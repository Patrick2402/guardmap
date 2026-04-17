import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { ShieldCheck } from 'lucide-react'

interface RoleData {
  label: string
  arn: string
  dimmed: boolean
  hovered: boolean
  topActions: string[]
}

export const IAMRoleNode = memo(({ data }: NodeProps<RoleData>) => {
  const { label, arn, dimmed, hovered, topActions } = data
  const roleShortName = arn?.split(':role/')[1] ?? ''

  return (
    <div
      className={`
        group relative rounded-xl border transition-all duration-200 cursor-pointer select-none overflow-visible
        ${dimmed ? 'opacity-20 scale-95' : 'opacity-100'}
        ${hovered
          ? 'border-amber-400 shadow-[0_0_18px_#f59e0b66]'
          : 'border-amber-500/40 hover:border-amber-400/70'
        }
        backdrop-blur-sm
      `}
      style={{ minWidth: 190, background: 'rgba(69,26,3,0.4)' }}
    >
      {/* type header strip */}
      <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 border-b border-amber-500/15 rounded-t-xl"
        style={{ background: 'rgba(245,158,11,0.07)' }}>
        <ShieldCheck size={9} className="text-amber-400" />
        <span className="text-[9px] font-mono font-bold text-amber-400 tracking-widest uppercase">IAM Role</span>
        {hovered && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />}
      </div>

      {/* content */}
      <div className="px-2.5 py-1.5">
        <div className="text-[12px] font-mono font-semibold text-amber-200 leading-tight truncate">{label}</div>
        {roleShortName && (
          <div className="text-[9px] font-mono text-slate-500 mt-0.5 truncate max-w-[160px]">{roleShortName}</div>
        )}
      </div>

      {/* Tooltip — appears above node on hover */}
      {topActions.length > 0 && (
        <div className="
          absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2
          z-50 pointer-events-none
          opacity-0 group-hover:opacity-100 transition-opacity duration-150
          bg-slate-900/95 border border-amber-500/30 rounded-lg shadow-xl backdrop-blur-sm
          px-3 py-2.5 min-w-[160px]
        ">
          <div className="text-[9px] font-mono text-amber-400 uppercase tracking-wider mb-1.5 font-bold">
            Top Permissions
          </div>
          {topActions.map(a => (
            <div key={a} className="text-[10px] font-mono text-slate-300 truncate max-w-[180px] py-0.5">
              {a}
            </div>
          ))}
          {/* arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-amber-500/30" />
        </div>
      )}

      <Handle type="target" position={Position.Left}  className="!w-2 !h-2 !bg-amber-500 !border-cyber-bg" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-amber-500 !border-cyber-bg" />
    </div>
  )
})
