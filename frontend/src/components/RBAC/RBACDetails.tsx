import { useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShieldCheck, Globe, Link2, Box, Hash, AlertTriangle, ChevronRight } from 'lucide-react'
import { GraphData, GraphNode } from '../../types'
import { DbFinding } from '../../hooks/useGraphData'

interface Props {
  node: GraphNode | null
  data: GraphData
  findings?: DbFinding[]
  onClose: () => void
  onFinding?: (f: DbFinding) => void
}

// ── Visual config ──────────────────────────────────────────────────────────────

const TYPE_CFG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  k8s_role:              { label: 'Role',               color: '#ef4444', Icon: ShieldCheck },
  k8s_clusterrole:       { label: 'ClusterRole',        color: '#f97316', Icon: Globe       },
  k8s_rolebinding:       { label: 'RoleBinding',        color: '#8b5cf6', Icon: Link2       },
  k8s_clusterrolebinding:{ label: 'ClusterRoleBinding', color: '#a78bfa', Icon: Link2       },
  serviceaccount:        { label: 'ServiceAccount',     color: '#6366f1', Icon: Box         },
}

const DANGER: Record<string, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: 'CRITICAL', color: '#f87171', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)'   },
  high:     { label: 'HIGH',     color: '#fb923c', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.35)'  },
  medium:   { label: 'MEDIUM',   color: '#facc15', bg: 'rgba(234,179,8,0.1)',    border: 'rgba(234,179,8,0.3)'    },
  low:      { label: 'LOW',      color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.2)'  },
}

const FINDING_SEV: Record<string, string> = {
  critical: 'text-red-400 border-red-500/30 bg-red-900/20',
  high:     'text-orange-400 border-orange-500/30 bg-orange-900/20',
  medium:   'text-yellow-400 border-yellow-500/30 bg-yellow-900/15',
  low:      'text-slate-400 border-slate-600/30 bg-slate-800/30',
}

const EDGE_COLOR: Record<string, string> = {
  'grants →': '#8b5cf6',
  'bound →':  '#7c3aed',
  'uses':     '#6366f1',
  'manages':  '#3b82f6',
}

// ── Mini-graph node card ──────────────────────────────────────────────────────

interface MiniNode { node: GraphNode; edgeLabel?: string; isFocal?: boolean }

function MiniCard({ n }: { n: MiniNode }) {
  const cfg = TYPE_CFG[n.node.type] ?? { color: '#94a3b8', label: n.node.type, Icon: Box }
  const danger = n.node.metadata?.danger
  const d = danger ? DANGER[danger] : null
  const edgeColor = n.edgeLabel ? (EDGE_COLOR[n.edgeLabel] ?? '#64748b') : '#64748b'

  return (
    <div className="flex items-center gap-2 shrink-0">
      {n.edgeLabel !== undefined && (
        <div className="flex flex-col items-center gap-0.5 shrink-0 mx-1">
          <div className="flex items-center gap-0.5">
            <div className="w-6 h-px" style={{ background: `${edgeColor}50` }} />
            <ChevronRight size={11} style={{ color: edgeColor }} />
          </div>
          <span className="text-[9px] font-mono whitespace-nowrap" style={{ color: edgeColor }}>
            {n.edgeLabel}
          </span>
        </div>
      )}
      <div className="flex flex-col gap-2 p-3.5 rounded-xl shrink-0"
        style={{
          background: n.isFocal ? `${cfg.color}16` : 'rgba(255,255,255,0.03)',
          border: n.isFocal ? `1.5px solid ${cfg.color}60` : `1px solid ${cfg.color}25`,
          minWidth: 160,
          boxShadow: n.isFocal ? `0 0 28px ${cfg.color}25` : undefined,
        }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <cfg.Icon size={11} style={{ color: cfg.color }} />
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
          {n.isFocal && (
            <span className="text-[8px] font-mono px-1 py-0.5 rounded"
              style={{ background: `${cfg.color}20`, color: cfg.color }}>
              selected
            </span>
          )}
          {d && (
            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-md font-bold"
              style={{ color: d.color, background: d.bg, border: `1px solid ${d.border}` }}>
              {d.label}
            </span>
          )}
        </div>
        <div className="text-sm font-mono font-semibold text-slate-100 leading-snug" style={{ wordBreak: 'break-word', maxWidth: 220 }}>
          {n.node.label}
        </div>
        {n.node.namespace && (
          <div className="text-[10px] font-mono text-slate-500">{n.node.namespace}</div>
        )}
      </div>
    </div>
  )
}

// ── RBAC chain builder ────────────────────────────────────────────────────────

function buildRBACChain(focal: GraphNode, data: GraphData): MiniNode[][] {
  const { nodes, edges } = data
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  const ROLE_TYPES    = new Set(['k8s_role', 'k8s_clusterrole'])
  const BINDING_TYPES = new Set(['k8s_rolebinding', 'k8s_clusterrolebinding'])

  // Build edge indices
  const outE = new Map<string, typeof edges[0][]>()
  const inE  = new Map<string, typeof edges[0][]>()
  edges.forEach(e => {
    if (!outE.has(e.source)) outE.set(e.source, [])
    outE.get(e.source)!.push(e)
    if (!inE.has(e.target)) inE.set(e.target, [])
    inE.get(e.target)!.push(e)
  })

  const chains: MiniNode[][] = []

  if (ROLE_TYPES.has(focal.type)) {
    // Role: find bindings → find SAs
    const bindingEdges = (inE.get(focal.id) ?? []).filter(e => e.label === 'grants →')
    if (!bindingEdges.length) return [[{ node: focal, isFocal: true }]]

    for (const be of bindingEdges.slice(0, 4)) {
      const binding = nodeMap.get(be.source)
      if (!binding) continue
      const saEdges = (inE.get(binding.id) ?? []).filter(e => e.label === 'bound →')
      const saNodes = saEdges.slice(0, 3).map(e => nodeMap.get(e.source)).filter(Boolean) as GraphNode[]

      if (!saNodes.length) {
        chains.push([
          { node: binding, edgeLabel: undefined },
          { node: focal, edgeLabel: 'grants →', isFocal: true },
        ])
      } else {
        for (const sa of saNodes) {
          chains.push([
            { node: sa, edgeLabel: undefined },
            { node: binding, edgeLabel: 'bound →' },
            { node: focal, edgeLabel: 'grants →', isFocal: true },
          ])
        }
      }
    }
    return chains.slice(0, 5)
  }

  if (BINDING_TYPES.has(focal.type)) {
    // Binding: find SAs + role
    const roleEdge = (outE.get(focal.id) ?? []).find(e => e.label === 'grants →')
    const role = roleEdge ? nodeMap.get(roleEdge.target) : null
    const saEdges = (inE.get(focal.id) ?? []).filter(e => e.label === 'bound →')
    const saNodes = saEdges.slice(0, 4).map(e => nodeMap.get(e.source)).filter(Boolean) as GraphNode[]

    if (!saNodes.length && !role) return [[{ node: focal, isFocal: true }]]

    if (!saNodes.length) {
      const chain: MiniNode[] = [{ node: focal, isFocal: true }]
      if (role) chain.push({ node: role, edgeLabel: 'grants →' })
      return [chain]
    }

    for (const sa of saNodes) {
      const chain: MiniNode[] = [
        { node: sa },
        { node: focal, edgeLabel: 'bound →', isFocal: true },
      ]
      if (role) chain.push({ node: role, edgeLabel: 'grants →' })
      chains.push(chain)
    }
    return chains.slice(0, 5)
  }

  if (focal.type === 'serviceaccount') {
    // SA: find bindings → roles
    const bindEdges = (outE.get(focal.id) ?? []).filter(e => e.label === 'bound →')
    if (!bindEdges.length) return [[{ node: focal, isFocal: true }]]

    for (const be of bindEdges.slice(0, 4)) {
      const binding = nodeMap.get(be.target)
      if (!binding) continue
      const roleEdge = (outE.get(binding.id) ?? []).find(e => e.label === 'grants →')
      const role = roleEdge ? nodeMap.get(roleEdge.target) : null
      const chain: MiniNode[] = [
        { node: focal, isFocal: true },
        { node: binding, edgeLabel: 'bound →' },
      ]
      if (role) chain.push({ node: role, edgeLabel: 'grants →' })
      chains.push(chain)
    }
    return chains.slice(0, 5)
  }

  return [[{ node: focal, isFocal: true }]]
}

// ── Rule row ──────────────────────────────────────────────────────────────────

const VERB_STYLE: Record<string, string> = {
  '*':       'border-red-500/40 bg-red-900/40 text-red-300',
  delete:    'border-red-500/30 bg-red-900/30 text-red-300',
  create:    'border-red-500/30 bg-red-900/30 text-red-300',
  escalate:  'border-red-500/30 bg-red-900/30 text-red-300',
  update:    'border-yellow-500/30 bg-yellow-900/20 text-yellow-300',
  patch:     'border-yellow-500/30 bg-yellow-900/20 text-yellow-300',
}

function RuleRow({ rule }: { rule: string }) {
  const [resPart, verbs] = rule.split(':')
  const verbList = (verbs ?? '').split(',').filter(Boolean)
  const isWild = resPart?.includes('*') || verbList.includes('*')
  return (
    <div className={`flex items-start gap-4 py-2.5 border-b border-slate-800/50 last:border-b-0 ${isWild ? 'bg-red-950/15 rounded' : ''}`}>
      <span className="text-sm font-mono text-slate-200 shrink-0 min-w-[160px] leading-snug">{resPart}</span>
      <div className="flex flex-wrap gap-1.5">
        {verbList.map(v => (
          <span key={v} className={`text-[11px] font-mono px-2 py-0.5 rounded-md border ${
            VERB_STYLE[v] ?? 'border-slate-700/40 bg-slate-800/40 text-slate-400'
          }`}>{v}</span>
        ))}
      </div>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function RBACDetails({ node, data, findings = [], onClose, onFinding }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [node])

  const { chains, relatedFindings, rules } = useMemo(() => {
    if (!node) return { chains: [], relatedFindings: [], rules: [] }

    const chains = buildRBACChain(node, data)

    const relatedFindings = findings.filter(f =>
      f.resource.toLowerCase().includes(node.label.toLowerCase()) ||
      (node.namespace && f.resource.toLowerCase().includes(node.namespace.toLowerCase()))
    ).slice(0, 8)

    const rules = node.metadata?.rules
      ? node.metadata.rules.split('; ').filter(Boolean)
      : []

    return { chains, relatedFindings, rules }
  }, [node, data, findings])

  const cfg = node ? (TYPE_CFG[node.type] ?? { label: node.type, color: '#94a3b8', Icon: Box }) : null
  const danger = node?.metadata?.danger
  const d = danger ? DANGER[danger] : null
  const showChain = chains.some(c => c.length > 1)

  return (
    <AnimatePresence>
      {node && cfg && (
        <>
          {/* Backdrop */}
          <motion.div
            key="rbac-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key={node.id}
            initial={{ opacity: 0, scale: 0.97, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 14 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-x-6 top-16 z-50 rounded-2xl flex flex-col overflow-hidden max-w-3xl mx-auto max-h-[calc(100vh-7rem)]"
            style={{
              background: 'rgba(8,12,20,0.97)',
              backdropFilter: 'blur(32px)',
              border: `1px solid ${cfg.color}28`,
              boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 60px ${cfg.color}12`,
            }}
            onClick={e => e.stopPropagation()}
          >

            {/* ── Header ── */}
            <div className="flex items-start gap-4 px-7 py-5 shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: `${cfg.color}0a` }}>
              <cfg.Icon size={20} style={{ color: cfg.color }} className="mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] mb-1" style={{ color: cfg.color }}>
                  {cfg.label}
                </div>
                <div className="text-2xl font-mono font-bold text-slate-100 leading-tight break-all">
                  {node.label}
                </div>
                {node.namespace && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Hash size={11} className="text-slate-500" />
                    <span className="text-sm font-mono text-slate-500">{node.namespace}</span>
                  </div>
                )}
                {d && (
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg"
                    style={{ background: d.bg, border: `1px solid ${d.border}` }}>
                    <AlertTriangle size={12} style={{ color: d.color }} />
                    <span className="text-xs font-mono font-bold" style={{ color: d.color }}>{d.label} RISK</span>
                  </div>
                )}
              </div>
              <button onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors shrink-0"
                style={{ background: 'rgba(255,255,255,0.05)' }}>
                <X size={16} />
              </button>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto scrollbar-none">

              {/* Permission chain mini-graph */}
              {showChain && (
                <div className="px-7 py-5 border-b border-slate-800/50">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-slate-500 mb-4">
                    Permission chain
                  </div>
                  <div ref={scrollRef} className="overflow-x-auto scrollbar-none">
                    <div className="flex flex-col gap-3 min-w-max py-1">
                      {chains.map((chain, ci) => (
                        <div key={ci} className="flex items-center gap-0">
                          {chains.length > 1 && (
                            <span className="text-[10px] font-mono text-slate-700 w-5 shrink-0 text-right mr-2 select-none">
                              {ci + 1}
                            </span>
                          )}
                          {chain.map((step, i) => (
                            <MiniCard key={step.node.id + i} n={step} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Rules (for roles) */}
              {rules.length > 0 && (
                <div className="px-7 py-5 border-b border-slate-800/50">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-slate-500 mb-4">
                    Rules · {rules.length}
                  </div>
                  <div className="space-y-0">
                    {rules.map((r, i) => <RuleRow key={i} rule={r} />)}
                  </div>
                </div>
              )}

              {/* RoleRef (for bindings) */}
              {node.metadata?.roleRef && (
                <div className="px-7 py-5 border-b border-slate-800/50">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-slate-500 mb-4">
                    Grants access to
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <Globe size={16} className="text-orange-400 shrink-0" />
                    <div>
                      <div className="text-base font-mono text-orange-300">{node.metadata.roleRef}</div>
                      <div className="text-xs font-mono text-slate-500 mt-0.5">{node.metadata.roleKind ?? 'Role'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Related findings */}
              {relatedFindings.length > 0 && (
                <div className="px-7 py-5 border-b border-slate-800/50">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-slate-500 mb-4">
                    Related findings · {relatedFindings.length}
                  </div>
                  <div className="space-y-2">
                    {relatedFindings.map((f, i) => (
                      <button key={i}
                        onClick={() => { onFinding?.(f); onClose() }}
                        className={`w-full text-left flex gap-3 p-3.5 rounded-xl border transition-all ${
                          onFinding
                            ? 'cursor-pointer hover:brightness-125 hover:scale-[1.01]'
                            : 'cursor-default'
                        } ${FINDING_SEV[f.severity] ?? FINDING_SEV.low}`}
                        style={{ transition: 'filter 0.15s, transform 0.15s' }}>
                        <span className="text-[10px] font-mono font-bold uppercase mt-0.5 shrink-0">{f.severity}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-mono text-slate-200 leading-snug">{f.type}</div>
                            {onFinding && <span className="text-[9px] font-mono text-slate-500 shrink-0">view →</span>}
                          </div>
                          <div className="text-xs font-sans text-slate-400 mt-1 leading-relaxed">{f.description}</div>
                          <div className="text-[10px] font-mono text-slate-600 mt-1.5">{f.resource}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="h-5" />
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center justify-between px-7 py-3.5 shrink-0"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
              <p className="text-xs font-mono text-slate-600">
                {showChain ? 'Chain reconstructed from graph edges' : 'No chain connections found'}
              </p>
              <button onClick={onClose}
                className="text-sm font-sans text-slate-400 hover:text-slate-200 transition-colors px-4 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.05)' }}>
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
