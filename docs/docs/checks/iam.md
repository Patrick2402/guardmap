---
id: iam
title: IAM / IRSA checks
sidebar_position: 5
---

# IAM / IRSA checks

:::note
IAM checks only run on EKS clusters where pods have the `eks.amazonaws.com/role-arn` annotation on their ServiceAccount. On non-EKS clusters (minikube, GKE, etc.) this section will have no findings.
:::

## How IRSA works

```
Pod → ServiceAccount (with role-arn annotation)
    → IAM Role
    → IAM Policy
    → AWS Resource (S3, RDS, SQS, ...)
```

## Critical

### `iam_wildcard_access`
Pod's IAM policy uses a wildcard action (`*` or `s3:*`) — equivalent to admin credentials on that AWS service.

**Remediation:** Replace wildcards with specific actions and resource ARNs:
```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::my-bucket/*"
}
```

---

## High

### `iam_write_access`
Pod has write/delete permissions on an AWS resource.

**Remediation:** Grant read-only access where writes aren't needed. Scope write access to specific resources, never `*`.

---

### `iam_broad_access`
Pod's IAM role grants access to more than 3 distinct AWS services — overly broad permissions increase blast radius on compromise.

**Remediation:** Split into separate IAM roles, one per workload, with only the services that workload actually uses.

---

### `shared_role_cross_env`
The same IAM role is used by pods in different namespaces (e.g. `production` and `staging`) — a compromise in one environment can pivot to the other.

**Remediation:** Create separate IAM roles per environment. IRSA roles are cheap; blast radius isolation is not.

---

## Medium

### `irsa_automount_token`
Pod has an IRSA annotation **and** `automountServiceAccountToken: true` — the Kubernetes API token is mounted alongside the AWS credentials, giving attackers a second credential set to abuse.

**Remediation:** IRSA uses a projected volume token injected by the mutating webhook, not the auto-mounted SA token. Disable auto-mount safely:
```yaml
spec:
  automountServiceAccountToken: false
```

---

## Low

### `sa_unused_irsa`
A ServiceAccount has an IRSA annotation (`eks.amazonaws.com/role-arn`) but no pod is currently using it — orphaned IAM bindings that should be cleaned up.

**Remediation:** Remove the annotation if the ServiceAccount is no longer in use, or delete the ServiceAccount entirely. Orphaned bindings can be exploited if someone creates a pod referencing the SA.

---

## Access level classification

| Level | Examples | Finding |
|-------|----------|---------|
| **Full** | `*`, `s3:*`, `iam:*` | `iam_wildcard_access` (Critical) |
| **Write** | `s3:PutObject`, `sqs:SendMessage` | `iam_write_access` (High) |
| **Read** | `s3:GetObject`, `sqs:ReceiveMessage` | None |

IRSA Graph edges are colour-coded: **red** = full, **orange** = write, **blue** = read.
