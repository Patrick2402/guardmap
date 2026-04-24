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
  iamChains: Array<{
    workload: string
    namespace: string
    serviceAccount: string
    role: string
    services: Array<{ name: string; accessLevel: string }>
  }>
}

function buildContext(
  data: GraphData,
  clusterName: string,
  dbFindings?: DbFinding[],
  stats?: { critical: number; high: number; medium: number; low: number },
): ClusterContext {
  const namespaces = [...new Set(data.nodes.filter(n => n.namespace).map(n => n.namespace!))]

  // Build IRSA chains: workload → SA → role → AWS services
  const podToSa = new Map<string, string>()
  const saToRole = new Map<string, string>()
  const roleToServices = new Map<string, Array<{ name: string; accessLevel: string }>>()

  for (const e of data.edges) {
    if (e.label === 'uses') podToSa.set(e.source, e.target)
    if (e.label === 'IRSA →') saToRole.set(e.source, e.target)
    if (e.source.startsWith('role:') && e.target.startsWith('svc:')) {
      if (!roleToServices.has(e.source)) roleToServices.set(e.source, [])
      const node = data.nodes.find(n => n.id === e.target)
      roleToServices.get(e.source)!.push({
        name: node?.label ?? e.target.replace('svc:', ''),
        accessLevel: e.accessLevel ?? 'read',
      })
    }
  }

  const WORKLOAD_TYPES = new Set(['deployment', 'statefulset', 'daemonset', 'job', 'cronjob'])
  const iamChains: ClusterContext['iamChains'] = []
  const seen = new Set<string>()

  for (const e of data.edges) {
    if (e.label !== 'manages') continue
    const workload = data.nodes.find(n => n.id === e.source && WORKLOAD_TYPES.has(n.type))
    const pod = data.nodes.find(n => n.id === e.target && n.type === 'pod')
    if (!workload || !pod) continue

    const saId = podToSa.get(pod.id)
    if (!saId) continue
    const roleId = saToRole.get(saId)
    if (!roleId) continue

    const chainKey = `${workload.id}:${roleId}`
    if (seen.has(chainKey)) continue
    seen.add(chainKey)

    const saNode = data.nodes.find(n => n.id === saId)
    const roleNode = data.nodes.find(n => n.id === roleId)
    const services = roleToServices.get(roleId) ?? []

    iamChains.push({
      workload: workload.label,
      namespace: workload.namespace ?? 'default',
      serviceAccount: saNode?.label ?? saId,
      role: roleNode?.label ?? roleId.replace('role:', ''),
      services,
    })
  }

  // Derive findings from graph if no DB findings
  const findings: DbFinding[] = dbFindings ?? []

  const finalStats = stats ?? {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
  }

  return {
    clusterName,
    namespaces,
    stats: { nodes: data.nodes.length, edges: data.edges.length, ...finalStats },
    findings,
    iamChains,
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
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: json.content,
        ts: Date.now(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(msg)
      // Remove the optimistic user message on error
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
