import dagre from '@dagrejs/dagre'
import { Node, Edge } from 'reactflow'

const NODE_W   = 200
const NODE_H   = 68
const ROW_GAP  = 10
const PAD      = 28
const COL_INNER = 44
const NS_GAP   = 28
const COL_GAP  = 110

// ── Flat dagre layout (legacy / simple mode) ────────────────────────────────
export function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 55, ranksep: 110, edgesep: 20 })
  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map(n => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } }
  })
}

// ── Namespace swimlane layout ────────────────────────────────────────────────
// Columns (L→R): [ns groups: pods | SAs]  →  [IAM Roles]  →  [AWS Services]
export interface SwimLaneResult {
  groupNodes: Node[]
  positionedNodes: Node[]
}

// Columns (L→R): [ns groups: Workloads | ServiceAccounts]  →  [IAM Roles]  →  [AWS Services]
export function applyNamespacedLayout(nodes: Node[], _edges: Edge[]): SwimLaneResult {
  const workloadsByNs = new Map<string, Node[]>()
  const sasByNs       = new Map<string, Node[]>()
  const iamRoles: Node[] = []
  const awsServices: Node[] = []

  const WORKLOAD_SET = new Set(['deployment', 'statefulset', 'daemonset', 'job', 'cronjob'])

  for (const n of nodes) {
    const ns = (n.data?.namespace as string) ?? 'default'
    if (WORKLOAD_SET.has(n.type!)) {
      if (!workloadsByNs.has(ns)) workloadsByNs.set(ns, [])
      workloadsByNs.get(ns)!.push(n)
    } else if (n.type === 'serviceaccount') {
      if (!sasByNs.has(ns)) sasByNs.set(ns, [])
      sasByNs.get(ns)!.push(n)
    } else if (n.type === 'iam_role') {
      iamRoles.push(n)
    } else if (n.type === 'aws_service') {
      awsServices.push(n)
    }
  }

  const namespaces = [...new Set([...workloadsByNs.keys(), ...sasByNs.keys()])]
  // Two sub-columns per group: Workloads | ServiceAccounts
  const GROUP_W = PAD + NODE_W + COL_INNER + NODE_W + PAD

  const groupNodes: Node[] = []
  const positionedNodes: Node[] = []
  let nsY = 0

  for (const ns of namespaces) {
    const workloads = workloadsByNs.get(ns) ?? []
    const sas       = sasByNs.get(ns)       ?? []
    const rows = Math.max(workloads.length, sas.length, 1)
    const groupH = PAD + rows * (NODE_H + ROW_GAP) - ROW_GAP + PAD

    groupNodes.push({
      id:   `ns-group:${ns}`,
      type: 'namespaceGroup',
      position: { x: 0, y: nsY },
      style:    { width: GROUP_W, height: groupH, zIndex: -1 },
      data:     { label: ns, podCount: workloads.length },
      selectable: false,
      focusable:  false,
    } as Node)

    workloads.forEach((node, i) => positionedNodes.push({
      ...node,
      parentId: `ns-group:${ns}`,
      extent: 'parent' as const,
      position: { x: PAD, y: PAD + i * (NODE_H + ROW_GAP) },
    }))

    sas.forEach((node, i) => positionedNodes.push({
      ...node,
      parentId: `ns-group:${ns}`,
      extent: 'parent' as const,
      position: { x: PAD + NODE_W + COL_INNER, y: PAD + i * (NODE_H + ROW_GAP) },
    }))

    nsY += groupH + NS_GAP
  }

  const ROLE_X = GROUP_W + COL_GAP
  iamRoles.forEach((node, i) => {
    positionedNodes.push({ ...node, position: { x: ROLE_X, y: i * (NODE_H + ROW_GAP) } })
  })

  const SVC_X = ROLE_X + NODE_W + COL_GAP
  awsServices.forEach((node, i) => {
    positionedNodes.push({ ...node, position: { x: SVC_X, y: i * (NODE_H + ROW_GAP) } })
  })

  return { groupNodes, positionedNodes }
}

// ── Topology layout — fixed 3-column swimlanes per namespace ─────────────────
// Columns per namespace tile: [Workloads] | [Pods] | [Networking]
// Namespace tiles in masonry 2-column grid.
// Nodes have parentId so edges render inside the group SVG layer.

const TOPO_NODE_W = 210           // fixed node width for topology
const TOPO_NODE_H = NODE_H
const TOPO_PAD    = 28
const TOPO_HEADER = 28
const TOPO_COL_GAP = 60           // gap BETWEEN columns (between right edge and left edge)
const TOPO_COL_W  = TOPO_NODE_W + TOPO_COL_GAP  // step from one column start to next
const TOPO_ROW_G  = 14
const TOPO_NS_GH  = 60            // horizontal gap between namespace tiles
const TOPO_NS_GV  = 24            // vertical gap between namespace tiles in same column

const NS_PRIORITY: Record<string, number> = {
  production: 0, prod: 0,
  staging: 1, stage: 1,
  monitoring: 2, observability: 2,
  default: 3,
}

const WORKLOAD_SET  = new Set(['deployment', 'statefulset', 'daemonset', 'job', 'cronjob'])
const NETWORK_SET   = new Set(['k8s_service', 'ingress', 'networkpolicy'])
const RBAC_SET      = new Set(['k8s_role', 'k8s_clusterrole', 'k8s_rolebinding', 'k8s_clusterrolebinding'])
const RBAC_SKIP_NS  = new Set(['kube-system', 'kube-public', 'kube-node-lease', 'ingress-nginx', 'cert-manager'])
const RBAC_DANGER_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const RBAC_GAP = 56  // vertical gap between namespace masonry and RBAC section

export function applyTopologyLayout(nodes: Node[], _edges: Edge[], showPods = true): SwimLaneResult {
  const namespaces = [...new Set(nodes.map(n => (n.data?.namespace as string) ?? 'default'))]
    .sort((a, b) => {
      const ap = NS_PRIORITY[a] ?? 99, bp = NS_PRIORITY[b] ?? 99
      return ap !== bp ? ap - bp : a.localeCompare(b)
    })

  // Per-namespace fixed-column placement
  type NSTile = { nodes: Node[]; w: number; h: number }
  const nsLayouts = new Map<string, NSTile>()

  for (const ns of namespaces) {
    const nsNodes = nodes.filter(n => (n.data?.namespace as string) === ns)
    if (!nsNodes.length) continue

    const workloads  = nsNodes.filter(n => WORKLOAD_SET.has(n.type!))
    const pods       = showPods ? nsNodes.filter(n => n.type === 'pod') : []
    const networking = nsNodes.filter(n => NETWORK_SET.has(n.type!))

    const rows = Math.max(workloads.length, pods.length, networking.length, 1)

    const nonEmptyCols = [workloads, pods, networking].filter(c => c.length > 0)
    const numCols = nonEmptyCols.length || 1
    // Tile width = padding + (numCols cols each TOPO_NODE_W wide with gaps) + right padding
    const tileW = TOPO_PAD + numCols * TOPO_NODE_W + (numCols - 1) * TOPO_COL_GAP + TOPO_PAD

    const positioned: Node[] = []
    let colIdx = 0
    for (const col of [workloads, pods, networking]) {
      if (!col.length) continue
      const cx = TOPO_PAD + colIdx * TOPO_COL_W
      col.forEach((n, i) => {
        positioned.push({
          ...n,
          style: { width: TOPO_NODE_W },
          position: {
            x: cx,
            y: TOPO_HEADER + TOPO_PAD + i * (TOPO_NODE_H + TOPO_ROW_G),
          },
        })
      })
      colIdx++
    }

    const tileH = TOPO_HEADER + TOPO_PAD + rows * (TOPO_NODE_H + TOPO_ROW_G) - TOPO_ROW_G + TOPO_PAD

    nsLayouts.set(ns, { nodes: positioned, w: tileW, h: tileH })
  }

  // Masonry 2-column grid — uniform tile width per column
  const maxColW = Math.max(0, ...[...nsLayouts.values()].map(l => l.w))
  const colY = [0, 0]
  const placement = new Map<string, { col: number; y: number }>()
  for (const ns of namespaces) {
    if (!nsLayouts.has(ns)) continue
    const col = colY[0] <= colY[1] ? 0 : 1
    placement.set(ns, { col, y: colY[col] })
    colY[col] += nsLayouts.get(ns)!.h + TOPO_NS_GV
  }
  const tileColX = (col: number) => col * (maxColW + TOPO_NS_GH)

  const groupNodes: Node[] = []
  const positionedNodes: Node[] = []

  for (const ns of namespaces) {
    const layout = nsLayouts.get(ns)
    if (!layout) continue
    const { col, y } = placement.get(ns)!
    const tileX = tileColX(col)
    const groupId = `topo-group:${ns}`

    groupNodes.push({
      id:   groupId,
      type: 'namespaceGroup',
      position: { x: tileX, y },
      style:    { width: maxColW, height: layout.h },
      data:     { label: ns, podCount: layout.nodes.length },
      selectable: false,
      focusable:  false,
      draggable:  false,
    } as Node)

    layout.nodes.forEach(n => positionedNodes.push({
      ...n,
      parentId: groupId,
      extent: 'parent' as const,
    }))
  }

  // ── RBAC section — below namespace masonry ──────────────────────────────────
  const rbacNodes = nodes.filter(n => RBAC_SET.has(n.type!) && !RBAC_SKIP_NS.has((n.data?.namespace as string) ?? ''))

  if (rbacNodes.length > 0) {
    const bindings = rbacNodes.filter(n => n.type === 'k8s_rolebinding' || n.type === 'k8s_clusterrolebinding')
    const roles = rbacNodes
      .filter(n => n.type === 'k8s_role' || n.type === 'k8s_clusterrole')
      .sort((a, b) =>
        (RBAC_DANGER_ORDER[a.data?.danger ?? 'low'] ?? 3) -
        (RBAC_DANGER_ORDER[b.data?.danger ?? 'low'] ?? 3)
      )

    const rows   = Math.max(bindings.length, roles.length, 1)
    const rbacW  = TOPO_PAD + TOPO_NODE_W + TOPO_COL_GAP + TOPO_NODE_W + TOPO_PAD
    const rbacH  = TOPO_HEADER + TOPO_PAD + rows * (TOPO_NODE_H + TOPO_ROW_G) - TOPO_ROW_G + TOPO_PAD

    const masonryBottom = Math.max(colY[0], colY[1])
    const rbacY  = masonryBottom + RBAC_GAP
    const rbacX  = 0
    const groupId = 'topo-group:__rbac__'

    groupNodes.push({
      id:   groupId,
      type: 'rbacGroup',
      position: { x: rbacX, y: rbacY },
      style:    { width: rbacW, height: rbacH, zIndex: -1 },
      data:     { bindingCount: bindings.length, roleCount: roles.length },
      selectable: false,
      focusable:  false,
      draggable:  false,
    } as Node)

    bindings.forEach((n, i) =>
      positionedNodes.push({
        ...n,
        style:    { width: TOPO_NODE_W },
        parentId: groupId,
        extent:   'parent' as const,
        position: {
          x: TOPO_PAD,
          y: TOPO_HEADER + TOPO_PAD + i * (TOPO_NODE_H + TOPO_ROW_G),
        },
      })
    )

    roles.forEach((n, i) =>
      positionedNodes.push({
        ...n,
        style:    { width: TOPO_NODE_W },
        parentId: groupId,
        extent:   'parent' as const,
        position: {
          x: TOPO_PAD + TOPO_NODE_W + TOPO_COL_GAP,
          y: TOPO_HEADER + TOPO_PAD + i * (TOPO_NODE_H + TOPO_ROW_G),
        },
      })
    )
  }

  return { groupNodes, positionedNodes }
}
