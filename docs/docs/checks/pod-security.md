---
id: pod-security
title: Pod security checks
sidebar_position: 2
---

# Pod security checks

## Critical

### `privileged_container`
Container runs in privileged mode — full host access, equivalent to root on the node.

**Remediation:**
```yaml
securityContext:
  privileged: false
```

---

### `host_pid`
Pod shares the host PID namespace — can inspect or kill any process on the node.

**Remediation:** Remove `hostPID: true` from the pod spec.

---

### `host_network`
Pod shares the host network namespace — can sniff all node-level traffic.

**Remediation:** Remove `hostNetwork: true` from the pod spec.

---

### `host_ipc`
Pod shares the host IPC namespace — can access shared memory of all node processes.

**Remediation:** Remove `hostIPC: true` from the pod spec.

---

## High

### `privilege_escalation_allowed`
`allowPrivilegeEscalation` is not set to false — container can gain more privileges at runtime.

**Remediation:**
```yaml
securityContext:
  allowPrivilegeEscalation: false
```

---

### `runs_as_root`
Container may run as UID 0 — maximises blast radius of any container escape.

**Remediation:**
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
```

---

### `dangerous_capability`
Container has a dangerous Linux capability (`SYS_ADMIN`, `SYS_PTRACE`, `SYS_MODULE`, `NET_ADMIN`, `NET_RAW`, etc.).

**Remediation:**
```yaml
securityContext:
  capabilities:
    drop: ["ALL"]
```

---

### `host_path_mount`
Container mounts a host path volume — can expose sensitive node files or enable persistence.

**Remediation:** Replace `hostPath` volumes with `emptyDir`, `ConfigMap`, or a PersistentVolumeClaim.

---

### `default_sa_binding`
Default ServiceAccount has a RoleBinding — grants permissions to all pods that don't specify a ServiceAccount.

**Remediation:** Create dedicated ServiceAccounts per workload and remove bindings from `default`.

---

## Medium

### `no_resource_limits`
No CPU/memory limits — container can exhaust node resources (DoS risk).

**Remediation:**
```yaml
resources:
  limits:
    cpu: "500m"
    memory: "256Mi"
```

---

### `unpinned_image`
Image uses `:latest` or has no tag — non-deterministic deployments, possible supply-chain risk.

**Remediation:**
```yaml
image: nginx:1.25.3
```

---

## Low

### `writable_root_fs`
Root filesystem is writable — attacker can modify binaries or write malware.

**Remediation:**
```yaml
securityContext:
  readOnlyRootFilesystem: true
```

---

### `no_resource_requests`
No CPU/memory requests — scheduler cannot make optimal placement decisions.

**Remediation:**
```yaml
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
```

---

### `no_liveness_probe`
No liveness probe — unhealthy containers won't be automatically restarted.

**Remediation:**
```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 15
```
