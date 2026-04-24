import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Network, Globe, ShieldOff, ShieldCheck } from 'lucide-react'
import { NodeType } from '../../types'

interface K8sNetworkData {
  label: string
  namespace: string
  nodeType: NodeType
  svcType?: string
  host?: string
  effect?: string
  dimmed?: boolean
  selected?: boolean
}

const CFG = {
  k8s_service: {
    icon: Network,
    kind: 'Service',
    border: 'border-teal-500/40',
    bg: 'rgba(13,42,39,0.5)',
    headerBg: 'rgba(20,184,166,0.07)',
    headerBorder: 'rgba(20,184,166,0.12)',
    text: 'text-teal-400',
    name: 'text-teal-200',
    handle: '!bg-teal-500',
  },
  ingress: {
    icon: Globe,
    kind: 'Ingress',
    border: 'border-green-500/40',
    bg: 'rgba(5,38,19,0.5)',
    headerBg: 'rgba(34,197,94,0.07)',
    headerBorder: 'rgba(34,197,94,0.12)',
    text: 'text-green-400',
    name: 'text-green-200',
    handle: '!bg-green-500',
  },
}

export const K8sNetworkNode = memo(({ data }: NodeProps<K8sNetworkData>) => {
  const { label, namespace, nodeType, svcType, host, effect, dimmed } = data
  const dimCls = dimmed ? 'opacity-20 scale-95' : 'opacity-100'

  // NetworkPolicy — unique variant
  if (nodeType === 'networkpolicy') {
    const isDeny = effect === 'deny'
    const Icon = isDeny ? ShieldOff : ShieldCheck
    return (
      <div
        className={`rounded-xl border backdrop-blur-sm cursor-pointer select-none overflow-hidden transition-all duration-300 hover:brightness-110 ${dimCls}
          ${isDeny ? 'border-red-500/40' : 'border-emerald-500/35'}`}
        style={{ minWidth: 190, background: isDeny ? 'rgba(40,8,8,0.5)' : 'rgba(5,35,20,0.5)' }}
      >
        <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 border-b"
          style={{ background: isDeny ? 'rgba(239,68,68,0.07)' : 'rgba(16,185,129,0.07)', borderColor: isDeny ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)' }}>
          <Icon size={9} className={isDeny ? 'text-red-400' : 'text-emerald-400'} />
          <span className={`text-[9px] font-mono font-bold tracking-widest uppercase ${isDeny ? 'text-red-400' : 'text-emerald-400'}`}>
            NetworkPolicy
          </span>
          <span className={`ml-auto text-[8px] font-mono px-1 py-px rounded ${isDeny ? 'text-red-500 bg-red-900/40' : 'text-emerald-600 bg-emerald-900/40'}`}>
            {isDeny ? 'deny' : 'allow'}
          </span>
        </div>
        <div className="px-2.5 py-1.5">
          <div className={`text-[12px] font-mono font-semibold leading-tight truncate ${isDeny ? 'text-red-200' : 'text-emerald-200'}`}>{label}</div>
          {namespace && <div className="text-[9px] font-mono text-slate-400 mt-0.5">{namespace}</div>}
        </div>
        <Handle type="target" position={Position.Left}  className={`!w-2 !h-2 !border-cyber-bg ${isDeny ? '!bg-red-500' : '!bg-emerald-500'}`} />
        <Handle type="source" position={Position.Right} className={`!w-2 !h-2 !border-cyber-bg ${isDeny ? '!bg-red-500' : '!bg-emerald-500'}`} />
      </div>
    )
  }

  // Service + Ingress — unified header-strip pattern
  const cfg = CFG[nodeType as keyof typeof CFG] ?? CFG.k8s_service
  const Icon = cfg.icon
  const meta = nodeType === 'k8s_service' ? svcType : host

  return (
    <div
      className={`rounded-xl border backdrop-blur-sm cursor-pointer select-none overflow-hidden transition-all duration-300 hover:brightness-110 ${dimCls} ${cfg.border}`}
      style={{ minWidth: 190, background: cfg.bg }}
    >
      <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 border-b"
        style={{ background: cfg.headerBg, borderColor: cfg.headerBorder }}>
        <Icon size={9} className={cfg.text} />
        <span className={`text-[9px] font-mono font-bold tracking-widest uppercase ${cfg.text}`}>{cfg.kind}</span>
        {meta && <span className="ml-auto text-[8px] font-mono text-slate-400 truncate max-w-[80px]">{meta}</span>}
      </div>
      <div className="px-2.5 py-1.5">
        <div className={`text-[12px] font-mono font-semibold leading-tight truncate ${cfg.name}`}>{label}</div>
        {namespace && <div className="text-[9px] font-mono text-slate-400 mt-0.5">{namespace}</div>}
      </div>
      <Handle type="target" position={Position.Left}  className={`!w-2 !h-2 !border-cyber-bg ${cfg.handle}`} />
      <Handle type="source" position={Position.Right} className={`!w-2 !h-2 !border-cyber-bg ${cfg.handle}`} />
    </div>
  )
})
