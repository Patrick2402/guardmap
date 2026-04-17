import { useMemo } from 'react'
import { GraphData, BlastRadiusResult, GraphNode, WORKLOAD_TYPES } from '../types'

export function useBlastRadius(data: GraphData | null, startId: string | null): BlastRadiusResult | null {
  return useMemo(() => {
    if (!data || !startId) return null

    const startNode = data.nodes.find(n => n.id === startId)
    if (!startNode) return null

    // For workloads: seed BFS from all pods the workload manages
    const seeds = new Set<string>([startId])
    if (WORKLOAD_TYPES.includes(startNode.type)) {
      data.edges.forEach(e => {
        if (e.source === startId && e.label === 'manages') seeds.add(e.target)
      })
    }

    const reachableNodeIds = new Set<string>(seeds)
    const reachableEdgeIds = new Set<string>()

    const queue = [...seeds]
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const edge of data.edges) {
        if (edge.source === current && !reachableNodeIds.has(edge.target)) {
          reachableNodeIds.add(edge.target)
          reachableEdgeIds.add(edge.id)
          queue.push(edge.target)
        }
      }
    }

    const nodeMap = new Map<string, GraphNode>(data.nodes.map(n => [n.id, n]))
    const writeTargets: GraphNode[] = []
    const fullTargets: GraphNode[] = []

    for (const edge of data.edges) {
      if (!reachableEdgeIds.has(edge.id)) continue
      const target = nodeMap.get(edge.target)
      if (!target || target.type !== 'aws_service') continue
      if (edge.accessLevel === 'full') fullTargets.push(target)
      else if (edge.accessLevel === 'write') writeTargets.push(target)
    }

    return { startId, reachableNodeIds, reachableEdgeIds, writeTargets, fullTargets }
  }, [data, startId])
}
