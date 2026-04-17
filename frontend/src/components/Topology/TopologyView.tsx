import { useMemo, useCallback, useState } from 'react'
import ReactFlow, {
  Background, BackgroundVariant, Controls, MiniMap,
  Node, Edge, NodeMouseHandler,
} from 'reactflow'
import { useFocusNode } from '../../hooks/useFocusNode'
import 'reactflow/dist/style.css'
import { Layers } from 'lucide-react'

import { GraphData, GraphNode } from '../../types'
import { applyTopologyLayout } from '../../utils/layout'
import { PodNode }            from '../NodeTypes/PodNode'
import { WorkloadNode }       from '../NodeTypes/WorkloadNode'
import { K8sNetworkNode }     from '../NodeTypes/K8sNetworkNode'
import { NamespaceGroupNode } from '../NodeTypes/NamespaceGroupNode'
import { RBACRoleNode }       from '../NodeTypes/RBACRoleNode'
import { RBACBindingNode }    from '../NodeTypes/RBACBindingNode'
import { RBACGroupNode }      from '../NodeTypes/RBACGroupNode'
import { TopologyEdge }       from '../EdgeTypes/TopologyEdge'
import { TopologyDetails }    from './TopologyDetails'

const nodeTypes = {
  pod:                    PodNode,
  deployment:             WorkloadNode,
  statefulset:            WorkloadNode,
  daemonset:              WorkloadNode,
  k8s_service:            K8sNetworkNode,
  ingress:                K8sNetworkNode,
  networkpolicy:          K8sNetworkNode,
  namespaceGroup:         NamespaceGroupNode,
  k8s_role:               RBACRoleNode,
  k8s_clusterrole:        RBACRoleNode,
  k8s_rolebinding:        RBACBindingNode,
  k8s_clusterrolebinding: RBACBindingNode,
  rbacGroup:              RBACGroupNode,
}

const edgeTypes = { topology: TopologyEdge }

const TOPO_TYPES      = new Set([
  'pod', 'deployment', 'statefulset', 'daemonset',
  'k8s_service', 'ingress', 'networkpolicy',
  'k8s_role', 'k8s_clusterrole', 'k8s_rolebinding', 'k8s_clusterrolebinding',
])
const TOPO_EDGE_LABELS = new Set(['manages', 'selects', 'routes →', 'grants →'])

const EDGE_COLOR: Record<string, string> = {
  'manages':  '#3b82f6',
  'selects':  '#14b8a6',
  'routes →': '#22c55e',
  'grants →': '#8b5cf6',
}

function FocusController({ nodeId }: { nodeId?: string | null }) {
  useFocusNode(nodeId)
  return null
}

interface TopologyViewProps { data: GraphData; focusNodeId?: string | null }

function directNeighbors(startId: string, edges: GraphData['edges']): Set<string> {
  const result = new Set<string>([startId])
  for (const e of edges) {
    if (e.source === startId) result.add(e.target)
    if (e.target === startId) result.add(e.source)
  }
  return result
}

export function TopologyView({ data, focusNodeId }: TopologyViewProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [showPods, setShowPods]         = useState(true)
  const [hoveredId, setHoveredId]       = useState<string | null>(null)

  const filteredNodes = useMemo(() => {
    const base = data.nodes.filter(n => TOPO_TYPES.has(n.type))
    return showPods ? base : base.filter(n => n.type !== 'pod')
  }, [data, showPods])

  const filteredIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes])

  const filteredEdges = useMemo(() =>
    data.edges.filter(e =>
      TOPO_EDGE_LABELS.has(e.label ?? '') &&
      filteredIds.has(e.source) &&
      filteredIds.has(e.target)
    ), [data.edges, filteredIds])

  // BFS from hovered node (both directions)
  const connectedIds = useMemo(() =>
    hoveredId ? directNeighbors(hoveredId, filteredEdges) : null,
    [hoveredId, filteredEdges])

  // Base RF nodes — layout only recomputes when data/showPods changes
  const rfNodesBase: Node[] = useMemo(() =>
    filteredNodes.map(n => ({
      id:   n.id,
      type: n.type,
      position: { x: 0, y: 0 },
      data: {
        label:        n.label,
        namespace:    n.namespace ?? '',
        nodeType:     n.type,
        replicas:     n.metadata?.replicas,
        svcType:      n.metadata?.svcType,
        host:         n.metadata?.host,
        effect:       n.metadata?.effect,
        phase:        n.metadata?.phase,
        restartCount: n.metadata?.restartCount,
        ready:        n.metadata?.ready,
        danger:       n.metadata?.danger,
        rules:        n.metadata?.rules,
        roleRef:      n.metadata?.roleRef,
        roleKind:     n.metadata?.roleKind,
        privileged:   n.metadata?.privileged,
        runAsRoot:    n.metadata?.runAsRoot,
        hostNetwork:  n.metadata?.hostNetwork,
        hostPID:      n.metadata?.hostPID,
        hostPath:     n.metadata?.hostPath,
        dimmed:       false,
        selected:     false,
      },
    })), [filteredNodes])

  // Layout — fixed 3-col swimlanes per namespace
  const { groupNodes, positionedNodes } = useMemo(
    () => applyTopologyLayout(rfNodesBase, [], showPods),
    [rfNodesBase, showPods])

  const allNodes = useMemo(() => {
    const active = connectedIds
    return [
      ...groupNodes.map(n => ({
        ...n,
        data: { ...n.data, dimmed: false },
      })),
      ...positionedNodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          dimmed:   active ? !active.has(n.id) : false,
          selected: n.id === selectedNode?.id,
        },
      })),
    ]
  }, [groupNodes, positionedNodes, connectedIds, selectedNode])

  // Edges — highlight connected, dim rest when hovering
  const rfEdges: Edge[] = useMemo(() =>
    filteredEdges.map(e => {
      const isRoutes  = e.label === 'routes →'
      const color = EDGE_COLOR[e.label ?? ''] ?? '#475569'
      const isActive = connectedIds
        ? connectedIds.has(e.source) && connectedIds.has(e.target)
        : true

      return {
        id:     e.id,
        source: e.source,
        target: e.target,
        type:   'topology',
        zIndex: isActive ? 10 : 1,
        data: {
          color:       isActive ? color : '#1e293b',
          strokeWidth: isActive ? (isRoutes ? 3 : 2) : 0.5,
          opacity:     isActive ? (isRoutes ? 0.95 : 0.8) : 0.08,
          dashed:      isActive && isRoutes,
          label:       e.label,
        },
      }
    }), [filteredEdges, connectedIds])

  const handleNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    if (node.id.startsWith('topo-group:') || node.type === 'rbacGroup') return
    const graphNode = data.nodes.find(n => n.id === node.id) ?? null
    setSelectedNode(prev => prev?.id === graphNode?.id ? null : graphNode)
  }, [data.nodes])

  const handleMouseEnter: NodeMouseHandler = useCallback((_evt, node) => {
    if (!node.id.startsWith('topo-group:') && node.type !== 'rbacGroup') setHoveredId(node.id)
  }, [])

  const handleMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredId(null)
  }, [])

  const stats = useMemo(() => ({
    workloads:  filteredNodes.filter(n => ['deployment','statefulset','daemonset'].includes(n.type)).length,
    pods:       filteredNodes.filter(n => n.type === 'pod').length,
    services:   filteredNodes.filter(n => n.type === 'k8s_service').length,
    ingresses:  filteredNodes.filter(n => n.type === 'ingress').length,
    netpols:    filteredNodes.filter(n => n.type === 'networkpolicy').length,
    namespaces: new Set(filteredNodes.filter(n => n.namespace).map(n => n.namespace!)).size,
  }), [filteredNodes])

  return (
    <div className="absolute inset-0">
      {/* Stat bar */}
      <div className="absolute top-0 left-0 right-0 z-10 px-5 py-1.5 border-b border-cyber-border/30 bg-cyber-panel/30 backdrop-blur-sm flex items-center gap-5">
        {[
          { label: 'namespaces', value: stats.namespaces, color: 'text-violet-400' },
          { label: 'workloads',  value: stats.workloads,  color: 'text-blue-400'   },
          { label: 'pods',       value: stats.pods,       color: 'text-cyan-400'   },
          { label: 'services',   value: stats.services,   color: 'text-teal-400'   },
          { label: 'ingresses',  value: stats.ingresses,  color: 'text-green-400'  },
          { label: 'netpols',    value: stats.netpols,    color: 'text-rose-400'   },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`text-sm font-mono font-bold ${color}`}>{value}</span>
            <span className="text-[10px] font-mono text-slate-600">{label}</span>
          </div>
        ))}
        <span className="ml-auto text-[9px] font-mono text-slate-700 hidden md:block">
          hover node to see connections · click for details
        </span>
        <button
          onClick={() => setShowPods(p => !p)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono transition-all ${
            showPods
              ? 'border-cyan-500/50 bg-cyan-950/40 text-cyan-300'
              : 'border-cyber-border bg-cyber-panel text-slate-500 hover:text-slate-300'
          }`}
        >
          <Layers size={10} />
          {showPods ? 'Pods ON' : 'Pods OFF'}
        </button>
      </div>

      {/* Legend */}
      <div className="absolute left-4 bottom-4 z-10 rounded-xl border border-cyber-border bg-cyber-panel/80 backdrop-blur-sm px-4 py-3 space-y-1.5">
        <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-2">Topology Legend</div>
        {[
          { color: '#3b82f6', label: 'manages (Workload→Pod)' },
          { color: '#14b8a6', label: 'selects (Service→Workload)' },
          { color: '#22c55e', label: 'routes → (Ingress→Service)' },
          { color: '#8b5cf6', label: 'grants → (Binding→Role)' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-5 h-px" style={{ background: color }} />
            <span className="text-[10px] font-mono text-slate-400">{label}</span>
          </div>
        ))}
        {[
          { color: 'bg-blue-400',   label: 'Deployment'    },
          { color: 'bg-purple-400', label: 'StatefulSet'   },
          { color: 'bg-orange-400', label: 'DaemonSet'     },
          { color: 'bg-cyan-400',   label: 'Pod'           },
          { color: 'bg-teal-400',   label: 'Service'       },
          { color: 'bg-green-400',  label: 'Ingress'       },
          { color: 'bg-rose-400',   label: 'NetworkPolicy' },
          { color: 'bg-violet-500', label: 'RoleBinding'   },
          { color: 'bg-red-500',    label: 'Role (critical)' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
            <span className="text-[10px] font-mono text-slate-400">{label}</span>
          </div>
        ))}
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
          fitView
          fitViewOptions={{ padding: 0.06 }}
          minZoom={0.04}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          elevateEdgesOnSelect
        >
          <FocusController nodeId={focusNodeId} />
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1a2840" />
          <Controls className="!border-cyber-border !bg-cyber-panel/80 !rounded-xl overflow-hidden" showInteractive={false} />
          <MiniMap
            nodeColor={n => {
              if (n.type === 'deployment')             return '#1d4ed8'
              if (n.type === 'statefulset')            return '#7e22ce'
              if (n.type === 'daemonset')              return '#c2410c'
              if (n.type === 'pod')                    return '#0e7490'
              if (n.type === 'k8s_service')            return '#0d9488'
              if (n.type === 'ingress')                return '#16a34a'
              if (n.type === 'networkpolicy')          return '#e11d48'
              if (n.type === 'k8s_rolebinding' || n.type === 'k8s_clusterrolebinding') return '#7c3aed'
              if (n.type === 'k8s_clusterrole')        return '#f97316'
              if (n.type === 'k8s_role')               return '#ef4444'
              return '#1e293b'
            }}
            className="!border-cyber-border !bg-cyber-panel/90 !rounded-xl"
            maskColor="rgba(8,12,20,0.7)"
          />
        </ReactFlow>
      </div>

      <TopologyDetails node={selectedNode} data={data} onClose={() => setSelectedNode(null)} />
    </div>
  )
}
