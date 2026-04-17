import { memo } from 'react'
import { NodeProps, Handle, Position } from 'reactflow'
import { ShieldCheck, Globe } from 'lucide-react'

interface RBACRoleData {
  label: string
  namespace?: string
  nodeType: string
  danger?: string
  rules?: string
  dimmed?: boolean
}

const DANGER_STYLE: Record<string, { border: string; bg: string; text: string; badge: string; badgeBg: string }> = {
  critical: { border: 'border-red-500/60',     bg: 'bg-red-950/40',     text: 'text-red-300',     badge: 'CRITICAL', badgeBg: 'bg-red-900/60 text-red-300'     },
  high:     { border: 'border-orange-500/50',  bg: 'bg-orange-950/35',  text: 'text-orange-300',  badge: 'HIGH',     badgeBg: 'bg-orange-900/60 text-orange-300' },
  medium:   { border: 'border-yellow-500/40',  bg: 'bg-yellow-950/30',  text: 'text-yellow-300',  badge: 'MEDIUM',   badgeBg: 'bg-yellow-900/50 text-yellow-300' },
  low:      { border: 'border-slate-500/30',   bg: 'bg-slate-900/40',   text: 'text-slate-300',   badge: 'LOW',      badgeBg: 'bg-slate-800/60 text-slate-400'   },
}

export const RBACRoleNode = memo(({ data }: NodeProps<RBACRoleData>) => {
  const { label, namespace, nodeType, danger = 'low', dimmed } = data
  const isCluster = nodeType === 'k8s_clusterrole'
  const s = DANGER_STYLE[danger] ?? DANGER_STYLE.low
  const Icon = isCluster ? Globe : ShieldCheck

  return (
    <div className={`rounded-xl border backdrop-blur-sm transition-all duration-300 cursor-pointer select-none overflow-hidden
      ${s.border} ${s.bg} ${dimmed ? 'opacity-20 scale-95' : 'opacity-100'}`}
      style={{ minWidth: 180 }}>
      <div className={`flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 border-b border-white/5`}
        style={{ background: 'rgba(255,255,255,0.03)' }}>
        <Icon size={9} className={s.text} />
        <span className={`text-[9px] font-mono font-bold tracking-widest uppercase ${s.text}`}>
          {isCluster ? 'ClusterRole' : 'Role'}
        </span>
        <span className={`ml-auto text-[8px] font-mono px-1 py-px rounded ${s.badgeBg}`}>{s.badge}</span>
      </div>
      <div className="px-2.5 py-1.5">
        <div className={`text-[12px] font-mono font-semibold leading-tight truncate ${s.text}`}>{label}</div>
        {namespace && <div className="text-[9px] font-mono text-slate-500 mt-0.5">{namespace}</div>}
      </div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border-cyber-bg" style={{ background: s.badgeBg.split(' ')[1] ?? '#475569' }} />
    </div>
  )
})
