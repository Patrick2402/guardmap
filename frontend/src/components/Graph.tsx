import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap, BackgroundVariant,
  Node, Edge, NodeMouseHandler, ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { GraphData, GraphNode, GraphEdge, AccessLevel, WORKLOAD_TYPES } from '../types'
import { BlastRadiusResult } from '../types'
import { applyNamespacedLayout } from '../utils/layout'
import { useFocusNode } from '../hooks/useFocusNode'
import { PodNode }              from './NodeTypes/PodNode'
import { ServiceAccountNode }   from './NodeTypes/ServiceAccountNode'
import { IAMRoleNode }          from './NodeTypes/IAMRoleNode'
import { AWSServiceNode }       from './NodeTypes/AWSServiceNode'
import { WorkloadNode }         from './NodeTypes/WorkloadNode'
import { NamespaceGroupNode }   from './NodeTypes/NamespaceGroupNode'
import { PermissionEdge }       from './EdgeTypes/PermissionEdge'
import { OffscreenOverlay }     from './OffscreenOverlay'

const nodeTypes = {
  pod:             PodNode,
  serviceaccount:  ServiceAccountNode,
  iam_role:        IAMRoleNode,
  aws_service:     AWSServiceNode,
  deployment:      WorkloadNode,
  statefulset:     WorkloadNode,
  daemonset:       WorkloadNode,
  job:             WorkloadNode,
  cronjob:         WorkloadNode,
  namespaceGroup:  NamespaceGroupNode,
}

const edgeTypes = { permission: PermissionEdge }

const ACCESS_PRIORITY: Record<string, number> = { full: 3, write: 2, read: 1 }

export interface GraphHandle {
  focusNodes: (nodeIds: string[]) => void
}

interface GraphProps {
  data: GraphData
  blastRadius: BlastRadiusResult | null
  onNodeClick: (node: GraphNode | null) => void
  onFocusReady?: (fn: (nodeIds: string[]) => void) => void
  search?: string
  activeNs?: string | null
  focusNodeId?: string | null
}

function FocusController({ nodeId }: { nodeId?: string | null }) {
  useFocusNode(nodeId)
  return null
}

function maxAccessForNode(nodeId: string, edges: GraphEdge[]): AccessLevel | null {
  const inc = edges.filter(e => e.target === nodeId && e.accessLevel)
  if (inc.some(e => e.accessLevel === 'full'))  return 'full'
  if (inc.some(e => e.accessLevel === 'write')) return 'write'
  if (inc.some(e => e.accessLevel === 'read'))  return 'read'
  return null
}

// BFS both directions from a starting node ID over given edges
function buildConnectedSet(startId: string, edges: GraphEdge[]): Set<string> {
  const nodeIds = new Set<string>([startId])

  const fwd = [startId]
  while (fwd.length) {
    const cur = fwd.shift()!
    edges.forEach(e => {
      if (e.source === cur && !nodeIds.has(e.target)) { nodeIds.add(e.target); fwd.push(e.target) }
    })
  }

  const bwd = [startId]
  const bwdSeen = new Set([startId])
  while (bwd.length) {
    const cur = bwd.shift()!
    edges.forEach(e => {
      if (e.target === cur && !bwdSeen.has(e.source)) {
        bwdSeen.add(e.source); nodeIds.add(e.source); bwd.push(e.source)
      }
    })
  }

  return nodeIds
}

const ALWAYS_HIDDEN = new Set(['pod', 'k8s_service', 'ingress', 'networkpolicy'])

export function Graph({ data, blastRadius, onNodeClick, onFocusReady, search = '', activeNs = null, focusNodeId }: GraphProps) {
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [hoveredId, setHoveredId]     = useState<string | null>(null)
  const [rfInstance, setRfInstance]   = useState<ReactFlowInstance | null>(null)
  const [viewport, setViewport]       = useState({ x: 0, y: 0, zoom: 1 })
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const blastActive  = blastRadius !== null

  // Measure container for OffscreenOverlay
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Register external focus callback
  useEffect(() => {
    if (!rfInstance || !onFocusReady) return
    onFocusReady((nodeIds: string[]) => {
      rfInstance.fitView({ nodes: nodeIds.map(id => ({ id })), duration: 600, padding: 0.25 })
    })
  }, [rfInstance, onFocusReady])

  // Re-fit view when namespace filter changes
  useEffect(() => {
    if (!rfInstance) return
    const t = setTimeout(() => rfInstance.fitView({ padding: 0.15, duration: 600 }), 100)
    return () => clearTimeout(t)
  }, [activeNs, rfInstance])

  // Select + highlight node when navigating from Findings
  useEffect(() => {
    if (!focusNodeId) return
    setSelectedId(focusNodeId)
    const graphNode = data.nodes.find(n => n.id === focusNodeId) ?? null
    onNodeClick(graphNode)
  }, [focusNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 1. Filter nodes ───────────────────────────────────────────────────────
  const filteredNodes = useMemo(() => data.nodes.filter(n => {
    if (ALWAYS_HIDDEN.has(n.type)) return false
    if (activeNs && n.namespace && n.namespace !== activeNs && n.type !== 'iam_role' && n.type !== 'aws_service') return false
    return true
  }), [data.nodes, activeNs])

  const filteredIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes])

  // ── 2. Build visible edges (transitive workload→SA) ───────────────────────
  const visibleEdges = useMemo(() => {
    const podToSa = new Map<string, string>()
    data.edges.forEach(e => {
      if (e.source.startsWith('pod:') && e.target.startsWith('sa:')) podToSa.set(e.source, e.target)
    })

    const seen = new Set<string>()
    const result: GraphEdge[] = []

    data.edges.forEach(e => {
      if (e.source.startsWith('pod:') || e.target.startsWith('pod:')) return
      if (e.label === 'manages' || e.label === 'selects' || e.label === 'routes →') return
      if (!filteredIds.has(e.source) || !filteredIds.has(e.target)) return
      result.push(e)
      seen.add(e.id)
    })

    filteredNodes.forEach(w => {
      if (!WORKLOAD_TYPES.includes(w.type)) return
      const saIds = new Set<string>()
      data.edges
        .filter(e => e.source === w.id && e.label === 'manages')
        .forEach(e => { const sa = podToSa.get(e.target); if (sa) saIds.add(sa) })
      saIds.forEach(saId => {
        if (!filteredIds.has(saId)) return
        const tid = `workload-sa:${w.id}→${saId}`
        if (seen.has(tid)) return
        seen.add(tid)
        result.push({ id: tid, source: w.id, target: saId, label: 'uses SA' })
      })
    })

    return result
  }, [data.edges, filteredNodes, filteredIds])

  // ── 3. Deduplicate edges: one per (source, target) ────────────────────────
  const dedupedEdges = useMemo(() => {
    type Entry = { primaryEdge: GraphEdge; count: number; allActions: string[]; allIds: string[] }
    const map = new Map<string, Entry>()

    visibleEdges.forEach(e => {
      const key = `${e.source}__${e.target}`
      const actions = e.actions ?? []
      const ex = map.get(key)
      if (!ex) {
        map.set(key, { primaryEdge: e, count: 1, allActions: [...actions], allIds: [e.id] })
      } else {
        const ep = ACCESS_PRIORITY[e.accessLevel ?? ''] ?? 0
        const xp = ACCESS_PRIORITY[ex.primaryEdge.accessLevel ?? ''] ?? 0
        map.set(key, {
          primaryEdge: ep > xp ? e : ex.primaryEdge,
          count: ex.count + 1,
          allActions: [...new Set([...ex.allActions, ...actions])],
          allIds: [...ex.allIds, e.id],
        })
      }
    })

    return [...map.values()]
  }, [visibleEdges])

  // ── 4. Hover & selection path BFS ─────────────────────────────────────────
  const hoveredConnected = useMemo<Set<string> | null>(() =>
    hoveredId ? buildConnectedSet(hoveredId, visibleEdges) : null,
    [hoveredId, visibleEdges])

  const selectedConnected = useMemo<Set<string> | null>(() =>
    selectedId ? buildConnectedSet(selectedId, visibleEdges) : null,
    [selectedId, visibleEdges])

  // Active focus set: selection takes priority over hover
  const activeFocusSet = selectedConnected ?? hoveredConnected

  // ── 5. Top 3 actions per node for tooltips ────────────────────────────────
  const topActionsMap = useMemo(() => {
    const map = new Map<string, string[]>()
    visibleEdges.forEach(e => {
      if (!e.accessLevel) return
      const actions = e.actions ?? (e.label ? [e.label] : [])
      ;[e.source, e.target].forEach(nid => {
        if (!map.has(nid)) map.set(nid, [])
        map.get(nid)!.push(...actions)
      })
    })
    return new Map([...map.entries()].map(([k, v]) => [k, [...new Set(v)].slice(0, 3)]))
  }, [visibleEdges])

  // ── 6. Build RF nodes ─────────────────────────────────────────────────────
  const rfNodes: Node[] = useMemo(() => filteredNodes.map(n => {
    const searchMatch = !search || n.label.toLowerCase().includes(search.toLowerCase()) || n.namespace?.toLowerCase().includes(search.toLowerCase())
    const blastDimmed  = blastActive && !blastRadius!.reachableNodeIds.has(n.id)
    const focusDimmed  = activeFocusSet !== null && !activeFocusSet.has(n.id)
    const dimmed       = (!!search && !searchMatch) || blastDimmed || focusDimmed

    const blastHighlight = blastActive && blastRadius!.reachableNodeIds.has(n.id) &&
      n.type === 'aws_service' &&
      (blastRadius!.writeTargets.some(t => t.id === n.id) || blastRadius!.fullTargets.some(t => t.id === n.id))

    return {
      id:      n.id,
      type:    n.type,
      zIndex:  activeFocusSet?.has(n.id) ? 10 : 1,
      position: { x: 0, y: 0 },
      data: {
        label:          n.label,
        namespace:      n.namespace ?? '',
        arn:            n.metadata?.arn ?? '',
        service:        n.metadata?.service ?? '',
        nodeType:       n.type,
        replicas:       n.metadata?.replicas,
        schedule:       n.metadata?.schedule,
        succeeded:      n.metadata?.succeeded,
        completions:    n.metadata?.completions,
        activeJobs:     n.metadata?.activeJobs,
        maxAccessLevel: maxAccessForNode(n.id, visibleEdges),
        topActions:     topActionsMap.get(n.id) ?? [],
        selected:       n.id === selectedId,
        hovered:        hoveredId === n.id,
        dimmed,
        blastActive,
        blastHighlight,
      },
    }
  }), [filteredNodes, blastRadius, blastActive, selectedId, hoveredId, activeFocusSet, search, visibleEdges, topActionsMap])

  // ── 7. Build RF edges ─────────────────────────────────────────────────────
  const rfEdges: Edge[] = useMemo(() =>
    dedupedEdges.map(({ primaryEdge: e, count, allActions, allIds }) => {
      const isReachable    = blastActive && allIds.some(id => blastRadius!.reachableEdgeIds.has(id))
      const hoverConnected = activeFocusSet !== null &&
        !!activeFocusSet.has(e.source) && !!activeFocusSet.has(e.target)
      return {
        id:     e.id,
        source: e.source,
        target: e.target,
        type:   'permission',
        zIndex: hoverConnected ? 10 : 1,
        data: {
          label:         count > 1 ? `${count} actions` : e.label,
          accessLevel:   e.accessLevel,
          mergedCount:   count,
          mergedActions: allActions,
          dimmed:        (blastActive && !isReachable) || (activeFocusSet !== null && !hoverConnected),
          highlighted:   isReachable || hoverConnected,
        },
      }
    }),
    [dedupedEdges, blastRadius, blastActive, activeFocusSet])

  // ── 8. Layout ─────────────────────────────────────────────────────────────
  const { groupNodes, positionedNodes } = useMemo(
    () => applyNamespacedLayout(rfNodes, rfEdges),
    [rfNodes, rfEdges])

  // Apply group dimming: groups with no connected child get dimmed
  const allNodes = useMemo(() => {
    if (!activeFocusSet) return [...groupNodes, ...positionedNodes]

    const connectedGroups = new Set<string>()
    positionedNodes.forEach(n => {
      if (activeFocusSet.has(n.id) && n.parentId) connectedGroups.add(n.parentId)
    })

    return [
      ...groupNodes.map(g => ({
        ...g,
        data: { ...g.data, dimmed: !connectedGroups.has(g.id) },
      })),
      ...positionedNodes,
    ]
  }, [groupNodes, positionedNodes, activeFocusSet])

  // Absolute-positioned nodes for OffscreenOverlay (no parentId)
  const absoluteNodes = useMemo(
    () => positionedNodes.filter(n => !n.parentId),
    [positionedNodes])

  // ── 9. Interaction ────────────────────────────────────────────────────────
  const handleNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    const graphNode = data.nodes.find(n => n.id === node.id) ?? null
    setSelectedId(node.id)
    onNodeClick(graphNode)

    // Auto-zoom: fitView on clicked node + its full connected path
    if (rfInstance) {
      const connected = buildConnectedSet(node.id, visibleEdges)
      rfInstance.fitView({
        nodes: [...connected].map(id => ({ id })),
        duration: 800,
        padding: 0.15,
      })
    }
  }, [data.nodes, onNodeClick, visibleEdges, rfInstance])

  const handlePaneClick = useCallback(() => {
    setSelectedId(null)
    onNodeClick(null)
  }, [onNodeClick])

  const handleNodeMouseEnter: NodeMouseHandler = useCallback((_evt, node) => {
    setHoveredId(node.id)
  }, [])

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredId(null)
  }, [])

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    setRfInstance(instance)
    setViewport(instance.getViewport())
  }, [])

  const handleMove = useCallback((_evt: unknown, vp: { x: number; y: number; zoom: number }) => {
    setViewport(vp)
  }, [])

  const focusNode = useCallback((nodeId: string) => {
    rfInstance?.fitView({ nodes: [{ id: nodeId }], duration: 600, padding: 0.3 })
  }, [rfInstance])

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <ReactFlow
        nodes={allNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onInit={handleInit}
        onMove={handleMove}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <FocusController nodeId={focusNodeId} />
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1a2840" />
        <Controls className="!border-cyber-border !bg-cyber-panel/80 !rounded-xl overflow-hidden" showInteractive={false} />
        <MiniMap
          nodeColor={n => {
            if (n.type === 'serviceaccount') return '#7c3aed'
            if (n.type === 'iam_role')       return '#b45309'
            if (n.type === 'deployment')     return '#1d4ed8'
            if (n.type === 'statefulset')    return '#7e22ce'
            if (n.type === 'daemonset')      return '#c2410c'
            if (n.type === 'namespaceGroup') return '#0f172a'
            return '#374151'
          }}
          className="!border-cyber-border !bg-cyber-panel/90 !rounded-xl"
          maskColor="rgba(8,12,20,0.7)"
        />
      </ReactFlow>

      {/* Ghost connection indicators for off-screen connected nodes */}
      {activeFocusSet && (
        <OffscreenOverlay
          nodes={absoluteNodes}
          viewport={viewport}
          containerSize={containerSize}
          connectedNodeIds={activeFocusSet}
          onFocusNode={focusNode}
        />
      )}
    </div>
  )
}
