import { useEffect, useRef } from 'react'
import { useReactFlow } from 'reactflow'

/**
 * Reliably focuses a node in React Flow by retrying until the node is
 * actually rendered (handles fresh mounts where layout hasn't settled yet).
 */
export function useFocusNode(nodeId?: string | null) {
  const { fitView, getNodes } = useReactFlow()
  const firedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!nodeId || nodeId === firedFor.current) return

    let attempts = 0
    const MAX = 15
    const INTERVAL = 80 // ms between retries → max wait ~1.2s

    const tryFocus = () => {
      attempts++
      const node = getNodes().find(n => n.id === nodeId)
      if (node) {
        firedFor.current = nodeId
        fitView({ nodes: [{ id: nodeId }], duration: 600, padding: 1.4, maxZoom: 1.6 })
        return
      }
      if (attempts < MAX) setTimeout(tryFocus, INTERVAL)
    }

    // Small initial delay to let React Flow start rendering
    const t = setTimeout(tryFocus, 60)
    return () => clearTimeout(t)
  }, [nodeId, fitView, getNodes])
}
