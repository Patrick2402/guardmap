import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ShieldAlert, Shield, Users } from 'lucide-react'
import { GraphData, GraphNode } from '../../types'
import { DbFinding } from '../../hooks/useGraphData'
import { RBACDetails } from './RBACDetails'

interface RBACViewProps { data: GraphData; focusNodeId?: string | null; findings?: DbFinding[] }

const SYSTEM_NS   = new Set(['kube-system','kube-public','kube-node-lease','ingress-nginx','cert-manager'])
const ROLE_TYPES  = new Set(['k8s_role','k8s_clusterrole'])
const BIND_TYPES  = new Set(['k8s_rolebinding','k8s_clusterrolebinding'])

const DANGER: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  critical: { label: 'CRITICAL', color: '#f87171', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   dot: 'bg-red-400'    },
  high:     { label: 'HIGH',     color: '#fb923c', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.3)',  dot: 'bg-orange-400' },
  medium:   { label: 'MEDIUM',   color: '#facc15', bg: 'rgba(234,179,8,0.1)',   border: 'rgba(234,179,8,0.3)',   dot: 'bg-yellow-400' },
  low:      { label: 'LOW',      color: '#94a3b8', bg: 'rgba(148,163,184,0.06)',border: 'rgba(148,163,184,0.15)',dot: 'bg-slate-500'  },
}

const DANGER_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const NS_PRIORITY: Record<string, number>  = { production: 0, prod: 0, staging: 1, default: 2 }

// ── Role Card ─────────────────────────────────────────────────────────────────

function RoleCard({ node, onClick, selected }: { node: GraphNode; onClick: () => void; selected: boolean }) {
  const d    = DANGER[node.metadata?.danger ?? 'low'] ?? DANGER.low
  const isCluster = node.type === 'k8s_clusterrole'
  const rulesRaw = node.metadata?.rules as string | undefined

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="w-full text-left rounded-2xl p-4 flex flex-col gap-2.5 transition-all"
      style={{
        background: selected ? d.bg : 'rgba(255,255,255,0.02)',
        border: `1px solid ${selected ? d.border : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md"
            style={{ color: d.color, background: d.bg, border: `1px solid ${d.border}` }}>
            {d.label}
          </span>
          {isCluster && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md text-slate-500"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              CLUSTER
            </span>
          )}
        </div>
        {rulesRaw && (
          <span className="text-[9px] font-mono text-slate-500 shrink-0 truncate max-w-[110px]" title={rulesRaw}>
            {rulesRaw.split(';')[0].trim()}
          </span>
        )}
      </div>
      <div className="font-sans font-semibold text-sm text-slate-200 truncate" title={node.label}>
        {node.label}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-slate-600">{node.namespace || 'cluster-wide'}</span>
        <ChevronRight size={12} className="text-slate-600" />
      </div>
    </motion.button>
  )
}

// ── Binding Card ──────────────────────────────────────────────────────────────

function BindingCard({ node, roleNode, onClick, selected }: {
  node: GraphNode; roleNode: GraphNode | null; onClick: () => void; selected: boolean
}) {
  const d = roleNode ? (DANGER[roleNode.metadata?.danger ?? 'low'] ?? DANGER.low) : DANGER.low
  const isCluster = node.type === 'k8s_clusterrolebinding'

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="w-full text-left rounded-2xl p-4 flex flex-col gap-2.5 transition-all"
      style={{
        background: selected ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${selected ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md text-violet-400"
          style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}>
          {isCluster ? 'CLUSTERBINDING' : 'ROLEBINDING'}
        </span>
      </div>
      <div className="font-sans font-semibold text-sm text-slate-200 truncate" title={node.label}>
        {node.label}
      </div>
      {node.metadata?.roleRef && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-slate-500">binds →</span>
          <span className="text-[10px] font-mono truncate max-w-[140px]"
            style={{ color: d.color }}>
            {node.metadata.roleRef}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-slate-600">{node.namespace || 'cluster-wide'}</span>
        <ChevronRight size={12} className="text-slate-600" />
      </div>
    </motion.button>
  )
}

// ── SA Card ───────────────────────────────────────────────────────────────────

function SACard({ node, boundRoles, onClick, selected }: {
  node: GraphNode; boundRoles: GraphNode[]; onClick: () => void; selected: boolean
}) {
  const maxDanger = boundRoles.reduce((m, r) => {
    const o = DANGER_ORDER[r.metadata?.danger ?? 'low'] ?? 3
    return o < (DANGER_ORDER[m] ?? 3) ? (r.metadata?.danger ?? 'low') : m
  }, 'low')
  const d = DANGER[maxDanger] ?? DANGER.low

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="w-full text-left rounded-2xl p-4 flex flex-col gap-2.5 transition-all"
      style={{
        background: selected ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${selected ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md text-indigo-400"
          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
          SERVICE ACCOUNT
        </span>
        {boundRoles.length > 0 && (
          <span className={`w-1.5 h-1.5 rounded-full ${d.dot} shrink-0`} />
        )}
      </div>
      <div className="font-sans font-semibold text-sm text-slate-200 truncate" title={node.label}>
        {node.label}
      </div>
      {boundRoles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {boundRoles.slice(0, 3).map(r => (
            <span key={r.id} className="text-[9px] font-mono px-1.5 py-0.5 rounded truncate max-w-[120px]"
              style={{ color: (DANGER[r.metadata?.danger ?? 'low'] ?? DANGER.low).color, background: (DANGER[r.metadata?.danger ?? 'low'] ?? DANGER.low).bg }}>
              {r.label}
            </span>
          ))}
          {boundRoles.length > 3 && (
            <span className="text-[9px] font-mono text-slate-500">+{boundRoles.length - 3}</span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-slate-600">{node.namespace || 'cluster-wide'}</span>
        <ChevronRight size={12} className="text-slate-600" />
      </div>
    </motion.button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function RBACView({ data, focusNodeId, findings }: RBACViewProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [activeNs, setActiveNs]         = useState<string | null>(null)

  useEffect(() => {
    if (!focusNodeId) return
    const node = data.nodes.find(n => n.id === focusNodeId) ?? null
    if (node) { setSelectedNode(node); setActiveNs(node.namespace ?? null) }
  }, [focusNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Index: binding → role node, sa → bound roles
  const { rbacNodes, bindingToRole, saToRoles, namespaces } = useMemo(() => {
    const rbacNodes = data.nodes.filter(n =>
      (ROLE_TYPES.has(n.type) || BIND_TYPES.has(n.type) || n.type === 'serviceaccount') &&
      !SYSTEM_NS.has(n.namespace ?? '')
    )
    const nodeById = new Map(data.nodes.map(n => [n.id, n]))

    // binding → role it references (via 'grants →' edge target)
    const bindingToRole = new Map<string, GraphNode>()
    // sa → roles it's bound to (via binding chain)
    const saToRoles = new Map<string, GraphNode[]>()

    for (const e of data.edges) {
      if (e.label === 'grants →') {
        const role = nodeById.get(e.target)
        if (role) bindingToRole.set(e.source, role)
      }
      if (e.label === 'bound →') {
        // sa → binding
        const binding = nodeById.get(e.target)
        const role = binding ? bindingToRole.get(binding.id) : null
        if (role) {
          if (!saToRoles.has(e.source)) saToRoles.set(e.source, [])
          if (!saToRoles.get(e.source)!.find(r => r.id === role.id))
            saToRoles.get(e.source)!.push(role)
        }
      }
    }

    const nsList = [...new Set(rbacNodes.filter(n => n.namespace).map(n => n.namespace!))]
      .sort((a, b) => {
        const ap = NS_PRIORITY[a] ?? 99, bp = NS_PRIORITY[b] ?? 99
        return ap !== bp ? ap - bp : a.localeCompare(b)
      })

    return { rbacNodes, bindingToRole, saToRoles, namespaces: nsList }
  }, [data])

  const stats = useMemo(() => {
    const roles = rbacNodes.filter(n => ROLE_TYPES.has(n.type))
    return {
      bindings: rbacNodes.filter(n => BIND_TYPES.has(n.type)).length,
      roles:    roles.length,
      critical: roles.filter(n => n.metadata?.danger === 'critical').length,
      high:     roles.filter(n => n.metadata?.danger === 'high').length,
    }
  }, [rbacNodes])

  const byNs = useMemo(() => {
    const m = new Map<string, GraphNode[]>()
    for (const n of rbacNodes) {
      const ns = n.namespace || '_cluster'
      if (!m.has(ns)) m.set(ns, [])
      m.get(ns)!.push(n)
    }
    return m
  }, [rbacNodes])

  const visibleNs = activeNs ? [activeNs] : namespaces

  function select(n: GraphNode) {
    setSelectedNode(prev => prev?.id === n.id ? null : n)
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">

      {/* Stat bar */}
      <div className="shrink-0 flex items-center gap-5 px-5 py-2 border-b border-cyber-border/30 bg-cyber-panel/30 backdrop-blur-sm">
        {[
          { label: 'bindings',  value: stats.bindings, color: 'text-violet-400', icon: <Users size={13} />          },
          { label: 'roles',     value: stats.roles,    color: 'text-slate-300',  icon: <Shield size={13} />         },
          { label: 'critical',  value: stats.critical, color: 'text-red-400',    icon: <ShieldAlert size={13} />    },
          { label: 'high risk', value: stats.high,     color: 'text-orange-400', icon: <ShieldAlert size={13} />    },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`text-lg font-mono font-bold ${color}`}>{value}</span>
            <span className="text-sm font-sans text-slate-400">{label}</span>
          </div>
        ))}
        <span className="ml-auto text-xs font-mono text-slate-500">click any resource for details</span>
      </div>

      {/* Namespace tabs */}
      <div className="shrink-0 flex items-center gap-1 px-5 py-2 border-b border-cyber-border/20 overflow-x-auto scrollbar-none">
        <button onClick={() => setActiveNs(null)}
          className={`shrink-0 px-3 py-1 rounded-lg text-xs font-mono transition-all ${
            activeNs === null ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
          }`}>all namespaces</button>
        {namespaces.map(ns => (
          <button key={ns} onClick={() => setActiveNs(activeNs === ns ? null : ns)}
            className={`shrink-0 px-3 py-1 rounded-lg text-xs font-mono transition-all ${
              activeNs === ns ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}>{ns}</button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8 scrollbar-none">
        <AnimatePresence mode="wait">
          <motion.div key={activeNs ?? 'all'}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} className="space-y-8">
            {visibleNs.map(ns => {
              const nodes = byNs.get(ns) ?? []
              const roles    = nodes.filter(n => ROLE_TYPES.has(n.type))
                .sort((a,b) => (DANGER_ORDER[a.metadata?.danger??'low']??3) - (DANGER_ORDER[b.metadata?.danger??'low']??3))
              const bindings = nodes.filter(n => BIND_TYPES.has(n.type))
              const sas      = nodes.filter(n => n.type === 'serviceaccount')
              if (!roles.length && !bindings.length && !sas.length) return null

              return (
                <div key={ns} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-violet-400/60" />
                    <span className="text-sm font-sans font-semibold text-slate-300">{ns}</span>
                    <span className="text-xs font-mono text-slate-600">{nodes.length} resources</span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  </div>

                  {/* Roles */}
                  {roles.length > 0 && (
                    <div>
                      <p className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Shield size={9} /> Roles & ClusterRoles
                      </p>
                      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                        {roles.map(n => (
                          <RoleCard key={n.id} node={n} onClick={() => select(n)} selected={selectedNode?.id === n.id} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bindings */}
                  {bindings.length > 0 && (
                    <div>
                      <p className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Users size={9} /> Bindings
                      </p>
                      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                        {bindings.map(n => (
                          <BindingCard key={n.id} node={n}
                            roleNode={bindingToRole.get(n.id) ?? null}
                            onClick={() => select(n)} selected={selectedNode?.id === n.id} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Service Accounts */}
                  {sas.length > 0 && (
                    <div>
                      <p className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Users size={9} /> Service Accounts
                      </p>
                      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                        {sas.map(n => (
                          <SACard key={n.id} node={n}
                            boundRoles={saToRoles.get(n.id) ?? []}
                            onClick={() => select(n)} selected={selectedNode?.id === n.id} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <RBACDetails node={selectedNode} data={data} findings={findings} onClose={() => setSelectedNode(null)} />
    </div>
  )
}
