import { useMemo, useState } from 'react'
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
  extraCount?: number  // "+N more siblings"
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
  '→':         '#94a3b8',
  'routes →':  '#22c55e',
  'selects':   '#14b8a6',
  'manages':   '#3b82f6',
  'uses':      '#8b5cf6',
  'grants →':  '#8b5cf6',
  'bound →':   '#7c3aed',
}

// ── Chain builder ──────────────────────────────────────────────────────────────

const WORKLOAD_SET    = new Set(['deployment', 'statefulset', 'daemonset', 'job', 'cronjob'])
const TRAFFIC_TYPES   = new Set([...WORKLOAD_SET, 'pod', 'k8s_service', 'ingress'])
const RBAC_BINDING    = new Set(['k8s_rolebinding', 'k8s_clusterrolebinding'])
const RBAC_ROLE       = new Set(['k8s_role', 'k8s_clusterrole'])
const CONFIG_TYPES    = new Set(['secret', 'configmap'])

type ChainKind = 'traffic' | 'rbac' | 'netpol' | 'config' | 'fallback'

interface Chain {
  kind: ChainKind
  steps: ChainNode[]
}

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
  const isFocal = (n: GraphNode) => n.id === focal.id

  // ── RBAC chain ───────────────────────────────────────────────────────────────
  if (RBAC_BINDING.has(focal.type)) {
    const steps: ChainNode[] = []
    const saEdge   = inn(focal.id).find(e => e.label === 'bound →')
    const roleEdge = out(focal.id).find(e => e.label === 'grants →')
    const sa   = saEdge   ? nodeMap.get(saEdge.source)   : undefined
    const role = roleEdge ? nodeMap.get(roleEdge.target) : undefined

    if (sa)   steps.push({ node: sa,    isFocal: false })
    steps.push({ node: focal, edgeLabel: sa ? 'bound →' : undefined, isFocal: true })
    if (role) steps.push({ node: role, edgeLabel: 'grants →', isFocal: false })
    return { kind: 'rbac', steps }
  }

  if (RBAC_ROLE.has(focal.type)) {
    const steps: ChainNode[] = []
    const bindEdge = inn(focal.id).find(e => e.label === 'grants →')
    const binding  = bindEdge ? nodeMap.get(bindEdge.source) : undefined
    if (binding) {
      const saEdge = inn(binding.id).find(e => e.label === 'bound →')
      const sa     = saEdge ? nodeMap.get(saEdge.source) : undefined
      if (sa) steps.push({ node: sa, isFocal: false })
      steps.push({ node: binding, edgeLabel: sa ? 'bound →' : undefined, isFocal: false })
    }
    steps.push({ node: focal, edgeLabel: binding ? 'grants →' : undefined, isFocal: true })
    return { kind: 'rbac', steps }
  }

  // ── NetworkPolicy chain ──────────────────────────────────────────────────────
  if (focal.type === 'networkpolicy') {
    const steps: ChainNode[] = [{ node: focal, isFocal: true }]
    out(focal.id)
      .filter(e => e.label === 'selects')
      .slice(0, 4)
      .forEach(e => {
        const wl = nodeMap.get(e.target)
        if (wl) steps.push({ node: wl, edgeLabel: 'selects', isFocal: false })
      })
    return { kind: 'netpol', steps }
  }

  // ── Config / Secret chain ────────────────────────────────────────────────────
  if (CONFIG_TYPES.has(focal.type)) {
    const label = focal.type === 'secret' ? 'uses secret →' : 'uses config →'
    const useEdges = inn(focal.id).filter(e => e.label === label)
    const steps: ChainNode[] = []
    useEdges.slice(0, 3).forEach(e => {
      const wl = nodeMap.get(e.source)
      if (wl) steps.push({ node: wl, isFocal: false })
    })
    steps.push({
      node: focal,
      edgeLabel: useEdges.length > 0 ? label : undefined,
      isFocal: true,
      extraCount: useEdges.length > 3 ? useEdges.length - 3 : undefined,
    })
    return { kind: 'config', steps }
  }

  // ── Traffic chain (ingress / service / workload / pod) ────────────────────────
  if (TRAFFIC_TYPES.has(focal.type)) {
    let workload: GraphNode | undefined
    if (WORKLOAD_SET.has(focal.type))  workload = focal
    else if (focal.type === 'pod') {
      const e = inn(focal.id).find(e => e.label === 'manages')
      workload = e ? nodeMap.get(e.source) : undefined
    } else if (focal.type === 'k8s_service') {
      const e = out(focal.id).find(e => e.label === 'selects')
      workload = e ? nodeMap.get(e.target) : undefined
    } else if (focal.type === 'ingress') {
      const se = out(focal.id).find(e => e.label === 'routes →')
      if (se) {
        const svc = nodeMap.get(se.target)
        if (svc) {
          const we = out(svc.id).find(e => e.label === 'selects')
          workload = we ? nodeMap.get(we.target) : undefined
        }
      }
    }

    const pods: GraphNode[] = workload
      ? out(workload.id).filter(e => e.label === 'manages').map(e => nodeMap.get(e.target)).filter(Boolean) as GraphNode[]
      : focal.type === 'pod' ? [focal] : []

    let svc: GraphNode | undefined
    if (workload) {
      const e = inn(workload.id).find(e => e.label === 'selects')
      svc = e ? nodeMap.get(e.source) : undefined
    } else if (focal.type === 'k8s_service') svc = focal

    let ingress: GraphNode | undefined
    if (svc) {
      const e = inn(svc.id).find(e => e.label === 'routes →')
      ingress = e ? nodeMap.get(e.source) : undefined
    } else if (focal.type === 'ingress') ingress = focal

    const steps: ChainNode[] = []
    if (ingress) {
      const internet: VirtualNode = { id: '__internet__', type: 'internet', label: 'Internet' }
      steps.push({ node: internet as unknown as GraphNode, isFocal: false })
      steps.push({ node: ingress, edgeLabel: '→', isFocal: isFocal(ingress) })
    }
    if (svc)     steps.push({ node: svc,     edgeLabel: ingress ? 'routes →' : undefined,  isFocal: isFocal(svc) })
    if (workload) steps.push({ node: workload, edgeLabel: svc ? 'selects' : undefined,       isFocal: isFocal(workload) })
    if (pods.length > 0) steps.push({
      node: pods[0],
      edgeLabel: workload ? 'manages' : undefined,
      isFocal: isFocal(pods[0]),
      extraCount: pods.length > 1 ? pods.length - 1 : undefined,
    })

    if (steps.length > 0) return { kind: 'traffic', steps }
  }

  // ── Fallback ─────────────────────────────────────────────────────────────────
  return { kind: 'fallback', steps: [{ node: focal, isFocal: true }] }
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
    const ing  = s.find(x => x.node.type === 'ingress')
    const svc  = s.find(x => x.node.type === 'k8s_service')
    const wl   = s.find(x => WORKLOAD_SET.has(x.node.type as string))
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
    const count = s.filter(x => !x.isFocal).length
    const focal = s.find(x => x.isFocal)
    const kind  = focal?.node.type === 'secret' ? 'Secret' : 'ConfigMap'
    if (count > 0)
      return `This ${kind} is used by ${count} workload${count !== 1 ? 's' : ''}. Changing or deleting it will affect those workloads.`
    return `This ${kind} exists in the namespace but is not currently mounted by any workload.`
  }
  return null
}

// ── Chain Step Card ────────────────────────────────────────────────────────────

interface HoveredInfo { label: string; namespace?: string; type: string; color: string; typeLabel: string }

function StepCard({ step, onHover }: { step: ChainNode; onHover: (info: HoveredInfo | null) => void }) {
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
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-1.5 p-3 rounded-xl shrink-0 cursor-default"
          onMouseEnter={() => onHover({ label: n.label, namespace: ('namespace' in n ? n.namespace : undefined), type: n.type, color: cfg.color, typeLabel: cfg.label })}
          onMouseLeave={() => onHover(null)}
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

          <div className="text-[12px] font-mono font-semibold text-slate-200 leading-snug break-all max-w-[200px]">
            {n.label}
          </div>

          {'namespace' in n && n.namespace && (
            <div className="text-[9px] font-mono text-slate-600">{n.namespace}</div>
          )}
        </motion.div>

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
      <span className="text-[10px] font-mono text-slate-600 shrink-0 w-24">{k}</span>
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
            <span className="text-[10px] font-mono text-slate-600 shrink-0 w-24">image</span>
            <span className="text-[10px] font-mono text-slate-400 break-all">{img}</span>
          </div>
        ))}
        {paths.map(p => (
          <div key={p} className="flex gap-3 py-0.5">
            <span className="text-[10px] font-mono text-slate-600 shrink-0 w-24">route</span>
            <span className="text-[10px] font-mono text-green-400 break-all">{p}</span>
          </div>
        ))}
        {labels.length > 0 && (
          <div className="flex gap-3 py-0.5">
            <span className="text-[10px] font-mono text-slate-600 shrink-0 w-24 mt-0.5">labels</span>
            <div className="flex flex-wrap gap-1">
              {labels.map(({ k, v }) => (
                <span key={k} className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-700/60 bg-slate-800/50 text-slate-400">
                  <span className="text-slate-500">{k}</span>
                  {v && <><span className="text-slate-600">=</span><span className="text-slate-300">{v}</span></>}
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
        <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-600">Connections</span>
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
  const [hovered, setHovered] = useState<HoveredInfo | null>(null)

  const cfg = node ? (TYPE_CFG[node.type] ?? { color: '#94a3b8', label: node.type, Icon: Box }) : null
  const showChain = chain && chain.kind !== 'fallback' && chain.steps.length > 1

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
                <div className="text-[10px] font-mono font-bold uppercase tracking-widest mb-0.5" style={{ color: cfg.color }}>
                  {cfg.label}
                </div>
                <div className="text-[16px] font-mono font-bold text-slate-100 truncate">{node.label}</div>
                {node.namespace && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Hash size={9} className="text-slate-600" />
                    <span className="text-[10px] font-mono text-slate-500">{node.namespace}</span>
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-200 transition-colors shrink-0"
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
                  <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-600 mb-3">
                    {CHAIN_TITLE[chain.kind]}
                  </div>

                  {/* Human-readable description */}
                  {(() => {
                    const desc = chainDescription(chain)
                    return desc ? (
                      <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-xl"
                        style={{ background: `${cfg.color}08`, border: `1px solid ${cfg.color}18` }}>
                        <span className="text-[10px] font-mono font-bold shrink-0 mt-px" style={{ color: cfg.color }}>?</span>
                        <p className="text-[11px] font-sans text-slate-400 leading-relaxed">{desc}</p>
                      </div>
                    ) : null
                  })()}

                  <div className="overflow-x-auto">
                    <div className="flex items-center min-w-max gap-0 py-4">
                      {chain.steps.map((step, i) => (
                        <StepCard key={step.node.id + i} step={step} onHover={setHovered} />
                      ))}
                    </div>
                  </div>

                  {/* Hover info strip */}
                  <div className="h-8 flex items-center mt-1">
                    <AnimatePresence>
                      {hovered && (
                        <motion.div
                          key={hovered.label}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.12 }}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-mono"
                          style={{ background: `${hovered.color}10`, border: `1px solid ${hovered.color}25` }}
                        >
                          <span className="font-bold uppercase tracking-widest text-[9px]" style={{ color: hovered.color }}>
                            {hovered.typeLabel}
                          </span>
                          <span className="text-slate-200">{hovered.label}</span>
                          {hovered.namespace && (
                            <span className="text-slate-600">· {hovered.namespace}</span>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
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

              {/* Fallback connections */}
              {!showChain && <ConnSection node={node} data={data} />}

              <div className="h-4" />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 shrink-0"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
              <p className="text-[10px] font-mono text-slate-600">
                {showChain
                  ? 'Path reconstructed from live graph · scroll right for full chain'
                  : 'Click any node in the topology to inspect it'}
              </p>
              <button
                onClick={onClose}
                className="text-xs font-sans text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 rounded-lg"
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
