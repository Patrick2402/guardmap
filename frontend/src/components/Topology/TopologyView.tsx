import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import ReactFlow, {
  Node, Edge, Background, BackgroundVariant, Controls, MiniMap,
  NodeMouseHandler, ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Layers, KeyRound, ShieldCheck } from 'lucide-react'

import { GraphData, GraphNode, GraphEdge }  from '../../types'
import { PodNode }                          from '../NodeTypes/PodNode'
import { WorkloadNode }                     from '../NodeTypes/WorkloadNode'
import { K8sNetworkNode }                   from '../NodeTypes/K8sNetworkNode'
import { NamespaceGroupNode }               from '../NodeTypes/NamespaceGroupNode'
import { RBACRoleNode }                     from '../NodeTypes/RBACRoleNode'
import { RBACBindingNode }                  from '../NodeTypes/RBACBindingNode'
import { RBACGroupNode }                    from '../NodeTypes/RBACGroupNode'
import { ConfigSecretNode }                 from '../NodeTypes/ConfigSecretNode'
import { TopologyEdge }                     from '../EdgeTypes/TopologyEdge'
import { TopologyChainModal }               from './TopologyChainModal'

// ── React Flow registries ────────────────────────────────────────────────────

const nodeTypes = {
  pod:                    PodNode,
  deployment:             WorkloadNode,
  statefulset:            WorkloadNode,
  daemonset:              WorkloadNode,
  job:                    WorkloadNode,
  cronjob:                WorkloadNode,
  k8s_service:            K8sNetworkNode,
  ingress:                K8sNetworkNode,
  networkpolicy:          K8sNetworkNode,
  namespaceGroup:         NamespaceGroupNode,
  k8s_role:               RBACRoleNode,
  k8s_clusterrole:        RBACRoleNode,
  k8s_rolebinding:        RBACBindingNode,
  k8s_clusterrolebinding: RBACBindingNode,
  rbacGroup:              RBACGroupNode,
  secret:                 ConfigSecretNode,
  configmap:              ConfigSecretNode,
}

const edgeTypes = { topology: TopologyEdge }

// ── Topology filters ─────────────────────────────────────────────────────────

const TOPO_TYPES = new Set([
  'pod', 'deployment', 'statefulset', 'daemonset', 'job', 'cronjob',
  'k8s_service', 'ingress', 'networkpolicy',
  'k8s_role', 'k8s_clusterrole', 'k8s_rolebinding', 'k8s_clusterrolebinding',
  'secret', 'configmap',
])

const TOPO_EDGE_LABELS = new Set([
  'manages', 'selects', 'routes →', 'grants →', 'bound →', 'schedules',
  'uses secret →', 'uses config →',
])

const EDGE_COLOR: Record<string, string> = {
  'manages':       '#3b82f6',
  'selects':       '#14b8a6',
  'routes →':      '#22c55e',
  'grants →':      '#8b5cf6',
  'bound →':       '#8b5cf6',
  'schedules':     '#2dd4bf',
  'uses secret →': '#f59e0b',
  'uses config →': '#38bdf8',
}

// ── Layout engine ────────────────────────────────────────────────────────────
// Namespace blocks in a 2-column grid.
// Within each namespace: resources grouped by category (workloads, batch, pods,
// services, networking, rbac) — laid out left-to-right, wrapping every 4 nodes.

const NW = 210, NH = 66           // node width / row height (with buffer)
const H_GAP = 16                  // gap between nodes in a row
const ROW_VGAP = 12               // gap between wrapped rows within a category
const CAT_GAP = 20                // vertical gap between categories
const NS_PX = 20, NS_PY = 14     // namespace inner padding x/y
const NS_HDR = 28                 // namespace header strip height
const COL_HGAP = 40               // gap between the 2 namespace columns
const NS_VGAP = 24                // gap between namespace rows in same column
const MAX_PER_ROW = 3             // max nodes per row within a category

const CAT_DEFS: { key: string; types: Set<string> }[] = [
  { key: 'wl',     types: new Set(['deployment','statefulset','daemonset']) },
  { key: 'bat',    types: new Set(['cronjob','job']) },
  { key: 'pod',    types: new Set(['pod']) },
  { key: 'svc',    types: new Set(['k8s_service']) },
  { key: 'net',    types: new Set(['ingress','networkpolicy']) },
  { key: 'rbac',   types: new Set(['k8s_role','k8s_clusterrole','k8s_rolebinding','k8s_clusterrolebinding']) },
  { key: 'config', types: new Set(['secret','configmap']) },
]

function rowsFor(n: number) { return Math.ceil(n / MAX_PER_ROW) }

function catBlockH(count: number) {
  if (!count) return 0
  return rowsFor(count) * NH + (rowsFor(count) - 1) * ROW_VGAP
}

function nsWidth(cats: Node[][]): number {
  const maxInRow = Math.min(Math.max(...cats.map(c => c.length), 1), MAX_PER_ROW)
  return 2 * NS_PX + maxInRow * NW + (maxInRow - 1) * H_GAP
}

function nsHeight(cats: Node[][]): number {
  const active = cats.filter(c => c.length > 0)
  if (!active.length) return NS_HDR + 2 * NS_PY
  const inner = active.reduce((sum, c, i) =>
    sum + catBlockH(c.length) + (i < active.length - 1 ? CAT_GAP : 0), 0)
  return NS_HDR + 2 * NS_PY + inner
}

const RBAC_TYPES = new Set(['k8s_role','k8s_clusterrole','k8s_rolebinding','k8s_clusterrolebinding'])

function buildLayout(nodes: Node[], showPods: boolean, showConfigs: boolean, showRBAC: boolean) {
  const visible = nodes.filter(n => {
    if (n.type === 'pod' && !showPods) return false
    if ((n.type === 'secret' || n.type === 'configmap') && !showConfigs) return false
    if (RBAC_TYPES.has(n.type!) && !showRBAC) return false
    return true
  })

  // Group nodes by namespace
  const byNs = new Map<string, Node[]>()
  for (const n of visible) {
    const ns = (n.data?.namespace as string) || '_global'
    if (!byNs.has(ns)) byNs.set(ns, [])
    byNs.get(ns)!.push(n)
  }

  // Build namespace blocks with category grouping
  type NsBlk = { ns: string; cats: Node[][]; w: number; h: number }
  const blocks: NsBlk[] = []
  for (const [ns, nsNodes] of byNs) {
    const cats = CAT_DEFS.map(def => nsNodes.filter(n => def.types.has(n.type!)))
    if (!cats.some(c => c.length > 0)) continue
    blocks.push({ ns, cats, w: nsWidth(cats), h: nsHeight(cats) })
  }

  // Sort largest-first for better greedy column packing
  blocks.sort((a, b) => b.h - a.h)

  // Greedy 2-column assignment
  const col0: NsBlk[] = [], col1: NsBlk[] = []
  const colH = [0, 0]
  for (const blk of blocks) {
    const c = colH[0] <= colH[1] ? 0 : 1
    if (c === 0) col0.push(blk); else col1.push(blk)
    colH[c] += blk.h + NS_VGAP
  }

  // Column widths
  const w0 = col0.reduce((m, b) => Math.max(m, b.w), 0)

  // Assign positions
  const nsPos = new Map<string, { x: number; y: number }>()
  let y = 0
  for (const b of col0) { nsPos.set(b.ns, { x: 0, y }); y += b.h + NS_VGAP }
  y = 0
  for (const b of col1) { nsPos.set(b.ns, { x: w0 + COL_HGAP, y }); y += b.h + NS_VGAP }

  const groupNodes: Node[] = []
  const positionedNodes: Node[] = []

  for (const blk of blocks) {
    const pos = nsPos.get(blk.ns)!

    groupNodes.push({
      id:         `topo-group:${blk.ns}`,
      type:       'namespaceGroup',
      position:   pos,
      style:      { width: blk.w, height: blk.h },
      data:       { label: blk.ns, podCount: 0 },
      selectable: false,
      draggable:  false,
      zIndex:     -1,
    })

    let catY = NS_HDR + NS_PY
    for (let ci = 0; ci < CAT_DEFS.length; ci++) {
      const cNodes = blk.cats[ci]
      if (!cNodes.length) continue

      for (let ni = 0; ni < cNodes.length; ni++) {
        const row = Math.floor(ni / MAX_PER_ROW)
        const col = ni % MAX_PER_ROW
        positionedNodes.push({
          ...cNodes[ni],
          style: { width: NW },          // force fixed width — prevents content overflow
          position: {
            x: pos.x + NS_PX + col * (NW + H_GAP),
            y: pos.y + catY + row * (NH + ROW_VGAP),
          },
        })
      }
      catY += catBlockH(cNodes.length) + CAT_GAP
    }
  }

  return { groupNodes, positionedNodes }
}

// Bidirectional BFS — returns all reachable node IDs from start
function bfsAll(startId: string, edges: GraphEdge[]): Set<string> {
  const visited = new Set([startId])
  const queue = [startId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const e of edges) {
      const next = e.source === cur ? e.target : e.target === cur ? e.source : null
      if (next && !visited.has(next)) { visited.add(next); queue.push(next) }
    }
  }
  return visited
}

// ── Component ────────────────────────────────────────────────────────────────

interface TopologyViewProps {
  data: GraphData
  focusNodeId?: string | null
}

export function TopologyView({ data, focusNodeId }: TopologyViewProps) {
  const [showPods,       setShowPods]       = useState(false)
  const [showConfigs,    setShowConfigs]    = useState(false)
  const [showRBAC,       setShowRBAC]       = useState(false)
  const [selectedNode,   setSelectedNode]   = useState<GraphNode | null>(null)
  const [rfReady,        setRfReady]        = useState(false)
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

  // ── Filter to topology-relevant resources ──────────────────────────────────
  const filteredNodes = useMemo(() =>
    data.nodes.filter(n => TOPO_TYPES.has(n.type)),
    [data.nodes])

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map(n => n.id))
    return data.edges.filter(e =>
      TOPO_EDGE_LABELS.has(e.label ?? '') &&
      nodeIds.has(e.source) &&
      nodeIds.has(e.target)
    )
  }, [data.edges, filteredNodes])

  // ── BFS from selected node ─────────────────────────────────────────────────
  const connectedIds: Set<string> | null = useMemo(() =>
    selectedNode ? bfsAll(selectedNode.id, filteredEdges) : null,
    [selectedNode, filteredEdges])

  // ── Build base React Flow nodes ────────────────────────────────────────────
  const baseNodes: Node[] = useMemo(() =>
    filteredNodes.map(n => ({
      id:   n.id,
      type: n.type,
      position: { x: 0, y: 0 },
      data: {
        label:        n.label,
        namespace:    n.namespace ?? '',
        nodeType:     n.type,
        replicas:     n.metadata?.replicas,
        available:    n.metadata?.available,
        desired:      n.metadata?.desired,
        schedule:     n.metadata?.schedule,
        succeeded:    n.metadata?.succeeded,
        completions:  n.metadata?.completions,
        activeJobs:   n.metadata?.activeJobs,
        svcType:      n.metadata?.svcType,
        host:         n.metadata?.host,
        effect:       n.metadata?.effect,
        phase:        n.metadata?.phase,
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
        // Secret / ConfigMap
        secretType:   n.metadata?.secretType,
        keyCount:     n.metadata?.keyCount,
        referenced:   n.metadata?.referenced,
        immutable:    n.metadata?.immutable,
        dimmed:       false,
        selected:     false,
      },
    })), [filteredNodes])

  // ── Layout ─────────────────────────────────────────────────────────────────
  const { groupNodes, positionedNodes } = useMemo(
    () => buildLayout(baseNodes, showPods, showConfigs, showRBAC),
    [baseNodes, showPods, showConfigs, showRBAC])

  // ── Merge dimming + selection into final nodes ─────────────────────────────
  const allNodes: Node[] = useMemo(() => [
    ...groupNodes.map(n => ({ ...n, data: { ...n.data, dimmed: false } })),
    ...positionedNodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        dimmed:   connectedIds ? !connectedIds.has(n.id) : false,
        selected: n.id === selectedNode?.id,
      },
    })),
  ], [groupNodes, positionedNodes, connectedIds, selectedNode])

  // ── Edges: hidden by default, fade in on selection ────────────────────────
  const rfEdges: Edge[] = useMemo(() =>
    filteredEdges.map(e => {
      const show = connectedIds
        ? connectedIds.has(e.source) && connectedIds.has(e.target)
        : false
      const color = EDGE_COLOR[e.label ?? ''] ?? '#475569'
      return {
        id:     e.id,
        source: e.source,
        target: e.target,
        type:   'topology',
        zIndex: show ? 10 : 0,
        data: {
          color:       show ? color : 'transparent',
          strokeWidth: show ? 2 : 0,
          opacity:     show ? 0.85 : 0,
          dashed:      show && e.label === 'routes →',
          label:       show ? e.label : '',
        },
      }
    }), [filteredEdges, connectedIds])

  // ── Interaction ────────────────────────────────────────────────────────────
  const handleNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    if (node.id.startsWith('topo-group:') || node.type === 'rbacGroup') return
    const gn = data.nodes.find(n => n.id === node.id) ?? null
    setSelectedNode(prev => prev?.id === gn?.id ? null : gn)
  }, [data.nodes])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    namespaces: new Set(filteredNodes.filter(n => n.namespace).map(n => n.namespace!)).size,
    workloads:  filteredNodes.filter(n =>
      ['deployment','statefulset','daemonset','job','cronjob'].includes(n.type)).length,
    pods:       filteredNodes.filter(n => n.type === 'pod').length,
    services:   filteredNodes.filter(n => n.type === 'k8s_service').length,
    ingresses:  filteredNodes.filter(n => n.type === 'ingress').length,
    netpols:    filteredNodes.filter(n => n.type === 'networkpolicy').length,
    secrets:    filteredNodes.filter(n => n.type === 'secret').length,
    configmaps: filteredNodes.filter(n => n.type === 'configmap').length,
  }), [filteredNodes])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0">

      {/* ── Top stat bar ────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-10 px-5 py-1.5 border-b border-cyber-border/30 bg-cyber-panel/30 backdrop-blur-sm flex items-center gap-5">
        {([
          { label: 'namespaces', value: stats.namespaces, color: 'text-violet-400' },
          { label: 'workloads',  value: stats.workloads,  color: 'text-blue-400'   },
          { label: 'pods',       value: stats.pods,       color: 'text-cyan-400'   },
          { label: 'services',   value: stats.services,   color: 'text-teal-400'   },
          { label: 'ingresses',  value: stats.ingresses,  color: 'text-green-400'  },
          { label: 'netpols',    value: stats.netpols,    color: 'text-rose-400'   },
          { label: 'secrets',    value: stats.secrets,    color: 'text-amber-400'  },
          { label: 'configmaps', value: stats.configmaps, color: 'text-sky-400'    },
        ] as const).map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`text-lg font-mono font-bold ${color}`}>{value}</span>
            <span className="text-sm font-sans text-slate-400">{label}</span>
          </div>
        ))}

        {/* Hint */}
        <span className="ml-auto text-xs font-mono text-slate-400 hidden md:block">
          {selectedNode
            ? `${selectedNode.label} · showing connections · click again or background to clear`
            : 'click any resource to reveal connections'}
        </span>

        {/* Pods toggle */}
        <button
          onClick={() => setShowPods(p => !p)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all ${
            showPods
              ? 'border-cyan-500/50 bg-cyan-950/40 text-cyan-300'
              : 'border-cyber-border bg-cyber-panel text-slate-400 hover:text-slate-300'
          }`}
        >
          <Layers size={10} />
          Pods {showPods ? 'ON' : 'OFF'}
        </button>

        {/* Secrets/Configs toggle */}
        <button
          onClick={() => setShowConfigs(p => !p)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all ${
            showConfigs
              ? 'border-amber-500/50 bg-amber-950/40 text-amber-300'
              : 'border-cyber-border bg-cyber-panel text-slate-400 hover:text-slate-300'
          }`}
        >
          <KeyRound size={10} />
          Secrets {showConfigs ? 'ON' : 'OFF'}
        </button>

        {/* RBAC toggle */}
        <button
          onClick={() => setShowRBAC(p => !p)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all ${
            showRBAC
              ? 'border-violet-500/50 bg-violet-950/40 text-violet-300'
              : 'border-cyber-border bg-cyber-panel text-slate-400 hover:text-slate-300'
          }`}
        >
          <ShieldCheck size={10} />
          RBAC {showRBAC ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* ── Edge legend — only when a node is selected ──────────────────── */}
      {selectedNode && (
        <div className="absolute left-4 bottom-4 z-10 rounded-xl border border-cyber-border bg-cyber-panel/80 backdrop-blur-sm px-3.5 py-2.5 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">Connections</div>
          {Object.entries(EDGE_COLOR).map(([label, color]) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-4 h-px" style={{ background: color }} />
              <span className="text-xs font-mono text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── React Flow canvas ───────────────────────────────────────────── */}
      <div className="absolute inset-0 pt-8">
        <ReactFlow
          nodes={allNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          onPaneClick={() => setSelectedNode(null)}
          onInit={(instance) => { rfRef.current = instance; setRfReady(true) }}
          fitView
          fitViewOptions={{ padding: 0.08 }}
          minZoom={0.03}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          elevateEdgesOnSelect
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1a2840" />
          <Controls
            className="!border-cyber-border !bg-cyber-panel/80 !rounded-xl overflow-hidden"
            showInteractive={false}
          />
          <MiniMap
            nodeColor={n => {
              const t = n.type
              if (t === 'deployment')             return '#1d4ed8'
              if (t === 'statefulset')            return '#7e22ce'
              if (t === 'daemonset')              return '#c2410c'
              if (t === 'job')                    return '#16a34a'
              if (t === 'cronjob')                return '#0d9488'
              if (t === 'pod')                    return '#0e7490'
              if (t === 'k8s_service')            return '#0d9488'
              if (t === 'ingress')                return '#16a34a'
              if (t === 'networkpolicy')          return '#e11d48'
              if (t === 'k8s_rolebinding' || t === 'k8s_clusterrolebinding') return '#7c3aed'
              if (t === 'k8s_role' || t === 'k8s_clusterrole')               return '#ef4444'
              if (t === 'secret')                 return '#d97706'
              if (t === 'configmap')              return '#0284c7'
              return '#1e293b'
            }}
            className="!border-cyber-border !bg-cyber-panel/90 !rounded-xl"
            maskColor="rgba(8,12,20,0.7)"
          />
        </ReactFlow>
      </div>

      <TopologyChainModal node={selectedNode} data={data} onClose={() => setSelectedNode(null)} />
    </div>
  )
}
