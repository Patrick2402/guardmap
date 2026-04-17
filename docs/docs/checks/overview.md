---
id: overview
title: Security checks overview
sidebar_position: 1
---

# Security checks overview

GuardMap runs 30+ checks across four categories on every scan.

## Categories

| Category | Checks | Description |
|----------|--------|-------------|
| [Pod Security](./pod-security) | 15 | Container-level checks — privileges, capabilities, root user, resource limits |
| [RBAC](./rbac) | 5 | Role and binding checks — wildcards, cluster-admin, dangerous permissions |
| [Network](./network) | 4 | NetworkPolicy coverage, allow-all policies, host networking |
| [IAM / IRSA](./iam) | 2 | AWS IAM permission checks for EKS IRSA chains |

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
| Pod Security | 4 | 5 | 3 | 3 |
| RBAC | 2 | 3 | — | — |
| Network | — | 2 | 2 | — |
| IAM / IRSA | 1 | 1 | — | — |
