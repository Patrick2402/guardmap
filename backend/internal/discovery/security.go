package discovery

import (
	"strings"

	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"

	"guardmap/internal/models"
)

// Severity levels.
const (
	SevCritical = "critical"
	SevHigh     = "high"
	SevMedium   = "medium"
	SevLow      = "low"
)

// Finding is a single security issue found during a scan.
type Finding struct {
	Severity    string `json:"severity"`
	Type        string `json:"type"`
	Resource    string `json:"resource"`
	Description string `json:"description"`
}

// SecurityReport holds all findings and their summary counts.
type SecurityReport struct {
	Critical int       `json:"critical"`
	High     int       `json:"high"`
	Medium   int       `json:"medium"`
	Low      int       `json:"low"`
	Findings []Finding `json:"findings"`
}

func (r *SecurityReport) add(sev, typ, resource, desc string) {
	r.Findings = append(r.Findings, Finding{sev, typ, resource, desc})
	switch sev {
	case SevCritical:
		r.Critical++
	case SevHigh:
		r.High++
	case SevMedium:
		r.Medium++
	case SevLow:
		r.Low++
	}
}

// dangerousCaps are Linux capabilities that can lead to node escape.
var dangerousCaps = map[string]bool{
	"SYS_ADMIN": true, "SYS_PTRACE": true, "SYS_MODULE": true,
	"NET_ADMIN": true, "NET_RAW": true, "SYS_RAWIO": true,
	"DAC_OVERRIDE": true, "SETUID": true, "SETGID": true,
}

// sensitiveResources are K8s API groups/resources that grant broad control.
var sensitiveResources = map[string]bool{
	"secrets": true, "pods": true, "deployments": true,
	"clusterroles": true, "clusterrolebindings": true,
	"rolebindings": true, "nodes": true,
}

// systemPrefixes identifies built-in K8s subjects that are expected to have broad permissions.
var systemPrefixes = []string{
	"system:", "kube-", "eks-", "aws-", "calico", "coredns",
	"metrics-server", "cluster-autoscaler", "cert-manager",
	"ingress-nginx", "guardmap",
}

func isSystemSubject(name string) bool {
	name = strings.ToLower(name)
	for _, pfx := range systemPrefixes {
		if strings.HasPrefix(name, pfx) || strings.Contains(name, pfx) {
			return true
		}
	}
	return false
}

// ScanSecurity runs all K8s + IAM security checks against a snapshot and graph.
func ScanSecurity(snap *ClusterSnapshot, graph *models.GraphData) *SecurityReport {
	r := &SecurityReport{}

	scanPodSecurity(snap, r)
	scanRBAC(snap, r)
	scanNetworkPolicies(snap, r)
	scanIAMGraph(graph, r)

	return r
}

// ── Pod / Container checks ────────────────────────────────────────────────────

func scanPodSecurity(snap *ClusterSnapshot, r *SecurityReport) {
	// Track which namespaces have pods (used for netpol check)
	namespacesWithPods := map[string]bool{}

	for _, pod := range snap.Pods {
		// Skip system/infrastructure pods
		if isSystemSubject(pod.Namespace) || isSystemSubject(pod.Name) {
			continue
		}
		ns := pod.Namespace
		name := pod.Name
		ref := ns + "/" + name
		namespacesWithPods[ns] = true

		spec := pod.Spec

		// ── Critical ─────────────────────────────────────────────────────────

		if spec.HostPID {
			r.add(SevCritical, "host_pid", ref,
				"Pod shares host PID namespace — can inspect/kill any process on the node")
		}
		if spec.HostNetwork {
			r.add(SevCritical, "host_network", ref,
				"Pod shares host network namespace — can sniff/intercept node-level traffic")
		}
		if spec.HostIPC {
			r.add(SevCritical, "host_ipc", ref,
				"Pod shares host IPC namespace — can access shared memory of all node processes")
		}

		for _, c := range append(spec.InitContainers, spec.Containers...) {
			cref := ref + "/" + c.Name
			sc := c.SecurityContext

			if sc != nil && sc.Privileged != nil && *sc.Privileged {
				r.add(SevCritical, "privileged_container", cref,
					"Container runs in privileged mode — full host access, equivalent to root on node")
			}

			if sc != nil && sc.Capabilities != nil {
				for _, cap := range sc.Capabilities.Add {
					if dangerousCaps[string(cap)] {
						sev := SevHigh
						if string(cap) == "SYS_ADMIN" || string(cap) == "SYS_MODULE" {
							sev = SevCritical
						}
						r.add(sev, "dangerous_capability", cref,
							"Container has capability "+string(cap)+" which can be exploited for privilege escalation")
					}
				}
			}

			// ── High ─────────────────────────────────────────────────────────

			// allowPrivilegeEscalation defaults to true — must be explicitly false
			if sc == nil || sc.AllowPrivilegeEscalation == nil || *sc.AllowPrivilegeEscalation {
				r.add(SevHigh, "privilege_escalation_allowed", cref,
					"allowPrivilegeEscalation not set to false — container can gain more privileges at runtime")
			}

			// Running as root
			runAsRoot := false
			if sc == nil {
				runAsRoot = true
			} else if sc.RunAsNonRoot == nil || !*sc.RunAsNonRoot {
				if sc.RunAsUser == nil || *sc.RunAsUser == 0 {
					runAsRoot = true
				}
			}
			if runAsRoot {
				r.add(SevHigh, "runs_as_root", cref,
					"Container may run as root (UID 0) — increases blast radius of any container escape")
			}

			// ── Medium ───────────────────────────────────────────────────────

			// No resource limits
			if c.Resources.Limits == nil ||
				(c.Resources.Limits.Cpu().IsZero() && c.Resources.Limits.Memory().IsZero()) {
				r.add(SevMedium, "no_resource_limits", cref,
					"No CPU/memory limits — container can exhaust node resources (DoS risk)")
			}

			// Latest or untagged image
			img := c.Image
			if img != "" {
				tag := ""
				if idx := strings.LastIndex(img, ":"); idx >= 0 && !strings.Contains(img[idx:], "/") {
					tag = img[idx+1:]
				}
				if tag == "" || tag == "latest" {
					r.add(SevMedium, "unpinned_image", cref,
						"Image uses :latest or has no tag — unpredictable deployments, possible supply-chain risk")
				}
			}

			// ── Low ──────────────────────────────────────────────────────────

			// readOnlyRootFilesystem not enforced
			if sc == nil || sc.ReadOnlyRootFilesystem == nil || !*sc.ReadOnlyRootFilesystem {
				r.add(SevLow, "writable_root_fs", cref,
					"Root filesystem is writable — attacker can modify binaries or write malware")
			}

			// No resource requests
			if c.Resources.Requests == nil ||
				(c.Resources.Requests.Cpu().IsZero() && c.Resources.Requests.Memory().IsZero()) {
				r.add(SevLow, "no_resource_requests", cref,
					"No CPU/memory requests — scheduler cannot make optimal placement decisions")
			}

			// No liveness probe
			if c.LivenessProbe == nil {
				r.add(SevLow, "no_liveness_probe", cref,
					"No liveness probe — unhealthy containers won't be automatically restarted")
			}
		}

		// hostPath volumes
		for _, v := range spec.Volumes {
			if v.HostPath != nil {
				r.add(SevHigh, "host_path_mount", ref+"/"+v.Name,
					"Volume mounts host path "+v.HostPath.Path+" — container can read/write host filesystem")
			}
		}
	}

	// Namespaces with pods but no NetworkPolicy → medium
	namespacesWithNetpol := map[string]bool{}
	for _, np := range snap.NetworkPolicies {
		namespacesWithNetpol[np.Namespace] = true
	}
	for ns := range namespacesWithPods {
		if !namespacesWithNetpol[ns] && !isSystemSubject(ns) {
			r.add(SevMedium, "no_network_policy", ns,
				"Namespace has no NetworkPolicy — all pods can communicate with each other and cluster-wide")
		}
	}
}

// ── RBAC checks ───────────────────────────────────────────────────────────────

func scanRBAC(snap *ClusterSnapshot, r *SecurityReport) {
	// Build set of ClusterRole names that are overly permissive
	dangerousRoles := map[string]bool{}

	for _, cr := range snap.ClusterRoles {
		if isSystemSubject(cr.Name) {
			continue
		}
		for _, rule := range cr.Rules {
			if hasWildcard(rule.Verbs) && hasWildcard(rule.Resources) {
				dangerousRoles[cr.Name] = true
				r.add(SevCritical, "wildcard_clusterrole", cr.Name,
					"ClusterRole grants wildcard verbs on wildcard resources — cluster-admin equivalent")
				break
			}
			for _, res := range rule.Resources {
				if sensitiveResources[res] && hasWildcard(rule.Verbs) {
					r.add(SevHigh, "wildcard_sensitive_resource", cr.Name,
						"ClusterRole grants wildcard verbs on "+res+" — can read secrets / escalate privileges")
			break
				}
			}
		}
	}

	// ClusterRoleBindings: cluster-admin or dangerous role bound to non-system subjects
	for _, crb := range snap.ClusterRoleBindings {
		if crb.RoleRef.Name == "cluster-admin" || dangerousRoles[crb.RoleRef.Name] {
			for _, subj := range crb.Subjects {
				if isSystemSubject(subj.Name) || isSystemSubject(subj.Namespace) {
					continue
				}
				ref := crb.Name + "/" + subj.Kind + "/" + subj.Name
				r.add(SevCritical, "cluster_admin_binding", ref,
					subj.Kind+" '"+subj.Name+"' has cluster-admin (or equivalent) — full cluster control")
			}
		}
	}

	// RoleBindings that bind cluster-admin or wildcard roles to default SA
	for _, rb := range snap.RoleBindings {
		if isSystemSubject(rb.Namespace) {
			continue
		}
		for _, subj := range rb.Subjects {
			if subj.Kind == "ServiceAccount" && subj.Name == "default" {
				r.add(SevHigh, "default_sa_role_binding", rb.Namespace+"/"+rb.Name,
					"'default' ServiceAccount is bound to role '"+rb.RoleRef.Name+"' — pods without explicit SA inherit these permissions")
			}
		}
	}
}

func hasWildcard(ss []string) bool {
	for _, s := range ss {
		if s == "*" {
			return true
		}
	}
	return false
}

// ── Network policy checks ─────────────────────────────────────────────────────

func scanNetworkPolicies(snap *ClusterSnapshot, r *SecurityReport) {
	// Flag NetworkPolicies that allow all ingress/egress (effectively no policy)
	for _, np := range snap.NetworkPolicies {
		if isSystemSubject(np.Namespace) {
			continue
		}
		for _, ing := range np.Spec.Ingress {
			// Empty From = allow all sources
			if len(ing.From) == 0 && len(ing.Ports) == 0 {
				r.add(SevMedium, "allow_all_ingress", np.Namespace+"/"+np.Name,
					"NetworkPolicy allows all ingress traffic — provides no isolation")
			}
		}
		for _, eg := range np.Spec.Egress {
			if len(eg.To) == 0 && len(eg.Ports) == 0 {
				r.add(SevMedium, "allow_all_egress", np.Namespace+"/"+np.Name,
					"NetworkPolicy allows all egress traffic — pods can reach any endpoint")
			}
		}
	}
}

// ── IAM / IRSA graph checks ───────────────────────────────────────────────────

func scanIAMGraph(graph *models.GraphData, r *SecurityReport) {
	for _, e := range graph.Edges {
		switch e.AccessLevel {
		case models.AccessFull:
			r.add(SevCritical, "iam_wildcard_access", e.Source+"→"+e.Target,
				"IAM role grants full/wildcard access — can perform any action on the AWS service")
		case models.AccessWrite:
			r.add(SevHigh, "iam_write_access", e.Source+"→"+e.Target,
				"IAM role grants write access — can modify or delete cloud resources")
		}
	}
}

// ── ServiceAccount automount check ───────────────────────────────────────────

func init() {
	// register post-scan SA check as part of pod scan (called explicitly)
	_ = corev1.Pod{}    // ensure import used
	_ = rbacv1.Role{}
}
