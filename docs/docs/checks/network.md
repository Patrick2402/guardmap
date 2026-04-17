---
id: network
title: Network checks
sidebar_position: 4
---

# Network checks

## High

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

## Medium

### `allow_all_network_policy`
NetworkPolicy has an empty `from` or `to` selector — equivalent to no policy.

```yaml
# dangerous — empty selector allows everything
spec:
  ingress:
  - {}
```

**Remediation:** Replace empty selectors with explicit `podSelector`, `namespaceSelector`, or `ipBlock` rules.

---

## Coverage check

For each user namespace with at least one workload, GuardMap checks whether at least one `NetworkPolicy` exists. System namespaces are excluded.
