import { memo } from 'react'
import { EdgeProps, getBezierPath, EdgeLabelRenderer } from 'reactflow'
import { AccessLevel } from '../../types'

interface PermissionEdgeData {
  label?: string
  accessLevel?: AccessLevel
  dimmed: boolean
  highlighted: boolean
  mergedCount: number
  mergedActions: string[]
}

const edgeStyles: Record<string, { stroke: string; glow: string; labelBg: string; labelText: string }> = {
  full:  { stroke: '#ef4444', glow: '0 0 10px #ef444499', labelBg: '#450a0a', labelText: '#fca5a5' },
  write: { stroke: '#f59e0b', glow: '0 0 8px #f59e0b88',  labelBg: '#451a03', labelText: '#fde68a' },
  read:  { stroke: '#10b981', glow: '0 0 6px #10b98166',  labelBg: '#022c22', labelText: '#6ee7b7' },
  uses:  { stroke: '#6366f1', glow: '0 0 4px #6366f144',  labelBg: '#1e1b4b', labelText: '#a5b4fc' },
}

export const PermissionEdge = memo(({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data,
}: EdgeProps<PermissionEdgeData>) => {
  const { label, accessLevel, dimmed, highlighted, mergedCount = 1 } = data ?? {}

  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const styleKey = accessLevel ?? 'uses'
  const style    = edgeStyles[styleKey] ?? edgeStyles.uses

  const opacity     = dimmed ? 0.06 : highlighted ? 1 : 0.4
  // Thicker stroke when multiple edges are merged; extra glow when highlighted
  const strokeWidth = highlighted
    ? (mergedCount > 1 ? 3.5 : 2.5)
    : (mergedCount > 1 ? 2.5 : 1.5)

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={style.stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        style={highlighted ? { filter: `drop-shadow(${style.glow})` } : undefined}
        strokeDasharray={accessLevel ? undefined : '5 4'}
        className="transition-all duration-200"
      />
      {label && !dimmed && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'none' }}
            className="absolute nodrag nopan"
          >
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-current/20 backdrop-blur-sm max-w-[130px] block truncate"
              style={{ background: style.labelBg, color: style.labelText, opacity }}
            >
              {mergedCount > 1 ? `${mergedCount} actions` : label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
