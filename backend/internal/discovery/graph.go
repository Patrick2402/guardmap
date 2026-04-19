package discovery

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	rbacv1 "k8s.io/api/rbac/v1"

	"guardmap/internal/models"
)

type GraphBuilder struct {
	k8s *K8sDiscovery
	iam *IAMDiscovery
}

func NewGraphBuilder(k8s *K8sDiscovery, iam *IAMDiscovery) *GraphBuilder {
	return &GraphBuilder{k8s: k8s, iam: iam}
}

// workloadRef identifies a K8s workload controller.
type workloadRef struct {
	kind string // "deployment" | "statefulset" | "daemonset" | "job" | "cronjob"
	ns   string
	name string
}

func (w workloadRef) nodeID() string {
	switch w.kind {
	case "deployment":
		return fmt.Sprintf("deploy:%s/%s", w.ns, w.name)
	case "statefulset":
		return fmt.Sprintf("ss:%s/%s", w.ns, w.name)
	case "daemonset":
		return fmt.Sprintf("ds:%s/%s", w.ns, w.name)
	case "job":
		return fmt.Sprintf("job:%s/%s", w.ns, w.name)
	case "cronjob":
		return fmt.Sprintf("cj:%s/%s", w.ns, w.name)
	}
	return ""
}

func (w workloadRef) nodeType() models.NodeType {
	switch w.kind {
	case "statefulset":
		return models.NodeTypeStatefulSet
	case "daemonset":
		return models.NodeTypeDaemonSet
	case "job":
		return models.NodeTypeJob
	case "cronjob":
		return models.NodeTypeCronJob
	default:
		return models.NodeTypeDeployment
	}
}

func (g *GraphBuilder) Build(ctx context.Context) (*models.GraphData, error) {
	snap, err := g.k8s.DiscoverCluster(ctx)
	if err != nil {
		return nil, fmt.Errorf("k8s discovery: %w", err)
	}

	nodeSet := make(map[string]models.Node)
	var edges []models.Edge
	edgeIdx := 0
	newEdge := func(src, tgt, label string, al models.AccessLevel, actions []string) {
		edges = append(edges, models.Edge{
			ID:          fmt.Sprintf("e%d", edgeIdx),
			Source:      src,
			Target:      tgt,
			Label:       label,
			AccessLevel: al,
			Actions:     actions,
		})
		edgeIdx++
	}

	// ── Build pod→workload mapping via owner references ───────────────────────
	// ReplicaSet UID → Deployment (namespace, name)
	rsOwner := make(map[string]struct{ ns, name string })
	for _, rs := range snap.ReplicaSets {
		for _, owner := range rs.OwnerReferences {
			if owner.Kind == "Deployment" {
				rsOwner[string(rs.UID)] = struct{ ns, name string }{rs.Namespace, owner.Name}
			}
		}
	}

	// Job UID → Job ref (for pod→Job lookup)
	jobByUID := make(map[string]struct{ ns, name string })
	for _, job := range snap.Jobs {
		jobByUID[string(job.UID)] = struct{ ns, name string }{job.Namespace, job.Name}
	}

	// Pod key ("ns/name") → workloadRef
	podWorkload := make(map[string]workloadRef)
	for _, pod := range snap.Pods {
		key := pod.Namespace + "/" + pod.Name
		for _, owner := range pod.OwnerReferences {
			switch owner.Kind {
			case "ReplicaSet":
				if depl, ok := rsOwner[string(owner.UID)]; ok {
					podWorkload[key] = workloadRef{"deployment", depl.ns, depl.name}
				}
			case "StatefulSet":
				podWorkload[key] = workloadRef{"statefulset", pod.Namespace, owner.Name}
			case "DaemonSet":
				podWorkload[key] = workloadRef{"daemonset", pod.Namespace, owner.Name}
			case "Job":
				if jInfo, ok := jobByUID[string(owner.UID)]; ok {
					podWorkload[key] = workloadRef{"job", jInfo.ns, jInfo.name}
				}
			}
		}
	}

	// ── IRSA chain ────────────────────────────────────────────────────────────
	bindings := IRSABindingsFromSnapshot(snap)
	roleCache := make(map[string]*ResolvedRole)

	for _, b := range bindings {
		podID  := fmt.Sprintf("pod:%s/%s", b.PodNamespace, b.PodName)
		saID   := fmt.Sprintf("sa:%s/%s", b.PodNamespace, b.ServiceAccount)
		roleID := fmt.Sprintf("role:%s", b.RoleARN)

		// Pod node
		nodeSet[podID] = models.Node{
			ID:        podID,
			Type:      models.NodeTypePod,
			Label:     b.PodName,
			Namespace: b.PodNamespace,
			Metadata:  map[string]string{"uid": b.PodUID, "nodeName": b.NodeName},
		}

		// SA node
		nodeSet[saID] = models.Node{
			ID:        saID,
			Type:      models.NodeTypeServiceAccount,
			Label:     b.ServiceAccount,
			Namespace: b.PodNamespace,
		}

		// Workload → Pod  (manages)
		wl, hasWL := podWorkload[b.PodNamespace+"/"+b.PodName]
		if hasWL {
			wlID := wl.nodeID()
			replicas := workloadReplicas(snap, wl)
			nodeSet[wlID] = models.Node{
				ID:        wlID,
				Type:      wl.nodeType(),
				Label:     wl.name,
				Namespace: wl.ns,
				Metadata:  map[string]string{"replicas": replicas},
			}
			newEdge(wlID, podID, "manages", "", nil)
		}

		// Pod → SA
		newEdge(podID, saID, "uses", "", nil)

		// Resolve IAM role (cached)
		resolved, ok := roleCache[b.RoleARN]
		if !ok {
			resolved, err = g.iam.ResolveRole(ctx, b.RoleARN)
			if err != nil {
				nodeSet[roleID] = models.Node{
					ID:   roleID,
					Type: models.NodeTypeIAMRole,
					Label: roleNameFromARN(b.RoleARN),
					Metadata: map[string]string{"arn": b.RoleARN, "error": err.Error()},
				}
				roleCache[b.RoleARN] = nil
				continue
			}
			roleCache[b.RoleARN] = resolved
		}
		if resolved == nil {
			continue
		}

		nodeSet[roleID] = models.Node{
			ID:    roleID,
			Type:  models.NodeTypeIAMRole,
			Label: resolved.RoleName,
			Metadata: map[string]string{"arn": b.RoleARN},
		}

		// SA → IAM Role  (IRSA →)
		newEdge(saID, roleID, "IRSA →", "", nil)

		// IAM Role → AWS Resources
		for _, stmt := range resolved.Statements {
			if stmt.Effect != "Allow" {
				continue
			}
			al := ClassifyAccess(stmt.Actions)
			for _, resource := range stmt.Resources {
				svcID := fmt.Sprintf("svc:%s", resource)
				nodeSet[svcID] = models.Node{
					ID:    svcID,
					Type:  models.NodeTypeAWSService,
					Label: ServiceFromARN(resource),
					Metadata: map[string]string{
						"arn":     resource,
						"service": serviceShortName(resource),
					},
				}
				newEdge(roleID, svcID, strings.Join(stmt.Actions, ", "), al, stmt.Actions)
			}
		}
	}

	// ── All pod nodes (regardless of IRSA) — always set rich metadata ───────
	for _, pod := range snap.Pods {
		id := fmt.Sprintf("pod:%s/%s", pod.Namespace, pod.Name)
		saName := pod.Spec.ServiceAccountName
		if saName == "" {
			saName = "default"
		}

		// Prefer spec image; fall back to resolved image from container status
		image := ""
		if len(pod.Spec.Containers) > 0 {
			image = pod.Spec.Containers[0].Image
		}
		if image == "" && len(pod.Status.ContainerStatuses) > 0 {
			image = pod.Status.ContainerStatuses[0].Image
		}
		cpuReq, cpuLim, memReq, memLim := containerResources(pod.Spec.Containers)

		var restarts int32
		for _, cs := range pod.Status.ContainerStatuses {
			restarts += cs.RestartCount
		}

		condition := ""
		for _, cond := range pod.Status.Conditions {
			if cond.Type == corev1.PodReady {
				if cond.Status == corev1.ConditionTrue {
					condition = "Ready"
				} else {
					condition = "NotReady"
				}
			}
		}

		// Also collect all container images as fallback display
		allImages := make([]string, 0, len(pod.Spec.Containers))
		for _, c := range pod.Spec.Containers {
			if c.Image != "" {
				allImages = append(allImages, c.Image)
			}
		}
		if len(allImages) == 0 {
			for _, cs := range pod.Status.ContainerStatuses {
				if cs.Image != "" {
					allImages = append(allImages, cs.Image)
				}
			}
		}
		if image == "" && len(allImages) > 0 {
			image = allImages[0]
		}

		meta := map[string]string{
			"nodeName":       pod.Spec.NodeName,
			"serviceAccount": saName,
			"phase":          string(pod.Status.Phase),
			"condition":      condition,
			"image":          image,
			"labels":         labelsToString(pod.Labels),
			"restarts":       fmt.Sprintf("%d", restarts),
			"containers":     fmt.Sprintf("%d", len(pod.Spec.Containers)),
		}
		if cpuReq != "" { meta["cpuRequest"] = cpuReq }
		if cpuLim != "" { meta["cpuLimit"]   = cpuLim }
		if memReq != "" { meta["memRequest"] = memReq }
		if memLim != "" { meta["memLimit"]   = memLim }

		// Preserve any existing fields (e.g. uid from IRSA path)
		if existing, ok := nodeSet[id]; ok {
			for k, v := range existing.Metadata {
				if _, alreadySet := meta[k]; !alreadySet {
					meta[k] = v
				}
			}
		}
		nodeSet[id] = models.Node{
			ID: id, Type: models.NodeTypePod, Label: pod.Name,
			Namespace: pod.Namespace, Metadata: meta,
		}

		// manages edge: workload → pod
		key := pod.Namespace + "/" + pod.Name
		if wl, ok := podWorkload[key]; ok {
			newEdge(wl.nodeID(), id, "manages", "", nil)
		}
	}

	// ── All workload nodes (always overwrite with full metadata) ─────────────
	for _, d := range snap.Deployments {
		id := fmt.Sprintf("deploy:%s/%s", d.Namespace, d.Name)
		replicas := "1"
		if d.Spec.Replicas != nil {
			replicas = fmt.Sprintf("%d", *d.Spec.Replicas)
		}
		available := fmt.Sprintf("%d", d.Status.AvailableReplicas)
		image := ""
		if len(d.Spec.Template.Spec.Containers) > 0 {
			image = d.Spec.Template.Spec.Containers[0].Image
		}
		cpuReq, cpuLim, memReq, memLim := containerResources(d.Spec.Template.Spec.Containers)
		strategy := string(d.Spec.Strategy.Type)
		selector := labelsToString(d.Spec.Selector.MatchLabels)
		meta := map[string]string{
			"replicas":  replicas,
			"available": available,
			"image":     image,
			"strategy":  strategy,
			"selector":  selector,
			"labels":    labelsToString(d.Spec.Template.Labels),
		}
		if cpuReq != "" { meta["cpuRequest"] = cpuReq }
		if cpuLim != "" { meta["cpuLimit"]   = cpuLim }
		if memReq != "" { meta["memRequest"] = memReq }
		if memLim != "" { meta["memLimit"]   = memLim }
		// preserve security flags set in previous pass
		if existing, ok := nodeSet[id]; ok {
			for _, k := range []string{"privileged","runAsRoot","hostPID","hostNetwork","hostPath"} {
				if v := existing.Metadata[k]; v != "" {
					meta[k] = v
				}
			}
		}
		nodeSet[id] = models.Node{ID: id, Type: models.NodeTypeDeployment, Label: d.Name, Namespace: d.Namespace, Metadata: meta}
	}

	for _, s := range snap.StatefulSets {
		id := fmt.Sprintf("ss:%s/%s", s.Namespace, s.Name)
		replicas := "1"
		if s.Spec.Replicas != nil {
			replicas = fmt.Sprintf("%d", *s.Spec.Replicas)
		}
		image := ""
		if len(s.Spec.Template.Spec.Containers) > 0 {
			image = s.Spec.Template.Spec.Containers[0].Image
		}
		cpuReq, cpuLim, memReq, memLim := containerResources(s.Spec.Template.Spec.Containers)
		storageClass, pvcSize := "", ""
		if len(s.Spec.VolumeClaimTemplates) > 0 {
			pvc := s.Spec.VolumeClaimTemplates[0]
			if q, ok := pvc.Spec.Resources.Requests[corev1.ResourceStorage]; ok {
				pvcSize = q.String()
			}
			if pvc.Spec.StorageClassName != nil {
				storageClass = *pvc.Spec.StorageClassName
			}
		}
		meta := map[string]string{
			"replicas":     replicas,
			"image":        image,
			"storageClass": storageClass,
			"pvc":          pvcSize,
			"labels":       labelsToString(s.Spec.Template.Labels),
		}
		if cpuReq != "" { meta["cpuRequest"] = cpuReq }
		if cpuLim != "" { meta["cpuLimit"]   = cpuLim }
		if memReq != "" { meta["memRequest"] = memReq }
		if memLim != "" { meta["memLimit"]   = memLim }
		if existing, ok := nodeSet[id]; ok {
			for _, k := range []string{"privileged","runAsRoot","hostPID","hostNetwork","hostPath"} {
				if v := existing.Metadata[k]; v != "" { meta[k] = v }
			}
		}
		nodeSet[id] = models.Node{ID: id, Type: models.NodeTypeStatefulSet, Label: s.Name, Namespace: s.Namespace, Metadata: meta}
	}

	for _, d := range snap.DaemonSets {
		id := fmt.Sprintf("ds:%s/%s", d.Namespace, d.Name)
		image := ""
		if len(d.Spec.Template.Spec.Containers) > 0 {
			image = d.Spec.Template.Spec.Containers[0].Image
		}
		cpuReq, cpuLim, memReq, memLim := containerResources(d.Spec.Template.Spec.Containers)
		nodeSelector := labelsToString(d.Spec.Template.Spec.NodeSelector)
		if nodeSelector == "" {
			nodeSelector = "all"
		}
		meta := map[string]string{
			"image":        image,
			"desired":      fmt.Sprintf("%d", d.Status.DesiredNumberScheduled),
			"ready":        fmt.Sprintf("%d", d.Status.NumberReady),
			"nodeSelector": nodeSelector,
			"labels":       labelsToString(d.Spec.Template.Labels),
		}
		if cpuReq != "" { meta["cpuRequest"] = cpuReq }
		if cpuLim != "" { meta["cpuLimit"]   = cpuLim }
		if memReq != "" { meta["memRequest"] = memReq }
		if memLim != "" { meta["memLimit"]   = memLim }
		if existing, ok := nodeSet[id]; ok {
			for _, k := range []string{"privileged","runAsRoot","hostPID","hostNetwork","hostPath"} {
				if v := existing.Metadata[k]; v != "" { meta[k] = v }
			}
		}
		nodeSet[id] = models.Node{ID: id, Type: models.NodeTypeDaemonSet, Label: d.Name, Namespace: d.Namespace, Metadata: meta}
	}

	// ── Jobs ─────────────────────────────────────────────────────────────────
	for _, job := range snap.Jobs {
		id := fmt.Sprintf("job:%s/%s", job.Namespace, job.Name)
		image := ""
		if len(job.Spec.Template.Spec.Containers) > 0 {
			image = job.Spec.Template.Spec.Containers[0].Image
		}
		completions := "1"
		if job.Spec.Completions != nil {
			completions = fmt.Sprintf("%d", *job.Spec.Completions)
		}
		parallelism := "1"
		if job.Spec.Parallelism != nil {
			parallelism = fmt.Sprintf("%d", *job.Spec.Parallelism)
		}
		cpuReq, cpuLim, memReq, memLim := containerResources(job.Spec.Template.Spec.Containers)
		meta := map[string]string{
			"image":       image,
			"completions": completions,
			"parallelism": parallelism,
			"succeeded":   fmt.Sprintf("%d", job.Status.Succeeded),
			"failed":      fmt.Sprintf("%d", job.Status.Failed),
			"active":      fmt.Sprintf("%d", job.Status.Active),
			"labels":      labelsToString(job.Spec.Template.Labels),
		}
		if cpuReq != "" { meta["cpuRequest"] = cpuReq }
		if cpuLim != "" { meta["cpuLimit"]   = cpuLim }
		if memReq != "" { meta["memRequest"] = memReq }
		if memLim != "" { meta["memLimit"]   = memLim }
		if existing, ok := nodeSet[id]; ok {
			for _, k := range []string{"privileged", "runAsRoot", "hostPID", "hostNetwork", "hostPath"} {
				if v := existing.Metadata[k]; v != "" {
					meta[k] = v
				}
			}
		}
		nodeSet[id] = models.Node{ID: id, Type: models.NodeTypeJob, Label: job.Name, Namespace: job.Namespace, Metadata: meta}

		// CronJob → Job "schedules" edge
		for _, owner := range job.OwnerReferences {
			if owner.Kind == "CronJob" {
				cjID := fmt.Sprintf("cj:%s/%s", job.Namespace, owner.Name)
				newEdge(cjID, id, "schedules", "", nil)
			}
		}
	}

	// ── CronJobs ─────────────────────────────────────────────────────────────
	for _, cj := range snap.CronJobs {
		id := fmt.Sprintf("cj:%s/%s", cj.Namespace, cj.Name)
		image := ""
		if len(cj.Spec.JobTemplate.Spec.Template.Spec.Containers) > 0 {
			image = cj.Spec.JobTemplate.Spec.Template.Spec.Containers[0].Image
		}
		lastSchedule := ""
		if cj.Status.LastScheduleTime != nil {
			lastSchedule = cj.Status.LastScheduleTime.UTC().Format(time.RFC3339)
		}
		suspend := "false"
		if cj.Spec.Suspend != nil && *cj.Spec.Suspend {
			suspend = "true"
		}
		cpuReq, cpuLim, memReq, memLim := containerResources(cj.Spec.JobTemplate.Spec.Template.Spec.Containers)
		meta := map[string]string{
			"schedule":          cj.Spec.Schedule,
			"concurrencyPolicy": string(cj.Spec.ConcurrencyPolicy),
			"suspend":           suspend,
			"lastScheduleTime":  lastSchedule,
			"activeJobs":        fmt.Sprintf("%d", len(cj.Status.Active)),
			"image":             image,
			"labels":            labelsToString(cj.Spec.JobTemplate.Labels),
		}
		if cpuReq != "" { meta["cpuRequest"] = cpuReq }
		if cpuLim != "" { meta["cpuLimit"]   = cpuLim }
		if memReq != "" { meta["memRequest"] = memReq }
		if memLim != "" { meta["memLimit"]   = memLim }
		if existing, ok := nodeSet[id]; ok {
			for _, k := range []string{"privileged", "runAsRoot", "hostPID", "hostNetwork", "hostPath"} {
				if v := existing.Metadata[k]; v != "" {
					meta[k] = v
				}
			}
		}
		nodeSet[id] = models.Node{ID: id, Type: models.NodeTypeCronJob, Label: cj.Name, Namespace: cj.Namespace, Metadata: meta}
	}

	// ── All ServiceAccount nodes ─────────────────────────────────────────────
	for key, sa := range snap.ServiceAccounts {
		id := fmt.Sprintf("sa:%s", key)
		meta := map[string]string{
			"labels": labelsToString(sa.Labels),
		}
		if irsaARN, ok := sa.Annotations["eks.amazonaws.com/role-arn"]; ok {
			meta["eks.amazonaws.com/role-arn"] = irsaARN
		}
		if sa.AutomountServiceAccountToken != nil {
			if *sa.AutomountServiceAccountToken {
				meta["automountToken"] = "true"
			} else {
				meta["automountToken"] = "false"
			}
		} else {
			meta["automountToken"] = "true" // default
		}
		nodeSet[id] = models.Node{
			ID: id, Type: models.NodeTypeServiceAccount,
			Label: sa.Name, Namespace: sa.Namespace, Metadata: meta,
		}
	}

	// ── K8s topology nodes & edges ────────────────────────────────────────────

	// Services
	for _, svc := range snap.Services {
		if svc.Spec.ClusterIP == "None" && len(svc.Spec.Selector) == 0 {
			continue // skip headless services with no selector
		}
		svcID := fmt.Sprintf("k8s-svc:%s/%s", svc.Namespace, svc.Name)
		ports := make([]string, 0, len(svc.Spec.Ports))
		for _, p := range svc.Spec.Ports {
			ports = append(ports, fmt.Sprintf("%d/%s", p.Port, p.Protocol))
		}
		nodeSet[svcID] = models.Node{
			ID:        svcID,
			Type:      models.NodeTypeK8sService,
			Label:     svc.Name,
			Namespace: svc.Namespace,
			Metadata:  map[string]string{"svcType": string(svc.Spec.Type), "ports": strings.Join(ports, ", "), "clusterIP": svc.Spec.ClusterIP},
		}

		// Service → Workload ("selects")
		for _, depl := range snap.Deployments {
			if depl.Namespace == svc.Namespace && labelsMatch(svc.Spec.Selector, depl.Spec.Template.Labels) {
				targetID := fmt.Sprintf("deploy:%s/%s", depl.Namespace, depl.Name)
				newEdge(svcID, targetID, "selects", "", nil)
			}
		}
		for _, sts := range snap.StatefulSets {
			if sts.Namespace == svc.Namespace && labelsMatch(svc.Spec.Selector, sts.Spec.Template.Labels) {
				targetID := fmt.Sprintf("ss:%s/%s", sts.Namespace, sts.Name)
				newEdge(svcID, targetID, "selects", "", nil)
			}
		}
		for _, ds := range snap.DaemonSets {
			if ds.Namespace == svc.Namespace && labelsMatch(svc.Spec.Selector, ds.Spec.Template.Labels) {
				targetID := fmt.Sprintf("ds:%s/%s", ds.Namespace, ds.Name)
				newEdge(svcID, targetID, "selects", "", nil)
			}
		}
	}

	// Ingresses
	for _, ing := range snap.Ingresses {
		ingID := fmt.Sprintf("ing:%s/%s", ing.Namespace, ing.Name)

		// Collect all hosts
		hostSet := make(map[string]struct{})
		var paths []string
		for _, rule := range ing.Spec.Rules {
			if rule.Host != "" {
				hostSet[rule.Host] = struct{}{}
			}
			if rule.HTTP != nil {
				for _, p := range rule.HTTP.Paths {
					svcName := ""
					if p.Backend.Service != nil {
						svcName = p.Backend.Service.Name
					}
					pathType := ""
					if p.PathType != nil {
						pathType = string(*p.PathType)
					}
					paths = append(paths, fmt.Sprintf("%s%s→%s", rule.Host, p.Path, svcName))
					_ = pathType
				}
			}
		}
		hosts := make([]string, 0, len(hostSet))
		for h := range hostSet {
			hosts = append(hosts, h)
		}

		// TLS info
		var tlsHosts []string
		var tlsSecrets []string
		for _, tls := range ing.Spec.TLS {
			tlsHosts = append(tlsHosts, tls.Hosts...)
			if tls.SecretName != "" {
				tlsSecrets = append(tlsSecrets, tls.SecretName)
			}
		}

		// Ingress class
		ingressClass := ""
		if ing.Spec.IngressClassName != nil {
			ingressClass = *ing.Spec.IngressClassName
		}
		if ingressClass == "" {
			if cls, ok := ing.Annotations["kubernetes.io/ingress.class"]; ok {
				ingressClass = cls
			}
		}

		host := ""
		if len(hosts) > 0 {
			host = strings.Join(hosts, ", ")
		}

		meta := map[string]string{
			"host":         host,
			"paths":        strings.Join(paths, "; "),
			"ingressClass": ingressClass,
			"tls":          strings.Join(tlsHosts, ", "),
			"tlsSecrets":   strings.Join(tlsSecrets, ", "),
		}

		nodeSet[ingID] = models.Node{
			ID:        ingID,
			Type:      models.NodeTypeIngress,
			Label:     ing.Name,
			Namespace: ing.Namespace,
			Metadata:  meta,
		}

		// Ingress → Service ("routes →")
		for _, rule := range ing.Spec.Rules {
			if rule.HTTP == nil {
				continue
			}
			for _, path := range rule.HTTP.Paths {
				if path.Backend.Service == nil {
					continue
				}
				targetID := fmt.Sprintf("k8s-svc:%s/%s", ing.Namespace, path.Backend.Service.Name)
				if _, exists := nodeSet[targetID]; exists {
					newEdge(ingID, targetID, "routes →", "", nil)
				}
			}
		}
	}

	// NetworkPolicies
	for _, np := range snap.NetworkPolicies {
		npID := fmt.Sprintf("netpol:%s/%s", np.Namespace, np.Name)
		effect := "allow"
		// Infer deny from policy types or empty egress/ingress
		if len(np.Spec.PolicyTypes) > 0 &&
			(len(np.Spec.Ingress) == 0 && containsPolicyType(np.Spec.PolicyTypes, networkingv1.PolicyTypeIngress)) {
			effect = "deny"
		}
		policyTypes := make([]string, 0, len(np.Spec.PolicyTypes))
		for _, pt := range np.Spec.PolicyTypes {
			policyTypes = append(policyTypes, string(pt))
		}
		nodeSet[npID] = models.Node{
			ID:        npID,
			Type:      models.NodeTypeNetworkPolicy,
			Label:     np.Name,
			Namespace: np.Namespace,
			Metadata: map[string]string{
				"effect":      effect,
				"podSelector": labelsToString(np.Spec.PodSelector.MatchLabels),
				"policyTypes": strings.Join(policyTypes, ", "),
			},
		}
	}

	// ── RBAC graph ───────────────────────────────────────────────────────────

	// Index roles and clusterroles by name (for binding lookup)
	roleIndex        := make(map[string]string) // "ns/name" → nodeID
	clusterRoleIndex := make(map[string]string) // "name"    → nodeID

	for _, r := range snap.Roles {
		id := fmt.Sprintf("k8s-role:%s/%s", r.Namespace, r.Name)
		roleIndex[r.Namespace+"/"+r.Name] = id
		rules := rulesString(r.Rules)
		danger := classifyRules(r.Rules)
		nodeSet[id] = models.Node{
			ID:        id,
			Type:      models.NodeTypeK8sRole,
			Label:     r.Name,
			Namespace: r.Namespace,
			Metadata:  map[string]string{"rules": rules, "danger": danger},
		}
	}
	for _, cr := range snap.ClusterRoles {
		if strings.HasPrefix(cr.Name, "system:") {
			continue // skip system ClusterRoles — too noisy
		}
		id := fmt.Sprintf("k8s-clusterrole:%s", cr.Name)
		clusterRoleIndex[cr.Name] = id
		rules := rulesString(cr.Rules)
		danger := classifyRules(cr.Rules)
		nodeSet[id] = models.Node{
			ID:       id,
			Type:     models.NodeTypeK8sClusterRole,
			Label:    cr.Name,
			Metadata: map[string]string{"rules": rules, "danger": danger},
		}
	}

	// System namespaces to skip for RBAC — too noisy
	rbacSkipNs := map[string]bool{
		"kube-system": true, "kube-public": true, "kube-node-lease": true,
	}

	// RoleBindings: SA → Binding → Role/ClusterRole
	for _, rb := range snap.RoleBindings {
		if strings.HasPrefix(rb.Name, "system:") || rbacSkipNs[rb.Namespace] {
			continue
		}
		bindID := fmt.Sprintf("k8s-rb:%s/%s", rb.Namespace, rb.Name)
		// Resolve target role
		var roleNodeID string
		switch rb.RoleRef.Kind {
		case "Role":
			roleNodeID = roleIndex[rb.Namespace+"/"+rb.RoleRef.Name]
		case "ClusterRole":
			roleNodeID = clusterRoleIndex[rb.RoleRef.Name]
		}
		if roleNodeID == "" {
			continue
		}

		nodeSet[bindID] = models.Node{
			ID:        bindID,
			Type:      models.NodeTypeK8sRoleBinding,
			Label:     rb.Name,
			Namespace: rb.Namespace,
			Metadata:  map[string]string{"roleRef": rb.RoleRef.Name, "roleKind": rb.RoleRef.Kind},
		}
		newEdge(bindID, roleNodeID, "grants →", "", nil)

		for _, subj := range rb.Subjects {
			if subj.Kind != "ServiceAccount" {
				continue
			}
			ns := subj.Namespace
			if ns == "" {
				ns = rb.Namespace
			}
			saNodeID := fmt.Sprintf("sa:%s/%s", ns, subj.Name)
			newEdge(saNodeID, bindID, "bound →", "", nil)
		}
	}

	// ClusterRoleBindings
	for _, crb := range snap.ClusterRoleBindings {
		if strings.HasPrefix(crb.Name, "system:") || strings.HasPrefix(crb.RoleRef.Name, "system:") {
			continue
		}
		bindID := fmt.Sprintf("k8s-crb:%s", crb.Name)
		roleNodeID := clusterRoleIndex[crb.RoleRef.Name]
		if roleNodeID == "" {
			continue
		}

		nodeSet[bindID] = models.Node{
			ID:       bindID,
			Type:     models.NodeTypeK8sClusterRoleBinding,
			Label:    crb.Name,
			Metadata: map[string]string{"roleRef": crb.RoleRef.Name, "roleKind": crb.RoleRef.Kind},
		}
		newEdge(bindID, roleNodeID, "grants →", "", nil)

		for _, subj := range crb.Subjects {
			if subj.Kind != "ServiceAccount" {
				continue
			}
			ns := subj.Namespace
			saNodeID := fmt.Sprintf("sa:%s/%s", ns, subj.Name)
			newEdge(saNodeID, bindID, "bound →", "", nil)
		}
	}

	// ── Security context enrichment ──────────────────────────────────────────
	for _, pod := range snap.Pods {
		id := fmt.Sprintf("pod:%s/%s", pod.Namespace, pod.Name)
		if n, ok := nodeSet[id]; ok {
			priv, root, hPID, hNet, hPath := podSecurityFlags(pod.Spec)
			n.Metadata["privileged"]  = boolFlag(priv)
			n.Metadata["runAsRoot"]   = boolFlag(root)
			n.Metadata["hostPID"]     = boolFlag(hPID)
			n.Metadata["hostNetwork"] = boolFlag(hNet)
			n.Metadata["hostPath"]    = boolFlag(hPath)
			nodeSet[id] = n
		}
	}
	for _, d := range snap.Deployments {
		id := fmt.Sprintf("deploy:%s/%s", d.Namespace, d.Name)
		if n, ok := nodeSet[id]; ok {
			priv, root, hPID, hNet, hPath := podSecurityFlags(d.Spec.Template.Spec)
			n.Metadata["privileged"]  = boolFlag(priv)
			n.Metadata["runAsRoot"]   = boolFlag(root)
			n.Metadata["hostPID"]     = boolFlag(hPID)
			n.Metadata["hostNetwork"] = boolFlag(hNet)
			n.Metadata["hostPath"]    = boolFlag(hPath)
			nodeSet[id] = n
		}
	}
	for _, s := range snap.StatefulSets {
		id := fmt.Sprintf("ss:%s/%s", s.Namespace, s.Name)
		if n, ok := nodeSet[id]; ok {
			priv, root, hPID, hNet, hPath := podSecurityFlags(s.Spec.Template.Spec)
			n.Metadata["privileged"]  = boolFlag(priv)
			n.Metadata["runAsRoot"]   = boolFlag(root)
			n.Metadata["hostPID"]     = boolFlag(hPID)
			n.Metadata["hostNetwork"] = boolFlag(hNet)
			n.Metadata["hostPath"]    = boolFlag(hPath)
			nodeSet[id] = n
		}
	}
	for _, d := range snap.DaemonSets {
		id := fmt.Sprintf("ds:%s/%s", d.Namespace, d.Name)
		if n, ok := nodeSet[id]; ok {
			priv, root, hPID, hNet, hPath := podSecurityFlags(d.Spec.Template.Spec)
			n.Metadata["privileged"]  = boolFlag(priv)
			n.Metadata["runAsRoot"]   = boolFlag(root)
			n.Metadata["hostPID"]     = boolFlag(hPID)
			n.Metadata["hostNetwork"] = boolFlag(hNet)
			n.Metadata["hostPath"]    = boolFlag(hPath)
			nodeSet[id] = n
		}
	}
	for _, job := range snap.Jobs {
		id := fmt.Sprintf("job:%s/%s", job.Namespace, job.Name)
		if n, ok := nodeSet[id]; ok {
			priv, root, hPID, hNet, hPath := podSecurityFlags(job.Spec.Template.Spec)
			n.Metadata["privileged"]  = boolFlag(priv)
			n.Metadata["runAsRoot"]   = boolFlag(root)
			n.Metadata["hostPID"]     = boolFlag(hPID)
			n.Metadata["hostNetwork"] = boolFlag(hNet)
			n.Metadata["hostPath"]    = boolFlag(hPath)
			nodeSet[id] = n
		}
	}
	for _, cj := range snap.CronJobs {
		id := fmt.Sprintf("cj:%s/%s", cj.Namespace, cj.Name)
		if n, ok := nodeSet[id]; ok {
			priv, root, hPID, hNet, hPath := podSecurityFlags(cj.Spec.JobTemplate.Spec.Template.Spec)
			n.Metadata["privileged"]  = boolFlag(priv)
			n.Metadata["runAsRoot"]   = boolFlag(root)
			n.Metadata["hostPID"]     = boolFlag(hPID)
			n.Metadata["hostNetwork"] = boolFlag(hNet)
			n.Metadata["hostPath"]    = boolFlag(hPath)
			nodeSet[id] = n
		}
	}

	// ── Secrets & ConfigMaps ────────────────────────────────────────────────

	// System namespaces to skip (same list as RBAC)
	configSkipNs := map[string]bool{
		"kube-system": true, "kube-public": true, "kube-node-lease": true,
		"ingress-nginx": true, "cert-manager": true, "guardmap": true,
	}

	// Types of secrets that are purely internal/auto-managed — hide from graph
	skipSecretType := map[corev1.SecretType]bool{
		corev1.SecretTypeServiceAccountToken: true,  // auto by K8s
		"helm.sh/release.v1":                 true,  // Helm state
		"bootstrap.kubernetes.io/token":       true,
	}

	// Collect pod → secret/configmap refs, aggregated to workload level
	type refKey struct{ ns, name string }
	wlSecrets  := make(map[string]map[refKey]bool)
	wlConfigs  := make(map[string]map[refKey]bool)
	referencedSecrets := make(map[string]bool)
	referencedCMs     := make(map[string]bool)

	addSecretRef := func(wlID, ns, name string) {
		referencedSecrets[ns+"/"+name] = true
		if wlID == "" { return }
		if wlSecrets[wlID] == nil { wlSecrets[wlID] = make(map[refKey]bool) }
		wlSecrets[wlID][refKey{ns, name}] = true
	}
	addCMRef := func(wlID, ns, name string) {
		referencedCMs[ns+"/"+name] = true
		if wlID == "" { return }
		if wlConfigs[wlID] == nil { wlConfigs[wlID] = make(map[refKey]bool) }
		wlConfigs[wlID][refKey{ns, name}] = true
	}

	for _, pod := range snap.Pods {
		if configSkipNs[pod.Namespace] { continue }
		podKey := pod.Namespace + "/" + pod.Name
		wlID := ""
		if wl, ok := podWorkload[podKey]; ok { wlID = wl.nodeID() }

		for _, vol := range pod.Spec.Volumes {
			if vol.Secret != nil    { addSecretRef(wlID, pod.Namespace, vol.Secret.SecretName) }
			if vol.ConfigMap != nil { addCMRef(wlID, pod.Namespace, vol.ConfigMap.Name) }
		}
		for _, c := range append(pod.Spec.Containers, pod.Spec.InitContainers...) {
			for _, ef := range c.EnvFrom {
				if ef.SecretRef    != nil { addSecretRef(wlID, pod.Namespace, ef.SecretRef.Name) }
				if ef.ConfigMapRef != nil { addCMRef(wlID, pod.Namespace, ef.ConfigMapRef.Name) }
			}
			for _, env := range c.Env {
				if env.ValueFrom == nil { continue }
				if env.ValueFrom.SecretKeyRef    != nil { addSecretRef(wlID, pod.Namespace, env.ValueFrom.SecretKeyRef.Name) }
				if env.ValueFrom.ConfigMapKeyRef != nil { addCMRef(wlID, pod.Namespace, env.ValueFrom.ConfigMapKeyRef.Name) }
			}
		}
	}

	// Secret nodes
	for _, sec := range snap.Secrets {
		if configSkipNs[sec.Namespace] { continue }
		if skipSecretType[sec.Type]    { continue }
		id := fmt.Sprintf("secret:%s/%s", sec.Namespace, sec.Name)
		nodeSet[id] = models.Node{
			ID: id, Type: models.NodeTypeSecret,
			Label: sec.Name, Namespace: sec.Namespace,
			Metadata: map[string]string{
				"secretType": string(sec.Type),
				"keyCount":   fmt.Sprintf("%d", len(sec.Data)),
				"referenced": fmt.Sprintf("%v", referencedSecrets[sec.Namespace+"/"+sec.Name]),
			},
		}
	}

	// ConfigMap nodes (skip kube-root-ca.crt which is injected in every namespace)
	for _, cm := range snap.ConfigMaps {
		if configSkipNs[cm.Namespace] { continue }
		if cm.Name == "kube-root-ca.crt" { continue }
		id := fmt.Sprintf("cm:%s/%s", cm.Namespace, cm.Name)
		immutable := "false"
		if cm.Immutable != nil && *cm.Immutable { immutable = "true" }
		nodeSet[id] = models.Node{
			ID: id, Type: models.NodeTypeConfigMap,
			Label: cm.Name, Namespace: cm.Namespace,
			Metadata: map[string]string{
				"keyCount":   fmt.Sprintf("%d", len(cm.Data)+len(cm.BinaryData)),
				"referenced": fmt.Sprintf("%v", referencedCMs[cm.Namespace+"/"+cm.Name]),
				"immutable":  immutable,
			},
		}
	}

	// Workload → Secret / ConfigMap edges
	for wlID, refs := range wlSecrets {
		for ref := range refs {
			secID := fmt.Sprintf("secret:%s/%s", ref.ns, ref.name)
			if _, ok := nodeSet[secID]; ok {
				newEdge(wlID, secID, "uses secret →", "", nil)
			}
		}
	}
	for wlID, refs := range wlConfigs {
		for ref := range refs {
			cmID := fmt.Sprintf("cm:%s/%s", ref.ns, ref.name)
			if _, ok := nodeSet[cmID]; ok {
				newEdge(wlID, cmID, "uses config →", "", nil)
			}
		}
	}

	// ── Assemble output ───────────────────────────────────────────────────────
	graph := &models.GraphData{}
	for _, n := range nodeSet {
		graph.Nodes = append(graph.Nodes, n)
	}
	graph.Edges = deduplicateEdges(edges)

	return graph, nil
}

// workloadReplicas returns a string representation of replicas for a workload.
func workloadReplicas(snap *ClusterSnapshot, wl workloadRef) string {
	switch wl.kind {
	case "deployment":
		for _, d := range snap.Deployments {
			if d.Namespace == wl.ns && d.Name == wl.name {
				if d.Spec.Replicas != nil {
					return fmt.Sprintf("%d", *d.Spec.Replicas)
				}
			}
		}
	case "statefulset":
		for _, s := range snap.StatefulSets {
			if s.Namespace == wl.ns && s.Name == wl.name {
				if s.Spec.Replicas != nil {
					return fmt.Sprintf("%d", *s.Spec.Replicas)
				}
			}
		}
	case "job":
		for _, j := range snap.Jobs {
			if j.Namespace == wl.ns && j.Name == wl.name {
				if j.Spec.Parallelism != nil {
					return fmt.Sprintf("%d", *j.Spec.Parallelism)
				}
			}
		}
	}
	return "1"
}

// labelsMatch returns true if all selector labels are present in the target labels.
func labelsMatch(selector, podLabels map[string]string) bool {
	if len(selector) == 0 {
		return false
	}
	for k, v := range selector {
		if podLabels[k] != v {
			return false
		}
	}
	return true
}

// containsPolicyType checks if a slice contains a given NetworkPolicyType.
func containsPolicyType(types []networkingv1.PolicyType, t networkingv1.PolicyType) bool {
	for _, pt := range types {
		if pt == t {
			return true
		}
	}
	return false
}

// deduplicateEdges removes exact duplicate edges (same source+target+label).
func deduplicateEdges(edges []models.Edge) []models.Edge {
	seen := make(map[string]struct{})
	result := make([]models.Edge, 0, len(edges))
	for _, e := range edges {
		key := e.Source + "|" + e.Target + "|" + e.Label
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, e)
	}
	return result
}

// serviceShortName extracts the AWS service identifier from an ARN (e.g. "s3", "rds").
func serviceShortName(arn string) string {
	if arn == "*" {
		return "aws"
	}
	parts := strings.Split(arn, ":")
	if len(parts) < 3 {
		return ""
	}
	return parts[2] // "s3", "rds", "dynamodb", "sqs", etc.
}

func labelsToString(labels map[string]string) string {
	parts := make([]string, 0, len(labels))
	for k, v := range labels {
		parts = append(parts, k+"="+v)
	}
	sort.Strings(parts)
	return strings.Join(parts, ", ")
}

// rulesString encodes RBAC rules into a human-readable string.
func rulesString(rules []rbacv1.PolicyRule) string {
	parts := make([]string, 0, len(rules))
	for _, r := range rules {
		resources := strings.Join(r.Resources, ",")
		verbs := strings.Join(r.Verbs, ",")
		if len(r.APIGroups) > 0 && r.APIGroups[0] != "" && r.APIGroups[0] != "core" {
			resources = r.APIGroups[0] + "/" + resources
		}
		parts = append(parts, resources+":"+verbs)
	}
	return strings.Join(parts, "; ")
}

// classifyRules returns a danger level for a set of RBAC rules.
func classifyRules(rules []rbacv1.PolicyRule) string {
	for _, r := range rules {
		for _, res := range r.Resources {
			for _, verb := range r.Verbs {
				if verb == "*" || res == "*" {
					return "critical"
				}
			}
		}
		for _, verb := range r.Verbs {
			if verb == "escalate" || verb == "bind" || verb == "impersonate" {
				return "critical"
			}
		}
		for _, res := range r.Resources {
			if res == "secrets" {
				for _, verb := range r.Verbs {
					if verb == "get" || verb == "list" || verb == "watch" || verb == "*" {
						return "high"
					}
				}
			}
			if res == "pods/exec" || res == "pods/attach" {
				return "high"
			}
		}
	}
	// Check for write operations
	for _, r := range rules {
		for _, verb := range r.Verbs {
			if verb == "create" || verb == "update" || verb == "patch" || verb == "delete" || verb == "deletecollection" {
				return "medium"
			}
		}
	}
	return "low"
}

// podSecurityFlags extracts security-relevant flags from a pod spec.
func podSecurityFlags(spec corev1.PodSpec) (privileged, runAsRoot, hostPID, hostNetwork, hostPath bool) {
	hostPID = spec.HostPID
	hostNetwork = spec.HostNetwork
	for _, v := range spec.Volumes {
		if v.HostPath != nil {
			hostPath = true
		}
	}
	if sc := spec.SecurityContext; sc != nil {
		if sc.RunAsUser != nil && *sc.RunAsUser == 0 {
			runAsRoot = true
		}
		if sc.RunAsNonRoot != nil && !*sc.RunAsNonRoot {
			runAsRoot = true
		}
	}
	for _, c := range append(spec.Containers, spec.InitContainers...) {
		if sc := c.SecurityContext; sc != nil {
			if sc.Privileged != nil && *sc.Privileged {
				privileged = true
			}
			if sc.RunAsUser != nil && *sc.RunAsUser == 0 {
				runAsRoot = true
			}
			if sc.RunAsNonRoot != nil && !*sc.RunAsNonRoot {
				runAsRoot = true
			}
		}
	}
	return
}

// containerResources returns CPU/mem request and limit strings for the first container that has them.
func containerResources(containers []corev1.Container) (cpuReq, cpuLim, memReq, memLim string) {
	for _, c := range containers {
		if q, ok := c.Resources.Requests[corev1.ResourceCPU]; ok && cpuReq == "" {
			cpuReq = q.String()
		}
		if q, ok := c.Resources.Limits[corev1.ResourceCPU]; ok && cpuLim == "" {
			cpuLim = q.String()
		}
		if q, ok := c.Resources.Requests[corev1.ResourceMemory]; ok && memReq == "" {
			memReq = q.String()
		}
		if q, ok := c.Resources.Limits[corev1.ResourceMemory]; ok && memLim == "" {
			memLim = q.String()
		}
	}
	return
}

func boolFlag(b bool) string {
	if b {
		return "true"
	}
	return ""
}

func roleNameFromARN(arn string) string {
	parts := strings.Split(arn, "/")
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return arn
}

// Compile-time interface checks to ensure we use the right K8s API types.
var _ = (*appsv1.Deployment)(nil)
var _ = (*corev1.Service)(nil)
var _ = (*networkingv1.Ingress)(nil)
