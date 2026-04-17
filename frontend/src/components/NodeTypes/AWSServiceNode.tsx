import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Database, HardDrive, MessageSquare, Lock, BarChart2, Box } from 'lucide-react'
import { AccessLevel } from '../../types'

interface AWSData {
  label: string
  arn: string
  service: string
  maxAccessLevel: AccessLevel | null
  dimmed: boolean
  hovered: boolean
  blastHighlight: boolean
  topActions: string[]
}

function ServiceIcon({ service, size = 9 }: { service: string; size?: number }) {
  const s = service?.toLowerCase() ?? ''
  if (s === 's3')                               return <HardDrive size={size} className="text-current" />
  if (s === 'rds' || s === 'dynamodb')          return <Database size={size} className="text-current" />
  if (s === 'sqs' || s === 'sns')               return <MessageSquare size={size} className="text-current" />
  if (s === 'secretsmanager' || s === 'kms')    return <Lock size={size} className="text-current" />
  if (s === 'cloudwatch')                       return <BarChart2 size={size} className="text-current" />
  return <Box size={size} className="text-current" />
}

const accessConfig = {
  full:  { border: 'border-red-500/70',     headerBg: 'rgba(239,68,68,0.1)',     headerText: 'text-red-400',     bodyBg: 'rgba(69,10,10,0.45)',   nameText: 'text-red-200',     dot: 'bg-red-500',     glow: '0 0 20px #ef444455' },
  write: { border: 'border-yellow-500/60',  headerBg: 'rgba(245,158,11,0.09)',   headerText: 'text-yellow-400',  bodyBg: 'rgba(69,49,3,0.4)',     nameText: 'text-yellow-200',  dot: 'bg-yellow-500',  glow: '0 0 16px #f59e0b44' },
  read:  { border: 'border-emerald-500/40', headerBg: 'rgba(16,185,129,0.07)',   headerText: 'text-emerald-400', bodyBg: 'rgba(3,46,20,0.35)',    nameText: 'text-emerald-200', dot: 'bg-emerald-500', glow: '0 0 12px #10b98133' },
  none:  { border: 'border-slate-600/40',   headerBg: 'rgba(71,85,105,0.08)',    headerText: 'text-slate-400',   bodyBg: 'rgba(15,23,42,0.4)',    nameText: 'text-slate-300',   dot: 'bg-slate-500',   glow: 'none' },
}

export const AWSServiceNode = memo(({ data }: NodeProps<AWSData>) => {
  const { label, arn, service, maxAccessLevel, dimmed, hovered, blastHighlight, topActions } = data
  const cfg = accessConfig[maxAccessLevel ?? 'none']
  const serviceLabel = service ? service.toUpperCase() : 'AWS'

  const borderCls = blastHighlight
    ? maxAccessLevel === 'full'
      ? 'border-red-400 shadow-[0_0_20px_#ef444466]'
      : 'border-yellow-400 shadow-[0_0_16px_#f59e0b55]'
    : hovered
      ? `${cfg.border} shadow-[${cfg.glow}]`
      : cfg.border

  return (
    <div
      className={`
        group relative rounded-xl border transition-all duration-200 cursor-pointer select-none overflow-visible
        ${dimmed ? 'opacity-15 scale-95' : 'opacity-100'}
        ${borderCls}
        backdrop-blur-sm
      `}
      style={{ minWidth: 190, background: cfg.bodyBg }}
    >
      {/* type header strip */}
      <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 border-b rounded-t-xl"
        style={{ background: cfg.headerBg, borderColor: 'rgba(255,255,255,0.06)' }}>
        <span className={cfg.headerText}><ServiceIcon service={service} size={9} /></span>
        <span className={`text-[9px] font-mono font-bold tracking-widest uppercase ${cfg.headerText}`}>
          {serviceLabel}
        </span>
        {maxAccessLevel && (
          <div className={`ml-auto w-1.5 h-1.5 rounded-full ${cfg.dot} ${blastHighlight ? 'animate-pulse' : ''}`} />
        )}
      </div>

      {/* content */}
      <div className="px-2.5 py-1.5">
        <div className={`text-[12px] font-mono font-semibold leading-tight truncate ${cfg.nameText}`}>{label}</div>
        {arn && (
          <div className="text-[9px] font-mono text-slate-500 mt-0.5 truncate max-w-[160px]">{arn}</div>
        )}
      </div>

      {/* Tooltip */}
      {topActions.length > 0 && (
        <div className="
          absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2
          z-50 pointer-events-none
          opacity-0 group-hover:opacity-100 transition-opacity duration-150
          bg-slate-900/95 border border-slate-700 rounded-lg shadow-xl backdrop-blur-sm
          px-3 py-2.5 min-w-[160px]
        ">
          <div className={`text-[9px] font-mono uppercase tracking-wider mb-1.5 font-bold ${cfg.headerText}`}>
            {serviceLabel} Permissions
          </div>
          {topActions.map(a => (
            <div key={a} className="text-[10px] font-mono text-slate-300 truncate max-w-[180px] py-0.5">
              {a}
            </div>
          ))}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700" />
        </div>
      )}

      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-slate-500 !border-cyber-bg" />
    </div>
  )
})
