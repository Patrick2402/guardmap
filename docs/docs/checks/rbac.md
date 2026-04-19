---
id: rbac
title: RBAC checks
sidebar_position: 3
---

# RBAC checks

:::note
RBAC findings are scoped to **user namespaces only** — `kube-system`, `kube-public`, `ingress-nginx`, `cert-manager`, and other system namespaces are excluded.
:::

## Critical

### `wildcard_clusterrole`
ClusterRole uses wildcard verbs or resources (`*`) — grants unlimited cluster access.

```yaml
# dangerous
rules:
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["*"]
```

**Remediation:** Replace wildcards with the specific resources and verbs your workload needs. Use namespace-scoped `Role` instead of `ClusterRole` where possible.

---

### `cluster_admin_binding`
A ClusterRoleBinding grants `cluster-admin` to a non-system subject — full read/write access to everything.

```bash
kubectl get clusterrolebindings -o json | \
  jq '.items[] | select(.roleRef.name == "cluster-admin") | .subjects'
```

**Remediation:** Replace with a least-privilege `ClusterRole` scoped to what is actually needed.

---

### `system_masters_binding`
A ClusterRoleBinding grants the `system:masters` group — bypasses RBAC authorisation entirely, no audit trail.

**Remediation:** Remove all bindings to `system:masters`. This group is reserved for cluster bootstrapping only.

---

### `rbac_escalate_verb`
ClusterRole grants the `escalate` verb on `roles` or `clusterroles` — allows the subject to grant themselves any permission, including ones they don't hold.

**Remediation:** Remove `escalate` from all role definitions. Only cluster operators need this during bootstrapping.

---

## High

### `wildcard_sensitive_resource`
Role or ClusterRole grants wildcard verbs on sensitive resources (`secrets`, `nodes`, `clusterroles`, `clusterrolebindings`).

**Remediation:** Replace `verbs: ["*"]` with the minimum required verbs (`get`, `list`) and scope to the specific resources needed.

---

### `default_sa_role_binding`
The `default` ServiceAccount has a RoleBinding — grants permissions to every pod that doesn't specify a ServiceAccount explicitly.

**Remediation:** Create dedicated ServiceAccounts per workload and remove bindings from `default`.

---

### `rbac_exec_pods`
ClusterRole grants `pods/exec` or `pods/attach` — allows running arbitrary commands inside any pod, bypassing application-level access controls.

**Remediation:** Remove `pods/exec` and `pods/attach` from production ClusterRoles. Restrict these to named users via individual RoleBindings in specific namespaces.

---

### `rbac_nodes_access`
ClusterRole explicitly grants access to the `nodes` resource — enables reading node metadata, labels, and capacity, which can be used for cluster reconnaissance (MITRE T1613).

**Remediation:** Remove `nodes` from role resource lists unless the workload is an infrastructure controller that genuinely requires it.

---

## Medium

### `create_pods_perm`
Role grants `create` on `pods` — allows spawning arbitrary pods in the namespace, which can be used to escape other restrictions or escalate privileges.

**Remediation:** Grant `create` on `pods` only to CI/CD system accounts. Prefer higher-level resources (`deployments`) instead.

---

### `wildcard_pv_access`
ClusterRole grants wildcard access to `persistentvolumes` — can expose or delete persistent storage across all namespaces.

**Remediation:** Scope PV permissions to the specific operations needed (`get`, `list`) and use PVC-level access where possible.

---

### `rbac_get_secrets`
ClusterRole grants explicit `get`, `list`, or `watch` on `secrets` — allows reading secret values from any namespace.

**Remediation:** Remove `secrets` from the role. Workloads should only access their own secrets via projected volumes, not via the API.
