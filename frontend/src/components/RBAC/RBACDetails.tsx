import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShieldCheck, Globe, Link2, Box, Hash, ArrowRight, ArrowLeft } from 'lucide-react'
import { GraphData, GraphNode } from '../../types'

interface Props {
  node: GraphNode | null
  data: GraphData
  onClose: () => void
}

const DANGER_STYLE: Record<string, { color: string; accent: string; badge: string }> = {
  critical: { color: 'text-red-400',    accent: '#ef4444', badge: 'bg-red-900/60 text-red-300 border-red-500/30'          },
  high:     { color: 'text-orange-400', accent: '#f97316', badge: 'bg-orange-900/60 text-orange-300 border-orange-500/30'  },
  medium:   { color: 'text-yellow-400', accent: '#eab308', badge: 'bg-yellow-900/50 text-yellow-300 border-yellow-500/30'  },
  low:      { color: 'text-slate-400',  accent: '#64748b', badge: 'bg-slate-800/60 text-slate-400 border-slate-600/30'     },
}

const TYPE_META: Record<string, { label: string; Icon: React.ElementType; accent: string }> = {
  k8s_role:              { label: 'Role',               Icon: ShieldCheck, accent: '#ef4444' },
  k8s_clusterrole:       { label: 'ClusterRole',        Icon: Globe,       accent: '#f97316' },
  k8s_rolebinding:       { label: 'RoleBinding',        Icon: Link2,       accent: '#8b5cf6' },
  k8s_clusterrolebinding:{ label: 'ClusterRoleBinding', Icon: Link2,       accent: '#a78bfa' },
  serviceaccount:        { label: 'ServiceAccount',     Icon: Box,         accent: '#6366f1' },
}

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
    <div className={`flex items-start gap-3 py-2.5 border-b border-slate-800/50 last:border-b-0 ${isWild ? 'bg-red-950/15 -mx-1 px-1 rounded' : ''}`}>
      <span className="text-xs font-mono text-slate-300 shrink-0 max-w-[150px] break-all leading-snug">{resPart}</span>
      <div className="flex flex-wrap gap-1 ml-auto">
        {verbList.map(v => (
          <span key={v} className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
            VERB_STYLE[v] ?? 'border-slate-700/40 bg-slate-800/40 text-slate-400'
          }`}>{v}</span>
        ))}
      </div>
    </div>
  )
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-[0.18em]">{label}</span>
      {count !== undefined && (
        <span className="text-[10px] font-mono text-slate-600">· {count}</span>
      )}
    </div>
  )
}

export function RBACDetails({ node, data, onClose }: Props) {
  const { outgoing, incoming } = useMemo(() => {
    if (!node) return { outgoing: [], incoming: [] }
    const nodeMap = new Map(data.nodes.map(n => [n.id, n]))
    return {
      outgoing: data.edges.filter(e => e.source === node.id)
        .map(e => ({ edge: e, peer: nodeMap.get(e.target) }))
        .filter(x => x.peer) as { edge: typeof data.edges[0]; peer: GraphNode }[],
      incoming: data.edges.filter(e => e.target === node.id)
        .map(e => ({ edge: e, peer: nodeMap.get(e.source) }))
        .filter(x => x.peer) as { edge: typeof data.edges[0]; peer: GraphNode }[],
    }
  }, [node, data])

  const meta   = node ? (TYPE_META[node.type] ?? { label: node.type, Icon: Box, accent: '#64748b' }) : null
  const danger = node?.metadata?.danger ?? 'low'
  const ds     = DANGER_STYLE[danger] ?? DANGER_STYLE.low
  const rules  = node?.metadata?.rules ? node.metadata.rules.split('; ').filter(Boolean) : []

  return (
    <AnimatePresence>
      {node && meta && (
        <motion.div
          key={node.id}
          initial={{ x: 420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 420, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="absolute right-4 top-4 bottom-4 w-[400px] z-10 flex flex-col"
        >
          <div className="flex flex-col h-full rounded-2xl border border-slate-700/50 bg-[#080c14]/95 backdrop-blur-xl overflow-hidden shadow-2xl"
            style={{ boxShadow: `0 0 50px 0 ${meta.accent}20` }}>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800/80 shrink-0"
              style={{ background: `${meta.accent}10` }}>
              <meta.Icon size={15} style={{ color: meta.accent }} />
              <span className="text-xs font-mono font-bold tracking-[0.15em] uppercase flex-1" style={{ color: meta.accent }}>
                {meta.label}
              </span>
              <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-white/5">
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-none">

              {/* Identity */}
              <div className="px-5 pt-5 pb-4 border-b border-slate-800/60">
                <div className="text-xl font-mono font-bold leading-snug break-all" style={{ color: meta.accent }}>
                  {node.label}
                </div>
                {node.namespace && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Hash size={10} className="text-slate-500" />
                    <span className="text-xs font-mono text-slate-500">{node.namespace}</span>
                  </div>
                )}
                {(node.type === 'k8s_role' || node.type === 'k8s_clusterrole') && danger !== 'low' && (
                  <span className={`inline-block mt-3 text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg border uppercase ${ds.badge}`}>
                    {danger} risk
                  </span>
                )}
              </div>

              {/* Rules for Role/ClusterRole */}
              {rules.length > 0 && (
                <div className="px-5 py-4 border-b border-slate-800/60">
                  <SectionHeader label="Rules" count={rules.length} />
                  {rules.map((r, i) => <RuleRow key={i} rule={r} />)}
                </div>
              )}

              {/* RoleRef for Bindings */}
              {node.metadata?.roleRef && (
                <div className="px-5 py-4 border-b border-slate-800/60">
                  <SectionHeader label="Grants" />
                  <div className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <Globe size={14} className="text-orange-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono text-orange-300 truncate">{node.metadata.roleRef}</div>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5">{node.metadata.roleKind}</div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">Role</span>
                  </div>
                </div>
              )}

              {/* Outgoing connections */}
              {outgoing.length > 0 && (
                <div className="px-5 py-4 border-b border-slate-800/60">
                  <SectionHeader label="Outgoing" count={outgoing.length} />
                  <div className="space-y-1.5">
                    {outgoing.map(({ edge, peer }) => (
                      <div key={edge.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <ArrowRight size={12} className="text-slate-600 shrink-0" />
                        <span className="text-sm font-mono text-slate-300 flex-1 truncate">{peer.label}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg border border-violet-500/25 bg-violet-900/20 text-violet-300 shrink-0">{edge.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Incoming connections */}
              {incoming.length > 0 && (
                <div className="px-5 py-4">
                  <SectionHeader label="Incoming" count={incoming.length} />
                  <div className="space-y-1.5">
                    {incoming.map(({ edge, peer }) => (
                      <div key={edge.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <ArrowLeft size={12} className="text-slate-600 shrink-0" />
                        <span className="text-sm font-mono text-slate-300 flex-1 truncate">{peer.label}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg border border-violet-500/25 bg-violet-900/20 text-violet-300 shrink-0">{edge.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
