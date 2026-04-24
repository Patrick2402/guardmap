import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Cloud, Shield, Zap, Search, X, ShieldAlert } from 'lucide-react'
import { GraphData, GraphNode, BlastRadiusResult, WORKLOAD_TYPES } from '../types'
import { DbFinding } from '../hooks/useGraphData'
import { IRSAChainModal } from './IRSAChainModal'

interface GraphProps {
  data: GraphData
  blastRadius: BlastRadiusResult | null
  onNodeClick: (node: GraphNode | null) => void
  onFocusReady?: (fn: (nodeIds: string[]) => void) => void
  focusNodeId?: string | null
  findings?: DbFinding[]
  onFinding?: (f: DbFinding) => void
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

type AccessFilter = 'all' | 'full' | 'write' | 'read' | 'none'

// ── Data builder ──────────────────────────────────────────────────────────────

interface IRSAChain {
  workload:       GraphNode
  serviceAccount: GraphNode | null
  iamRole:        GraphNode | null
  awsServices:    Array<{ node: GraphNode; accessLevel: string; actions: string[] }>
}

function buildChains(data: GraphData): IRSAChain[] {
  const nodeById   = new Map(data.nodes.map(n => [n.id, n]))
  const podToSa    = new Map<string, string>()
  const saToRole   = new Map<string, string>()
  const roleToSvcs = new Map<string, Array<{ id: string; accessLevel: string; actions: string[] }>>()

  for (const e of data.edges) {
    if (e.label === 'uses')    podToSa.set(e.source, e.target)
    if (e.label === 'IRSA →' || e.label === 'assumes (IRSA)')  saToRole.set(e.source, e.target)
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
    const key    = `${workload.id}:${roleId ?? 'none'}`
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

  for (const n of data.nodes) {
    if (!WORKLOAD_TYPES.includes(n.type as typeof WORKLOAD_TYPES[number])) continue
    if (!chains.some(c => c.workload.id === n.id))
      chains.push({ workload: n, serviceAccount: null, iamRole: null, awsServices: [] })
  }

  return chains
}

function maxAccess(chain: IRSAChain): string {
  return chain.awsServices.reduce<string>((m, s) => {
    if (s.accessLevel === 'full') return 'full'
    if (s.accessLevel === 'write' && m !== 'full') return 'write'
    return m
  }, 'read')
}

// ── IRSAChainCard ─────────────────────────────────────────────────────────────

function IRSAChainCard({ chain, selected, dimmed, onClick }: {
  chain: IRSAChain; selected: boolean; dimmed: boolean; onClick: () => void
}) {
  const { workload, serviceAccount, iamRole, awsServices } = chain
  const tm  = WORKLOAD_TYPE_META[workload.type] ?? WORKLOAD_TYPE_META.deployment
  const rep   = workload.metadata?.replicas  ? parseInt(workload.metadata.replicas)  : null
  const avail = workload.metadata?.available ? parseInt(workload.metadata.available) : null
  const healthy = rep !== null && avail !== null ? avail >= rep : null
  const hasIAM  = iamRole !== null
  const ma  = hasIAM ? maxAccess(chain) : null
  const riskMeta = ma ? (ACCESS_META[ma] ?? ACCESS_META.read) : null

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      transition={{ duration: 0.15 }}
      className="w-full text-left rounded-2xl p-5 flex flex-col gap-4 transition-all"
      style={{
        opacity: dimmed ? 0.22 : 1,
        background: selected
          ? (riskMeta ? riskMeta.bg : 'rgba(34,211,238,0.08)')
          : 'rgba(255,255,255,0.02)',
        border: `1px solid ${selected
          ? (riskMeta ? riskMeta.border : 'rgba(34,211,238,0.25)')
          : 'rgba(255,255,255,0.06)'}`,
        boxShadow: selected ? `0 0 24px ${riskMeta?.bg ?? 'rgba(34,211,238,0.08)'}` : undefined,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md"
            style={{ color: tm.color, background: tm.bg, border: `1px solid ${tm.border}` }}>
            {tm.label}
          </span>
          {healthy === true  && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="healthy" />}
          {healthy === false && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 animate-pulse" title="degraded" />}
          {riskMeta && (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md"
              style={{ color: riskMeta.color, background: riskMeta.bg, border: `1px solid ${riskMeta.border}` }}>
              {riskMeta.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {rep !== null && (
            <span className="text-[10px] font-mono text-slate-500">{avail ?? '?'}/{rep}</span>
          )}
          <ChevronRight size={13} className="text-slate-600" />
        </div>
      </div>

      {/* Name */}
      <div>
        <div className="font-sans font-bold text-base text-slate-100 leading-snug" title={workload.label}>
          {workload.label}
        </div>
        <div className="text-[11px] font-mono text-slate-500 mt-0.5">{workload.namespace}</div>
      </div>

      {/* SA → IAM chain */}
      {(serviceAccount || iamRole) && (
        <div className="flex items-center gap-2 flex-wrap">
          {serviceAccount && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <Shield size={10} className="text-indigo-400 shrink-0" />
              <span className="text-[11px] font-mono text-indigo-300 max-w-[130px] truncate">{serviceAccount.label}</span>
            </div>
          )}
          {serviceAccount && iamRole && (
            <span className="text-[10px] font-mono text-slate-600">→</span>
          )}
          {iamRole && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <Zap size={10} className="text-amber-400 shrink-0" />
              <span className="text-[11px] font-mono text-amber-300 max-w-[150px] truncate">{iamRole.label}</span>
            </div>
          )}
        </div>
      )}

      {/* AWS services */}
      {awsServices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {awsServices.slice(0, 4).map(s => {
            const am = ACCESS_META[s.accessLevel] ?? ACCESS_META.read
            return (
              <div key={s.node.id} className="flex items-center gap-1 px-2 py-1 rounded-lg"
                style={{ background: am.bg, border: `1px solid ${am.border}` }}>
                <Cloud size={9} style={{ color: am.color }} className="shrink-0" />
                <span className="text-[10px] font-mono max-w-[100px] truncate" style={{ color: am.color }}>
                  {s.node.label}
                </span>
              </div>
            )
          })}
          {awsServices.length > 4 && (
            <span className="text-[10px] font-mono text-slate-600 self-center">+{awsServices.length - 4}</span>
          )}
        </div>
      )}

      {!hasIAM && (
        <div className="text-[10px] font-mono text-slate-700">no IRSA binding</div>
      )}
    </motion.button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const ACCESS_FILTERS: { key: AccessFilter; label: string; color?: string }[] = [
  { key: 'all',   label: 'All'      },
  { key: 'full',  label: 'Full',    color: '#f87171' },
  { key: 'write', label: 'Write',   color: '#fb923c' },
  { key: 'read',  label: 'Read',    color: '#4ade80' },
  { key: 'none',  label: 'No IRSA', color: '#64748b' },
]

export function Graph({ data, blastRadius, onNodeClick, onFocusReady, focusNodeId, findings, onFinding }: GraphProps) {
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [modalChain,    setModalChain]    = useState<IRSAChain | null>(null)
  const [search,        setSearch]        = useState('')
  const [activeNs,      setActiveNs]      = useState<string | null>(null)
  const [accessFilter,  setAccessFilter]  = useState<AccessFilter>('all')
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (!onFocusReady) return
    onFocusReady((nodeIds: string[]) => {
      const el = cardRefs.current.get(nodeIds[0])
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [onFocusReady])

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

  const namespaces = useMemo(() =>
    [...new Set(chains.map(c => c.workload.namespace ?? 'default'))]
      .sort((a, b) => {
        const ap = NS_PRIORITY[a] ?? 99, bp = NS_PRIORITY[b] ?? 99
        return ap !== bp ? ap - bp : a.localeCompare(b)
      })
  , [chains])

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
    if (accessFilter !== 'all') {
      if (accessFilter === 'none') return !c.iamRole
      if (!c.iamRole) return false
      const ma = maxAccess(c)
      if (accessFilter === 'full')  return ma === 'full'
      if (accessFilter === 'write') return ma === 'write'
      if (accessFilter === 'read')  return ma === 'read'
    }
    return true
  }), [chains, activeNs, search, accessFilter])

  const byNs = useMemo(() => {
    const m = new Map<string, IRSAChain[]>()
    for (const c of filtered) {
      const ns = c.workload.namespace ?? 'default'
      if (!m.has(ns)) m.set(ns, [])
      m.get(ns)!.push(c)
    }
    return m
  }, [filtered])

  const nsOrder = useMemo(() =>
    [...byNs.keys()].sort((a, b) => {
      const ap = NS_PRIORITY[a] ?? 99, bp = NS_PRIORITY[b] ?? 99
      return ap !== bp ? ap - bp : a.localeCompare(b)
    })
  , [byNs])

  // Stats
  const iamCount   = chains.filter(c => c.iamRole).length
  const fullCount  = chains.filter(c => c.awsServices.some(s => s.accessLevel === 'full')).length
  const writeCount = chains.filter(c =>
    c.awsServices.some(s => s.accessLevel === 'write') && !c.awsServices.some(s => s.accessLevel === 'full')
  ).length
  const noIrsaCount = chains.filter(c => !c.iamRole).length

  function handleClick(chain: IRSAChain) {
    const node = chain.workload
    const next = selectedId === node.id ? null : node.id
    setSelectedId(next)
    onNodeClick(next ? node : null)
    if (next) setModalChain(chain)
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">

      {/* ── Stat bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-5 px-5 py-2 border-b border-cyber-border/30 bg-cyber-panel/30 backdrop-blur-sm flex-wrap">
        {[
          { val: chains.length, label: 'workloads',  color: 'text-blue-400'   },
          { val: iamCount,      label: 'with IRSA',  color: 'text-amber-400'  },
          { val: fullCount,     label: 'full access', color: 'text-red-400'   },
          { val: writeCount,    label: 'write access',color: 'text-orange-400'},
          { val: noIrsaCount,   label: 'no IRSA',    color: 'text-slate-500'  },
        ].map(({ val, label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`text-lg font-mono font-bold ${color}`}>{val}</span>
            <span className="text-sm font-sans text-slate-400">{label}</span>
          </div>
        ))}
        {blastRadius && (
          <div className="flex items-center gap-2 ml-2 px-3 py-1 rounded-xl border border-yellow-500/35 bg-yellow-950/25">
            <Zap size={11} className="text-yellow-400" />
            <span className="text-xs font-sans font-semibold text-yellow-300">
              Blast radius — {blastRadius.fullTargets.length} full · {blastRadius.writeTargets.length} write
            </span>
          </div>
        )}
      </div>

      {/* ── Search + access filter ────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 border-b border-cyber-border/20 bg-cyber-panel/20">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl flex-1 max-w-xs"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Search size={12} className="text-slate-500 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search workloads, roles, services…"
            className="bg-transparent text-sm font-mono text-slate-300 placeholder-slate-600 outline-none flex-1 min-w-0"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-300 transition-colors shrink-0">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Access level pills */}
        <div className="flex items-center gap-1">
          <ShieldAlert size={11} className="text-slate-600 shrink-0 mr-1" />
          {ACCESS_FILTERS.map(f => (
            <button key={f.key}
              onClick={() => setAccessFilter(f.key)}
              className="px-3 py-1 rounded-lg text-xs font-mono transition-all whitespace-nowrap"
              style={accessFilter === f.key ? {
                background: f.color ? `${f.color}18` : 'rgba(34,211,238,0.12)',
                color: f.color ?? '#67e8f9',
                border: `1px solid ${f.color ? `${f.color}40` : 'rgba(34,211,238,0.3)'}`,
              } : {
                color: '#64748b',
                border: '1px solid transparent',
              }}>
              {f.key !== 'all' && f.color && (
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                  style={{ background: f.color }} />
              )}
              {f.label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[10px] font-mono text-slate-600 hidden lg:block">
          {filtered.length} / {chains.length} shown
        </span>
      </div>

      {/* ── Namespace tabs ────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1 px-5 py-2 border-b border-cyber-border/15 overflow-x-auto scrollbar-none">
        <button onClick={() => setActiveNs(null)}
          className={`shrink-0 px-3 py-1 rounded-lg text-xs font-mono transition-all ${
            activeNs === null
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
          }`}>
          all namespaces
        </button>
        {namespaces.map(ns => (
          <button key={ns} onClick={() => setActiveNs(activeNs === ns ? null : ns)}
            className={`shrink-0 px-3 py-1 rounded-lg text-xs font-mono transition-all ${
              activeNs === ns
                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}>
            {ns}
          </button>
        ))}
      </div>

      {/* ── Card grid ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8 scrollbar-none">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Search size={24} className="text-slate-700" />
            <p className="text-sm font-mono text-slate-500">No workloads match your filters</p>
            <button onClick={() => { setSearch(''); setAccessFilter('all'); setActiveNs(null) }}
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors">
              clear all filters
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={`${activeNs}-${accessFilter}`}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} className="space-y-8">
            {nsOrder.map(ns => {
              const nsChains = byNs.get(ns) ?? []
              return (
                <div key={ns} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-400/60" />
                    <span className="text-sm font-sans font-semibold text-slate-300">{ns}</span>
                    <span className="text-xs font-mono text-slate-600">{nsChains.length} workloads</span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
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

      {/* IRSA chain modal */}
      {modalChain && (
        <IRSAChainModal
          chain={modalChain}
          findings={findings}
          onClose={() => { setModalChain(null); setSelectedId(null); onNodeClick(null) }}
          onFinding={onFinding}
        />
      )}
    </div>
  )
}
