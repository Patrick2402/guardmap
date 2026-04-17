import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Box, Layers, Globe, Shield, GitBranch,
  Cpu, Network, ArrowRight, ArrowLeft, Hash, Clock, Tag, Container,
} from 'lucide-react'
import { GraphData, GraphNode } from '../../types'

interface TopologyDetailsProps {
  node: GraphNode | null
  data: GraphData
  onClose: () => void
}

const TYPE_META: Record<string, { label: string; color: string; accent: string; Icon: React.ElementType }> = {
  deployment:    { label: 'Deployment',    color: 'text-blue-400',   accent: '#3b82f6', Icon: Box       },
  statefulset:   { label: 'StatefulSet',   color: 'text-purple-400', accent: '#a855f7', Icon: Layers    },
  daemonset:     { label: 'DaemonSet',     color: 'text-orange-400', accent: '#f97316', Icon: GitBranch },
  pod:           { label: 'Pod',           color: 'text-cyan-400',   accent: '#06b6d4', Icon: Container },
  k8s_service:   { label: 'Service',       color: 'text-teal-400',   accent: '#14b8a6', Icon: Globe     },
  ingress:       { label: 'Ingress',       color: 'text-green-400',  accent: '#22c55e', Icon: Network   },
  networkpolicy: { label: 'NetworkPolicy', color: 'text-rose-400',   accent: '#f43f5e', Icon: Shield    },
}

const EDGE_PILL: Record<string, string> = {
  'manages':  'bg-blue-500/15 text-blue-300 border-blue-500/25',
  'selects':  'bg-teal-500/15 text-teal-300 border-teal-500/25',
  'routes →': 'bg-green-500/15 text-green-300 border-green-500/25',
  'uses':     'bg-violet-500/15 text-violet-300 border-violet-500/25',
  'IRSA →':   'bg-amber-500/15 text-amber-300 border-amber-500/25',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-slate-800/60 last:border-b-0">
      <div className="text-[9px] font-mono font-bold text-slate-600 uppercase tracking-[0.15em] mb-2.5">{title}</div>
      {children}
    </div>
  )
}

function KVRow({ k, v, valueColor }: { k: string; v: string; valueColor?: string }) {
  if (!v) return null
  return (
    <div className="flex gap-2 py-0.5">
      <span className="text-[10px] font-mono text-slate-600 shrink-0 w-24">{k}</span>
      <span className={`text-[10px] font-mono break-all leading-relaxed ${valueColor ?? 'text-slate-300'}`}>{v}</span>
    </div>
  )
}

function LabelTags({ raw }: { raw: string }) {
  const tags = raw.split(', ').filter(Boolean).map(s => {
    const i = s.indexOf('=')
    return i > 0 ? { k: s.slice(0, i), v: s.slice(i + 1) } : { k: s, v: '' }
  })
  if (!tags.length) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map(({ k, v }) => (
        <span key={k} className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-700/60 bg-slate-800/50 text-slate-400">
          <span className="text-slate-500">{k}</span>
          {v && <><span className="text-slate-600">=</span><span className="text-slate-300">{v}</span></>}
        </span>
      ))}
    </div>
  )
}

function ConnRow({ node, edgeLabel, dir }: { node: GraphNode; edgeLabel: string; dir: 'in' | 'out' }) {
  const meta = TYPE_META[node.type] ?? { label: node.type, color: 'text-slate-400', accent: '#64748b', Icon: Box }
  const pill = EDGE_PILL[edgeLabel] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/25'
  return (
    <div className="flex items-start gap-2 py-2 border-b border-slate-800/40 last:border-b-0">
      <meta.Icon size={12} className={`${meta.color} mt-0.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-mono text-slate-200 break-all leading-snug">{node.label}</div>
        {node.namespace && (
          <div className="text-[9px] font-mono text-slate-600 mt-0.5">{node.namespace}</div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 mt-0.5">
        {dir === 'out' ? <ArrowRight size={8} className="text-slate-600" /> : <ArrowLeft size={8} className="text-slate-600" />}
        <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border font-semibold ${pill}`}>
          {edgeLabel}
        </span>
      </div>
    </div>
  )
}

export function TopologyDetails({ node, data, onClose }: TopologyDetailsProps) {
  const { outgoing, incoming } = useMemo(() => {
    if (!node) return { outgoing: [], incoming: [] }
    const nodeMap = new Map(data.nodes.map(n => [n.id, n]))
    return {
      outgoing: data.edges
        .filter(e => e.source === node.id)
        .map(e => ({ edge: e, peer: nodeMap.get(e.target) }))
        .filter(x => x.peer) as { edge: (typeof data.edges)[0]; peer: GraphNode }[],
      incoming: data.edges
        .filter(e => e.target === node.id)
        .map(e => ({ edge: e, peer: nodeMap.get(e.source) }))
        .filter(x => x.peer) as { edge: (typeof data.edges)[0]; peer: GraphNode }[],
    }
  }, [node, data])

  const meta = node ? (TYPE_META[node.type] ?? { label: node.type, color: 'text-slate-400', accent: '#64748b', Icon: Box }) : null
  const m = node?.metadata ?? {}

  return (
    <AnimatePresence>
      {node && meta && (
        <motion.div
          key={node.id}
          initial={{ x: 360, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 360, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="absolute right-4 top-4 bottom-4 w-80 z-10 flex flex-col"
        >
          <div className="flex flex-col h-full rounded-2xl border border-slate-700/50 bg-[#080c14]/95 backdrop-blur-xl overflow-hidden shadow-2xl"
            style={{ boxShadow: `0 0 40px 0 ${meta.accent}18` }}>

            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800/80 shrink-0"
              style={{ background: `${meta.accent}0e` }}>
              <meta.Icon size={13} className={meta.color} />
              <span className="text-[10px] font-mono font-bold tracking-[0.15em] uppercase flex-1" style={{ color: meta.accent }}>
                {meta.label}
              </span>
              <button onClick={onClose} className="text-slate-600 hover:text-slate-200 transition-colors p-0.5">
                <X size={13} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-800">

              {/* Name + namespace */}
              <div className="px-4 pt-4 pb-3 border-b border-slate-800/60">
                <div className="text-[16px] font-mono font-bold leading-snug break-all" style={{ color: meta.accent }}>
                  {node.label}
                </div>
                {node.namespace && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Hash size={9} className="text-slate-600" />
                    <span className="text-[10px] font-mono text-slate-500">{node.namespace}</span>
                  </div>
                )}
              </div>

              {/* Core metadata */}
              {(m.replicas || m.serviceAccount || m.nodeName || m.phase || m.svcType || m.clusterIP || m.ports || m.host || m.effect || m.ingressClass || m.tls) && (
                <Section title="Details">
                  {m.replicas      && <KVRow k="replicas"    v={m.replicas} valueColor="text-blue-300" />}
                  {m.serviceAccount && <KVRow k="svc account" v={m.serviceAccount} valueColor="text-violet-300" />}
                  {m.nodeName      && <KVRow k="node"         v={m.nodeName} />}
                  {m.phase && m.phase !== '' && (
                    <div className="flex gap-2 py-0.5">
                      <span className="text-[10px] font-mono text-slate-600 w-24 shrink-0">phase</span>
                      <span className={`text-[10px] font-mono font-semibold flex items-center gap-1 ${
                        m.phase === 'Running'   ? 'text-emerald-400' :
                        m.phase === 'Pending'   ? 'text-yellow-400'  :
                        m.phase === 'Failed'    ? 'text-red-400'     :
                        m.phase === 'Succeeded' ? 'text-blue-400'    : 'text-slate-400'
                      }`}>
                        <Clock size={9} />{m.phase}
                      </span>
                    </div>
                  )}
                  {m.svcType   && <KVRow k="type"       v={m.svcType} />}
                  {m.clusterIP && m.clusterIP !== 'None' && <KVRow k="cluster IP" v={m.clusterIP} valueColor="text-teal-300" />}
                  {m.ports     && <KVRow k="ports"      v={m.ports} />}
                  {m.host && m.host !== '' && <KVRow k="host"        v={m.host} valueColor="text-green-300" />}
                  {m.ingressClass && <KVRow k="class"        v={m.ingressClass} valueColor="text-slate-300" />}
                  {m.tls && m.tls !== '' && <KVRow k="tls hosts"   v={m.tls} valueColor="text-emerald-300" />}
                  {m.tlsSecrets && m.tlsSecrets !== '' && <KVRow k="tls secret"  v={m.tlsSecrets} />}
                  {m.effect    && (
                    <div className="flex gap-2 py-0.5">
                      <span className="text-[10px] font-mono text-slate-600 w-24 shrink-0">effect</span>
                      <span className={`text-[10px] font-mono font-bold ${m.effect === 'deny' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {m.effect.toUpperCase()}
                      </span>
                    </div>
                  )}
                  {m.arn && <KVRow k="arn" v={m.arn} />}
                </Section>
              )}

              {/* Ingress paths */}
              {m.paths && m.paths !== '' && (
                <Section title="Routes">
                  <div className="space-y-1">
                    {m.paths.split('; ').filter(Boolean).map(path => (
                      <div key={path} className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/60">
                        <Network size={9} className="text-green-600 mt-0.5 shrink-0" />
                        <span className="text-[10px] font-mono text-slate-300 break-all leading-relaxed">{path}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Images */}
              {m.images && (
                <Section title="Container Images">
                  <div className="space-y-1">
                    {m.images.split(', ').filter(Boolean).map(img => (
                      <div key={img} className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/60">
                        <Cpu size={9} className="text-slate-600 mt-0.5 shrink-0" />
                        <span className="text-[10px] font-mono text-slate-300 break-all leading-relaxed">{img}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Labels */}
              {m.labels && m.labels !== '' && (
                <Section title="Labels">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Tag size={9} className="text-slate-600" />
                  </div>
                  <LabelTags raw={m.labels} />
                </Section>
              )}

              {/* Connections */}
              {outgoing.length > 0 && (
                <Section title={`Outgoing · ${outgoing.length}`}>
                  {outgoing.map(({ edge, peer }) => (
                    <ConnRow key={edge.id} node={peer} edgeLabel={edge.label ?? ''} dir="out" />
                  ))}
                </Section>
              )}

              {incoming.length > 0 && (
                <Section title={`Incoming · ${incoming.length}`}>
                  {incoming.map(({ edge, peer }) => (
                    <ConnRow key={edge.id} node={peer} edgeLabel={edge.label ?? ''} dir="in" />
                  ))}
                </Section>
              )}

              {outgoing.length === 0 && incoming.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <Cpu size={22} className="text-slate-800 mx-auto mb-2" />
                  <p className="text-[10px] font-mono text-slate-700">No connections found</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
