import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { GraphData } from '../types'
import { DbFinding } from './useGraphData'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: number
}

interface ClusterContext {
  clusterName: string
  namespaces: string[]
  stats: {
    nodes: number
    edges: number
    critical: number
    high: number
    medium: number
    low: number
  }
  findings: DbFinding[]
  // IRSA: workload → SA → IAM role → AWS services
  iamChains: Array<{
    workload: string
    namespace: string
    serviceAccount: string
    role: string
    services: Array<{ name: string; accessLevel: string }>
  }>
  // K8s topology: service → workloads it selects
  serviceBindings: Array<{
    service: string
    namespace: string
    selects: string[]
  }>
  // Ingress → Service routes
  ingressRoutes: Array<{
    ingress: string
    namespace: string
    routes: string[]
    hosts: string[]
    tls: string[]
    paths: string
  }>
  // All nodes inventory grouped by type
  inventory: Array<{
    type: string
    namespace: string
    name: string
  }>
  // RBAC bindings
  rbacBindings: Array<{
    binding: string
    namespace: string
    role: string
    subjects: string[]
  }>
}

function buildContext(
  data: GraphData,
  clusterName: string,
  dbFindings?: DbFinding[],
  stats?: { critical: number; high: number; medium: number; low: number },
): ClusterContext {
  const namespaces = [...new Set(data.nodes.filter(n => n.namespace).map(n => n.namespace!))]
  const nodeById = new Map(data.nodes.map(n => [n.id, n]))

  // ── IRSA chains ────────────────────────────────────────────────────────────
  const podToSa = new Map<string, string>()
  const saToRole = new Map<string, string>()
  const roleToServices = new Map<string, Array<{ name: string; accessLevel: string }>>()

  for (const e of data.edges) {
    if (e.label === 'uses') podToSa.set(e.source, e.target)
    if (e.label === 'IRSA →') saToRole.set(e.source, e.target)
    if (e.source.startsWith('role:') && e.target.startsWith('svc:')) {
      if (!roleToServices.has(e.source)) roleToServices.set(e.source, [])
      const node = nodeById.get(e.target)
      roleToServices.get(e.source)!.push({
        name: node?.label ?? e.target.replace('svc:', ''),
        accessLevel: e.accessLevel ?? 'read',
      })
    }
  }

  const WORKLOAD_TYPES = new Set(['deployment', 'statefulset', 'daemonset', 'job', 'cronjob'])
  const iamChains: ClusterContext['iamChains'] = []
  const seenChain = new Set<string>()

  for (const e of data.edges) {
    if (e.label !== 'manages') continue
    const workload = nodeById.get(e.source)
    const pod = nodeById.get(e.target)
    if (!workload || !WORKLOAD_TYPES.has(workload.type)) continue
    if (!pod || pod.type !== 'pod') continue

    const saId = podToSa.get(pod.id)
    if (!saId) continue
    const roleId = saToRole.get(saId)
    if (!roleId) continue

    const key = `${workload.id}:${roleId}`
    if (seenChain.has(key)) continue
    seenChain.add(key)

    iamChains.push({
      workload: workload.label,
      namespace: workload.namespace ?? 'default',
      serviceAccount: nodeById.get(saId)?.label ?? saId,
      role: nodeById.get(roleId)?.label ?? roleId.replace('role:', ''),
      services: roleToServices.get(roleId) ?? [],
    })
  }

  // ── Service bindings (selects edges) ───────────────────────────────────────
  const svcToWorkloads = new Map<string, string[]>()
  for (const e of data.edges) {
    if (e.label !== 'selects') continue
    if (!svcToWorkloads.has(e.source)) svcToWorkloads.set(e.source, [])
    const target = nodeById.get(e.target)
    svcToWorkloads.get(e.source)!.push(target?.label ?? e.target)
  }

  const serviceBindings: ClusterContext['serviceBindings'] = []
  for (const [svcId, selects] of svcToWorkloads) {
    const svc = nodeById.get(svcId)
    if (!svc) continue
    serviceBindings.push({
      service: svc.label,
      namespace: svc.namespace ?? 'default',
      selects,
    })
  }

  // ── Ingress routes ──────────────────────────────────────────────────────────
  const ingToSvcs = new Map<string, string[]>()
  for (const e of data.edges) {
    if (e.label !== 'routes →') continue
    if (!ingToSvcs.has(e.source)) ingToSvcs.set(e.source, [])
    const target = nodeById.get(e.target)
    ingToSvcs.get(e.source)!.push(target?.label ?? e.target)
  }

  const ingressRoutes: ClusterContext['ingressRoutes'] = []
  for (const [ingId, routes] of ingToSvcs) {
    const ing = nodeById.get(ingId)
    if (!ing) continue
    ingressRoutes.push({
      ingress: ing.label,
      namespace: ing.namespace ?? 'default',
      routes,
      hosts: ing.metadata?.host ? ing.metadata.host.split(', ').filter(Boolean) : [],
      tls:   ing.metadata?.tls   ? ing.metadata.tls.split(', ').filter(Boolean)   : [],
      paths: ing.metadata?.paths ?? '',
    })
  }

  // ── RBAC bindings ──────────────────────────────────────────────────────────
  const rbacBindings: ClusterContext['rbacBindings'] = []
  const BINDING_TYPES = new Set(['k8s_rolebinding', 'k8s_clusterrolebinding'])
  for (const n of data.nodes) {
    if (!BINDING_TYPES.has(n.type)) continue
    const roleEdge = data.edges.find(e => e.source === n.id && (e.label === 'binds' || e.label === 'references'))
    const subjectEdges = data.edges.filter(e => e.target === n.id)
    rbacBindings.push({
      binding: n.label,
      namespace: n.namespace ?? 'cluster-wide',
      role: roleEdge ? (nodeById.get(roleEdge.target)?.label ?? roleEdge.target) : (n.metadata?.roleRef ?? ''),
      subjects: subjectEdges.map(e => nodeById.get(e.source)?.label ?? e.source),
    })
  }

  // ── Full node inventory (skip pods to keep context compact) ────────────────
  const SKIP_IN_INVENTORY = new Set(['pod'])
  const inventory: ClusterContext['inventory'] = data.nodes
    .filter(n => !SKIP_IN_INVENTORY.has(n.type))
    .map(n => ({ type: n.type, namespace: n.namespace ?? 'cluster-wide', name: n.label }))

  // ── Findings ───────────────────────────────────────────────────────────────
  const findings: DbFinding[] = dbFindings ?? []
  const finalStats = stats ?? {
    critical: findings.filter(f => f.severity === 'critical').length,
    high:     findings.filter(f => f.severity === 'high').length,
    medium:   findings.filter(f => f.severity === 'medium').length,
    low:      findings.filter(f => f.severity === 'low').length,
  }

  return {
    clusterName,
    namespaces,
    stats: { nodes: data.nodes.length, edges: data.edges.length, ...finalStats },
    findings,
    iamChains,
    serviceBindings,
    ingressRoutes,
    inventory,
    rbacBindings,
  }
}

export function useAIChat(
  data: GraphData | null,
  clusterName: string,
  dbFindings?: DbFinding[],
  scanStats?: { critical: number; high: number; medium: number; low: number },
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading || !data) return

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim(), ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setError(null)

    try {
      const context = buildContext(data, clusterName, dbFindings, scanStats)
      const history = messages.slice(-12).map(m => ({ role: m.role, content: m.content }))

      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ message: text.trim(), history, context }),
        }
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? res.statusText)
      }

      const json = await res.json()
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: json.content,
        ts: Date.now(),
      }])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(msg)
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
    } finally {
      setLoading(false)
    }
  }, [data, clusterName, dbFindings, scanStats, messages, loading])

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, loading, error, send, clear }
}
