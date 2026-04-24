import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import ReactFlow, {
  Background, BackgroundVariant, Controls, MiniMap,
  Node, Edge, NodeMouseHandler, ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { GraphData, GraphNode } from '../../types'
import { ServiceAccountNode } from '../NodeTypes/ServiceAccountNode'
import { RBACRoleNode }       from '../NodeTypes/RBACRoleNode'
import { RBACBindingNode }    from '../NodeTypes/RBACBindingNode'
import { PermissionEdge }     from '../EdgeTypes/PermissionEdge'
import { RBACDetails }        from './RBACDetails'
import { applyRBACLayout }    from '../../utils/rbacLayout'

const ColumnHeader = ({ data }: { data: { label: string } }) => (
  <div className="text-xs font-mono font-bold text-slate-400 uppercase tracking-[0.2em] pointer-events-none select-none whitespace-nowrap">
    {data.label}
  </div>
)

const nodeTypes = {
  serviceaccount:         ServiceAccountNode,
  k8s_role:               RBACRoleNode,
  k8s_clusterrole:        RBACRoleNode,
  k8s_rolebinding:        RBACBindingNode,
  k8s_clusterrolebinding: RBACBindingNode,
  columnHeader:           ColumnHeader,
}

const edgeTypes = { rbac: PermissionEdge }

const RBAC_NODE_TYPES = new Set([
  'serviceaccount',
  'k8s_role', 'k8s_clusterrole', 'k8s_rolebinding', 'k8s_clusterrolebinding',
])
const RBAC_EDGE_LABELS = new Set(['bound →', 'grants →'])
const SYSTEM_NS = new Set(['kube-system', 'kube-public', 'kube-node-lease', 'ingress-nginx', 'cert-manager'])

function bfsConnected(startId: string, edges: GraphData['edges']): Set<string> {
  const visited = new Set<string>([startId])
  const queue = [startId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const e of edges) {
      if (e.source === cur && !visited.has(e.target)) {
        visited.add(e.target); queue.push(e.target)
      }
      if (e.target === cur && !visited.has(e.source)) {
        visited.add(e.source); queue.push(e.source)
      }
    }
  }
  return visited
}

const DANGER_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#64748b',
}

interface RBACViewProps { data: GraphData; focusNodeId?: string | null }

export function RBACView({ data, focusNodeId }: RBACViewProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredId, setHoveredId]       = useState<string | null>(null)
  const [rfReady,   setRfReady]         = useState(false)
  const rfRef = useRef<ReactFlowInstance | null>(null)

  // Select node when navigating from Findings
  useEffect(() => {
    if (!focusNodeId) return
    const node = data.nodes.find(n => n.id === focusNodeId) ?? null
    if (node) setSelectedNode(node)
  }, [focusNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus + zoom to node after ReactFlow is ready
  useEffect(() => {
    if (!focusNodeId || !rfReady) return
    let cancelled = false
    const inst = rfRef.current!
    const tryFocus = (attempt = 0) => {
      if (cancelled) return
      const node = inst.getNodes().find(n => n.id === focusNodeId)
      if (node) {
        inst.fitView({ nodes: [{ id: focusNodeId }], duration: 600, padding: 0.4, maxZoom: 1.8 })
      } else if (attempt < 20) {
        setTimeout(() => tryFocus(attempt + 1), 100)
      }
    }
    const t = setTimeout(() => tryFocus(0), 150)
    return () => { cancelled = true; clearTimeout(t) }
  }, [focusNodeId, rfReady])

  const rbacNodes = useMemo(() =>
    data.nodes.filter(n =>
      RBAC_NODE_TYPES.has(n.type) &&
      !SYSTEM_NS.has(n.namespace ?? '')
    ),
    [data.nodes])

  const rbacIds = useMemo(() => new Set(rbacNodes.map(n => n.id)), [rbacNodes])

  const rbacEdges = useMemo(() =>
    data.edges.filter(e =>
      RBAC_EDGE_LABELS.has(e.label ?? '') &&
      rbacIds.has(e.source) &&
      rbacIds.has(e.target)
    ), [data.edges, rbacIds])

  const connectedIds = useMemo(() =>
    hoveredId ? bfsConnected(hoveredId, rbacEdges) : null,
    [hoveredId, rbacEdges])

  const rfNodesBase: Node[] = useMemo(() =>
    rbacNodes.map(n => ({
      id:   n.id,
      type: n.type,
      position: { x: 0, y: 0 },
      data: {
        label:     n.label,
        namespace: n.namespace ?? '',
        nodeType:  n.type,
        replicas:  n.metadata?.replicas,
        danger:    n.metadata?.danger,
        rules:     n.metadata?.rules,
        roleRef:   n.metadata?.roleRef,
        roleKind:  n.metadata?.roleKind,
        dimmed:    false,
      },
    })), [rbacNodes])

  const { positionedNodes } = useMemo(
    () => applyRBACLayout(rfNodesBase, rbacEdges),
    [rfNodesBase, rbacEdges])

  // Column header nodes (non-interactive labels)
  const headerNodes: Node[] = useMemo(() => [
    { id: '__hdr_sa',   type: 'columnHeader', position: { x: 0,   y: -36 }, data: { label: 'SERVICE ACCOUNTS' }, selectable: false, focusable: false, draggable: false },
    { id: '__hdr_bind', type: 'columnHeader', position: { x: 330, y: -36 }, data: { label: 'BINDINGS'         }, selectable: false, focusable: false, draggable: false },
    { id: '__hdr_role', type: 'columnHeader', position: { x: 660, y: -36 }, data: { label: 'ROLES'            }, selectable: false, focusable: false, draggable: false },
  ], [])

  const allNodes = useMemo(() => {
    const active = connectedIds
    return [
      ...headerNodes,
      ...positionedNodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          dimmed:   active ? !active.has(n.id) : false,
          selected: n.id === selectedNode?.id,
        },
      })),
    ]
  }, [headerNodes, positionedNodes, connectedIds, selectedNode])

  const rfEdges: Edge[] = useMemo(() =>
    rbacEdges.map(e => {
      const isGrants  = e.label === 'grants →'
      const isBound   = e.label === 'bound →'
      const isActive  = connectedIds
        ? connectedIds.has(e.source) && connectedIds.has(e.target)
        : true

      // Determine danger level from target role node
      const targetNode = rbacNodes.find(n => n.id === e.target)
      const danger = targetNode?.metadata?.danger ?? 'low'
      const color  = isGrants ? (DANGER_COLOR[danger] ?? '#64748b') : '#8b5cf6'

      return {
        id:     e.id,
        source: e.source,
        target: e.target,
        type:   'rbac',
        zIndex: isActive ? 10 : 1,
        data: {
          label:       e.label,
          accessLevel: isGrants ? (danger === 'critical' || danger === 'high' ? 'full' : danger === 'medium' ? 'write' : 'read') : 'uses',
          dimmed:      !isActive,
          highlighted: isActive && !!connectedIds,
          mergedCount: 1,
          mergedActions: [],
        },
      }
    }), [rbacEdges, connectedIds, rbacNodes])

  const handleNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    if (node.id.startsWith('ns-group:')) return
    const graphNode = data.nodes.find(n => n.id === node.id) ?? null
    setSelectedNode(prev => prev?.id === graphNode?.id ? null : graphNode)
  }, [data.nodes])

  const handleMouseEnter: NodeMouseHandler = useCallback((_evt, node) => {
    if (!node.id.startsWith('ns-group:')) setHoveredId(node.id)
  }, [])

  const handleMouseLeave: NodeMouseHandler = useCallback(() => setHoveredId(null), [])

  // Stats
  const stats = useMemo(() => {
    const roles = rbacNodes.filter(n => n.type === 'k8s_role' || n.type === 'k8s_clusterrole')
    return {
      bindings:  rbacNodes.filter(n => n.type === 'k8s_rolebinding' || n.type === 'k8s_clusterrolebinding').length,
      roles:     roles.length,
      critical:  roles.filter(n => n.metadata?.danger === 'critical').length,
      high:      roles.filter(n => n.metadata?.danger === 'high').length,
    }
  }, [rbacNodes])

  return (
    <div className="absolute inset-0">
      {/* Stat bar */}
      <div className="absolute top-0 left-0 right-0 z-10 px-5 py-1.5 border-b border-cyber-border/30 bg-cyber-panel/30 backdrop-blur-sm flex items-center gap-5">
        {[
          { label: 'bindings',  value: stats.bindings, color: 'text-violet-400' },
          { label: 'roles',     value: stats.roles,    color: 'text-slate-300'  },
          { label: 'critical',  value: stats.critical, color: 'text-red-400'    },
          { label: 'high risk', value: stats.high,     color: 'text-orange-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`text-sm font-mono font-bold ${color}`}>{value}</span>
            <span className="text-xs font-mono text-slate-400">{label}</span>
          </div>
        ))}
        <span className="ml-auto text-xs font-mono text-slate-400 hidden md:block">
          hover to trace · click for details
        </span>
      </div>

      <div className="absolute inset-0 pt-8">
        <ReactFlow
          nodes={allNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          onNodeMouseEnter={handleMouseEnter}
          onNodeMouseLeave={handleMouseLeave}
          onPaneClick={() => { setSelectedNode(null); setHoveredId(null) }}
          onInit={(instance) => { rfRef.current = instance; setRfReady(true) }}
          fitView
          fitViewOptions={{ padding: 0.08 }}
          minZoom={0.03}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          elevateEdgesOnSelect
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1a2840" />
          <Controls className="!border-cyber-border !bg-cyber-panel/80 !rounded-xl overflow-hidden" showInteractive={false} />
          <MiniMap
            nodeColor={n => {
              if (n.type === 'k8s_role')              return '#ef4444'
              if (n.type === 'k8s_clusterrole')       return '#f97316'
              if (n.type === 'k8s_rolebinding')       return '#8b5cf6'
              if (n.type === 'k8s_clusterrolebinding') return '#a78bfa'
              if (n.type === 'serviceaccount')        return '#6366f1'
              return '#1e293b'
            }}
            className="!border-cyber-border !bg-cyber-panel/90 !rounded-xl"
            maskColor="rgba(8,12,20,0.7)"
          />
        </ReactFlow>
      </div>

      <RBACDetails node={selectedNode} data={data} onClose={() => setSelectedNode(null)} />
    </div>
  )
}
