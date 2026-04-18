---
id: overview
title: Security checks overview
sidebar_position: 1
---

# Security checks overview

GuardMap runs 40+ checks across five categories on every scan.

## Categories

| Category | Checks | Description |
|----------|--------|-------------|
| [Pod Security](./pod-security) | 21 | Container-level checks — privileges, capabilities, root user, resource limits, plaintext secrets, public images |
| [RBAC](./rbac) | 12 | Role and binding checks — wildcards, cluster-admin, exec/attach, secrets access, node access |
| [Network](./network) | 5 | NetworkPolicy coverage, allow-all policies, host networking, public load balancers |
| [IAM / IRSA](./iam) | 6 | AWS IAM permission checks for EKS IRSA chains, unused IRSA bindings |
| Batch / Workload | 3 | CronJob and Job hygiene — TTL, concurrency, missing deadline |

## Severity levels

| Severity | Meaning | Max score impact |
|----------|---------|-----------------|
| **Critical** | Immediate risk — can lead to full cluster or node compromise | −42 pts |
| **High** | Significant risk — increases blast radius of other vulnerabilities | −28 pts |
| **Medium** | Elevated risk — should be addressed but not immediately dangerous | −14 pts |
| **Low** | Best practice violation — low direct risk but increases attack surface | −6 pts |

## System namespace exclusions

GuardMap skips checks in system namespaces by default:

- `kube-system`
- `kube-public`
- `kube-node-lease`
- `ingress-nginx`
- `cert-manager`
- `guardmap` (the agent itself)

This avoids noise from privileged system components you don't control.

## Check count by category

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Pod Security | 4 | 7 | 4 | 6 |
| RBAC | 3 | 4 | 3 | 2 |
| Network | — | 2 | 2 | 1 |
| IAM / IRSA | 2 | 1 | 2 | 1 |
| Batch / Workload | — | — | 1 | 2 |
