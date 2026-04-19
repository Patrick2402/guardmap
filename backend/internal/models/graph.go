package models

type NodeType string

const (
	// IRSA chain
	NodeTypePod            NodeType = "pod"
	NodeTypeServiceAccount NodeType = "serviceaccount"
	NodeTypeIAMRole        NodeType = "iam_role"
	NodeTypeAWSService     NodeType = "aws_service"

	// K8s workloads
	NodeTypeDeployment  NodeType = "deployment"
	NodeTypeStatefulSet NodeType = "statefulset"
	NodeTypeDaemonSet   NodeType = "daemonset"
	NodeTypeJob         NodeType = "job"
	NodeTypeCronJob     NodeType = "cronjob"

	// K8s networking
	NodeTypeK8sService    NodeType = "k8s_service"
	NodeTypeIngress       NodeType = "ingress"
	NodeTypeNetworkPolicy NodeType = "networkpolicy"

	// K8s RBAC
	NodeTypeK8sRole              NodeType = "k8s_role"
	NodeTypeK8sClusterRole       NodeType = "k8s_clusterrole"
	NodeTypeK8sRoleBinding       NodeType = "k8s_rolebinding"
	NodeTypeK8sClusterRoleBinding NodeType = "k8s_clusterrolebinding"

	// K8s config resources
	NodeTypeSecret    NodeType = "secret"
	NodeTypeConfigMap NodeType = "configmap"
)

type AccessLevel string

const (
	AccessRead  AccessLevel = "read"
	AccessWrite AccessLevel = "write"
	AccessFull  AccessLevel = "full"
)

type Node struct {
	ID        string            `json:"id"`
	Type      NodeType          `json:"type"`
	Label     string            `json:"label"`
	Namespace string            `json:"namespace,omitempty"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

type Edge struct {
	ID          string      `json:"id"`
	Source      string      `json:"source"`
	Target      string      `json:"target"`
	Label       string      `json:"label,omitempty"`
	AccessLevel AccessLevel `json:"accessLevel,omitempty"`
	Actions     []string    `json:"actions,omitempty"`
}

type GraphData struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

type PolicyStatement struct {
	Effect    string   `json:"Effect"`
	Actions   []string `json:"Action"`
	Resources []string `json:"Resource"`
}

type PolicyDocument struct {
	Version    string            `json:"Version"`
	Statements []PolicyStatement `json:"Statement"`
}
