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

### `iam_full_access`
Pod can perform all actions on an AWS resource — equivalent to admin credentials.

**Remediation:** Replace wildcard policies with specific actions and resources:
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

## Access level classification

| Level | Examples | Finding |
|-------|----------|---------|
| **Full** | `*`, `s3:*`, `iam:*` | Critical |
| **Write** | `s3:PutObject`, `sqs:SendMessage` | High |
| **Read** | `s3:GetObject`, `sqs:ReceiveMessage` | None |

IRSA Graph edges are colour-coded: **red** = full, **orange** = write, **blue** = read.
