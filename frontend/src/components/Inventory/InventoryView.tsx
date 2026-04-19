import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, X, Container, KeyRound, ShieldCheck, HardDrive,
  ChevronUp, ChevronDown, ExternalLink, Layers, Database,
  Cpu, Network, Globe, ShieldOff, PlayCircle, Clock, FileText,
} from 'lucide-react'
import { GraphData, GraphNode, NodeType, AccessLevel } from '../../types'

interface InventoryViewProps { data: GraphData }

type SortKey = 'label' | 'namespace' | 'type' | 'access'
type SortDir = 'asc' | 'desc'

const TYPE_TABS: { id: NodeType | 'all'; label: string; icon: React.ReactNode }[] = [
  { id: 'all',            label: 'All',              icon: null },
  { id: 'pod',            label: 'Pods',             icon: <Container size={11} /> },
  { id: 'deployment',     label: 'Deployments',      icon: <Layers size={11} /> },
  { id: 'statefulset',    label: 'StatefulSets',     icon: <Database size={11} /> },
  { id: 'daemonset',      label: 'DaemonSets',       icon: <Cpu size={11} /> },
  { id: 'job',            label: 'Jobs',             icon: <PlayCircle size={11} /> },
  { id: 'cronjob',        label: 'CronJobs',         icon: <Clock size={11} /> },
  { id: 'serviceaccount', label: 'ServiceAccounts',  icon: <KeyRound size={11} /> },
  { id: 'iam_role',       label: 'IAM Roles',        icon: <ShieldCheck size={11} /> },
  { id: 'aws_service',    label: 'AWS Resources',    icon: <HardDrive size={11} /> },
  { id: 'k8s_service',    label: 'Services',         icon: <Network size={11} /> },
  { id: 'ingress',        label: 'Ingresses',        icon: <Globe size={11} /> },
  { id: 'networkpolicy',  label: 'NetworkPolicies',  icon: <ShieldOff size={11} /> },
]

const TYPE_COLOR: Record<NodeType, string> = {
  pod:                    'text-cyan-400   bg-cyan-950/40   border-cyan-500/30',
  serviceaccount:         'text-violet-400 bg-violet-950/40 border-violet-500/30',
  iam_role:               'text-amber-400  bg-amber-950/40  border-amber-500/30',
  aws_service:            'text-slate-300  bg-slate-800/40  border-slate-600/30',
  deployment:             'text-blue-400   bg-blue-950/40   border-blue-500/30',
  statefulset:            'text-purple-400 bg-purple-950/40 border-purple-500/30',
  daemonset:              'text-orange-400 bg-orange-950/35 border-orange-500/30',
  job:                    'text-green-400  bg-green-950/35  border-green-500/30',
  cronjob:                'text-teal-400   bg-teal-950/35   border-teal-500/30',
  k8s_service:            'text-teal-400   bg-teal-950/35   border-teal-500/30',
  ingress:                'text-green-400  bg-green-950/30  border-green-500/30',
  networkpolicy:          'text-rose-400   bg-rose-950/30   border-rose-500/30',
  k8s_role:               'text-red-400    bg-red-950/30    border-red-500/30',
  k8s_clusterrole:        'text-orange-400 bg-orange-950/30 border-orange-500/30',
  k8s_rolebinding:        'text-violet-400 bg-violet-950/30 border-violet-500/30',
  k8s_clusterrolebinding: 'text-violet-300 bg-violet-950/25 border-violet-400/25',
  secret:                 'text-amber-400  bg-amber-950/35  border-amber-500/30',
  configmap:              'text-sky-400    bg-sky-950/35    border-sky-500/30',
}

const TYPE_LABEL: Record<NodeType, string> = {
  pod: 'Pod', serviceaccount: 'ServiceAccount', iam_role: 'IAM Role',
  aws_service: 'AWS Resource', deployment: 'Deployment', statefulset: 'StatefulSet',
  daemonset: 'DaemonSet', job: 'Job', cronjob: 'CronJob',
  k8s_service: 'Service', ingress: 'Ingress',
  networkpolicy: 'NetworkPolicy',
  k8s_role: 'Role', k8s_clusterrole: 'ClusterRole',
  k8s_rolebinding: 'RoleBinding', k8s_clusterrolebinding: 'ClusterRoleBinding',
  secret: 'Secret', configmap: 'ConfigMap',
}

const TYPE_ICON: Record<NodeType, React.ReactNode> = {
  pod:                    <Container size={9} />,
  serviceaccount:         <KeyRound size={9} />,
  iam_role:               <ShieldCheck size={9} />,
  aws_service:            <HardDrive size={9} />,
  deployment:             <Layers size={9} />,
  statefulset:            <Database size={9} />,
  daemonset:              <Cpu size={9} />,
  job:                    <PlayCircle size={9} />,
  cronjob:                <Clock size={9} />,
  k8s_service:            <Network size={9} />,
  ingress:                <Globe size={9} />,
  networkpolicy:          <ShieldOff size={9} />,
  k8s_role:               <ShieldCheck size={9} />,
  k8s_clusterrole:        <ShieldCheck size={9} />,
  k8s_rolebinding:        <ShieldCheck size={9} />,
  k8s_clusterrolebinding: <ShieldCheck size={9} />,
  secret:                 <KeyRound size={9} />,
  configmap:              <FileText size={9} />,
}

const ACCESS_BADGE: Record<AccessLevel, string> = {
  full:  'text-red-400    bg-red-950/40    border-red-500/30',
  write: 'text-yellow-400 bg-yellow-950/30 border-yellow-500/30',
  read:  'text-emerald-400 bg-emerald-950/30 border-emerald-500/30',
}
const ACCESS_ORDER: Record<string, number> = { full: 3, write: 2, read: 1, '—': 0 }

function getNodeAccess(node: GraphNode, data: GraphData): AccessLevel | null {
  const incoming = data.edges.filter(e => e.target === node.id && e.accessLevel)
  if (incoming.some(e => e.accessLevel === 'full'))  return 'full'
  if (incoming.some(e => e.accessLevel === 'write')) return 'write'
  if (incoming.some(e => e.accessLevel === 'read'))  return 'read'
  return null
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronUp size={10} className="text-slate-700" />
  return dir === 'asc' ? <ChevronUp size={10} className="text-cyan-400" /> : <ChevronDown size={10} className="text-cyan-400" />
}

export function InventoryView({ data }: InventoryViewProps) {
  const [typeFilter, setTypeFilter] = useState<NodeType | 'all'>('all')
  const [search, setSearch]         = useState('')
  const [sortKey, setSortKey]       = useState<SortKey>('type')
  const [sortDir, setSortDir]       = useState<SortDir>('asc')
  const [expanded, setExpanded]     = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.nodes.length }
    for (const n of data.nodes) c[n.type] = (c[n.type] ?? 0) + 1
    return c
  }, [data])

  const rows = useMemo(() => {
    let nodes = data.nodes
    if (typeFilter !== 'all') nodes = nodes.filter(n => n.type === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      nodes = nodes.filter(n =>
        n.label.toLowerCase().includes(q) ||
        n.namespace?.toLowerCase().includes(q) ||
        n.metadata?.arn?.toLowerCase().includes(q)
      )
    }
    return [...nodes].sort((a, b) => {
      if (sortKey === 'access') {
        const va = ACCESS_ORDER[getNodeAccess(a, data) ?? '—']
        const vb = ACCESS_ORDER[getNodeAccess(b, data) ?? '—']
        return sortDir === 'asc' ? va - vb : vb - va
      }
      const va = sortKey === 'label' ? a.label : sortKey === 'namespace' ? (a.namespace ?? '') : a.type
      const vb = sortKey === 'label' ? b.label : sortKey === 'namespace' ? (b.namespace ?? '') : b.type
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
  }, [data, typeFilter, search, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-cyber-border/50 overflow-x-auto">
        <div className="flex items-center gap-1 p-1 rounded-xl border border-cyber-border bg-cyber-panel/60 shrink-0">
          {TYPE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setTypeFilter(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all whitespace-nowrap ${
                typeFilter === tab.id ? 'bg-white/8 text-slate-200 border border-white/10' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.icon}
              {tab.label}
              <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] ${typeFilter === tab.id ? 'bg-white/10 text-slate-300' : 'bg-white/5 text-slate-600'}`}>
                {counts[tab.id] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-cyber-border bg-cyber-panel/60 ml-auto shrink-0">
          <Search size={11} className="text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search name, namespace, ARN..."
            className="bg-transparent text-[11px] font-mono text-slate-300 placeholder-slate-600 outline-none w-48"
          />
          {search && <button onClick={() => setSearch('')} className="text-slate-600 hover:text-slate-300"><X size={11} /></button>}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-cyber-border bg-cyber-panel/95 backdrop-blur-sm">
              {([
                { key: 'label',     label: 'Name'      },
                { key: 'namespace', label: 'Namespace' },
                { key: 'type',      label: 'Kind'      },
                { key: 'access',    label: 'Max Access'},
              ] as { key: SortKey; label: string }[]).map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)}
                  className="text-left px-5 py-2.5 text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300 transition-colors select-none">
                  <div className="flex items-center gap-1.5">
                    {col.label}
                    <SortIcon active={sortKey === col.key} dir={sortDir} />
                  </div>
                </th>
              ))}
              <th className="text-left px-5 py-2.5 text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest">Links</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {rows.map((node, i) => {
                const access = getNodeAccess(node, data)
                const links  = data.edges.filter(e => e.source === node.id || e.target === node.id).length
                const isExpanded = expanded === node.id
                return (
                  <>
                    <motion.tr key={node.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.008, 0.15) }}
                      onClick={() => setExpanded(isExpanded ? null : node.id)}
                      className={`border-b border-cyber-border/30 cursor-pointer transition-colors hover:bg-white/3 ${isExpanded ? 'bg-white/4' : ''}`}
                    >
                      <td className="px-5 py-2.5">
                        <span className="text-[11px] font-mono font-medium text-slate-200">{node.label}</span>
                      </td>
                      <td className="px-5 py-2.5">
                        <span className="text-[11px] font-mono text-slate-500">{node.namespace ?? <span className="text-slate-700">—</span>}</span>
                      </td>
                      <td className="px-5 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-mono ${TYPE_COLOR[node.type]}`}>
                          {TYPE_ICON[node.type]}
                          {TYPE_LABEL[node.type]}
                        </span>
                      </td>
                      <td className="px-5 py-2.5">
                        {access
                          ? <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-mono font-semibold ${ACCESS_BADGE[access]}`}>{access.toUpperCase()}</span>
                          : <span className="text-[11px] font-mono text-slate-700">—</span>
                        }
                      </td>
                      <td className="px-5 py-2.5"><span className="text-[11px] font-mono text-slate-500">{links}</span></td>
                      <td className="pr-5 py-2.5 text-right text-slate-600">
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </td>
                    </motion.tr>

                    {isExpanded && (
                      <tr key={`${node.id}-exp`} className="bg-white/2 border-b border-cyber-border/30">
                        <td colSpan={6} className="px-5 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-1.5">
                            <div>
                              <span className="text-[9px] font-mono text-slate-600 uppercase tracking-wider">ID</span>
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5 break-all">{node.id}</div>
                            </div>
                            {node.metadata && Object.entries(node.metadata).map(([k, v]) => (
                              <div key={k}>
                                <span className="text-[9px] font-mono text-slate-600 uppercase tracking-wider">{k}</span>
                                <div className="text-[10px] font-mono text-slate-400 mt-0.5 break-all flex items-center gap-1">
                                  {v || '—'}
                                  {k === 'arn' && <ExternalLink size={8} className="text-slate-700 shrink-0" />}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </AnimatePresence>
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="flex items-center justify-center h-32 text-[11px] font-mono text-slate-600">no results</div>
        )}
      </div>

      <div className="shrink-0 px-6 py-2 border-t border-cyber-border/40">
        <span className="text-[10px] font-mono text-slate-600">{rows.length} of {data.nodes.length} resources</span>
      </div>
    </div>
  )
}
