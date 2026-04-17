import { memo } from 'react'
import { EdgeProps, getBezierPath, EdgeLabelRenderer } from 'reactflow'

interface TopologyEdgeData {
  color: string
  strokeWidth: number
  opacity: number
  animated: boolean
  dashed: boolean
  label?: string
}

export const TopologyEdge = memo(({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data,
}: EdgeProps<TopologyEdgeData>) => {
  const { color = '#475569', strokeWidth = 1.5, opacity = 0.85, dashed, label } = data ?? {}
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  return (
    <>
      <defs>
        <marker id={`arrow-${id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L0,6 L8,3 z" fill={color} opacity={opacity} />
        </marker>
      </defs>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={opacity}
        strokeDasharray={dashed ? '8 4' : undefined}
        markerEnd={`url(#arrow-${id})`}
        className="transition-all duration-150"
      />
      {/* wider transparent hit area */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={10} />
      {label && opacity > 0.3 && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'none' }}
            className="absolute nodrag nopan"
          >
            <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-slate-900/80 border border-slate-700/40 text-slate-400">
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
