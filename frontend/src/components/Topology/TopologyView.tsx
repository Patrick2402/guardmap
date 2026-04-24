import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Layers, KeyRound, ShieldCheck, ChevronRight,
  Globe, Network, Lock, Box, RefreshCw,
} from 'lucide-react'

import { GraphData, GraphNode } from '../../types'
import { TopologyChainModal }   from './TopologyChainModal'

interface TopologyViewProps {
  data: GraphData
  focusNodeId?: string | null
}

// ── Constants ────────────────────────────────────────────────────────────────

const WORKLOAD_TYPES = new Set(['deployment', 'statefulset', 'daemonset', 'job', 'cronjob'])
const ALL_TOPO_TYPES = new Set([
  'deployment','statefulset','daemonset','job','cronjob',
  'k8s_service','ingress','networkpolicy',
  'k8s_role','k8s_clusterrole','k8s_rolebinding','k8s_clusterrolebinding',
  'secret','configmap','pod',
])

const TYPE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  deployment:             { label: 'DEPLOYMENT',   color: '#60a5fa', bg: 'rgba(59,130,246,0.08)',   border: 'rgba(59,130,246,0.2)'  },
  statefulset:            { label: 'STATEFULSET',  color: '#a78bfa', bg: 'rgba(139,92,246,0.08)',   border: 'rgba(139,92,246,0.2)'  },
  daemonset:              { label: 'DAEMONSET',    color: '#fb923c', bg: 'rgba(249,115,22,0.08)',   border: 'rgba(249,115,22,0.2)'  },
  job:                    { label: 'JOB',          color: '#34d399', bg: 'rgba(52,211,153,0.08)',   border: 'rgba(52,211,153,0.2)'  },
  cronjob:                { label: 'CRONJOB',      color: '#2dd4bf', bg: 'rgba(45,212,191,0.08)',   border: 'rgba(45,212,191,0.2)'  },
  k8s_service:            { label: 'SERVICE',      color: '#22d3ee', bg: 'rgba(34,211,238,0.08)',   border: 'rgba(34,211,238,0.2)'  },
  ingress:                { label: 'INGRESS',      color: '#4ade80', bg: 'rgba(74,222,128,0.08)',   border: 'rgba(74,222,128,0.2)'  },
  networkpolicy:          { label: 'NETPOL',       color: '#f87171', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.2)' },
  k8s_role:               { label: 'ROLE',         color: '#c084fc', bg: 'rgba(192,132,252,0.08)',  border: 'rgba(192,132,252,0.2)' },
  k8s_clusterrole:        { label: 'CLUSTERROLE',  color: '#c084fc', bg: 'rgba(192,132,252,0.08)',  border: 'rgba(192,132,252,0.2)' },
  k8s_rolebinding:        { label: 'ROLEBINDING',  color: '#818cf8', bg: 'rgba(129,140,248,0.08)',  border: 'rgba(129,140,248,0.2)' },
  k8s_clusterrolebinding: { label: 'CLUSTERBINDING',color:'#818cf8', bg: 'rgba(129,140,248,0.08)',  border: 'rgba(129,140,248,0.2)' },
  secret:                 { label: 'SECRET',       color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',   border: 'rgba(251,191,36,0.2)'  },
  configmap:              { label: 'CONFIGMAP',    color: '#38bdf8', bg: 'rgba(56,189,248,0.08)',   border: 'rgba(56,189,248,0.2)'  },
  pod:                    { label: 'POD',          color: '#94a3b8', bg: 'rgba(148,163,184,0.06)',  border: 'rgba(148,163,184,0.15)' },
}

const NS_PRIORITY: Record<string, number> = {
  production: 0, prod: 0, staging: 1, stage: 1,
  monitoring: 2, observability: 2, default: 3,
}

function nsSort(a: string, b: string) {
  const ap = NS_PRIORITY[a] ?? 99, bp = NS_PRIORITY[b] ?? 99
  return ap !== bp ? ap - bp : a.localeCompare(b)
}

// ── Derived data helpers ─────────────────────────────────────────────────────

function useTopologyIndex(data: GraphData) {
  return useMemo(() => {
    // service → workloads it selects
    const svcToWorkloads = new Map<string, string[]>()
    // workload → services that select it
    const workloadToSvcs = new Map<string, string[]>()
    // ingress → services
    const ingToSvcs = new Map<string, string[]>()
    // workload → ingresses (transitive through services)
    const workloadToIngs = new Map<string, string[]>()

    for (const e of data.edges) {
      if (e.label === 'selects') {
        if (!svcToWorkloads.has(e.source)) svcToWorkloads.set(e.source, [])
        svcToWorkloads.get(e.source)!.push(e.target)
        if (!workloadToSvcs.has(e.target)) workloadToSvcs.set(e.target, [])
        workloadToSvcs.get(e.target)!.push(e.source)
      }
      if (e.label === 'routes →') {
        if (!ingToSvcs.has(e.source)) ingToSvcs.set(e.source, [])
        ingToSvcs.get(e.source)!.push(e.target)
      }
    }

    // Compute workload → ingresses transitively
    for (const [ingId, svcs] of ingToSvcs) {
      for (const svcId of svcs) {
        const workloads = svcToWorkloads.get(svcId) ?? []
        for (const wlId of workloads) {
          if (!workloadToIngs.has(wlId)) workloadToIngs.set(wlId, [])
          if (!workloadToIngs.get(wlId)!.includes(ingId))
            workloadToIngs.get(wlId)!.push(ingId)
        }
      }
    }

    const nodeById = new Map(data.nodes.map(n => [n.id, n]))
    return { workloadToSvcs, workloadToIngs, ingToSvcs, nodeById }
  }, [data])
}

// ── WorkloadCard ─────────────────────────────────────────────────────────────

interface WorkloadCardProps {
  node: GraphNode
  services: GraphNode[]
  ingresses: GraphNode[]
  onClick: () => void
  focused: boolean
}

function WorkloadCard({ node, services, ingresses, onClick, focused }: WorkloadCardProps) {
  const meta  = TYPE_META[node.type] ?? TYPE_META.deployment
  const rep   = node.metadata?.replicas ? parseInt(node.metadata.replicas) : null
  const avail = node.metadata?.available ? parseInt(node.metadata.available) : null
  const healthy = rep !== null && avail !== null ? avail >= rep : null

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="w-full text-left rounded-2xl p-4 flex flex-col gap-3 transition-all"
      style={{
        background: focused ? meta.bg : 'rgba(255,255,255,0.02)',
        border: `1px solid ${focused ? meta.border : 'rgba(255,255,255,0.06)'}`,
        boxShadow: focused ? `0 0 20px ${meta.bg}` : undefined,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md"
            style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
            {meta.label}
          </span>
          {healthy === true  && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="healthy" />}
          {healthy === false && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 animate-pulse" title="degraded" />}
        </div>
        {rep !== null && (
          <span className="shrink-0 text-[10px] font-mono text-slate-500">
            {avail ?? '?'}/{rep}
          </span>
        )}
        {node.metadata?.schedule && (
          <span className="shrink-0 text-[10px] font-mono text-slate-500 truncate max-w-[80px]">
            {node.metadata.schedule}
          </span>
        )}
      </div>

      {/* Name */}
      <div className="font-sans font-semibold text-sm text-slate-200 truncate" title={node.label}>
        {node.label}
      </div>

      {/* Badges row */}
      {(ingresses.length > 0 || services.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {ingresses.map(ing => (
            <span key={ing.id} className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-lg"
              style={{ background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}>
              <Globe size={8} />
              {ing.label}
            </span>
          ))}
          {services.map(svc => (
            <span key={svc.id} className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-lg"
              style={{ background: 'rgba(34,211,238,0.08)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.2)' }}>
              <Network size={8} />
              {svc.label}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-slate-600">{node.namespace}</span>
        <ChevronRight size={12} className="text-slate-600" />
      </div>
    </motion.button>
  )
}

// ── GenericCard (services, networking, rbac, secrets) ────────────────────────

function GenericCard({ node, onClick, focused }: { node: GraphNode; onClick: () => void; focused: boolean }) {
  const meta = TYPE_META[node.type] ?? TYPE_META.k8s_service

  const sub = (() => {
    if (node.type === 'ingress' && node.metadata?.host) return node.metadata.host
    if (node.type === 'k8s_service' && node.metadata?.svcType) return node.metadata.svcType
    if (node.type === 'networkpolicy') return node.metadata?.effect ?? ''
    if (node.type === 'secret' && node.metadata?.secretType) return node.metadata.secretType
    if (node.metadata?.roleRef) return node.metadata.roleRef
    return ''
  })()

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -1, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="w-full text-left rounded-xl px-3.5 py-3 flex items-center gap-3 transition-all"
      style={{
        background: focused ? meta.bg : 'rgba(255,255,255,0.02)',
        border: `1px solid ${focused ? meta.border : 'rgba(255,255,255,0.05)'}`,
      }}
    >
      <span className="shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md"
        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
        {meta.label}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-sans font-medium text-slate-300 truncate">{node.label}</div>
        {sub && <div className="text-[10px] font-mono text-slate-500 truncate">{sub}</div>}
      </div>
      <ChevronRight size={11} className="text-slate-600 shrink-0" />
    </motion.button>
  )
}

// ── NamespaceSection ─────────────────────────────────────────────────────────

interface NsSectionProps {
  ns: string
  nodes: GraphNode[]
  index: ReturnType<typeof useTopologyIndex>
  selectedId: string | null
  onSelect: (n: GraphNode) => void
  showPods: boolean
  showConfigs: boolean
  showRBAC: boolean
}

const RBAC_TYPES = new Set(['k8s_role','k8s_clusterrole','k8s_rolebinding','k8s_clusterrolebinding'])
const CONFIG_TYPES = new Set(['secret','configmap'])
const NET_TYPES = new Set(['k8s_service','ingress','networkpolicy'])

function NamespaceSection({ ns, nodes, index, selectedId, onSelect, showPods, showConfigs, showRBAC }: NsSectionProps) {
  const workloads = nodes.filter(n => WORKLOAD_TYPES.has(n.type))
  const networking = nodes.filter(n => NET_TYPES.has(n.type))
  const rbac    = showRBAC    ? nodes.filter(n => RBAC_TYPES.has(n.type))   : []
  const configs = showConfigs ? nodes.filter(n => CONFIG_TYPES.has(n.type)) : []
  const pods    = showPods    ? nodes.filter(n => n.type === 'pod')          : []

  const visible = workloads.length + networking.length + rbac.length + configs.length + pods.length
  if (!visible) return null

  return (
    <div className="space-y-3">
      {/* Namespace header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-400/60" />
          <span className="text-sm font-sans font-semibold text-slate-300">{ns}</span>
          <span className="text-xs font-mono text-slate-600">{visible} resources</span>
        </div>
        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
      </div>

      {/* Workloads grid */}
      {workloads.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {workloads.map(n => {
            const svcs = (index.workloadToSvcs.get(n.id) ?? []).map(id => index.nodeById.get(id)!).filter(Boolean)
            const ings = (index.workloadToIngs.get(n.id) ?? []).map(id => index.nodeById.get(id)!).filter(Boolean)
            return (
              <WorkloadCard key={n.id} node={n} services={svcs} ingresses={ings}
                onClick={() => onSelect(n)} focused={selectedId === n.id} />
            )
          })}
        </div>
      )}

      {/* Networking */}
      {networking.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {networking.map(n => (
            <GenericCard key={n.id} node={n} onClick={() => onSelect(n)} focused={selectedId === n.id} />
          ))}
        </div>
      )}

      {/* Pods */}
      {pods.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {pods.map(n => (
            <GenericCard key={n.id} node={n} onClick={() => onSelect(n)} focused={selectedId === n.id} />
          ))}
        </div>
      )}

      {/* RBAC */}
      {rbac.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {rbac.map(n => (
            <GenericCard key={n.id} node={n} onClick={() => onSelect(n)} focused={selectedId === n.id} />
          ))}
        </div>
      )}

      {/* Configs */}
      {configs.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {configs.map(n => (
            <GenericCard key={n.id} node={n} onClick={() => onSelect(n)} focused={selectedId === n.id} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function TopologyView({ data, focusNodeId }: TopologyViewProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [showPods,     setShowPods]     = useState(false)
  const [showConfigs,  setShowConfigs]  = useState(false)
  const [showRBAC,     setShowRBAC]     = useState(false)
  const [activeNs,     setActiveNs]     = useState<string | null>(null)

  const index = useTopologyIndex(data)

  // Focus node from navigation
  useEffect(() => {
    if (!focusNodeId) return
    const node = data.nodes.find(n => n.id === focusNodeId) ?? null
    if (node) { setSelectedNode(node); setActiveNs(node.namespace ?? null) }
  }, [focusNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Group nodes by namespace
  const byNs = useMemo(() => {
    const map = new Map<string, GraphNode[]>()
    for (const n of data.nodes) {
      if (!ALL_TOPO_TYPES.has(n.type)) continue
      const ns = n.namespace || '_cluster'
      if (!map.has(ns)) map.set(ns, [])
      map.get(ns)!.push(n)
    }
    return map
  }, [data.nodes])

  const namespaces = useMemo(() =>
    [...byNs.keys()].sort(nsSort),
    [byNs])

  const visibleNs = activeNs ? [activeNs] : namespaces

  // Stats
  const stats = useMemo(() => ({
    namespaces: namespaces.filter(n => n !== '_cluster').length,
    workloads:  data.nodes.filter(n => WORKLOAD_TYPES.has(n.type)).length,
    pods:       data.nodes.filter(n => n.type === 'pod').length,
    services:   data.nodes.filter(n => n.type === 'k8s_service').length,
    ingresses:  data.nodes.filter(n => n.type === 'ingress').length,
    netpols:    data.nodes.filter(n => n.type === 'networkpolicy').length,
    secrets:    data.nodes.filter(n => n.type === 'secret').length,
    configmaps: data.nodes.filter(n => n.type === 'configmap').length,
  }), [data.nodes])

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">

      {/* ── Stat bar ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-5 px-5 py-2 border-b border-cyber-border/30 bg-cyber-panel/30 backdrop-blur-sm flex-wrap">
        {([
          { label: 'namespaces', value: stats.namespaces, color: 'text-violet-400' },
          { label: 'workloads',  value: stats.workloads,  color: 'text-blue-400'   },
          { label: 'pods',       value: stats.pods,       color: 'text-cyan-400'   },
          { label: 'services',   value: stats.services,   color: 'text-teal-400'   },
          { label: 'ingresses',  value: stats.ingresses,  color: 'text-green-400'  },
          { label: 'netpols',    value: stats.netpols,    color: 'text-rose-400'   },
          { label: 'secrets',    value: stats.secrets,    color: 'text-amber-400'  },
          { label: 'configmaps', value: stats.configmaps, color: 'text-sky-400'    },
        ] as const).map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`text-lg font-mono font-bold ${color}`}>{value}</span>
            <span className="text-sm font-sans text-slate-400">{label}</span>
          </div>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-mono text-slate-500 mr-1">
            {selectedNode ? `${selectedNode.label} selected` : 'click any resource for details'}
          </span>

          {[
            { label: 'Pods',    active: showPods,    toggle: () => setShowPods(p => !p),    icon: <Layers size={10} />,      activeClass: 'border-cyan-500/50 bg-cyan-950/40 text-cyan-300' },
            { label: 'Secrets', active: showConfigs, toggle: () => setShowConfigs(p => !p), icon: <KeyRound size={10} />,    activeClass: 'border-amber-500/50 bg-amber-950/40 text-amber-300' },
            { label: 'RBAC',    active: showRBAC,    toggle: () => setShowRBAC(p => !p),    icon: <ShieldCheck size={10} />, activeClass: 'border-violet-500/50 bg-violet-950/40 text-violet-300' },
          ].map(({ label, active, toggle, icon, activeClass }) => (
            <button key={label} onClick={toggle}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all ${
                active ? activeClass : 'border-cyber-border bg-cyber-panel text-slate-400 hover:text-slate-300'
              }`}>
              {icon}{label} {active ? 'ON' : 'OFF'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Namespace filter tabs ─────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1 px-5 py-2 border-b border-cyber-border/20 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveNs(null)}
          className={`shrink-0 px-3 py-1 rounded-lg text-xs font-mono transition-all ${
            activeNs === null
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
          }`}
        >
          all namespaces
        </button>
        {namespaces.filter(n => n !== '_cluster').map(ns => (
          <button key={ns}
            onClick={() => setActiveNs(activeNs === ns ? null : ns)}
            className={`shrink-0 px-3 py-1 rounded-lg text-xs font-mono transition-all ${
              activeNs === ns
                ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            {ns}
          </button>
        ))}
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8 scrollbar-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeNs ?? 'all'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-8"
          >
            {visibleNs.map(ns => (
              <NamespaceSection
                key={ns}
                ns={ns}
                nodes={byNs.get(ns) ?? []}
                index={index}
                selectedId={selectedNode?.id ?? null}
                onSelect={n => setSelectedNode(prev => prev?.id === n.id ? null : n)}
                showPods={showPods}
                showConfigs={showConfigs}
                showRBAC={showRBAC}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Chain modal ───────────────────────────────────────────────────── */}
      <TopologyChainModal node={selectedNode} data={data} onClose={() => setSelectedNode(null)} />
    </div>
  )
}
