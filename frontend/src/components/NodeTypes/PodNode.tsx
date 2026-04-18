import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Container } from 'lucide-react'

interface PodData {
  label: string
  namespace: string
  selected: boolean
  dimmed: boolean
  blastActive: boolean
  phase?: string
  restartCount?: string
  ready?: string
}

const PHASE_STYLE: Record<string, string> = {
  Running:   'text-emerald-400 bg-emerald-900/40 border-emerald-600/30',
  Succeeded: 'text-slate-400   bg-slate-800/40   border-slate-600/30',
  Pending:   'text-yellow-400  bg-yellow-900/40  border-yellow-600/30',
  Failed:    'text-red-400     bg-red-900/40     border-red-600/30',
  Unknown:   'text-slate-500   bg-slate-800/30   border-slate-600/20',
}

export const PodNode = memo(({ data }: NodeProps<PodData>) => {
  const { label, namespace, selected, dimmed, phase, restartCount, ready } = data
  const restarts = parseInt(restartCount ?? '0', 10)
  const hasCrash = restarts > 0
  const isNotRunning = phase && phase !== 'Running' && phase !== ''

  const borderCls = selected
    ? 'border-cyan-400 shadow-[0_0_20px_#00d4ff55]'
    : hasCrash || isNotRunning
      ? 'border-red-500/50 hover:border-red-400/70'
      : 'border-cyan-500/30 hover:border-cyan-400/60 hover:shadow-[0_0_10px_#00d4ff22]'

  const phaseCls = phase ? (PHASE_STYLE[phase] ?? PHASE_STYLE.Unknown) : null

  return (
    <div
      className={`relative rounded-xl border transition-all duration-300 cursor-pointer select-none overflow-hidden
        ${dimmed ? 'opacity-20 scale-95' : 'opacity-100'} ${borderCls} backdrop-blur-sm`}
      style={{ minWidth: 190, background: selected ? 'rgba(8,47,73,0.7)' : 'rgba(8,47,73,0.4)' }}
    >
      <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 border-b border-cyan-500/15"
        style={{ background: 'rgba(6,182,212,0.08)' }}>
        <Container size={9} className="text-cyan-500" />
        <span className="text-[9px] font-mono font-bold text-cyan-500 tracking-widest uppercase">Pod</span>
        <div className="ml-auto flex items-center gap-1.5">
          {hasCrash && (
            <span className="text-[8px] font-mono text-red-400 bg-red-900/40 px-1 rounded border border-red-600/30">
              ↺{restarts}
            </span>
          )}
          {phaseCls && (
            <span className={`text-[8px] font-mono px-1 py-px rounded border ${phaseCls}`}>
              {phase}
            </span>
          )}
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
        </div>
      </div>

      <div className="px-2.5 py-1.5">
        <div className="text-[12px] font-mono font-semibold text-cyan-200 leading-tight truncate">{label}</div>
        <div className="text-[9px] font-mono text-slate-500 mt-0.5">{namespace}</div>
      </div>

      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-cyan-500 !border-cyber-bg" />
    </div>
  )
})
