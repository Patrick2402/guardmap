import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Layers, Database, Cpu, PlayCircle, Clock } from 'lucide-react'
import { NodeType } from '../../types'

interface WorkloadData {
  label: string
  namespace: string
  nodeType: NodeType
  replicas?: string
  available?: string
  desired?: string
  ready?: string
  // job/cronjob extras
  schedule?: string
  succeeded?: string
  completions?: string
  activeJobs?: string
  dimmed: boolean
  privileged?: string
  runAsRoot?: string
  hostNetwork?: string
  hostPID?: string
  hostPath?: string
}

const config = {
  deployment:  { icon: Layers,       headerText: 'text-blue-400',   headerBg: 'rgba(59,130,246,0.08)',  border: 'border-blue-500/40',   bodyBg: 'rgba(3,14,46,0.4)',    nameText: 'text-blue-200',   kind: 'Deployment'  },
  statefulset: { icon: Database,     headerText: 'text-purple-400', headerBg: 'rgba(168,85,247,0.08)', border: 'border-purple-500/40', bodyBg: 'rgba(24,5,46,0.4)',    nameText: 'text-purple-200', kind: 'StatefulSet' },
  daemonset:   { icon: Cpu,          headerText: 'text-orange-400', headerBg: 'rgba(249,115,22,0.08)', border: 'border-orange-500/40', bodyBg: 'rgba(46,14,3,0.4)',    nameText: 'text-orange-200', kind: 'DaemonSet'   },
  job:         { icon: PlayCircle,   headerText: 'text-green-400',  headerBg: 'rgba(34,197,94,0.08)',  border: 'border-green-500/40',  bodyBg: 'rgba(3,46,14,0.4)',    nameText: 'text-green-200',  kind: 'Job'         },
  cronjob:     { icon: Clock,        headerText: 'text-teal-400',   headerBg: 'rgba(20,184,166,0.08)', border: 'border-teal-500/40',   bodyBg: 'rgba(3,40,40,0.4)',    nameText: 'text-teal-200',   kind: 'CronJob'     },
}

export const WorkloadNode = memo(({ data }: NodeProps<WorkloadData>) => {
  const { label, namespace, nodeType, replicas, available, desired, ready, schedule, succeeded, completions, activeJobs,
          dimmed, privileged, runAsRoot, hostNetwork, hostPID, hostPath } = data
  const cfg = config[nodeType as keyof typeof config] ?? config.deployment
  const Icon = cfg.icon

  const secBadges = [
    privileged   === 'true' && { label: 'PRIV',  cls: 'bg-red-900/60 text-red-300 border-red-600/40' },
    runAsRoot    === 'true' && { label: 'ROOT',  cls: 'bg-orange-900/60 text-orange-300 border-orange-600/40' },
    hostNetwork  === 'true' && { label: 'hNet',  cls: 'bg-orange-900/50 text-orange-300 border-orange-600/40' },
    hostPID      === 'true' && { label: 'hPID',  cls: 'bg-orange-900/50 text-orange-300 border-orange-600/40' },
    hostPath     === 'true' && { label: 'hPath', cls: 'bg-yellow-900/50 text-yellow-300 border-yellow-600/40' },
  ].filter(Boolean) as { label: string; cls: string }[]

  // Header right-side indicator
  let headerRight: React.ReactNode = null
  if (nodeType === 'cronjob' && schedule) {
    headerRight = <span className={`text-[8px] font-mono ${cfg.headerText} opacity-70`}>{schedule}</span>
  } else if (nodeType === 'job' && succeeded != null && completions != null) {
    headerRight = <span className={`text-[9px] font-mono ${cfg.headerText} opacity-70`}>{succeeded}/{completions}</span>
  } else if (nodeType === 'daemonset' && desired) {
    const readyN  = parseInt(ready  ?? desired, 10)
    const desiredN = parseInt(desired, 10)
    const degraded = readyN < desiredN
    headerRight = (
      <span className={`text-[9px] font-mono font-semibold ${degraded ? 'text-red-400' : cfg.headerText} opacity-90`}>
        {ready ?? desired}/{desired}
      </span>
    )
  } else if (replicas) {
    const avail    = parseInt(available ?? replicas, 10)
    const total    = parseInt(replicas, 10)
    const degraded = avail < total
    headerRight = (
      <span className={`text-[9px] font-mono font-semibold ${degraded ? 'text-red-400' : cfg.headerText} opacity-90`}>
        {available ?? replicas}/{replicas}
      </span>
    )
  }

  // Sub-label for cronjob active jobs count
  const subLabel = nodeType === 'cronjob' && activeJobs != null
    ? `${activeJobs} active`
    : null

  return (
    <div
      className={`
        relative rounded-xl border transition-all duration-300 cursor-pointer select-none overflow-hidden
        ${dimmed ? 'opacity-20 scale-95' : 'opacity-100'}
        ${secBadges.some(b => b.label === 'PRIV' || b.label === 'ROOT') ? 'border-red-500/50' : cfg.border} hover:brightness-110
        backdrop-blur-sm
      `}
      style={{ minWidth: 190, background: cfg.bodyBg }}
    >
      <Handle type="target" position={Position.Left}  className="!w-2 !h-2 !bg-slate-600 !border-cyber-bg" />

      <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 border-b"
        style={{ background: cfg.headerBg, borderColor: 'rgba(255,255,255,0.06)' }}>
        <span className={cfg.headerText}><Icon size={9} /></span>
        <span className={`text-[9px] font-mono font-bold tracking-widest uppercase ${cfg.headerText}`}>
          {cfg.kind}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {secBadges.map(b => (
            <span key={b.label} className={`text-[7px] font-mono font-bold px-1 py-px rounded border ${b.cls}`}>
              {b.label}
            </span>
          ))}
          {headerRight}
        </div>
      </div>

      <div className="px-2.5 py-1.5">
        <div className={`text-[12px] font-mono font-semibold leading-tight truncate ${cfg.nameText}`}>{label}</div>
        <div className="text-[9px] font-mono text-slate-400 mt-0.5">
          {namespace}{subLabel ? <span className="ml-2 text-teal-600">{subLabel}</span> : null}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-blue-600 !border-cyber-bg" />
    </div>
  )
})
