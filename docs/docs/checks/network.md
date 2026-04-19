---
id: network
title: Network checks
sidebar_position: 4
---

# Network checks

## Medium

### `no_network_policy`
Namespace has workloads but no NetworkPolicy — all pods can freely communicate cluster-wide.

**Remediation:** Add a default-deny policy first, then explicitly allow required traffic:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: your-namespace
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

---

### `allow_all_ingress`
A NetworkPolicy has an empty `from` selector on an ingress rule — allows traffic from any pod or IP, making it equivalent to no ingress policy.

```yaml
# dangerous — empty from selector allows everything
spec:
  ingress:
  - {}
```

**Remediation:** Replace empty selectors with explicit `podSelector`, `namespaceSelector`, or `ipBlock` rules.

---

### `allow_all_egress`
A NetworkPolicy has an empty `to` selector on an egress rule — all outbound traffic is allowed, bypassing egress controls.

**Remediation:** Define explicit egress rules to known destinations. Block all other outbound traffic by default.

---

### `public_loadbalancer`
Service of type `LoadBalancer` has no `loadBalancerSourceRanges` — exposed to the entire internet.

**Remediation:** Restrict access with source ranges:
```yaml
spec:
  type: LoadBalancer
  loadBalancerSourceRanges:
  - "10.0.0.0/8"       # internal traffic only
  - "203.0.113.0/24"   # specific office IP range
```

---

## Low

### `node_port_service`
Service uses `NodePort` — opens a port on every node in the cluster, bypassing NetworkPolicy on the node interface.

**Remediation:** Use `ClusterIP` + an Ingress controller instead of `NodePort` for external access.
