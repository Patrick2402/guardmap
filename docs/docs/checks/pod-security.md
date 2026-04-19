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

### `sensitive_env_plaintext`
Environment variable name contains a credential keyword (`PASSWORD`, `SECRET`, `TOKEN`, `API_KEY`, etc.) and is set as a literal string value — exposed in `kubectl describe`, pod specs, audit logs.

**Remediation:** Use a Kubernetes Secret and reference it via `valueFrom.secretKeyRef`:
```yaml
env:
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: db-credentials
      key: password
```

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

**Remediation:** Pin to a specific digest or immutable tag:
```yaml
image: nginx:1.25.3
```

---

### `secret_as_env`
A Kubernetes Secret is mounted as an environment variable — secrets exposed in process listings and `kubectl describe`.

**Remediation:** Mount secrets as files instead (`volumeMounts` + `volumes.secret`), or use an external secrets manager.

---

### `no_seccomp_profile`
No seccomp profile set — container can make any syscall the kernel allows, widening exploit surface.

**Remediation:**
```yaml
securityContext:
  seccompProfile:
    type: RuntimeDefault
```

---

### `automount_default_sa_token`
Pod uses the default ServiceAccount with `automountServiceAccountToken: true` — Kubernetes API credentials mounted in every container unnecessarily.

**Remediation:** Either set `automountServiceAccountToken: false` on the pod, or create a dedicated ServiceAccount with minimal RBAC and disable auto-mount on the default SA.

---

### `irsa_automount_token`
Pod has an IRSA annotation (AWS IAM role) **and** automounts its ServiceAccount token — the token is accessible to any process in the container and can be used to call the Kubernetes API.

**Remediation:** Set `automountServiceAccountToken: false` on the pod spec (IRSA uses a projected token from the webhook, not the mounted SA token).

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

---

### `no_readiness_probe`
No readiness probe — pod receives traffic before it is ready, causing request failures during startup.

**Remediation:**
```yaml
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
```

---

### `no_drop_all_caps`
Container does not drop all Linux capabilities — runs with a broader syscall surface than needed.

**Remediation:**
```yaml
securityContext:
  capabilities:
    drop: ["ALL"]
    add: ["NET_BIND_SERVICE"]  # only if actually needed
```

---

### `public_registry_image`
Image is pulled from a public registry (`docker.io`, `ghcr.io`, `quay.io`) — no control over image provenance, possible supply-chain risk.

**Remediation:** Mirror images to a private registry (ECR, GCR, Harbor) and pull from there. Enable image scanning on push.

---

### `host_port`
Container exposes a `hostPort` — binds directly on the node's network interface, bypassing NetworkPolicy.

**Remediation:** Use a Kubernetes Service instead of `hostPort` to expose the container.

---

### `default_namespace_workload`
Workload runs in the `default` namespace — lacks namespace-level isolation and is harder to apply targeted RBAC and NetworkPolicy.

**Remediation:** Move workloads into dedicated namespaces per team or environment.
