---
id: introduction
title: Introduction
sidebar_position: 1
slug: /
---

# GuardMap

Security visibility for your Kubernetes clusters — graph-based, real-time, actionable.

## What is GuardMap?

GuardMap is a security monitoring platform for Kubernetes clusters. It continuously scans your cluster, scores your security posture, and maps the full IRSA (IAM Roles for Service Accounts) permission chain — giving you a clear picture of what can access what.

## Key features

- **Security score** — a single 0–100 score using a diminishing-returns formula, updated after every scan
- **40+ security checks** across pod security, RBAC, network policies, and IAM
- **IRSA graph** — visualise the full chain from Deployment → ServiceAccount → IAM Role → AWS Resource
- **Topology view** — see workloads, services, ingresses, and network policies per namespace
- **Scan history** — track your security posture over time with trend charts
- **Multi-cluster** — manage multiple clusters across organisations from one dashboard
- **Google SSO** — sign in with Google or email/password

## How the score works

```
Score = 100 − penalty(critical) − penalty(high) − penalty(medium) − penalty(low)
```

Each severity uses a **diminishing-returns** formula — the first critical finding hurts more than the 10th. A score of 90+ means your cluster is well hardened. Below 50 means immediate action is needed.

→ [Full scoring reference](./reference/scoring)

## Next steps

- [Quick Start](./quickstart) — connect your first cluster in 5 minutes
- [How it works](./how-it-works) — understand the agent and data flow
- [Security Checks](./checks/overview) — browse all 40+ checks
- [Dashboard Tour](./guides/dashboard-tour) — learn what each tab shows
