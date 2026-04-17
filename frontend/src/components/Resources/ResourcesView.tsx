import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Container, KeyRound, ShieldCheck, AlertTriangle,
  ChevronDown, ChevronRight, HardDrive, Database,
  MessageSquare, Lock, BarChart2, Layers, Cpu,
  Network, Globe, ShieldOff, Server,
} from 'lucide-react'
import { GraphData, GraphNode, AccessLevel } from '../../types'

interface ResourcesViewProps { data: GraphData }

const ACCESS_BADGE: Record<AccessLevel, string> = {
  full:  'bg-red-500/15 text-red-400 border-red-500/30',
  write: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  read:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}

function awsServiceIcon(label: string) {
  const l = label.toLowerCase()
  if (l.startsWith('s3'))          return <HardDrive size={10} />
  if (l.startsWith('rds') || l.startsWith('dynamodb')) return <Database size={10} />
  if (l.startsWith('sqs') || l.startsWith('sns'))      return <MessageSquare size={10} />
  if (l.startsWith('sm:') || l.startsWith('kms'))      return <Lock size={10} />
  if (l.startsWith('cloudwatch'))  return <BarChart2 size={10} />
  return <Server size={10} />
}

function getNodeAccess(nodeId: string, data: GraphData): AccessLevel | null {
  const inc = data.edges.filter(e => e.target === nodeId && e.accessLevel)
  if (inc.some(e => e.accessLevel === 'full'))  return 'full'
  if (inc.some(e => e.accessLevel === 'write')) return 'write'
  if (inc.some(e => e.accessLevel === 'read'))  return 'read'
  return null
}

function podIAMChain(pod: GraphNode, data: GraphData) {
  const saEdge   = data.edges.find(e => e.source === pod.id && e.label === 'uses')
  const sa       = saEdge ? data.nodes.find(n => n.id === saEdge.target) : null
  const roleEdge = sa ? data.edges.find(e => e.source === sa.id && e.label?.includes('IRSA')) : null
  const role     = roleEdge ? data.nodes.find(n => n.id === roleEdge.target) : null
  const svcEdges = role ? data.edges.filter(e => e.source === role.id && e.accessLevel) : []
  const svcs     = svcEdges.map(e => ({ node: data.nodes.find(n => n.id === e.target)!, access: e.accessLevel! })).filter(x => x.node)
  return { sa, role, svcs }
}

function workloadForPod(pod: GraphNode, data: GraphData): GraphNode | null {
  const edge = data.edges.find(e => e.target === pod.id && e.label === 'manages')
  return edge ? data.nodes.find(n => n.id === edge.source) ?? null : null
}

// ── Section components ────────────────────────────────────────────────────────

function WorkloadsSection({ nodes, data }: { nodes: GraphNode[]; data: GraphData }) {
  const deployments  = nodes.filter(n => n.type === 'deployment')
  const statefulsets = nodes.filter(n => n.type === 'statefulset')
  const daemonsets   = nodes.filter(n => n.type === 'daemonset')

  if (!deployments.length && !statefulsets.length && !daemonsets.length) return null

  return (
    <div className="space-y-1">
      {[
        { kind: 'Deployments',  items: deployments,  icon: <Layers size={10} className="text-blue-400" />,   color: 'text-blue-400',   pill: 'bg-blue-900/30 border-blue-500/20' },
        { kind: 'StatefulSets', items: statefulsets, icon: <Database size={10} className="text-purple-400" />,color: 'text-purple-400', pill: 'bg-purple-900/30 border-purple-500/20' },
        { kind: 'DaemonSets',   items: daemonsets,   icon: <Cpu size={10} className="text-orange-400" />,     color: 'text-orange-400', pill: 'bg-orange-900/25 border-orange-500/20' },
      ].filter(g => g.items.length > 0).map(({ kind, items, icon, color, pill }) => (
        <div key={kind}>
          <div className={`text-[9px] font-mono text-slate-600 mb-1 flex items-center gap-1`}>{icon}{kind}</div>
          <div className="flex flex-wrap gap-1.5">
            {items.map(n => (
              <div key={n.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-mono ${pill}`}>
                <span className={color}>{n.label}</span>
                {n.metadata?.replicas && <span className="text-slate-600">{n.metadata.replicas}×</span>}
                {n.metadata?.image && <span className="text-slate-700 truncate max-w-[100px]">{n.metadata.image.split(':')[1]}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function NetworkingSection({ ns, data }: { ns: string; data: GraphData }) {
  const services = data.nodes.filter(n => n.namespace === ns && n.type === 'k8s_service')
  const ingresses = data.nodes.filter(n => n.namespace === ns && n.type === 'ingress')
  const netpols   = data.nodes.filter(n => n.namespace === ns && n.type === 'networkpolicy')

  if (!services.length && !ingresses.length && !netpols.length) return null

  return (
    <div className="space-y-1.5">
      {services.length > 0 && (
        <div>
          <div className="text-[9px] font-mono text-slate-600 mb-1 flex items-center gap-1"><Network size={10} className="text-teal-400" />Services</div>
          <div className="flex flex-wrap gap-1.5">
            {services.map(n => (
              <div key={n.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-teal-500/20 bg-teal-950/20 text-[10px] font-mono">
                <span className="text-teal-300">{n.label}</span>
                <span className="text-slate-700">{n.metadata?.svcType}</span>
                <span className="text-slate-600">:{n.metadata?.port}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {ingresses.length > 0 && (
        <div>
          <div className="text-[9px] font-mono text-slate-600 mb-1 flex items-center gap-1"><Globe size={10} className="text-green-400" />Ingresses</div>
          <div className="flex flex-wrap gap-1.5">
            {ingresses.map(n => (
              <div key={n.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-green-500/20 bg-green-950/15 text-[10px] font-mono">
                <span className="text-green-300">{n.label}</span>
                {n.metadata?.host && <span className="text-slate-600">{n.metadata.host}</span>}
                {n.metadata?.tls === 'true' && <span className="text-emerald-600 text-[9px]">TLS</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {netpols.length > 0 && (
        <div>
          <div className="text-[9px] font-mono text-slate-600 mb-1 flex items-center gap-1"><ShieldOff size={10} className="text-rose-400" />NetworkPolicies</div>
          <div className="flex flex-wrap gap-1.5">
            {netpols.map(n => {
              const isDeny = n.metadata?.effect === 'deny'
              return (
                <div key={n.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-mono ${isDeny ? 'border-red-500/25 bg-red-950/15 text-red-300' : 'border-emerald-500/20 bg-emerald-950/10 text-emerald-300'}`}>
                  {n.label}
                  <span className={`text-[9px] ${isDeny ? 'text-red-600' : 'text-emerald-600'}`}>{isDeny ? 'DENY' : 'ALLOW'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function NamespaceCard({ ns, nsNodes, data }: { ns: string; nsNodes: GraphNode[]; data: GraphData }) {
  const [open, setOpen] = useState(true)
  const [activeSection, setActiveSection] = useState<'irsa' | 'workloads' | 'networking'>('irsa')

  const pods = nsNodes.filter(n => n.type === 'pod')
  const riskCount = pods.filter(p => {
    const { svcs } = podIAMChain(p, data)
    return svcs.some(s => s.access === 'full' || s.access === 'write')
  }).length

  const workloadNodes = data.nodes.filter(n => n.namespace === ns && ['deployment','statefulset','daemonset'].includes(n.type))
  const netNodes = data.nodes.filter(n => n.namespace === ns && ['k8s_service','ingress','networkpolicy'].includes(n.type))

  const sectionTabs = [
    { id: 'irsa' as const,       label: 'IRSA',       count: pods.length },
    { id: 'workloads' as const,  label: 'Workloads',  count: workloadNodes.length },
    { id: 'networking' as const, label: 'Networking', count: netNodes.length },
  ].filter(s => s.count > 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-cyber-border bg-cyber-panel/60 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
          <span className="text-[12px] font-mono font-semibold text-slate-200">{ns}</span>
          <span className="text-[10px] font-mono text-slate-600">{nsNodes.length + workloadNodes.length + netNodes.length} resources</span>
        </div>
        <div className="flex items-center gap-2">
          {riskCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">
              <AlertTriangle size={9} className="text-red-400" />
              <span className="text-[9px] font-mono text-red-400">{riskCount} risky IRSA</span>
            </div>
          )}
          {open ? <ChevronDown size={13} className="text-slate-500" /> : <ChevronRight size={13} className="text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-cyber-border/50">
          {/* Section tabs */}
          {sectionTabs.length > 1 && (
            <div className="flex items-center gap-1 px-4 pt-3 pb-1">
              {sectionTabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveSection(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all flex items-center gap-1.5 ${
                    activeSection === tab.id ? 'bg-white/8 text-slate-200 border border-white/8' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab.label}
                  <span className="text-[9px] text-slate-600">{tab.count}</span>
                </button>
              ))}
            </div>
          )}

          <div className="px-5 py-3">
            {/* IRSA section */}
            {activeSection === 'irsa' && (
              <div className="divide-y divide-cyber-border/20 -mx-5">
                {pods.map(pod => {
                  const { sa, role, svcs } = podIAMChain(pod, data)
                  const workload = workloadForPod(pod, data)
                  const hasRisk = svcs.some(s => s.access === 'full' || s.access === 'write')

                  return (
                    <div key={pod.id} className={`px-5 py-2.5 ${hasRisk ? 'bg-red-950/10' : ''}`}>
                      <div className="flex items-start gap-4 flex-wrap">
                        <div className="flex items-center gap-2 min-w-[140px]">
                          {workload && <div className="text-[8px] font-mono text-blue-600">{workload.label}</div>}
                          <Container size={11} className="text-cyan-400 shrink-0" />
                          <span className="text-[11px] font-mono text-cyan-300 truncate max-w-[130px]">{pod.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-1 flex-wrap">
                          {sa && (
                            <><span className="text-slate-700 text-[10px]">→</span>
                            <div className="flex items-center gap-1"><KeyRound size={9} className="text-violet-400" /><span className="text-[10px] font-mono text-violet-400">{sa.label}</span></div></>
                          )}
                          {role && (
                            <><span className="text-slate-700 text-[10px]">→</span>
                            <div className="flex items-center gap-1"><ShieldCheck size={9} className="text-amber-400" /><span className="text-[10px] font-mono text-amber-400">{role.label}</span></div></>
                          )}
                          {svcs.length > 0 && (
                            <><span className="text-slate-700 text-[10px]">→</span>
                            <div className="flex flex-wrap gap-1">
                              {svcs.map(({ node: svc, access }) => (
                                <div key={svc.id} className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono ${ACCESS_BADGE[access]}`}>
                                  {awsServiceIcon(svc.label)}
                                  <span className="truncate max-w-[90px]">{svc.label.replace(/^[^:]+:\s*/,'')}</span>
                                </div>
                              ))}
                            </div></>
                          )}
                          {!sa && !role && <span className="text-[10px] font-mono text-slate-700">no IRSA binding</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Workloads section */}
            {activeSection === 'workloads' && (
              <WorkloadsSection nodes={data.nodes.filter(n => n.namespace === ns)} data={data} />
            )}

            {/* Networking section */}
            {activeSection === 'networking' && (
              <NetworkingSection ns={ns} data={data} />
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}

export function ResourcesView({ data }: ResourcesViewProps) {
  const byNamespace = useMemo(() => {
    const pods = data.nodes.filter(n => n.type === 'pod')
    const map = new Map<string, GraphNode[]>()
    for (const pod of pods) {
      const ns = pod.namespace ?? 'default'
      if (!map.has(ns)) map.set(ns, [])
      map.get(ns)!.push(pod)
    }
    return map
  }, [data])

  const totals = useMemo(() => ({
    namespaces:   new Set(data.nodes.filter(n => n.namespace).map(n => n.namespace!)).size,
    deployments:  data.nodes.filter(n => n.type === 'deployment').length,
    daemonsets:   data.nodes.filter(n => n.type === 'daemonset').length,
    statefulsets: data.nodes.filter(n => n.type === 'statefulset').length,
    services:     data.nodes.filter(n => n.type === 'k8s_service').length,
    ingresses:    data.nodes.filter(n => n.type === 'ingress').length,
    netpols:      data.nodes.filter(n => n.type === 'networkpolicy').length,
    fullAccess:   data.edges.filter(e => e.accessLevel === 'full').length,
    writeAccess:  data.edges.filter(e => e.accessLevel === 'write').length,
  }), [data])

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      {/* Stats grid */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-6">
        {[
          { label: 'Namespaces',  value: totals.namespaces,  color: 'text-violet-400', border: 'border-violet-500/20', bg: 'bg-violet-950/20' },
          { label: 'Deployments', value: totals.deployments, color: 'text-blue-400',   border: 'border-blue-500/20',   bg: 'bg-blue-950/20'   },
          { label: 'StatefulSets',value: totals.statefulsets,color: 'text-purple-400', border: 'border-purple-500/20', bg: 'bg-purple-950/20' },
          { label: 'DaemonSets',  value: totals.daemonsets,  color: 'text-orange-400', border: 'border-orange-500/20', bg: 'bg-orange-950/20' },
          { label: 'Services',    value: totals.services,    color: 'text-teal-400',   border: 'border-teal-500/20',   bg: 'bg-teal-950/20'   },
          { label: 'Ingresses',   value: totals.ingresses,   color: 'text-green-400',  border: 'border-green-500/20',  bg: 'bg-green-950/15'  },
          { label: 'NetPolicies', value: totals.netpols,     color: 'text-rose-400',   border: 'border-rose-500/20',   bg: 'bg-rose-950/15'   },
          { label: 'Write paths', value: totals.writeAccess, color: 'text-yellow-400', border: 'border-yellow-500/20', bg: 'bg-yellow-950/20' },
          { label: 'Full paths',  value: totals.fullAccess,  color: 'text-red-400',    border: 'border-red-500/20',    bg: 'bg-red-950/20'    },
        ].map(({ label, value, color, border, bg }) => (
          <div key={label} className={`rounded-xl border ${border} ${bg} px-3 py-2.5 flex flex-col`}>
            <span className={`text-xl font-mono font-bold ${color}`}>{value}</span>
            <span className="text-[9px] font-mono text-slate-600 mt-0.5">{label}</span>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {Array.from(byNamespace.entries()).map(([ns, pods]) => (
          <NamespaceCard key={ns} ns={ns} nsNodes={pods} data={data} />
        ))}
      </div>
    </div>
  )
}
