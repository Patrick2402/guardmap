import { Node, Edge } from 'reactflow'
import { SwimLaneResult } from './layout'

const NODE_W   = 210
const NODE_H   = 68
const ROW_GAP  = 12
const COL_GAP  = 120
const NS_SECTION_GAP = 28  // extra gap between namespace sections in SA column

const SYSTEM_NS = new Set(['kube-system', 'kube-public', 'kube-node-lease', 'ingress-nginx', 'cert-manager'])
const WORKLOAD_SET = new Set(['deployment', 'statefulset', 'daemonset'])

// Layout (no parentId — avoids cross-group edge rendering issues):
//  Col 0: SAs grouped by namespace (with namespace header labels)
//  Col 1: RoleBindings
//  Col 2: Roles / ClusterRoles
export function applyRBACLayout(nodes: Node[], _edges: Edge[]): SwimLaneResult {
  const sasByNs    = new Map<string, Node[]>()
  const bindings:  Node[] = []
  const roles:     Node[] = []

  for (const n of nodes) {
    const ns = (n.data?.namespace as string) || ''
    if (SYSTEM_NS.has(ns) || WORKLOAD_SET.has(n.type!)) continue

    if (n.type === 'serviceaccount') {
      if (SYSTEM_NS.has(ns)) continue
      if (!sasByNs.has(ns)) sasByNs.set(ns, [])
      sasByNs.get(ns)!.push(n)
    } else if (n.type === 'k8s_rolebinding' || n.type === 'k8s_clusterrolebinding') {
      bindings.push(n)
    } else if (n.type === 'k8s_role' || n.type === 'k8s_clusterrole') {
      roles.push(n)
    }
  }

  const positionedNodes: Node[] = []

  // ── Col 0: SAs, grouped by namespace with divider spacing ────────────────
  const COL0_X = 0
  let saY = 0
  const nsOrder = [...sasByNs.keys()].sort()
  for (const ns of nsOrder) {
    const sas = sasByNs.get(ns)!
    sas.forEach((node, i) => {
      positionedNodes.push({
        ...node,
        position: { x: COL0_X, y: saY + i * (NODE_H + ROW_GAP) },
      })
    })
    saY += sas.length * (NODE_H + ROW_GAP) + NS_SECTION_GAP
  }

  // ── Col 1: Bindings (namespace RBs first, then cluster RBs) ─────────────
  const COL1_X = NODE_W + COL_GAP
  const nsBindings  = bindings.filter(n => n.type === 'k8s_rolebinding')
  const cluBindings = bindings.filter(n => n.type === 'k8s_clusterrolebinding')
  const allBindings = [...nsBindings, ...cluBindings]
  allBindings.forEach((node, i) =>
    positionedNodes.push({ ...node, position: { x: COL1_X, y: i * (NODE_H + ROW_GAP) } })
  )

  // ── Col 2: Roles / ClusterRoles (sorted by danger desc) ─────────────────
  const DANGER_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const nsRoles  = roles.filter(n => n.type === 'k8s_role')
  const cluRoles = roles.filter(n => n.type === 'k8s_clusterrole')
  const allRoles = [
    ...cluRoles.sort((a, b) => (DANGER_ORDER[a.data?.danger ?? 'low'] ?? 3) - (DANGER_ORDER[b.data?.danger ?? 'low'] ?? 3)),
    ...nsRoles.sort((a, b) => (DANGER_ORDER[a.data?.danger ?? 'low'] ?? 3) - (DANGER_ORDER[b.data?.danger ?? 'low'] ?? 3)),
  ]
  const COL2_X = COL1_X + NODE_W + COL_GAP
  allRoles.forEach((node, i) =>
    positionedNodes.push({ ...node, position: { x: COL2_X, y: i * (NODE_H + ROW_GAP) } })
  )

  return { groupNodes: [], positionedNodes }
}
