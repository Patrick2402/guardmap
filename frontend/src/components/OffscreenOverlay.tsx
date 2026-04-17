import { useMemo } from 'react'
import { Node } from 'reactflow'
import { HardDrive, Database, MessageSquare, Lock, BarChart2, Box, ChevronRight } from 'lucide-react'

const NODE_W = 200
const NODE_H = 68
const PILL_W = 148
const MARGIN = 52

interface OverlayProps {
  nodes: Node[]
  viewport: { x: number; y: number; zoom: number }
  containerSize: { width: number; height: number }
  connectedNodeIds: Set<string>
  onFocusNode: (nodeId: string) => void
}

function ServiceIcon({ service }: { service: string }) {
  const s = service?.toLowerCase() ?? ''
  if (s === 's3')                             return <HardDrive size={10} />
  if (s === 'rds' || s === 'dynamodb')        return <Database size={10} />
  if (s === 'sqs' || s === 'sns')             return <MessageSquare size={10} />
  if (s === 'secretsmanager' || s === 'kms') return <Lock size={10} />
  if (s === 'cloudwatch')                     return <BarChart2 size={10} />
  return <Box size={10} />
}

const accessColors: Record<string, string> = {
  full:  'border-red-500/60 bg-red-950/90 text-red-300 hover:border-red-400',
  write: 'border-yellow-500/60 bg-yellow-950/90 text-yellow-300 hover:border-yellow-400',
  read:  'border-emerald-500/50 bg-emerald-950/90 text-emerald-300 hover:border-emerald-400',
  none:  'border-slate-600/50 bg-slate-900/90 text-slate-400 hover:border-slate-500',
}

function clampToEdge(sx: number, sy: number, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  const dx = sx - cx, dy = sy - cy
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null

  const sx2 = Math.abs(dx) > 0 ? (w / 2 - MARGIN) / Math.abs(dx) : Infinity
  const sy2 = Math.abs(dy) > 0 ? (h / 2 - MARGIN) / Math.abs(dy) : Infinity
  const scale = Math.min(sx2, sy2)

  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
    angle: Math.atan2(dy, dx) * (180 / Math.PI),
  }
}

export function OffscreenOverlay({ nodes, viewport, containerSize, connectedNodeIds, onFocusNode }: OverlayProps) {
  const { width, height } = containerSize

  const indicators = useMemo(() => {
    if (!connectedNodeIds.size || width === 0 || height === 0) return []

    return nodes
      .filter(n =>
        (n.type === 'aws_service' || n.type === 'iam_role') &&
        connectedNodeIds.has(n.id) &&
        !n.parentId
      )
      .flatMap(n => {
        const cx = n.position.x * viewport.zoom + viewport.x + (NODE_W / 2) * viewport.zoom
        const cy = n.position.y * viewport.zoom + viewport.y + (NODE_H / 2) * viewport.zoom

        const offScreen = cx < 0 || cx > width || cy < 0 || cy > height
        if (!offScreen) return []

        const pos = clampToEdge(cx, cy, width, height)
        if (!pos) return []

        return [{
          id:          n.id,
          label:       n.data?.label as string ?? '',
          service:     n.data?.service as string ?? '',
          accessLevel: (n.data?.maxAccessLevel as string) ?? 'none',
          nodeType:    n.type!,
          ...pos,
        }]
      })
  }, [nodes, viewport, connectedNodeIds, width, height])

  if (indicators.length === 0) return null

  return (
    <>
      {indicators.map(ind => {
        const colorCls = accessColors[ind.accessLevel] ?? accessColors.none
        // Clamp pill position so it stays within container
        const left = Math.max(MARGIN / 2, Math.min(width - PILL_W - MARGIN / 2, ind.x - PILL_W / 2))
        const top  = Math.max(MARGIN / 2, Math.min(height - 36 - MARGIN / 2, ind.y - 18))

        return (
          <button
            key={ind.id}
            title={`Jump to ${ind.label}`}
            onClick={() => onFocusNode(ind.id)}
            className={`
              absolute z-50 flex items-center gap-1.5
              px-2.5 py-1.5 rounded-lg border backdrop-blur-sm shadow-lg
              text-[10px] font-mono font-semibold
              transition-all duration-150 hover:scale-105 active:scale-95
              ${colorCls}
            `}
            style={{ left, top, width: PILL_W }}
          >
            <ServiceIcon service={ind.service} />
            <span className="truncate flex-1 text-left">{ind.label}</span>
            <ChevronRight
              size={10}
              className="shrink-0 opacity-70"
              style={{ transform: `rotate(${ind.angle}deg)` }}
            />
          </button>
        )
      })}
    </>
  )
}
