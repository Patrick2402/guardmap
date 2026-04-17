import { memo } from 'react'
import { NodeProps } from 'reactflow'

interface GroupData { label: string; podCount: number; color: string; dimmed?: boolean }

const NS_COLORS: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  production:     { border: '#06b6d4', bg: 'rgba(8,47,73,0.35)',   text: '#22d3ee', dot: '#06b6d4' },
  staging:        { border: '#a78bfa', bg: 'rgba(46,16,101,0.25)', text: '#c4b5fd', dot: '#a78bfa' },
  'data-platform':{ border: '#f59e0b', bg: 'rgba(69,26,3,0.25)',   text: '#fcd34d', dot: '#f59e0b' },
  monitoring:     { border: '#10b981', bg: 'rgba(6,40,30,0.28)',   text: '#34d399', dot: '#10b981' },
  security:       { border: '#ef4444', bg: 'rgba(69,10,10,0.28)',  text: '#f87171', dot: '#ef4444' },
  ingress:        { border: '#6366f1', bg: 'rgba(30,27,75,0.28)',  text: '#a5b4fc', dot: '#6366f1' },
  'ml-platform':  { border: '#ec4899', bg: 'rgba(74,4,78,0.22)',   text: '#f9a8d4', dot: '#ec4899' },
}

export const NamespaceGroupNode = memo(({ data }: NodeProps<GroupData>) => {
  const c = NS_COLORS[data.label] ?? { border: '#334155', bg: 'rgba(30,41,59,0.3)', text: '#94a3b8', dot: '#64748b' }
  const dimmed = data.dimmed ?? false

  return (
    <div
      className="h-full w-full rounded-2xl pointer-events-none transition-all duration-300 flex flex-col"
      style={{
        border: `1.5px solid ${c.border}${dimmed ? '0d' : '28'}`,
        background: 'transparent',  // transparent so SVG edges show through
        boxShadow: dimmed ? 'none' : `inset 0 0 60px 0 ${c.border}06`,
        opacity: dimmed ? 0.4 : 1,
      }}
    >
      {/* Header strip only — body stays transparent */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-t-2xl shrink-0"
        style={{ background: `${c.border}${dimmed ? '06' : '14'}` }}
      >
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: dimmed ? '#1e293b' : c.dot }} />
        <span className="text-[10px] font-mono font-semibold"
          style={{ color: dimmed ? '#334155' : c.text }}>
          {data.label}
        </span>
        <span className="text-[9px] font-mono ml-auto" style={{ color: dimmed ? '#1e293b' : `${c.text}55` }}>
          {data.podCount} workloads
        </span>
      </div>
    </div>
  )
})
