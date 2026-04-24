import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, X, Container, KeyRound, ShieldCheck, HardDrive,
  ChevronUp, ChevronDown, ChevronRight, ExternalLink, Layers, Database,
  Cpu, Network, Globe, ShieldOff, Server, MessageSquare, Lock,
  BarChart2, Filter, PlayCircle, Clock,
} from 'lucide-react'
import { GraphData, GraphNode, NodeType, AccessLevel } from '../../types'

interface ExplorerViewProps {
  data: GraphData
  clusterName?: string
  initialTypeFilter?: NodeType | 'all'
}

type SortKey = 'label' | 'namespace' | 'type' | 'access'
type SortDir = 'asc' | 'desc'

// ── Config ────────────────────────────────────────────────────────────────────

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
  networkpolicy: 'NetworkPolicy', k8s_role: 'Role', k8s_clusterrole: 'ClusterRole',
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
  configmap:              <MessageSquare size={9} />,
}

const ACCESS_BADGE: Record<AccessLevel, string> = {
  full:  'text-red-400    bg-red-950/40    border-red-500/30',
  write: 'text-yellow-400 bg-yellow-950/30 border-yellow-500/30',
  read:  'text-emerald-400 bg-emerald-950/30 border-emerald-500/30',
}
const ACCESS_ORDER: Record<string, number> = { full: 3, write: 2, read: 1, '—': 0 }

// ── Grouped type tiles config ─────────────────────────────────────────────────

const TYPE_GROUPS: { label: string; types: NodeType[]; color: string; icon: React.ReactNode }[] = [
  { label: 'Pods',           types: ['pod'],             color: 'text-cyan-400',   icon: <Container size={12} /> },
  { label: 'Deployments',    types: ['deployment'],      color: 'text-blue-400',   icon: <Layers size={12} /> },
  { label: 'StatefulSets',   types: ['statefulset'],     color: 'text-purple-400', icon: <Database size={12} /> },
  { label: 'DaemonSets',     types: ['daemonset'],       color: 'text-orange-400', icon: <Cpu size={12} /> },
  { label: 'Jobs',           types: ['job'],             color: 'text-green-400',  icon: <PlayCircle size={12} /> },
  { label: 'CronJobs',       types: ['cronjob'],         color: 'text-teal-400',   icon: <Clock size={12} /> },
  { label: 'ServiceAccounts',types: ['serviceaccount'],  color: 'text-violet-400', icon: <KeyRound size={12} /> },
  { label: 'Services',       types: ['k8s_service'],     color: 'text-teal-400',   icon: <Network size={12} /> },
  { label: 'Ingresses',      types: ['ingress'],         color: 'text-green-400',  icon: <Globe size={12} /> },
  { label: 'NetPolicies',    types: ['networkpolicy'],   color: 'text-rose-400',   icon: <ShieldOff size={12} /> },
  { label: 'IAM Roles',      types: ['iam_role'],        color: 'text-amber-400',  icon: <ShieldCheck size={12} /> },
  { label: 'AWS Resources',  types: ['aws_service'],     color: 'text-slate-400',  icon: <HardDrive size={12} /> },
  { label: 'RBAC',           types: ['k8s_role','k8s_clusterrole','k8s_rolebinding','k8s_clusterrolebinding'], color: 'text-red-400', icon: <ShieldCheck size={12} /> },
  { label: 'Secrets',        types: ['secret'],          color: 'text-amber-400', icon: <KeyRound size={12} /> },
  { label: 'ConfigMaps',     types: ['configmap'],       color: 'text-sky-400',   icon: <MessageSquare size={12} /> },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNodeAccess(node: GraphNode, data: GraphData): AccessLevel | null {
  const incoming = data.edges.filter(e => e.target === node.id && e.accessLevel)
  if (incoming.some(e => e.accessLevel === 'full'))  return 'full'
  if (incoming.some(e => e.accessLevel === 'write')) return 'write'
  if (incoming.some(e => e.accessLevel === 'read'))  return 'read'
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

function awsServiceIcon(label: string) {
  const l = label.toLowerCase()
  if (l.startsWith('s3'))                               return <HardDrive size={9} />
  if (l.startsWith('rds') || l.startsWith('dynamodb'))  return <Database size={9} />
  if (l.startsWith('sqs') || l.startsWith('sns'))       return <MessageSquare size={9} />
  if (l.startsWith('sm:') || l.startsWith('kms'))       return <Lock size={9} />
  if (l.startsWith('cloudwatch'))                       return <BarChart2 size={9} />
  return <Server size={9} />
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronUp size={10} className="text-slate-400" />
  return dir === 'asc' ? <ChevronUp size={10} className="text-cyan-400" /> : <ChevronDown size={10} className="text-cyan-400" />
}

// ── Expanded row helpers ──────────────────────────────────────────────────────

function Field({ label, value, mono = true, wide = false }: { label: string; value?: string | null; mono?: boolean; wide?: boolean }) {
  if (!value) return null
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[9px] font-mono text-slate-400 uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-[11px] ${mono ? 'font-mono' : ''} text-slate-300 break-all leading-snug`}>{value}</div>
    </div>
  )
}

function ResourceBar({ label, req, lim, color }: { label: string; req?: string; lim?: string; color: string }) {
  if (!req && !lim) return null
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-mono text-slate-400 w-8 uppercase">{label}</span>
      <div className="flex items-center gap-1">
        <span className={`text-[10px] font-mono font-semibold ${color}`}>{req}</span>
        <span className="text-[9px] text-slate-400">→</span>
        <span className="text-[10px] font-mono text-slate-400">{lim}</span>
      </div>
    </div>
  )
}

function LabelChips({ raw }: { raw?: string }) {
  if (!raw) return null
  const pairs = raw.split(',').map(s => s.trim()).filter(Boolean)
  return (
    <div className="flex flex-wrap gap-1">
      {pairs.map((pair, i) => {
        const [k, v] = pair.split('=')
        return (
          <span key={i} className="inline-flex items-center text-[9px] font-mono rounded-md border border-slate-700/60 bg-slate-800/50 overflow-hidden">
            <span className="px-1.5 py-0.5 text-slate-400 border-r border-slate-700/60">{k}</span>
            <span className="px-1.5 py-0.5 text-slate-300">{v}</span>
          </span>
        )
      })}
    </div>
  )
}

function ImageTag({ image }: { image?: string }) {
  if (!image) return null
  const [name, tag] = image.split(':')
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-700/50 bg-slate-800/40 font-mono text-[10px] w-fit max-w-full overflow-hidden">
      <Container size={10} className="text-slate-400 shrink-0" />
      <span className="text-slate-300 truncate">{name}</span>
      {tag && <><span className="text-slate-400">:</span><span className="text-cyan-400 shrink-0">{tag}</span></>}
    </div>
  )
}

function PhaseChip({ phase, condition }: { phase?: string; condition?: string }) {
  if (!phase) return null
  const isOk = phase === 'Running' && condition === 'Ready'
  const color = isOk ? 'text-emerald-400 border-emerald-500/30 bg-emerald-950/30'
    : phase === 'Pending' ? 'text-yellow-400 border-yellow-500/30 bg-yellow-950/30'
    : 'text-red-400 border-red-500/30 bg-red-950/30'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-mono font-semibold ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isOk ? 'bg-emerald-400' : phase === 'Pending' ? 'bg-yellow-400' : 'bg-red-400'}`} />
      {phase}
    </span>
  )
}

function IrsaChain({ node, data }: { node: GraphNode; data: GraphData }) {
  const { sa, role, svcs } = podIAMChain(node, data)
  if (!sa && !role && !svcs.length) {
    return <span className="text-[10px] font-mono text-slate-400">no IRSA binding</span>
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-950/30 border border-cyan-500/20">
        <Container size={9} className="text-cyan-400" />
        <span className="text-[10px] font-mono text-cyan-300">{node.label}</span>
      </div>
      {sa && (
        <>
          <ChevronRight size={10} className="text-slate-400" />
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-950/30 border border-violet-500/20">
            <KeyRound size={9} className="text-violet-400" />
            <span className="text-[10px] font-mono text-violet-300">{sa.label}</span>
          </div>
        </>
      )}
      {role && (
        <>
          <ChevronRight size={10} className="text-slate-400" />
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-950/30 border border-amber-500/20">
            <ShieldCheck size={9} className="text-amber-400" />
            <span className="text-[10px] font-mono text-amber-300">{role.label}</span>
          </div>
        </>
      )}
      {svcs.length > 0 && (
        <>
          <ChevronRight size={10} className="text-slate-400" />
          <div className="flex flex-wrap gap-1">
            {svcs.map(({ node: svc, access }) => (
              <div key={svc.id} className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-mono ${ACCESS_BADGE[access]}`}>
                {awsServiceIcon(svc.label)}
                <span className="truncate max-w-[100px]">{svc.label.replace(/^[^:]+:\s*/, '')}</span>
                <span className="font-bold">{access.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Expanded row ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-mono text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
        <span>{title}</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>
      {children}
    </div>
  )
}

function ExpandedRow({ node, data }: { node: GraphNode; data: GraphData }) {
  const m = node.metadata ?? {}

  // ── Pod ──
  if (node.type === 'pod') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <Section title="Container">
              <ImageTag image={m.image} />
              <div className="mt-2 space-y-1">
                <ResourceBar label="CPU" req={m.cpuRequest} lim={m.cpuLimit} color="text-blue-400" />
                <ResourceBar label="Mem" req={m.memRequest} lim={m.memLimit} color="text-purple-400" />
              </div>
            </Section>
          </div>
          <div className="space-y-2">
            <Section title="Status">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <PhaseChip phase={m.phase} condition={m.condition} />
                  {m.restarts && Number(m.restarts) > 0 && (
                    <span className="text-[9px] font-mono text-yellow-400 bg-yellow-950/30 border border-yellow-500/25 px-1.5 py-0.5 rounded-full">{m.restarts} restarts</span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-1">
                  <Field label="Node" value={m.nodeName} />
                  <Field label="UID" value={m.uid} />
                </div>
              </div>
            </Section>
          </div>
        </div>
        {m.labels && (
          <Section title="Labels">
            <LabelChips raw={m.labels} />
          </Section>
        )}
        <Section title="IRSA Chain">
          <IrsaChain node={node} data={data} />
        </Section>
      </div>
    )
  }

  // ── Deployment / StatefulSet / DaemonSet ──
  if (['deployment','statefulset','daemonset'].includes(node.type)) {
    const replicas = node.type === 'daemonset'
      ? (m.desired ? `${m.ready ?? '?'}/${m.desired} nodes` : null)
      : (m.replicas ? `${m.available ?? m.replicas}/${m.replicas} ready` : null)
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <Section title="Spec">
              <ImageTag image={m.image} />
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {replicas && <Field label="Replicas" value={replicas} />}
                {m.strategy && <Field label="Strategy" value={m.strategy} />}
                {m.storageClass && <Field label="StorageClass" value={m.storageClass} />}
                {m.pvc && <Field label="PVC size" value={m.pvc} />}
                {m.nodeSelector && <Field label="NodeSelector" value={m.nodeSelector} />}
              </div>
            </Section>
          </div>
          <Section title="Resources">
            <div className="space-y-1.5 pt-0.5">
              <ResourceBar label="CPU" req={m.cpuRequest} lim={m.cpuLimit} color="text-blue-400" />
              <ResourceBar label="Mem" req={m.memRequest} lim={m.memLimit} color="text-purple-400" />
            </div>
            {m.selector && <div className="mt-3"><Field label="Selector" value={m.selector} /></div>}
          </Section>
        </div>
        {m.labels && (
          <Section title="Labels">
            <LabelChips raw={m.labels} />
          </Section>
        )}
      </div>
    )
  }

  // ── ServiceAccount ──
  if (node.type === 'serviceaccount') {
    const irsaArn = m['eks.amazonaws.com/role-arn']
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-6">
          <Section title="Config">
            <div className="space-y-1.5">
              <Field label="Automount token" value={m.automountToken} />
            </div>
          </Section>
          {irsaArn && (
            <Section title="IRSA">
              <div className="px-2.5 py-2 rounded-xl border border-amber-500/25 bg-amber-950/20">
                <div className="text-[8px] font-mono text-amber-600 uppercase tracking-wider mb-1">Annotated IAM Role</div>
                <div className="text-[10px] font-mono text-amber-300 break-all">{irsaArn}</div>
              </div>
            </Section>
          )}
        </div>
        {m.labels && (
          <Section title="Labels">
            <LabelChips raw={m.labels} />
          </Section>
        )}
      </div>
    )
  }

  // ── IAM Role ──
  if (node.type === 'iam_role') {
    return (
      <div className="space-y-3">
        <Section title="Identity">
          <div className="px-3 py-2 rounded-xl border border-amber-500/20 bg-amber-950/15 font-mono text-[10px] text-amber-300 break-all flex items-start gap-1.5">
            <ExternalLink size={9} className="text-amber-600 shrink-0 mt-0.5" />
            {m.arn}
          </div>
        </Section>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Path" value={m.path} />
          <Field label="Policies attached" value={m.policies} />
          <Field label="Max session" value={m.maxSessionDuration ? `${m.maxSessionDuration}s` : undefined} />
          <Field label="Created" value={m.created} />
        </div>
      </div>
    )
  }

  // ── AWS Service ──
  if (node.type === 'aws_service') {
    return (
      <div className="space-y-3">
        <Section title="Resource">
          <div className="px-3 py-2 rounded-xl border border-slate-600/40 bg-slate-800/30 font-mono text-[10px] text-slate-300 break-all flex items-start gap-1.5">
            <ExternalLink size={9} className="text-slate-400 shrink-0 mt-0.5" />
            {m.arn}
          </div>
        </Section>
        <Field label="Service" value={m.service?.toUpperCase()} />
      </div>
    )
  }

  // ── K8s Service ──
  if (node.type === 'k8s_service') {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Type" value={m.svcType} />
          <Field label="ClusterIP" value={m.clusterIP} />
          <Field label="Port" value={m.port ? `${m.port}/${m.protocol ?? 'TCP'}` : undefined} />
          <Field label="Selector" value={m.selector} wide />
        </div>
        {m.labels && (
          <Section title="Labels">
            <LabelChips raw={m.labels} />
          </Section>
        )}
      </div>
    )
  }

  // ── Ingress ──
  if (node.type === 'ingress') {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Class" value={m.class} />
          <Field label="Host" value={m.host} />
          <Field label="TLS" value={m.tls === 'true' ? 'enabled' : 'disabled'} />
          <Field label="Rules" value={m.rules} />
          {m.annotations && <Field label="Annotations" value={m.annotations} wide />}
        </div>
        {m.labels && (
          <Section title="Labels">
            <LabelChips raw={m.labels} />
          </Section>
        )}
      </div>
    )
  }

  // ── NetworkPolicy ──
  if (node.type === 'networkpolicy') {
    const isDeny = m.effect === 'deny'
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[9px] font-mono text-slate-400 uppercase tracking-wider mb-0.5">Effect</div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-mono font-bold ${
              isDeny ? 'text-red-400 border-red-500/30 bg-red-950/30' : 'text-emerald-400 border-emerald-500/30 bg-emerald-950/30'
            }`}>{isDeny ? 'DENY' : 'ALLOW'}</span>
          </div>
          <Field label="Pod selector" value={m.podSelector} />
          <Field label="Policy types" value={m.policyTypes} />
        </div>
      </div>
    )
  }

  // ── RBAC ──
  if (['k8s_role','k8s_clusterrole','k8s_rolebinding','k8s_clusterrolebinding'].includes(node.type)) {
    const isDanger = m.danger === 'critical' || m.danger === 'high'
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          {m.rules && (
            <div>
              <div className="text-[9px] font-mono text-slate-400 uppercase tracking-wider mb-1">Rules</div>
              <div className={`px-2.5 py-1.5 rounded-lg border font-mono text-[10px] ${
                isDanger ? 'border-red-500/25 bg-red-950/20 text-red-300' : 'border-slate-700/50 bg-slate-800/30 text-slate-300'
              }`}>{m.rules}</div>
            </div>
          )}
          {m.danger && (
            <div>
              <div className="text-[9px] font-mono text-slate-400 uppercase tracking-wider mb-1">Risk level</div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-mono font-bold uppercase ${
                m.danger === 'critical' ? 'text-red-400 border-red-500/40 bg-red-950/40'
                : m.danger === 'high' ? 'text-orange-400 border-orange-500/35 bg-orange-950/30'
                : 'text-slate-400 border-slate-600/40 bg-slate-800/30'
              }`}>{m.danger}</span>
            </div>
          )}
          {m.roleRef && <Field label="Role ref" value={`${m.roleKind ?? 'Role'}/${m.roleRef}`} />}
          {m.subjects && <Field label="Subjects" value={m.subjects} />}
        </div>
      </div>
    )
  }

  // ── Fallback: generic grid ──
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2">
      <Field label="ID" value={node.id} />
      {node.metadata && Object.entries(node.metadata).map(([k, v]) => (
        <Field key={k} label={k} value={v || '—'} />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ExplorerView({ data, clusterName = 'mock-cluster', initialTypeFilter }: ExplorerViewProps) {
  const [typeFilter, setTypeFilter]   = useState<NodeType | 'all'>(initialTypeFilter ?? 'all')
  useEffect(() => { if (initialTypeFilter) setTypeFilter(initialTypeFilter) }, [initialTypeFilter])
  const [nsFilter, setNsFilter]       = useState<string>('all')
  const [search, setSearch]           = useState('')
  const [sortKey, setSortKey]         = useState<SortKey>('type')
  const [sortDir, setSortDir]         = useState<SortDir>('asc')
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const namespaces = useMemo(() =>
    ['all', ...new Set(data.nodes.filter(n => n.namespace).map(n => n.namespace!)).values()]
  , [data])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.nodes.length }
    for (const n of data.nodes) c[n.type] = (c[n.type] ?? 0) + 1
    return c
  }, [data])

  const groupCounts = useMemo(() =>
    TYPE_GROUPS.map(g => ({
      ...g,
      count: g.types.reduce((sum, t) => sum + (counts[t] ?? 0), 0),
    }))
  , [counts])

  const activeGroupTypes = useMemo(() => {
    if (typeFilter === 'all') return null
    return TYPE_GROUPS.find(g => g.types.includes(typeFilter as NodeType))?.types ?? null
  }, [typeFilter])

  const rows = useMemo(() => {
    let nodes = data.nodes
    if (typeFilter !== 'all') nodes = nodes.filter(n => n.type === typeFilter || activeGroupTypes?.includes(n.type))
    if (nsFilter !== 'all')   nodes = nodes.filter(n => n.namespace === nsFilter)
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
  }, [data, typeFilter, nsFilter, search, sortKey, sortDir, activeGroupTypes])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function handleGroupClick(g: typeof TYPE_GROUPS[number]) {
    const t = g.types[0]
    setTypeFilter(prev => (prev === t && g.types.length === 1) || g.types.includes(prev as NodeType) ? 'all' : t)
  }

  const isGroupActive = (g: typeof TYPE_GROUPS[number]) =>
    g.types.includes(typeFilter as NodeType)

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Summary tiles ── */}
      <div className="shrink-0 px-5 pt-4 pb-3 border-b border-cyber-border/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400">cluster</span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-cyan-500/25 bg-cyan-950/20">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[11px] font-mono text-cyan-300 font-semibold">{clusterName}</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              {data.nodes.length} resources · {new Set(data.nodes.filter(n=>n.namespace).map(n=>n.namespace!)).size} namespaces
            </span>
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-all ${
              showFilters || typeFilter !== 'all' || nsFilter !== 'all' || search
                ? 'border-cyan-500/40 bg-cyan-950/25 text-cyan-300'
                : 'border-cyber-border/60 text-slate-400 hover:text-slate-300'
            }`}
          >
            <Filter size={10} />
            {typeFilter !== 'all' || nsFilter !== 'all' || search ? 'Filters active' : 'Filters'}
          </button>
        </div>

        {/* Type tiles */}
        <div className="flex flex-wrap gap-1.5">
          {groupCounts.filter(g => g.count > 0).map(g => (
            <button
              key={g.label}
              onClick={() => handleGroupClick(g)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono transition-all ${
                isGroupActive(g)
                  ? `border-white/15 bg-white/8 ${g.color}`
                  : 'border-cyber-border/50 bg-cyber-panel/40 text-slate-400 hover:text-slate-300 hover:border-slate-600/60'
              }`}
            >
              <span className={isGroupActive(g) ? g.color : 'text-slate-400'}>{g.icon}</span>
              <span>{g.label}</span>
              <span className={`px-1.5 py-px rounded-full text-[10px] ${isGroupActive(g) ? 'bg-white/12 text-slate-200' : 'bg-white/5 text-slate-400'}`}>
                {g.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Filter bar (collapsible) ── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden border-b border-cyber-border/50"
          >
            <div className="flex items-center gap-3 px-5 py-2.5">
              {/* Namespace filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-400">Namespace</span>
                <div className="flex items-center gap-1 p-0.5 rounded-lg border border-cyber-border bg-cyber-panel/60">
                  {namespaces.map(ns => (
                    <button
                      key={ns}
                      onClick={() => setNsFilter(ns)}
                      className={`px-2 py-1 rounded-md text-xs font-mono transition-all ${
                        nsFilter === ns ? 'bg-white/8 text-slate-200 border border-white/10' : 'text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      {ns === 'all' ? 'All' : ns}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-cyber-border bg-cyber-panel/60 ml-auto">
                <Search size={11} className="text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="search name, namespace, ARN..."
                  className="bg-transparent text-sm font-mono text-slate-300 placeholder-slate-600 outline-none w-52"
                />
                {search && <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-300"><X size={11} /></button>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-cyber-border bg-cyber-panel/95 backdrop-blur-sm">
              {([
                { key: 'label',     label: 'Name'       },
                { key: 'namespace', label: 'Namespace'  },
                { key: 'type',      label: 'Kind'       },
                { key: 'access',    label: 'AWS Access' },
              ] as { key: SortKey; label: string }[]).map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)}
                  className="text-left px-5 py-2.5 text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-300 transition-colors select-none">
                  <div className="flex items-center gap-1.5">
                    {col.label}
                    <SortIcon active={sortKey === col.key} dir={sortDir} />
                  </div>
                </th>
              ))}
              <th className="text-left px-5 py-2.5 text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">Connections</th>
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
                    <motion.tr
                      key={node.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.006, 0.12) }}
                      onClick={() => setExpanded(isExpanded ? null : node.id)}
                      className={`border-b border-cyber-border/30 cursor-pointer transition-colors hover:bg-white/3 ${isExpanded ? 'bg-white/4' : ''}`}
                    >
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`shrink-0 ${TYPE_COLOR[node.type].split(' ')[0]}`}>
                            {TYPE_ICON[node.type]}
                          </span>
                          <span className="text-sm font-mono font-medium text-slate-200">{node.label}</span>
                          {/* Security badges */}
                          {node.metadata?.privileged === 'true' && (
                            <span className="text-[8px] font-mono px-1 py-px rounded bg-red-900/50 text-red-400 border border-red-500/30">PRIV</span>
                          )}
                          {node.metadata?.runAsRoot === 'true' && (
                            <span className="text-[8px] font-mono px-1 py-px rounded bg-orange-900/40 text-orange-400 border border-orange-500/25">ROOT</span>
                          )}
                          {node.metadata?.hostNetwork === 'true' && (
                            <span className="text-[8px] font-mono px-1 py-px rounded bg-orange-900/30 text-orange-400 border border-orange-500/20">hNet</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-2.5">
                        <span className="text-sm font-mono text-slate-400">{node.namespace ?? <span className="text-slate-400">—</span>}</span>
                      </td>
                      <td className="px-5 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-mono ${TYPE_COLOR[node.type]}`}>
                          {TYPE_ICON[node.type]}
                          {TYPE_LABEL[node.type]}
                        </span>
                      </td>
                      <td className="px-5 py-2.5">
                        {access
                          ? <span className={`inline-block px-2 py-0.5 rounded-md border text-xs font-mono font-semibold ${ACCESS_BADGE[access]}`}>{access.toUpperCase()}</span>
                          : <span className="text-sm font-mono text-slate-400">—</span>
                        }
                      </td>
                      <td className="px-5 py-2.5">
                        <span className="text-sm font-mono text-slate-400">{links}</span>
                      </td>
                      <td className="pr-5 py-2.5 text-right text-slate-400">
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </td>
                    </motion.tr>

                    {isExpanded && (
                      <tr key={`${node.id}-exp`} className="bg-white/2 border-b border-cyber-border/30">
                        <td colSpan={6} className="px-5 py-3">
                          <ExpandedRow node={node} data={data} />
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
          <div className="flex items-center justify-center h-32 text-sm font-mono text-slate-400">no results</div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 px-6 py-2 border-t border-cyber-border/40 flex items-center justify-between">
        <span className="text-xs font-mono text-slate-400">
          {rows.length} of {data.nodes.length} resources
          {(typeFilter !== 'all' || nsFilter !== 'all' || search) && ' · filtered'}
        </span>
        {(typeFilter !== 'all' || nsFilter !== 'all' || search) && (
          <button
            onClick={() => { setTypeFilter('all'); setNsFilter('all'); setSearch('') }}
            className="text-xs font-mono text-slate-400 hover:text-slate-300 transition-colors flex items-center gap-1"
          >
            <X size={9} /> clear filters
          </button>
        )}
      </div>
    </div>
  )
}
