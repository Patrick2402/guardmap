import { useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Globe, Layers, Container, Shield, Network, GitBranch,
  Box, ChevronRight, Hash, Lock, FileText, Users, Tag, Cpu, Clock,
} from 'lucide-react'
import { GraphData, GraphNode } from '../../types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface VirtualNode {
  id: string
  type: string
  label: string
  namespace?: string
}

type AnyNode = GraphNode | VirtualNode

interface ChainNode {
  node: AnyNode
  edgeLabel?: string
  isFocal?: boolean
  extraCount?: number
}

// ── Visual config ──────────────────────────────────────────────────────────────

const TYPE_CFG: Record<string, { color: string; label: string; Icon: React.ElementType }> = {
  internet:               { color: '#ef4444', label: 'Internet',       Icon: Globe      },
  ingress:                { color: '#22c55e', label: 'Ingress',        Icon: Network    },
  k8s_service:            { color: '#14b8a6', label: 'Service',        Icon: Layers     },
  deployment:             { color: '#3b82f6', label: 'Deployment',     Icon: Layers     },
  statefulset:            { color: '#a855f7', label: 'StatefulSet',    Icon: Layers     },
  daemonset:              { color: '#f97316', label: 'DaemonSet',      Icon: GitBranch  },
  job:                    { color: '#16a34a', label: 'Job',            Icon: Cpu        },
  cronjob:                { color: '#0d9488', label: 'CronJob',        Icon: Clock      },
  pod:                    { color: '#06b6d4', label: 'Pod',            Icon: Container  },
  serviceaccount:         { color: '#8b5cf6', label: 'ServiceAccount', Icon: Shield     },
  networkpolicy:          { color: '#f43f5e', label: 'NetworkPolicy',  Icon: Shield     },
  k8s_role:               { color: '#ef4444', label: 'Role',           Icon: Lock       },
  k8s_clusterrole:        { color: '#ef4444', label: 'ClusterRole',    Icon: Lock       },
  k8s_rolebinding:        { color: '#7c3aed', label: 'RoleBinding',    Icon: Users      },
  k8s_clusterrolebinding: { color: '#7c3aed', label: 'ClusterRoleBinding', Icon: Users },
  secret:                 { color: '#f59e0b', label: 'Secret',         Icon: Lock       },
  configmap:              { color: '#38bdf8', label: 'ConfigMap',      Icon: FileText   },
}

const EDGE_COLOR: Record<string, string> = {
  '→':              '#94a3b8',
  'routes →':       '#22c55e',
  'selects':        '#14b8a6',
  'manages':        '#3b82f6',
  'schedules':      '#0d9488',
  'uses':           '#8b5cf6',
  'grants →':       '#8b5cf6',
  'bound →':        '#7c3aed',
  'uses secret →':  '#f59e0b',
  'uses config →':  '#38bdf8',
}

// ── Flow edge sets ─────────────────────────────────────────────────────────────
// Traffic flow: direction of "data path" through the cluster
const MAIN_FLOW    = new Set(['routes →', 'selects', 'manages', 'schedules'])
// RBAC permission chain
const RBAC_FLOW    = new Set(['bound →', 'grants →'])
// Lateral resource dependencies (secrets/configs)
const LATERAL_FLOW = new Set(['uses secret →', 'uses config →'])

const WORKLOAD_SET  = new Set(['deployment', 'statefulset', 'daemonset', 'job', 'cronjob'])
const TRAFFIC_TYPES = new Set([...WORKLOAD_SET, 'pod', 'k8s_service', 'ingress'])
const RBAC_BINDING  = new Set(['k8s_rolebinding', 'k8s_clusterrolebinding'])
const RBAC_ROLE     = new Set(['k8s_role', 'k8s_clusterrole'])
const CONFIG_TYPES  = new Set(['secret', 'configmap'])

type ChainKind = 'traffic' | 'rbac' | 'netpol' | 'config' | 'fallback'

interface Chain {
  kind: ChainKind
  steps: ChainNode[]
  branches?: ChainNode[][]
  extraBranchCount?: number
}

const INTERNET: VirtualNode = { id: '__internet__', type: 'internet', label: 'Internet' }

function buildTopoChain(focal: GraphNode, data: GraphData): Chain {
  const { nodes, edges } = data
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const outE = new Map<string, typeof edges[0][]>()
  const inE  = new Map<string, typeof edges[0][]>()
  edges.forEach(e => {
    if (!outE.has(e.source)) outE.set(e.source, [])
    outE.get(e.source)!.push(e)
    if (!inE.has(e.target)) inE.set(e.target, [])
    inE.get(e.target)!.push(e)
  })
  const out = (id: string) => outE.get(id) ?? []
  const inn = (id: string) => inE.get(id)  ?? []
  const F = focal.id

  // ── BFS upstream ──────────────────────────────────────────────────────────────
  // Walk backwards from startId through `flow` edges (depth-limited).
  // Returns [{node, edgeFwd}] ordered root → last-ancestor.
  // edgeFwd = label of the edge FROM that node TO the next one (towards focal).
  function walkUp(startId: string, flow: Set<string>): { node: GraphNode; edgeFwd: string }[] {
    const result: { node: GraphNode; edgeFwd: string }[] = []
    const vis = new Set([startId])
    let cur = startId
    for (let depth = 0; depth < 8; depth++) {
      const e = inn(cur).find(e => !!e.label && flow.has(e.label))
      if (!e || !e.label) break
      const p = nodeMap.get(e.source)
      if (!p || vis.has(p.id)) break
      result.unshift({ node: p, edgeFwd: e.label })
      vis.add(p.id)
      cur = p.id
    }
    return result
  }

  // ── BFS downstream ────────────────────────────────────────────────────────────
  // Walk forward from startId through `flow` edges (depth-limited).
  // Returns ChainNode[] for nodes AFTER startId. Surfaces focal among siblings.
  function walkDown(startId: string, flow: Set<string>, vis: Set<string>): ChainNode[] {
    const steps: ChainNode[] = []
    let cur = startId
    for (let depth = 0; depth < 6; depth++) {
      const ces = out(cur).filter(e => !!e.label && flow.has(e.label) && !vis.has(e.target))
      if (!ces.length) break
      // Surface focal node among siblings so "selected" badge is always visible
      const focalEdge = ces.find(e => e.target === F)
      const chosen = focalEdge ?? ces[0]
      const child = nodeMap.get(chosen.target)
      if (!child) break
      steps.push({
        node: child,
        edgeLabel: chosen.label ?? undefined,
        isFocal: child.id === F,
        extraCount: ces.length > 1 ? ces.length - 1 : undefined,
      })
      vis.add(child.id)
      cur = child.id
    }
    return steps
  }

  // ── Build full linear chain through focal ─────────────────────────────────────
  // upstream → focal → downstream, with Internet prefix when chain starts at Ingress.
  function buildChain(flow: Set<string>): ChainNode[] {
    const up  = walkUp(F, flow)
    const vis = new Set([F, ...up.map(x => x.node.id)])
    const leftmost = up.length > 0 ? up[0].node : focal
    const atIngress = leftmost.type === 'ingress'
    const steps: ChainNode[] = []

    if (atIngress) {
      steps.push({ node: INTERNET as unknown as GraphNode, isFocal: false })
    }
    up.forEach((x, i) => {
      steps.push({
        node: x.node,
        edgeLabel: i === 0 ? (atIngress ? '→' : undefined) : up[i - 1].edgeFwd,
        isFocal: x.node.id === F,
      })
    })
    steps.push({
      node: focal,
      edgeLabel: up.length > 0 ? up[up.length - 1].edgeFwd : (atIngress ? '→' : undefined),
      isFocal: true,
    })
    steps.push(...walkDown(F, flow, vis))
    return steps
  }

  // ── Lateral branches ──────────────────────────────────────────────────────────
  // Secret/configmap usage from a workload node — appended as extra branches.
  function laterals(wl: GraphNode): ChainNode[][] {
    return out(wl.id)
      .filter(e => !!e.label && LATERAL_FLOW.has(e.label))
      .slice(0, 5)
      .map(e => {
        const res = nodeMap.get(e.target)
        if (!res) return null
        return [
          { node: wl, isFocal: wl.id === F },
          { node: res, edgeLabel: e.label ?? undefined, isFocal: false },
        ] as ChainNode[]
      })
      .filter(Boolean) as ChainNode[][]
  }

  // ── RBAC ──────────────────────────────────────────────────────────────────────
  if (RBAC_BINDING.has(focal.type) || RBAC_ROLE.has(focal.type)) {
    return { kind: 'rbac', steps: buildChain(RBAC_FLOW) }
  }

  // ── NetworkPolicy ─────────────────────────────────────────────────────────────
  if (focal.type === 'networkpolicy') {
    const steps: ChainNode[] = [{ node: focal, isFocal: true }]
    out(F).filter(e => e.label === 'selects').slice(0, 4).forEach(e => {
      const wl = nodeMap.get(e.target)
      if (wl) steps.push({ node: wl, edgeLabel: 'selects', isFocal: false })
    })
    return { kind: 'netpol', steps }
  }

  // ── Config / Secret ───────────────────────────────────────────────────────────
  if (CONFIG_TYPES.has(focal.type)) {
    const edgeLabel = focal.type === 'secret' ? 'uses secret →' : 'uses config →'
    const useEdges  = inn(F).filter(e => e.label === edgeLabel)
    if (!useEdges.length) return { kind: 'config', steps: [{ node: focal, isFocal: true }] }

    const branches = useEdges.slice(0, 5).map(e => {
      const wl = nodeMap.get(e.source)
      if (!wl) return null
      const pods = out(wl.id).filter(pe => pe.label === 'manages')
        .map(pe => nodeMap.get(pe.target)).filter(Boolean) as GraphNode[]
      const branch: ChainNode[] = []
      if (pods.length) {
        branch.push({ node: pods[0], isFocal: false, extraCount: pods.length > 1 ? pods.length - 1 : undefined })
      }
      branch.push({ node: wl, edgeLabel: pods.length ? 'manages' : undefined, isFocal: false })
      branch.push({ node: focal, edgeLabel: edgeLabel, isFocal: true })
      return branch
    }).filter(Boolean) as ChainNode[][]

    const extraBranchCount = useEdges.length > 5 ? useEdges.length - 5 : 0
    return { kind: 'config', steps: [], branches, extraBranchCount: extraBranchCount || undefined }
  }

  // ── Traffic / Batch ───────────────────────────────────────────────────────────
  if (TRAFFIC_TYPES.has(focal.type)) {
    const up = walkUp(F, MAIN_FLOW)

    // Detect multi-service ingress anywhere in the upstream path (or focal itself)
    const ingressInPath = focal.type === 'ingress' ? focal
      : up.find(x => x.node.type === 'ingress')?.node

    if (ingressInPath) {
      const svcEdges = out(ingressInPath.id).filter(e => e.label === 'routes →')
      if (svcEdges.length > 1) {
        const internet = INTERNET as unknown as GraphNode
        const branches: ChainNode[][] = svcEdges.map(se => {
          const svc = nodeMap.get(se.target)
          if (!svc) return null
          const branch: ChainNode[] = [
            { node: internet, isFocal: false },
            { node: ingressInPath, edgeLabel: '→', isFocal: ingressInPath.id === F },
            { node: svc, edgeLabel: 'routes →', isFocal: svc.id === F },
          ]
          const wlEdge = out(svc.id).find(e => e.label === 'selects')
          const wl = wlEdge ? nodeMap.get(wlEdge.target) : undefined
          if (wl) {
            branch.push({ node: wl, edgeLabel: 'selects', isFocal: wl.id === F })
            const podEdges = out(wl.id).filter(e => e.label === 'manages')
            const pod = podEdges[0] ? nodeMap.get(podEdges[0].target) : undefined
            if (pod) {
              branch.push({
                node: pod, edgeLabel: 'manages', isFocal: pod.id === F,
                extraCount: podEdges.length > 1 ? podEdges.length - 1 : undefined,
              })
            }
          }
          return branch
        }).filter(Boolean) as ChainNode[][]
        return { kind: 'traffic', steps: [], branches }
      }
    }

    // Generic single-path chain
    const mainSteps = buildChain(MAIN_FLOW)

    // Append lateral (secret/configmap) branches from the workload in the chain
    const wlNode = mainSteps.find(s => WORKLOAD_SET.has(s.node.type))?.node as GraphNode | undefined
    const lats   = wlNode ? laterals(wlNode) : []
    if (lats.length > 0) {
      return { kind: 'traffic', steps: [], branches: [mainSteps, ...lats] }
    }

    if (mainSteps.length > 1) return { kind: 'traffic', steps: mainSteps }
  }

  // ── Fallback ──────────────────────────────────────────────────────────────────
  return { kind: 'fallback', steps: [{ node: focal, isFocal: true }] }
}

// ── Fork detection ────────────────────────────────────────────────────────────
// Returns the rightmost node ID (in branches[0]) that appears in ALL branches.
// That node is the "fork point" — shared prefix ends there, branches diverge after.
function findForkNodeId(branches: ChainNode[][]): string | undefined {
  if (branches.length < 2) return undefined
  const sets = branches.map(b => new Set(b.map(s => s.node.id)))
  const commonIds = new Set([...sets[0]].filter(id => sets.every(s => s.has(id))))
  if (!commonIds.size) return undefined
  const b0 = branches[0]
  for (let i = b0.length - 1; i >= 0; i--) {
    if (commonIds.has(b0[i].node.id)) return b0[i].node.id
  }
  return undefined
}

// ── Chain description ──────────────────────────────────────────────────────────

function chainDescription(chain: Chain): string | null {
  const s = chain.steps
  if (chain.kind === 'rbac') {
    const sa      = s.find(x => x.node.type === 'serviceaccount')
    const role    = s.find(x => RBAC_ROLE.has(x.node.type as string))
    const roleKind = role?.node.type === 'k8s_clusterrole' ? 'ClusterRole' : 'Role'
    if (sa && role)
      return `ServiceAccount "${sa.node.label}" is bound to ${roleKind} "${role.node.label}" via this binding — granting it the Kubernetes API permissions defined in the role.`
    if (role)
      return `This binding grants permissions defined in ${roleKind} "${role.node.label}".`
    return 'This binding grants a ServiceAccount access to a Kubernetes Role.'
  }
  if (chain.kind === 'traffic') {
    if (chain.branches && chain.branches.length > 1) {
      const hasIngress = chain.branches[0].some(x => x.node.type === 'ingress')
      // Multi-service ingress: all branches are traffic paths
      if (hasIngress && chain.branches.every(b => !b.some(x => CONFIG_TYPES.has(x.node.type)))) {
        const ing = chain.branches[0].find(x => x.node.type === 'ingress')
        const svcNames = chain.branches
          .map(b => b.find(x => x.node.type === 'k8s_service')?.node.label)
          .filter(Boolean).join(', ')
        return `Ingress "${ing?.node.label ?? ''}" routes traffic to ${chain.branches.length} services: ${svcNames}. Each row shows the full path for one route.`
      }
      // Traffic + resource branches
      const trafficBranch = chain.branches[0]
      const wl = trafficBranch.find(x => WORKLOAD_SET.has(x.node.type))
      const resourceCount = chain.branches.length - 1
      const resourceLabel = resourceCount === 1 ? 'resource' : 'resources'
      return `${wl ? `${TYPE_CFG[wl.node.type]?.label ?? 'Workload'} "${wl.node.label}"` : 'This workload'} uses ${resourceCount} ${resourceLabel}. Row 1 shows the traffic path; remaining rows show mounted secrets and config maps.`
    }
    const ing  = s.find(x => x.node.type === 'ingress')
    const svc  = s.find(x => x.node.type === 'k8s_service')
    const cj   = s.find(x => x.node.type === 'cronjob')
    const job  = s.find(x => x.node.type === 'job')
    const wl   = s.find(x => ['deployment','statefulset','daemonset'].includes(x.node.type))
    if (cj && job)
      return `CronJob "${cj.node.label}" schedules Job "${job.node.label}" on its configured interval. The Job then manages pod execution.`
    if (job && !cj)
      return `Job "${job.node.label}" is a one-time workload that manages pod execution directly.`
    if (ing && svc && wl)
      return `External traffic enters through Ingress "${ing.node.label}", is routed to Service "${svc.node.label}", which selects ${TYPE_CFG[wl.node.type]?.label ?? wl.node.type} "${wl.node.label}".`
    if (svc && wl)
      return `Service "${svc.node.label}" selects ${TYPE_CFG[wl.node.type]?.label ?? wl.node.type} "${wl.node.label}" (no public Ingress).`
    return null
  }
  if (chain.kind === 'netpol') {
    const count = s.length - 1
    return `This NetworkPolicy applies to ${count} workload${count !== 1 ? 's' : ''}. It controls which traffic is allowed in/out of the selected pods.`
  }
  if (chain.kind === 'config') {
    const allSteps = chain.branches ? chain.branches.flat() : s
    const focalNode = allSteps.find(x => x.isFocal)
    const kind = focalNode?.node.type === 'secret' ? 'Secret' : 'ConfigMap'
    const count = chain.branches?.length ?? s.filter(x => !x.isFocal).length
    const extra = chain.extraBranchCount ?? 0
    if (count > 0)
      return `This ${kind} is used by ${count + extra} workload${(count + extra) !== 1 ? 's' : ''}${extra > 0 ? ` (showing ${count})` : ''}. Each row shows the full pod→workload→${kind.toLowerCase()} path.`
    return `This ${kind} exists in the namespace but is not currently mounted by any workload.`
  }
  return null
}

// ── Chain Step Card ────────────────────────────────────────────────────────────

function StepCard({ step }: { step: ChainNode }) {
  const n         = step.node
  const cfg       = TYPE_CFG[n.type] ?? { color: '#94a3b8', label: n.type, Icon: Box }
  const edgeColor = step.edgeLabel ? (EDGE_COLOR[step.edgeLabel] ?? '#475569') : '#475569'

  return (
    <div className="flex items-center gap-2 shrink-0">
      {step.edgeLabel !== undefined && (
        <div className="flex flex-col items-center gap-0.5 shrink-0 mx-1">
          <div className="flex items-center gap-0.5">
            <div className="w-6 h-px" style={{ background: `${edgeColor}60` }} />
            <ChevronRight size={10} style={{ color: edgeColor }} />
          </div>
          <span className="text-[9px] font-mono whitespace-nowrap" style={{ color: edgeColor }}>
            {step.edgeLabel}
          </span>
        </div>
      )}

      <div className="relative">
        <div
          className="flex flex-col gap-1.5 p-3 rounded-xl shrink-0 cursor-default"
          style={{
            background: n.type === 'internet'
              ? 'rgba(239,68,68,0.08)'
              : step.isFocal
                ? `${cfg.color}14`
                : 'rgba(255,255,255,0.03)',
            border: step.isFocal
              ? `1.5px solid ${cfg.color}70`
              : `1px solid ${cfg.color}20`,
            minWidth: 130,
            boxShadow: step.isFocal
              ? `0 0 24px ${cfg.color}28, 0 0 8px ${cfg.color}14`
              : `0 0 16px ${cfg.color}0a`,
          }}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <cfg.Icon size={11} style={{ color: cfg.color }} />
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest" style={{ color: cfg.color }}>
              {cfg.label}
            </span>
            {step.isFocal && (
              <span className="text-[8px] font-mono px-1 py-0.5 rounded"
                style={{ background: `${cfg.color}20`, color: cfg.color }}>
                selected
              </span>
            )}
          </div>
          <div className="text-[12px] font-mono font-semibold text-slate-200 leading-snug"
            style={{ wordBreak: 'break-word', maxWidth: 220 }}>
            {n.label}
          </div>
          {'namespace' in n && n.namespace && (
            <div className="text-[9px] font-mono text-slate-400">{n.namespace}</div>
          )}
        </div>
        {step.extraCount && (
          <div className="absolute -right-2 -bottom-2 text-[9px] font-mono px-1.5 py-0.5 rounded-full border z-10"
            style={{ background: 'rgba(8,12,20,0.95)', borderColor: `${TYPE_CFG['pod']?.color ?? '#94a3b8'}40`, color: '#94a3b8' }}>
            +{step.extraCount}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Metadata section ───────────────────────────────────────────────────────────

function MetaRow({ k, v, color }: { k: string; v?: string; color?: string }) {
  if (!v) return null
  return (
    <div className="flex gap-3 py-0.5">
      <span className="text-[10px] font-mono text-slate-400 shrink-0 w-24">{k}</span>
      <span className={`text-[10px] font-mono break-all ${color ?? 'text-slate-300'}`}>{v}</span>
    </div>
  )
}

function NodeMeta({ node }: { node: GraphNode }) {
  const m = node.metadata ?? {}
  const cfg = TYPE_CFG[node.type] ?? { color: '#94a3b8', label: node.type, Icon: Box }

  const rows = [
    { k: 'replicas',    v: m.replicas,       color: 'text-blue-300'   },
    { k: 'svc account',v: m.serviceAccount,  color: 'text-violet-300' },
    { k: 'node',       v: m.nodeName                                   },
    { k: 'phase',      v: m.phase,           color: m.phase === 'Running' ? 'text-emerald-400' : m.phase === 'Failed' ? 'text-red-400' : undefined },
    { k: 'type',       v: m.svcType                                    },
    { k: 'cluster IP', v: m.clusterIP !== 'None' ? m.clusterIP : '',  color: 'text-teal-300' },
    { k: 'ports',      v: m.ports                                      },
    { k: 'host',       v: m.host,            color: 'text-green-300'  },
    { k: 'class',      v: m.ingressClass                               },
    { k: 'tls',        v: m.tls,             color: 'text-emerald-300'},
    { k: 'effect',     v: m.effect,          color: m.effect === 'deny' ? 'text-red-400' : 'text-emerald-400' },
    { k: 'schedule',   v: m.schedule,        color: 'text-teal-300'   },
  ].filter(r => r.v)

  const images = m.images?.split(', ').filter(Boolean) ?? []
  const paths  = m.paths?.split('; ').filter(Boolean) ?? []
  const labels = m.labels?.split(', ').filter(Boolean).map(s => {
    const i = s.indexOf('=')
    return i > 0 ? { k: s.slice(0, i), v: s.slice(i + 1) } : { k: s, v: '' }
  }) ?? []

  if (rows.length === 0 && images.length === 0 && paths.length === 0 && labels.length === 0) return null

  return (
    <div className="mt-4 mx-6 mb-2 rounded-xl border border-slate-800/60 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-800/60"
        style={{ background: `${cfg.color}08` }}>
        <span className="text-[9px] font-mono font-bold uppercase tracking-widest" style={{ color: cfg.color }}>
          {cfg.label} details
        </span>
      </div>
      <div className="px-4 py-3 space-y-0.5">
        {rows.map(r => <MetaRow key={r.k} k={r.k} v={r.v} color={r.color} />)}
        {images.map(img => (
          <div key={img} className="flex gap-3 py-0.5">
            <span className="text-[10px] font-mono text-slate-400 shrink-0 w-24">image</span>
            <span className="text-[10px] font-mono text-slate-400 break-all">{img}</span>
          </div>
        ))}
        {paths.map(p => (
          <div key={p} className="flex gap-3 py-0.5">
            <span className="text-[10px] font-mono text-slate-400 shrink-0 w-24">route</span>
            <span className="text-[10px] font-mono text-green-400 break-all">{p}</span>
          </div>
        ))}
        {labels.length > 0 && (
          <div className="flex gap-3 py-0.5">
            <span className="text-[10px] font-mono text-slate-400 shrink-0 w-24 mt-0.5">labels</span>
            <div className="flex flex-wrap gap-1">
              {labels.map(({ k, v }) => (
                <span key={k} className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-700/60 bg-slate-800/50 text-slate-400">
                  <span className="text-slate-400">{k}</span>
                  {v && <><span className="text-slate-400">=</span><span className="text-slate-300">{v}</span></>}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Connections section (for non-chain nodes) ──────────────────────────────────

function ConnSection({ node, data }: { node: GraphNode; data: GraphData }) {
  const nodeMap = new Map(data.nodes.map(n => [n.id, n]))
  const outgoing = data.edges.filter(e => e.source === node.id)
    .map(e => ({ e, peer: nodeMap.get(e.target) })).filter(x => x.peer)
  const incoming = data.edges.filter(e => e.target === node.id)
    .map(e => ({ e, peer: nodeMap.get(e.source) })).filter(x => x.peer)

  if (outgoing.length === 0 && incoming.length === 0) return null

  return (
    <div className="mx-6 mt-3 mb-2 rounded-xl border border-slate-800/60 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-800/60 bg-white/[0.02]">
        <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400">Connections</span>
      </div>
      <div className="px-4 py-2 space-y-1.5">
        {[...incoming.map(x => ({ ...x, dir: 'in' as const })), ...outgoing.map(x => ({ ...x, dir: 'out' as const }))]
          .map(({ e, peer, dir }) => {
            const cfg = TYPE_CFG[peer!.type] ?? { color: '#94a3b8', label: peer!.type, Icon: Box }
            return (
              <div key={e.id} className="flex items-center gap-2">
                <cfg.Icon size={10} style={{ color: cfg.color }} />
                <span className="text-[10px] font-mono text-slate-300 flex-1">{peer!.label}</span>
                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border"
                  style={{ color: EDGE_COLOR[e.label ?? ''] ?? '#64748b', borderColor: `${EDGE_COLOR[e.label ?? ''] ?? '#334155'}40`, background: `${EDGE_COLOR[e.label ?? ''] ?? '#1e293b'}15` }}>
                  {dir === 'in' ? '← ' : ''}{e.label ?? 'ref'}{dir === 'out' ? ' →' : ''}
                </span>
              </div>
            )
          })}
      </div>
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────────────

interface TopologyChainModalProps {
  node: GraphNode | null
  data: GraphData
  onClose: () => void
}

const CHAIN_TITLE: Record<string, string> = {
  traffic: 'Traffic path',
  rbac:    'Permission chain',
  netpol:  'Applies to',
  config:  'Used by',
  fallback: '',
}

export function TopologyChainModal({ node, data, onClose }: TopologyChainModalProps) {
  const chain = useMemo(
    () => node ? buildTopoChain(node, data) : null,
    [node, data]
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return  // already horizontal
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const cfg = node ? (TYPE_CFG[node.type] ?? { color: '#94a3b8', label: node.type, Icon: Box }) : null
  const showChain = chain && chain.kind !== 'fallback' && (
    chain.steps.length > 1 || (chain.branches && chain.branches.length > 0)
  )
  const isIsolated = chain && chain.kind !== 'fallback' && !showChain

  return (
    <AnimatePresence>
      {node && cfg && (
        <>
          {/* Backdrop */}
          <motion.div
            key="topo-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="topo-modal"
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 16 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-x-4 top-16 z-50 rounded-2xl flex flex-col overflow-hidden max-w-4xl mx-auto max-h-[calc(100vh-8rem)]"
            style={{
              background: 'rgba(8,12,20,0.97)',
              backdropFilter: 'blur(32px)',
              WebkitBackdropFilter: 'blur(32px)',
              border: `1px solid ${cfg.color}25`,
              boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 60px ${cfg.color}10`,
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: `${cfg.color}08` }}>
              <cfg.Icon size={14} style={{ color: cfg.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono font-bold uppercase tracking-widest mb-0.5" style={{ color: cfg.color }}>
                  {cfg.label}
                </div>
                <div className="text-lg font-mono font-bold text-slate-100 truncate">{node.label}</div>
                {node.namespace && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Hash size={9} className="text-slate-400" />
                    <span className="text-xs font-mono text-slate-400">{node.namespace}</span>
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors shrink-0"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto">

              {/* Chain visualization */}
              {showChain && chain && (
                <div className="px-6 pt-5 pb-4">
                  <div className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400 mb-3">
                    {CHAIN_TITLE[chain.kind]}
                  </div>

                  {/* Human-readable description */}
                  {(() => {
                    const desc = chainDescription(chain)
                    return desc ? (
                      <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-xl"
                        style={{ background: `${cfg.color}08`, border: `1px solid ${cfg.color}18` }}>
                        <span className="text-[10px] font-mono font-bold shrink-0 mt-px" style={{ color: cfg.color }}>?</span>
                        <p className="text-sm font-sans text-slate-400 leading-relaxed">{desc}</p>
                      </div>
                    ) : null
                  })()}

                  <div ref={scrollRef} className="overflow-x-auto"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: `${cfg.color}30 transparent` }}>
                    {chain.branches && chain.branches.length > 0 ? (() => {
                      const forkId = findForkNodeId(chain.branches)
                      if (forkId) {
                        const b0 = chain.branches[0]
                        const forkIdx0 = b0.findIndex(s => s.node.id === forkId)
                        const prefix = b0.slice(0, forkIdx0 + 1)
                        const tails = chain.branches
                          .map(b => b.slice(b.findIndex(s => s.node.id === forkId) + 1))
                          .filter(t => t.length > 0)
                        return (
                          <div className="flex flex-col py-4 min-w-max">
                            {/* Shared prefix row */}
                            <div className="flex items-center gap-0">
                              {prefix.map((step, i) => (
                                <StepCard key={step.node.id + i} step={step} />
                              ))}
                            </div>
                            {/* Branch separator */}
                            <div className="flex items-center gap-2 my-1.5 pl-2">
                              <div className="h-px flex-1 max-w-[120px]" style={{ background: 'rgba(255,255,255,0.07)' }} />
                              <span className="text-[9px] font-mono text-slate-400 shrink-0">
                                {tails.length} branch{tails.length !== 1 ? 'es' : ''}
                              </span>
                              <div className="h-px flex-1 max-w-[120px]" style={{ background: 'rgba(255,255,255,0.07)' }} />
                            </div>
                            {/* Branch tails with ├/└ connectors */}
                            {tails.map((tail, bi) => (
                              <div key={bi} className="flex items-center gap-0 mt-1">
                                <span className="text-[11px] font-mono text-slate-400 mr-2 shrink-0 select-none" style={{ fontFamily: 'monospace' }}>
                                  {bi === tails.length - 1 ? '└' : '├'}
                                </span>
                                {tail.map((step, i) => (
                                  <StepCard key={step.node.id + i} step={step} />
                                ))}
                              </div>
                            ))}
                            {chain.extraBranchCount && chain.extraBranchCount > 0 ? (
                              <div className="text-[9px] font-mono text-slate-400 pl-6 mt-1.5">
                                +{chain.extraBranchCount} more not shown
                              </div>
                            ) : null}
                          </div>
                        )
                      }
                      // No common fork found — fall back to numbered rows
                      return (
                        <div className="flex flex-col gap-3 py-4 min-w-max">
                          {chain.branches.map((branch, bi) => (
                            <div key={bi} className="flex items-center gap-0">
                              <div className="text-[9px] font-mono text-slate-800 w-4 shrink-0 text-right mr-3 self-center select-none">
                                {bi + 1}
                              </div>
                              {branch.map((step, i) => (
                                <StepCard key={step.node.id + i} step={step} />
                              ))}
                            </div>
                          ))}
                          {chain.extraBranchCount && chain.extraBranchCount > 0 ? (
                            <div className="text-[9px] font-mono text-slate-400 pl-7">
                              +{chain.extraBranchCount} more workloads not shown
                            </div>
                          ) : null}
                        </div>
                      )
                    })() : (
                      <div className="flex items-center min-w-max gap-0 py-4">
                        {chain.steps.map((step, i) => (
                          <StepCard key={step.node.id + i} step={step} />
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* Node metadata */}
              <NodeMeta node={node} />

              {/* RBAC metadata */}
              {(node.metadata?.rules || node.metadata?.roleRef) && (
                <div className="mx-6 mt-3 mb-2 rounded-xl border border-slate-800/60 bg-white/[0.02] overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-800/60"
                    style={{ background: `${cfg.color}08` }}>
                    <span className="text-[9px] font-mono font-bold uppercase tracking-widest" style={{ color: cfg.color }}>
                      RBAC
                    </span>
                  </div>
                  <div className="px-4 py-3 space-y-0.5">
                    <MetaRow k="rules"     v={node.metadata?.rules} />
                    <MetaRow k="role ref"  v={node.metadata?.roleRef}  color="text-violet-300" />
                    <MetaRow k="role kind" v={node.metadata?.roleKind} />
                  </div>
                </div>
              )}

              {/* Isolated node notice */}
              {isIsolated && (
                <div className="mx-6 mt-4 mb-2 flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="text-slate-400 shrink-0">⬡</span>
                  <p className="text-[12px] font-sans text-slate-400">
                    No topology connections found — this resource has no edges in the current graph view.
                  </p>
                </div>
              )}

              {/* Fallback connections */}
              {!showChain && !isIsolated && (
                data.edges.filter(e => e.source === node.id || e.target === node.id).length === 0
                  ? (
                    <div className="mx-6 mt-4 mb-2 flex items-center gap-3 px-4 py-3 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="text-slate-400 shrink-0">⬡</span>
                      <p className="text-sm font-sans text-slate-400">
                        No connections found in topology — this resource has no edges in the current graph view.
                      </p>
                    </div>
                  )
                  : <ConnSection node={node} data={data} />
              )}

              <div className="h-4" />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 shrink-0"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
              <p className="text-xs font-mono text-slate-400">
                {showChain
                  ? 'Path reconstructed from live graph · scroll right for full chain'
                  : 'Click any node in the topology to inspect it'}
              </p>
              <button
                onClick={onClose}
                className="text-xs font-sans text-slate-400 hover:text-slate-300 transition-colors px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
