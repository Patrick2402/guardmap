export type NodeType =
  | 'pod'
  | 'serviceaccount'
  | 'iam_role'
  | 'aws_service'
  | 'deployment'
  | 'statefulset'
  | 'daemonset'
  | 'job'
  | 'cronjob'
  | 'k8s_service'
  | 'ingress'
  | 'networkpolicy'
  | 'k8s_role'
  | 'k8s_clusterrole'
  | 'k8s_rolebinding'
  | 'k8s_clusterrolebinding'
  | 'secret'
  | 'configmap'

export type AccessLevel = 'read' | 'write' | 'full'

export const WORKLOAD_TYPES: NodeType[] = ['deployment', 'statefulset', 'daemonset', 'job', 'cronjob']
export const NETWORKING_TYPES: NodeType[] = ['k8s_service', 'ingress', 'networkpolicy']
export const IRSA_TYPES: NodeType[] = ['pod', 'serviceaccount', 'iam_role', 'aws_service']
export const CONFIG_TYPES: NodeType[] = ['secret', 'configmap']

export interface GraphNode {
  id: string
  type: NodeType
  label: string
  namespace?: string
  metadata?: Record<string, string>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
  accessLevel?: AccessLevel
  actions?: string[]
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface BlastRadiusResult {
  startId: string
  reachableNodeIds: Set<string>
  reachableEdgeIds: Set<string>
  writeTargets: GraphNode[]
  fullTargets: GraphNode[]
}
