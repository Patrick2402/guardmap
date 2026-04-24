import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Cloud, Shield, Zap, Search, X, SlidersHorizontal } from 'lucide-react'
import { GraphData, GraphNode, BlastRadiusResult, WORKLOAD_TYPES } from '../types'

interface GraphProps {
  data: GraphData
  blastRadius: BlastRadiusResult | null
  onNodeClick: (node: GraphNode | null) => void
  onFocusReady?: (fn: (nodeIds: string[]) => void) => void
  search?: string
  activeNs?: string | null
  focusNodeId?: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NS_PRIORITY: Record<string, number> = { production: 0, prod: 0, staging: 1, default: 2 }

const ACCESS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  full:  { label: 'FULL',  color: '#f87171', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)'  },
  write: { label: 'WRITE', color: '#fb923c', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' },
  read:  { label: 'READ',  color: '#4ade80', bg: 'rgba(74,222,128,0.08)',border: 'rgba(74,222,128,0.2)' },
}

const WORKLOAD_TYPE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  deployment:  { label: 'DEPLOYMENT',  color: '#60a5fa', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)'  },
  statefulset: { label: 'STATEFULSET', color: '#a78bfa', bg: 'rgba(139,92,246,0.08)',  border: 'rgba(139,92,246,0.2)'  },
  daemonset:   { label: 'DAEMONSET',   color: '#fb923c', bg: 'rgba(249,115,22,0.08)',  border: 'rgba(249,115,22,0.2)'  },
  job:         { label: 'JOB',         color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.2)'  },
  cronjob:     { label: 'CRONJOB',     color: '#2dd4bf', bg: 'rgba(45,212,191,0.08)',  border: 'rgba(45,212,191,0.2)'  },
}

// ── Data builder ──────────────────────────────────────────────────────────────

interface IRSAChain {
  workload:       GraphNode
  serviceAccount: GraphNode | null
  iamRole:        GraphNode | null
  awsServices:    Array<{ node: GraphNode; accessLevel: string; actions: string[] }>
}

function buildChains(data: GraphData): IRSAChain[] {
  const nodeById   = new Map(data.nodes.map(n => [n.id, n]))
  const podToSa    = new Map<string, string>()   // pod → sa
  const saToRole   = new Map<string, string>()   // sa → role
  const roleToSvcs = new Map<string, Array<{ id: string; accessLevel: string; actions: string[] }>>()

  for (const e of data.edges) {
    if (e.label === 'uses')    podToSa.set(e.source, e.target)
    if (e.label === 'IRSA →')  saToRole.set(e.source, e.target)
    if (e.source.startsWith('role:') && e.target.startsWith('svc:')) {
      if (!roleToSvcs.has(e.source)) roleToSvcs.set(e.source, [])
      roleToSvcs.get(e.source)!.push({ id: e.target, accessLevel: e.accessLevel ?? 'read', actions: e.actions ?? [] })
    }
  }

  const chains: IRSAChain[] = []
  const seen = new Set<string>()

  for (const e of data.edges) {
    if (e.label !== 'manages') continue
    const workload = nodeById.get(e.source)
    const pod      = nodeById.get(e.target)
    if (!workload || !WORKLOAD_TYPES.includes(workload.type as typeof WORKLOAD_TYPES[number])) continue
    if (!pod || pod.type !== 'pod') continue

    const saId   = podToSa.get(pod.id)
    const roleId = saId ? saToRole.get(saId) : undefined

    const key = `${workload.id}:${roleId ?? 'none'}`
    if (seen.has(key)) continue
    seen.add(key)

    const awsServices = roleId
      ? (roleToSvcs.get(roleId) ?? []).map(s => ({
          node: nodeById.get(s.id)!,
          accessLevel: s.accessLevel,
          actions: s.actions,
        })).filter(s => s.node)
      : []

    chains.push({
      workload,
      serviceAccount: saId   ? nodeById.get(saId)   ?? null : null,
      iamRole:        roleId ? nodeById.get(roleId)  ?? null : null,
      awsServices,
    })
  }

  // Also include workloads with no pods/SA (standalone)
  for (const n of data.nodes) {
    if (!WORKLOAD_TYPES.includes(n.type as typeof WORKLOAD_TYPES[number])) continue
    const hasChain = chains.some(c => c.workload.id === n.id)
    if (!hasChain) {
      chains.push({ workload: n, serviceAccount: null, iamRole: null, awsServices: [] })
    }
  }

  return chains
}

// ── IRSAChainCard ─────────────────────────────────────────────────────────────

function IRSAChainCard({ chain, selected, dimmed, onClick }: {
  chain: IRSAChain; selected: boolean; dimmed: boolean; onClick: () => void
}) {
  const { workload, serviceAccount, iamRole, awsServices } = chain
  const tm  = WORKLOAD_TYPE_META[workload.type] ?? WORKLOAD_TYPE_META.deployment
  const rep   = workload.metadata?.replicas ? parseInt(workload.metadata.replicas) : null
  const avail = workload.metadata?.available ? parseInt(workload.metadata.available) : null
  const healthy = rep !== null && avail !== null ? avail >= rep : null
  const hasIAM  = iamRole !== null

  // Max access level across all services
  const maxAccess = awsServices.reduce<string>((m, s) => {
    if (s.accessLevel === 'full')  return 'full'
    if (s.accessLevel === 'write' && m !== 'full') return 'write'
    return m
  }, 'read')
  const riskMeta = hasIAM ? (ACCESS_META[maxAccess] ?? ACCESS_META.read) : null

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      transition={{ duration: 0.15 }}
      className="w-full text-left rounded-2xl p-5 flex flex-col gap-4 transition-all"
      style={{
        opacity: dimmed ? 0.25 : 1,
        background: selected
          ? (riskMeta ? riskMeta.bg : 'rgba(34,211,238,0.08)')
          : 'rgba(255,255,255,0.02)',
        border: `1px solid ${selected
          ? (riskMeta ? riskMeta.border : 'rgba(34,211,238,0.25)')
          : 'rgba(255,255,255,0.06)'}`,
        boxShadow: selected ? `0 0 24px ${riskMeta?.bg ?? 'rgba(34,211,238,0.08)'}` : undefined,
      }}
    >
      {/* Workload header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md"
            style={{ color: tm.color, background: tm.bg, border: `1px solid ${tm.border}` }}>
            {tm.label}
          </span>
          {healthy === true  && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
          {healthy === false && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 animate-pulse" />}
          {riskMeta && (
            <span className="shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md"
              style={{ color: riskMeta.color, background: riskMeta.bg, border: `1px solid ${riskMeta.border}` }}>
              {riskMeta.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rep !== null && (
            <span className="text-[10px] font-mono text-slate-500">{avail ?? '?'}/{rep}</span>
          )}
          <ChevronRight size={13} className="text-slate-600" />
        </div>
      </div>

      {/* Name */}
      <div>
        <div className="font-sans font-bold text-base text-slate-100 truncate" title={workload.label}>
          {workload.label}
        </div>
        <div className="text-[11px] font-mono text-slate-500 mt-0.5">{workload.namespace}</div>
      </div>

      {/* IRSA chain */}
      {(serviceAccount || iamRole) && (
        <div className="flex items-center gap-2 flex-wrap">
          {serviceAccount && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <Shield size={10} className="text-indigo-400 shrink-0" />
              <span className="text-[11px] font-mono text-indigo-300 truncate max-w-[140px]">{serviceAccount.label}</span>
            </div>
          )}
          {serviceAccount && iamRole && (
            <span className="text-[10px] font-mono text-slate-600">→</span>
          )}
          {iamRole && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <Zap size={10} className="text-amber-400 shrink-0" />
              <span className="text-[11px] font-mono text-amber-300 truncate max-w-[160px]">{iamRole.label}</span>
            </div>
          )}
        </div>
      )}

      {/* AWS services */}
      {awsServices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {awsServices.map(s => {
            const am = ACCESS_META[s.accessLevel] ?? ACCESS_META.read
            return (
              <div key={s.node.id} className="flex items-center gap-1 px-2 py-1 rounded-lg"
                style={{ background: am.bg, border: `1px solid ${am.border}` }}>
                <Cloud size={9} style={{ color: am.color }} className="shrink-0" />
                <span className="text-[10px] font-mono truncate max-w-[100px]" style={{ color: am.color }}>
                  {s.node.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* No IAM */}
      {!hasIAM && (
        <div className="text-[10px] font-mono text-slate-600">no IRSA binding</div>
      )}
    </motion.button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function Graph({ data, blastRadius, onNodeClick, onFocusReady, search = '', activeNs = null, focusNodeId }: GraphProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Register focus callback (scroll to card)
  useEffect(() => {
    if (!onFocusReady) return
    onFocusReady((nodeIds: string[]) => {
      const id = nodeIds[0]
      const el = cardRefs.current.get(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [onFocusReady])

  // Auto-select from Findings navigation
  useEffect(() => {
    if (!focusNodeId) return
    setSelectedId(focusNodeId)
    const node = data.nodes.find(n => n.id === focusNodeId) ?? null
    onNodeClick(node)
    setTimeout(() => {
      const el = cardRefs.current.get(focusNodeId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }, [focusNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const chains = useMemo(() => buildChains(data), [data])

  // Filter + search
  const filtered = useMemo(() => chains.filter(c => {
    if (activeNs && c.workload.namespace !== activeNs) return false
    if (search) {
      const q = search.toLowerCase()
      const hit =
        c.workload.label.toLowerCase().includes(q) ||
        c.serviceAccount?.label.toLowerCase().includes(q) ||
        c.iamRole?.label.toLowerCase().includes(q) ||
        c.awsServices.some(s => s.node.label.toLowerCase().includes(q))
      if (!hit) return false
    }
    return true
  }), [chains, activeNs, search])

  // Group by namespace
  const byNs = useMemo(() => {
    const m = new Map<string, IRSAChain[]>()
    for (const c of filtered) {
      const ns = c.workload.namespace ?? 'default'
      if (!m.has(ns)) m.set(ns, [])
      m.get(ns)!.push(c)
    }
    return m
  }, [filtered])

  const namespaces = useMemo(() =>
    [...byNs.keys()].sort((a, b) => {
      const ap = NS_PRIORITY[a] ?? 99, bp = NS_PRIORITY[b] ?? 99
      return ap !== bp ? ap - bp : a.localeCompare(b)
    }), [byNs])

  // Stats
  const iamCount  = chains.filter(c => c.iamRole).length
  const fullCount = chains.filter(c => c.awsServices.some(s => s.accessLevel === 'full')).length
  const writeCount= chains.filter(c => c.awsServices.some(s => s.accessLevel === 'write') && !c.awsServices.some(s => s.accessLevel === 'full')).length

  function handleClick(chain: IRSAChain) {
    const node = chain.workload
    const next = selectedId === node.id ? null : node.id
    setSelectedId(next)
    onNodeClick(next ? node : null)
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">

      {/* Stat bar */}
      <div className="shrink-0 flex items-center gap-5 px-5 py-2 border-b border-cyber-border/30 bg-cyber-panel/30 backdrop-blur-sm flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-mono font-bold text-blue-400">{chains.length}</span>
          <span className="text-sm font-sans text-slate-400">workloads</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-mono font-bold text-amber-400">{iamCount}</span>
          <span className="text-sm font-sans text-slate-400">with IRSA</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-mono font-bold text-red-400">{fullCount}</span>
          <span className="text-sm font-sans text-slate-400">full access</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-mono font-bold text-orange-400">{writeCount}</span>
          <span className="text-sm font-sans text-slate-400">write access</span>
        </div>

        {blastRadius && (
          <div className="flex items-center gap-2 ml-2 px-3 py-1 rounded-xl border border-yellow-500/35 bg-yellow-950/25">
            <Zap size={11} className="text-yellow-400" />
            <span className="text-xs font-sans font-semibold text-yellow-300">
              Blast radius — {blastRadius.fullTargets.length} full · {blastRadius.writeTargets.length} write
            </span>
          </div>
        )}

        <span className="ml-auto text-xs font-mono text-slate-500">click workload to inspect IAM permissions</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8 scrollbar-none">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Search size={20} className="text-slate-600" />
            <p className="text-sm font-sans text-slate-500">No workloads match your search</p>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={activeNs ?? 'all'}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} className="space-y-8">
            {namespaces.map(ns => {
              const nsChains = byNs.get(ns) ?? []
              return (
                <div key={ns} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-400/60" />
                    <span className="text-sm font-sans font-semibold text-slate-300">{ns}</span>
                    <span className="text-xs font-mono text-slate-600">{nsChains.length} workloads</span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  </div>
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                    {nsChains.map(c => (
                      <div key={c.workload.id} ref={el => { if (el) cardRefs.current.set(c.workload.id, el) }}>
                        <IRSAChainCard
                          chain={c}
                          selected={selectedId === c.workload.id}
                          dimmed={blastRadius !== null && !blastRadius.reachableNodeIds.has(c.workload.id)}
                          onClick={() => handleClick(c)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
