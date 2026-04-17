---
id: rbac
title: RBAC checks
sidebar_position: 3
---

# RBAC checks

## Critical

### `wildcard_clusterrole`
ClusterRole uses wildcard verbs or resources (`*`) — grants unlimited cluster access.

```yaml
# dangerous — triggers this check
rules:
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["*"]
```

**Remediation:** Replace wildcards with the specific resources and verbs your workload needs. Use namespace-scoped `Role` instead of `ClusterRole` where possible.

---

## High

### `cluster_admin_binding`
A ClusterRoleBinding grants `cluster-admin` to a non-system subject.

`cluster-admin` is full read/write access to everything. Audit all bindings:

```bash
kubectl get clusterrolebindings -o json | \
  jq '.items[] | select(.roleRef.name == "cluster-admin") | .subjects'
```

**Remediation:** Replace with a least-privilege `ClusterRole` scoped to what is actually needed.

---

### `dangerous_rbac_permissions`
Role grants access to sensitive resources: `secrets`, `pods`, `deployments`, `clusterroles`, `clusterrolebindings`, `rolebindings`, `nodes`.

**Remediation:** Use `kubectl auth can-i --list --as=system:serviceaccount:<ns>:<sa>` to inspect effective permissions, then remove excess.

---

:::note
RBAC findings are scoped to **user namespaces only** — `kube-system`, `kube-public`, and other system namespaces are excluded.
:::
