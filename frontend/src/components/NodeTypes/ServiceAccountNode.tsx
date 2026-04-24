import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { KeyRound } from 'lucide-react'

interface SAData {
  label: string
  namespace: string
  dimmed: boolean
}

export const ServiceAccountNode = memo(({ data }: NodeProps<SAData>) => {
  const { label, namespace, dimmed } = data

  return (
    <div
      className={`
        relative rounded-xl border transition-all duration-300 cursor-pointer select-none overflow-hidden
        ${dimmed ? 'opacity-20 scale-95' : 'opacity-100'}
        border-violet-500/40 hover:border-violet-400/60
        backdrop-blur-sm
      `}
      style={{ minWidth: 210, background: 'rgba(46,16,101,0.35)' }}
    >
      <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 border-b border-violet-500/15"
        style={{ background: 'rgba(139,92,246,0.08)' }}>
        <KeyRound size={9} className="text-violet-400" />
        <span className="text-xs font-mono font-bold text-violet-400 tracking-widest uppercase">Service Account</span>
      </div>

      <div className="px-2.5 py-1.5">
        <div className="text-sm font-mono font-semibold text-violet-200 leading-tight truncate">{label}</div>
        <div className="text-xs font-mono text-slate-400 mt-0.5">{namespace}</div>
      </div>

      <Handle type="target" position={Position.Left}  className="!w-2 !h-2 !bg-violet-500 !border-cyber-bg" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-violet-500 !border-cyber-bg" />
    </div>
  )
})
