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
	scanServices(snap, r)
	scanIAMGraph(graph, r)
	scanBatchResources(snap, r)

	return r
}

// ── Pod / Container checks ────────────────────────────────────────────────────
// Covers: CIS 5.2.x, MITRE T1610/T1611/T1548/T1525/T1552/T1499, NSA/CISA Pod hardening

func scanPodSecurity(snap *ClusterSnapshot, r *SecurityReport) {
	namespacesWithPods := map[string]bool{}

	// Build set of IRSA-enabled service accounts (used for double-token exposure check)
	irsaSAs := map[string]bool{}
	for key, sa := range snap.ServiceAccounts {
		if _, ok := sa.Annotations["eks.amazonaws.com/role-arn"]; ok {
			irsaSAs[key] = true
		}
	}

	for _, pod := range snap.Pods {
		if isSystemSubject(pod.Namespace) || isSystemSubject(pod.Name) {
			continue
		}
		ns   := pod.Namespace
		name := pod.Name
		ref  := ns + "/" + name
		namespacesWithPods[ns] = true
		spec := pod.Spec

		// ── Critical: host namespace sharing ─────────────────────────────────
		// CIS 5.2.2 / MITRE T1611
		if spec.HostPID {
			r.add(SevCritical, "host_pid", ref,
				"Pod shares host PID namespace — can inspect/kill any process on the node")
		}
		// CIS 5.2.4 / MITRE T1611
		if spec.HostNetwork {
			r.add(SevCritical, "host_network", ref,
				"Pod shares host network namespace — can sniff/intercept node-level traffic")
		}
		// CIS 5.2.3 / MITRE T1611
		if spec.HostIPC {
			r.add(SevCritical, "host_ipc", ref,
				"Pod shares host IPC namespace — can access shared memory of all node processes")
		}

		// ── Container-level checks ────────────────────────────────────────────
		for _, c := range append(spec.InitContainers, spec.Containers...) {
			cref := ref + "/" + c.Name
			sc   := c.SecurityContext

			// CIS 5.2.1 / MITRE T1610
			if sc != nil && sc.Privileged != nil && *sc.Privileged {
				r.add(SevCritical, "privileged_container", cref,
					"Container runs in privileged mode — full host access, equivalent to root on node")
			}

			// CIS 5.2.8 / MITRE T1548 — dangerous capabilities
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

				// CIS 5.2.8 ext — not dropping ALL capabilities before adding
				dropAll := false
				for _, cap := range sc.Capabilities.Drop {
					if string(cap) == "ALL" {
						dropAll = true
						break
					}
				}
				if !dropAll {
					r.add(SevLow, "no_drop_all_caps", cref,
						"Container does not drop ALL capabilities — best practice is drop: [ALL] then add only what is needed")
				}
			} else {
				// No capabilities section at all — not explicitly dropping anything
				r.add(SevLow, "no_drop_all_caps", cref,
					"Container has no capabilities.drop: [ALL] — Linux capabilities are inherited from the default set")
			}

			// CIS 5.2.5 / MITRE T1548
			if sc == nil || sc.AllowPrivilegeEscalation == nil || *sc.AllowPrivilegeEscalation {
				r.add(SevHigh, "privilege_escalation_allowed", cref,
					"allowPrivilegeEscalation not set to false — container can gain more privileges at runtime")
			}

			// CIS 5.2.6 / MITRE T1548
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

			// CIS 5.2.13 / MITRE T1499
			if c.Resources.Limits == nil ||
				(c.Resources.Limits.Cpu().IsZero() && c.Resources.Limits.Memory().IsZero()) {
				r.add(SevMedium, "no_resource_limits", cref,
					"No CPU/memory limits — container can exhaust node resources (DoS risk)")
			}

			// MITRE T1525 — unpinned image
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

			// CIS 5.4.1 / MITRE T1552 — secrets as env vars
			for _, env := range c.Env {
				if env.ValueFrom != nil && env.ValueFrom.SecretKeyRef != nil {
					r.add(SevMedium, "secret_as_env", cref,
						"Secret '"+env.ValueFrom.SecretKeyRef.Name+"' is exposed as an environment variable — visible in /proc, may appear in logs or crash dumps")
					break
				}
			}

			// OWASP K08 / MITRE T1552 — plaintext credential in env var literal
			for _, env := range c.Env {
				if env.ValueFrom != nil || env.Value == "" {
					continue
				}
				lower := strings.ToLower(env.Name)
				if strings.Contains(lower, "password") || strings.Contains(lower, "passwd") ||
					strings.Contains(lower, "secret") || strings.Contains(lower, "token") ||
					strings.Contains(lower, "api_key") || strings.Contains(lower, "apikey") ||
					strings.Contains(lower, "credential") {
					r.add(SevHigh, "sensitive_env_plaintext", cref,
						"Environment variable '"+env.Name+"' appears to contain a credential and is set as a plaintext literal — use a Kubernetes Secret reference instead")
					break
				}
			}

			// NSA/CISA / MITRE T1525 — image pulled from a public registry
			if img != "" {
				if strings.HasPrefix(img, "docker.io/") || strings.HasPrefix(img, "ghcr.io/") || strings.HasPrefix(img, "quay.io/") {
					reg := strings.SplitN(img, "/", 2)[0]
					r.add(SevLow, "public_registry_image", cref,
						"Image pulled from public registry '"+reg+"' — consider using a private registry with vulnerability scanning")
				}
			}

			// CIS 5.2.12
			if sc == nil || sc.ReadOnlyRootFilesystem == nil || !*sc.ReadOnlyRootFilesystem {
				r.add(SevLow, "writable_root_fs", cref,
					"Root filesystem is writable — attacker can modify binaries or write malware")
			}

			if c.Resources.Requests == nil ||
				(c.Resources.Requests.Cpu().IsZero() && c.Resources.Requests.Memory().IsZero()) {
				r.add(SevLow, "no_resource_requests", cref,
					"No CPU/memory requests — scheduler cannot make optimal placement decisions")
			}

			if c.LivenessProbe == nil {
				r.add(SevLow, "no_liveness_probe", cref,
					"No liveness probe — unhealthy containers won't be automatically restarted")
			}

			if c.ReadinessProbe == nil {
				r.add(SevLow, "no_readiness_probe", cref,
					"No readiness probe — traffic may be sent to containers that are not yet ready")
			}

			// CIS 5.2.10 — hostPort binding
			for _, port := range c.Ports {
				if port.HostPort > 0 {
					r.add(SevLow, "host_port", cref,
						"Container binds to a hostPort — bypasses NetworkPolicy enforcement and is directly accessible on all cluster nodes")
					break
				}
			}
		}

		// ── hostPath volumes ──────────────────────────────────────────────────
		// CIS 5.2.9 / MITRE T1611
		for _, v := range spec.Volumes {
			if v.HostPath != nil {
				r.add(SevHigh, "host_path_mount", ref+"/"+v.Name,
					"Volume mounts host path "+v.HostPath.Path+" — container can read/write host filesystem")
			}
		}

		// ── Pod-level security context ────────────────────────────────────────

		// CIS 5.2.7 — no seccomp profile
		if spec.SecurityContext == nil || spec.SecurityContext.SeccompProfile == nil {
			r.add(SevMedium, "no_seccomp_profile", ref,
				"Pod has no seccompProfile — containers run with unconfined seccomp, all syscalls are permitted")
		}

		// CIS 5.1.6 / MITRE T1552 — default SA with token automount
		if spec.AutomountServiceAccountToken == nil || *spec.AutomountServiceAccountToken {
			sa := spec.ServiceAccountName
			if sa == "" || sa == "default" {
				r.add(SevMedium, "automount_default_sa_token", ref,
					"Pod uses the default ServiceAccount with SA token automounted — unnecessary Kubernetes API access")
			}
		}

		// AWS EKS BP — IRSA SA still automounting K8s token (double credential exposure)
		saName := spec.ServiceAccountName
		if saName == "" {
			saName = "default"
		}
		if irsaSAs[ns+"/"+saName] {
			if spec.AutomountServiceAccountToken == nil || *spec.AutomountServiceAccountToken {
				r.add(SevMedium, "irsa_automount_token", ref,
					"Pod uses an IRSA-enabled ServiceAccount but still automounts the Kubernetes SA token — both AWS and K8s API credentials are exposed inside the container")
			}
		}

		// NSA/CISA — workload deployed in the default namespace
		if ns == "default" {
			r.add(SevLow, "default_namespace_workload", ref,
				"Workload deployed in the 'default' namespace — use dedicated namespaces for workload isolation and NetworkPolicy enforcement")
		}
	}

	// AWS EKS BP — IRSA-annotated SA with no running pod (orphaned credential)
	podSAs := map[string]bool{}
	for _, pod := range snap.Pods {
		sa := pod.Spec.ServiceAccountName
		if sa == "" {
			sa = "default"
		}
		podSAs[pod.Namespace+"/"+sa] = true
	}
	for key := range irsaSAs {
		if !podSAs[key] {
			r.add(SevLow, "sa_unused_irsa", key,
				"ServiceAccount has an IRSA annotation but no running pod is using it — the IAM trust relationship is active but unused, an unnecessary attack surface")
		}
	}

	// Namespaces with pods but no NetworkPolicy — NSA/CISA
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
// Covers: CIS 5.1.x, MITRE T1068, NSA/CISA RBAC hardening

func scanRBAC(snap *ClusterSnapshot, r *SecurityReport) {
	dangerousRoles := map[string]bool{}

	for _, cr := range snap.ClusterRoles {
		if isSystemSubject(cr.Name) {
			continue
		}
		for _, rule := range cr.Rules {
			// CIS 5.1.1 — wildcard verbs + wildcard resources = cluster-admin equivalent
			if hasWildcard(rule.Verbs) && hasWildcard(rule.Resources) {
				dangerousRoles[cr.Name] = true
				r.add(SevCritical, "wildcard_clusterrole", cr.Name,
					"ClusterRole grants wildcard verbs on wildcard resources — cluster-admin equivalent")
				break
			}
			// CIS 5.1.2 — wildcard verbs on sensitive resources
			for _, res := range rule.Resources {
				if sensitiveResources[res] && hasWildcard(rule.Verbs) {
					r.add(SevHigh, "wildcard_sensitive_resource", cr.Name,
						"ClusterRole grants wildcard verbs on "+res+" — can read secrets / escalate privileges")
					break
				}
			}
		}
	}

	// CIS 5.1.2 — cluster-admin or dangerous role bound to non-system subjects
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

	// CIS 5.1.7 / MITRE T1068 — system:masters group (bypasses all RBAC)
	for _, crb := range snap.ClusterRoleBindings {
		for _, subj := range crb.Subjects {
			if subj.Kind == "Group" && subj.Name == "system:masters" {
				r.add(SevCritical, "system_masters_binding", crb.Name,
					"ClusterRoleBinding includes the system:masters group — members bypass all RBAC authorization and have full cluster control")
			}
		}
	}

	// CIS 5.1.5 — default SA bound to a role
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

	// CIS 5.1.3 / MITRE T1068 — escalate / bind / impersonate verbs
	escalateVerbs := map[string]bool{"escalate": true, "bind": true, "impersonate": true}
	for _, cr := range snap.ClusterRoles {
		if isSystemSubject(cr.Name) {
			continue
		}
		found := ""
	nextCR:
		for _, rule := range cr.Rules {
			for _, verb := range rule.Verbs {
				if escalateVerbs[verb] {
					found = verb
					break nextCR
				}
			}
		}
		if found != "" {
			r.add(SevCritical, "rbac_escalate_verb", cr.Name,
				"ClusterRole grants '"+found+"' verb — allows bypassing RBAC to obtain arbitrary cluster permissions")
		}
	}

	// CIS 5.1.4 / MITRE T1610 — ClusterRole can create/patch pods (can bypass Pod Security)
	for _, cr := range snap.ClusterRoles {
		if isSystemSubject(cr.Name) {
			continue
		}
		canCreatePods := false
	checkCreatePods:
		for _, rule := range cr.Rules {
			hasPodResource := false
			for _, res := range rule.Resources {
				if res == "pods" || res == "*" {
					hasPodResource = true
					break
				}
			}
			if !hasPodResource {
				continue
			}
			for _, verb := range rule.Verbs {
				if verb == "create" || verb == "update" || verb == "patch" || verb == "*" {
					canCreatePods = true
					break checkCreatePods
				}
			}
		}
		if canCreatePods {
			r.add(SevMedium, "create_pods_perm", cr.Name,
				"ClusterRole can create or patch Pods — can be abused to spawn a privileged pod and bypass Pod Security Standards")
		}
	}

	// CIS 5.1.9 — RBAC access to persistent volumes (can read PVC data cross-namespace)
	for _, cr := range snap.ClusterRoles {
		if isSystemSubject(cr.Name) {
			continue
		}
		for _, rule := range cr.Rules {
			hasPV := false
			for _, res := range rule.Resources {
				if res == "persistentvolumes" || res == "persistentvolumeclaims" {
					hasPV = true
					break
				}
			}
			if hasPV && hasWildcard(rule.Verbs) {
				r.add(SevMedium, "wildcard_pv_access", cr.Name,
					"ClusterRole grants wildcard access to PersistentVolumes — can read or overwrite persistent data across namespaces")
				break
			}
		}
	}

	// CIS 5.1.2 / MITRE T1552 — explicit (non-wildcard) read access to secrets
	for _, cr := range snap.ClusterRoles {
		if isSystemSubject(cr.Name) {
			continue
		}
		for _, rule := range cr.Rules {
			hasSecrets := false
			for _, res := range rule.Resources {
				if res == "secrets" {
					hasSecrets = true
					break
				}
			}
			if !hasSecrets || hasWildcard(rule.Verbs) {
				continue // wildcard already caught by wildcard_sensitive_resource
			}
			hasRead := false
			for _, verb := range rule.Verbs {
				if verb == "get" || verb == "list" || verb == "watch" {
					hasRead = true
					break
				}
			}
			if hasRead {
				r.add(SevMedium, "rbac_get_secrets", cr.Name,
					"ClusterRole can read or list Secrets — read access to secrets exposes all secret values in every namespace cluster-wide")
				break
			}
		}
	}

	// CIS 5.1.1 / MITRE T1609 — pods/exec or pods/attach
	for _, cr := range snap.ClusterRoles {
		if isSystemSubject(cr.Name) {
			continue
		}
		found := ""
	checkExec:
		for _, rule := range cr.Rules {
			for _, res := range rule.Resources {
				if res == "pods/exec" || res == "pods/attach" || res == "pods/portforward" {
					found = res
					break checkExec
				}
			}
		}
		if found != "" {
			r.add(SevHigh, "rbac_exec_pods", cr.Name,
				"ClusterRole grants '"+found+"' — allows interactive shell access and arbitrary code execution inside running containers")
		}
	}

	// CIS 5.1.1 / MITRE T1613 — explicit access to nodes resource
	for _, cr := range snap.ClusterRoles {
		if isSystemSubject(cr.Name) {
			continue
		}
		found := ""
	checkNodes:
		for _, rule := range cr.Rules {
			if hasWildcard(rule.Resources) {
				continue // already caught by wildcard_clusterrole / wildcard_sensitive_resource
			}
			for _, res := range rule.Resources {
				if res == "nodes" || res == "nodes/stats" || res == "nodes/proxy" || res == "nodes/log" {
					found = res
					break checkNodes
				}
			}
		}
		if found != "" {
			r.add(SevHigh, "rbac_nodes_access", cr.Name,
				"ClusterRole grants access to '"+found+"' — can enumerate node metadata and may enable host-level attacks")
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
// Covers: NSA/CISA network isolation

func scanNetworkPolicies(snap *ClusterSnapshot, r *SecurityReport) {
	for _, np := range snap.NetworkPolicies {
		if isSystemSubject(np.Namespace) {
			continue
		}
		for _, ing := range np.Spec.Ingress {
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

// ── Service exposure checks ───────────────────────────────────────────────────
// Covers: CIS 5.3.x, NSA/CISA network surface reduction

func scanServices(snap *ClusterSnapshot, r *SecurityReport) {
	for _, svc := range snap.Services {
		if isSystemSubject(svc.Namespace) || isSystemSubject(svc.Name) {
			continue
		}
		switch svc.Spec.Type {
		case corev1.ServiceTypeNodePort:
			// NSA/CISA — NodePort exposes service on every cluster node
			r.add(SevLow, "node_port_service", svc.Namespace+"/"+svc.Name,
				"Service uses type NodePort — accessible on all cluster nodes, bypasses external firewall rules")

		case corev1.ServiceTypeLoadBalancer:
			// NSA/CISA — LoadBalancer may provision a public IP
			isInternal := false
			for k, v := range svc.Annotations {
				if strings.Contains(k, "internal") || strings.Contains(v, "internal") {
					isInternal = true
					break
				}
			}
			if !isInternal {
				r.add(SevMedium, "public_loadbalancer", svc.Namespace+"/"+svc.Name,
					"Service uses type LoadBalancer without internal annotation — may provision a publicly accessible IP address")
			}
		}
	}
}

// ── IAM / IRSA graph checks ───────────────────────────────────────────────────
// Covers: AWS EKS Best Practices, MITRE T1078/T1530/T1619

func scanIAMGraph(graph *models.GraphData, r *SecurityReport) {
	// Per-edge access level checks
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

	// AWS EKS BP — same IAM role used by prod and non-prod namespaces
	roleNs := map[string][]string{}
	for _, e := range graph.Edges {
		if strings.HasPrefix(e.Source, "sa:") && strings.HasPrefix(e.Target, "role:") {
			parts := strings.SplitN(strings.TrimPrefix(e.Source, "sa:"), "/", 2)
			if len(parts) == 2 {
				roleNs[e.Target] = append(roleNs[e.Target], parts[0])
			}
		}
	}
	prodPats  := []string{"prod", "production"}
	stagePats := []string{"staging", "stage", "dev", "development", "test"}
	for roleId, nsList := range roleNs {
		hasProd, hasStage := false, false
		for _, ns := range nsList {
			ns = strings.ToLower(ns)
			for _, p := range prodPats  { if strings.Contains(ns, p) { hasProd = true } }
			for _, p := range stagePats { if strings.Contains(ns, p) { hasStage = true } }
		}
		if hasProd && hasStage {
			r.add(SevHigh, "shared_role_cross_env", roleId,
				"IAM role shared between production and non-production namespaces — cross-environment blast radius if compromised")
		}
	}

	// AWS EKS BP / MITRE T1078 — IAM role with broad access to 3+ AWS services
	type roleAccess struct{ full, write int }
	roleServices := map[string]*roleAccess{}
	for _, e := range graph.Edges {
		if !strings.HasPrefix(e.Source, "role:") { continue }
		if e.AccessLevel != models.AccessFull && e.AccessLevel != models.AccessWrite { continue }
		if _, ok := roleServices[e.Source]; !ok {
			roleServices[e.Source] = &roleAccess{}
		}
		if e.AccessLevel == models.AccessFull {
			roleServices[e.Source].full++
		} else {
			roleServices[e.Source].write++
		}
	}
	for roleId, acc := range roleServices {
		if acc.full+acc.write >= 3 {
			r.add(SevHigh, "iam_broad_access", roleId,
				"IAM role has write or full access to 3 or more AWS services — overly broad permissions increase blast radius on compromise")
		}
	}
}

// ── Batch resource checks ─────────────────────────────────────────────────────
// Covers: NSA/CISA workload hardening, K8s best practices

func scanBatchResources(snap *ClusterSnapshot, r *SecurityReport) {
	// Job TTL: completed jobs accumulate without ttlSecondsAfterFinished
	for _, job := range snap.Jobs {
		if isSystemSubject(job.Namespace) {
			continue
		}
		if job.Spec.TTLSecondsAfterFinished == nil {
			r.add(SevLow, "job_no_ttl", job.Namespace+"/"+job.Name,
				"Job has no ttlSecondsAfterFinished — completed jobs accumulate and consume etcd resources")
		}
	}

	// CronJob concurrencyPolicy: Allow — concurrent runs can pile up
	for _, cj := range snap.CronJobs {
		if isSystemSubject(cj.Namespace) {
			continue
		}
		cp := string(cj.Spec.ConcurrencyPolicy)
		if cp == "" || cp == "Allow" {
			r.add(SevMedium, "cj_concurrent_allow", cj.Namespace+"/"+cj.Name,
				"CronJob has concurrencyPolicy: Allow — if a run takes longer than the schedule interval, concurrent runs pile up and exhaust cluster resources")
		}
	}

	// NSA/CISA — CronJob without startingDeadlineSeconds
	for _, cj := range snap.CronJobs {
		if isSystemSubject(cj.Namespace) {
			continue
		}
		if cj.Spec.StartingDeadlineSeconds == nil {
			r.add(SevLow, "cj_missing_deadline", cj.Namespace+"/"+cj.Name,
				"CronJob has no startingDeadlineSeconds — if the controller misses >100 schedules, Kubernetes permanently stops creating new jobs for this CronJob")
		}
	}
}

func init() {
	_ = corev1.Pod{}
	_ = rbacv1.Role{}
}
