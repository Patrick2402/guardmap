package discovery

import (
	"context"
	"fmt"
	"path/filepath"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
)

const irsaAnnotation = "eks.amazonaws.com/role-arn"

// ClusterSnapshot holds all K8s resources discovered in a single scan.
type ClusterSnapshot struct {
	Pods            []corev1.Pod
	ServiceAccounts map[string]*corev1.ServiceAccount // "ns/name" → SA
	Deployments     []appsv1.Deployment
	StatefulSets    []appsv1.StatefulSet
	DaemonSets      []appsv1.DaemonSet
	ReplicaSets     []appsv1.ReplicaSet
	Services        []corev1.Service
	Ingresses       []networkingv1.Ingress
	NetworkPolicies []networkingv1.NetworkPolicy
	Endpoints       []corev1.Endpoints
	Nodes           []corev1.Node

	// Batch
	Jobs     []batchv1.Job
	CronJobs []batchv1.CronJob

	// RBAC
	Roles                []rbacv1.Role
	ClusterRoles         []rbacv1.ClusterRole
	RoleBindings         []rbacv1.RoleBinding
	ClusterRoleBindings  []rbacv1.ClusterRoleBinding
}

// ClusterInfo contains metadata extracted from nodes.
type ClusterInfo struct {
	K8sVersion string
	NodeCount  int
	Region     string
}

// Info extracts cluster-level metadata from discovered nodes.
func (s *ClusterSnapshot) Info() ClusterInfo {
	info := ClusterInfo{NodeCount: len(s.Nodes)}
	if len(s.Nodes) > 0 {
		info.K8sVersion = s.Nodes[0].Status.NodeInfo.KubeletVersion
		// AWS/GCP/Azure region label
		for _, label := range []string{"topology.kubernetes.io/region", "failure-domain.beta.kubernetes.io/region"} {
			if r, ok := s.Nodes[0].Labels[label]; ok {
				info.Region = r
				break
			}
		}
	}
	return info
}

type K8sDiscovery struct {
	client kubernetes.Interface
}

func NewK8sDiscovery(kubeconfig string) (*K8sDiscovery, error) {
	var cfg *rest.Config
	var err error

	if kubeconfig == "" {
		cfg, err = rest.InClusterConfig()
		if err != nil {
			home := homedir.HomeDir()
			kubeconfig = filepath.Join(home, ".kube", "config")
			cfg, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
			if err != nil {
				return nil, fmt.Errorf("failed to build kubeconfig: %w", err)
			}
		}
	} else {
		cfg, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			return nil, fmt.Errorf("failed to build kubeconfig from %s: %w", kubeconfig, err)
		}
	}

	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create k8s client: %w", err)
	}
	return &K8sDiscovery{client: client}, nil
}

// DiscoverCluster fetches all workloads, networking resources, and service accounts
// across all namespaces in a single scan. Individual list errors are non-fatal where possible.
func (d *K8sDiscovery) DiscoverCluster(ctx context.Context) (*ClusterSnapshot, error) {
	snap := &ClusterSnapshot{
		ServiceAccounts: make(map[string]*corev1.ServiceAccount),
	}

	// ── Pods ─────────────────────────────────────────────────────────────────
	pods, err := d.client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("listing pods: %w", err)
	}
	snap.Pods = pods.Items

	// ── Service Accounts (all namespaces) ────────────────────────────────────
	if sas, err := d.client.CoreV1().ServiceAccounts("").List(ctx, metav1.ListOptions{}); err == nil {
		for i := range sas.Items {
			sa := &sas.Items[i]
			snap.ServiceAccounts[sa.Namespace+"/"+sa.Name] = sa
		}
	}

	// ── Workloads ─────────────────────────────────────────────────────────────
	if depls, err := d.client.AppsV1().Deployments("").List(ctx, metav1.ListOptions{}); err == nil {
		snap.Deployments = depls.Items
	}
	if ssets, err := d.client.AppsV1().StatefulSets("").List(ctx, metav1.ListOptions{}); err == nil {
		snap.StatefulSets = ssets.Items
	}
	if dsets, err := d.client.AppsV1().DaemonSets("").List(ctx, metav1.ListOptions{}); err == nil {
		snap.DaemonSets = dsets.Items
	}
	if rsets, err := d.client.AppsV1().ReplicaSets("").List(ctx, metav1.ListOptions{}); err == nil {
		snap.ReplicaSets = rsets.Items
	}

	// ── Networking ────────────────────────────────────────────────────────────
	if svcs, err := d.client.CoreV1().Services("").List(ctx, metav1.ListOptions{}); err == nil {
		snap.Services = svcs.Items
	}
	if ings, err := d.client.NetworkingV1().Ingresses("").List(ctx, metav1.ListOptions{}); err == nil {
		snap.Ingresses = ings.Items
	}
	if netpols, err := d.client.NetworkingV1().NetworkPolicies("").List(ctx, metav1.ListOptions{}); err == nil {
		snap.NetworkPolicies = netpols.Items
	}
	if eps, err := d.client.CoreV1().Endpoints("").List(ctx, metav1.ListOptions{}); err == nil {
		snap.Endpoints = eps.Items
	}

	// ── Nodes ─────────────────────────────────────────────────────────────────
	if nodes, err := d.client.CoreV1().Nodes().List(ctx, metav1.ListOptions{}); err == nil {
		snap.Nodes = nodes.Items
	}

	// ── Batch (Jobs + CronJobs) ───────────────────────────────────────────────
	if jobs, err := d.client.BatchV1().Jobs("").List(ctx, metav1.ListOptions{}); err == nil {
		snap.Jobs = jobs.Items
	}
	if cjs, err := d.client.BatchV1().CronJobs("").List(ctx, metav1.ListOptions{}); err == nil {
		snap.CronJobs = cjs.Items
	}

	// ── RBAC ─────────────────────────────────────────────────────────────────
	if roles, err := d.client.RbacV1().Roles("").List(ctx, metav1.ListOptions{}); err == nil {
		snap.Roles = roles.Items
	}
	if croles, err := d.client.RbacV1().ClusterRoles().List(ctx, metav1.ListOptions{}); err == nil {
		snap.ClusterRoles = croles.Items
	}
	if rbs, err := d.client.RbacV1().RoleBindings("").List(ctx, metav1.ListOptions{}); err == nil {
		snap.RoleBindings = rbs.Items
	}
	if crbs, err := d.client.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{}); err == nil {
		snap.ClusterRoleBindings = crbs.Items
	}

	return snap, nil
}

// IRSABinding is kept for backward compatibility but now derived from ClusterSnapshot.
type IRSABinding struct {
	PodName        string
	PodNamespace   string
	PodUID         string
	ServiceAccount string
	RoleARN        string
	NodeName       string
	Labels         map[string]string
}

// DiscoverIRSABindings extracts pods with IRSA annotations from a snapshot.
func IRSABindingsFromSnapshot(snap *ClusterSnapshot) []IRSABinding {
	var bindings []IRSABinding
	for _, pod := range snap.Pods {
		saName := pod.Spec.ServiceAccountName
		if saName == "" {
			saName = "default"
		}
		sa, ok := snap.ServiceAccounts[pod.Namespace+"/"+saName]
		if !ok {
			continue
		}
		roleARN, hasIRSA := sa.Annotations[irsaAnnotation]
		if !hasIRSA {
			continue
		}
		bindings = append(bindings, IRSABinding{
			PodName:        pod.Name,
			PodNamespace:   pod.Namespace,
			PodUID:         string(pod.UID),
			ServiceAccount: saName,
			RoleARN:        roleARN,
			NodeName:       pod.Spec.NodeName,
			Labels:         pod.Labels,
		})
	}
	return bindings
}
