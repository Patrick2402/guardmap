---
id: how-it-works
title: How it works
sidebar_position: 3
---

# How it works

## Architecture overview

```
Your Cluster                         GuardMap Cloud
─────────────                        ──────────────
CronJob (every 6h)
  │
  ├─ Discovers K8s resources
  │  (Pods, Deployments, RBAC,
  │   NetworkPolicies, Nodes...)
  │
  ├─ Builds IRSA graph
  │  (SA → IAM Role → AWS Resource)
  │
  ├─ Runs 71 security checks
  │
  └─ HTTP POST /rpc/submit_scan ──►  Supabase (submit_scan RPC)
                                       │
                                       ├─ Validates API key (SHA-256)
                                       ├─ Updates cluster metadata
                                       ├─ Inserts scan_results
                                       └─ Trigger → updates cluster score
                                            │
                                            ▼
                                     Dashboard (React)
                                       ├─ Overview (score ring)
                                       ├─ Findings (from DB)
                                       ├─ Graph / Topology / RBAC
                                       └─ History (trend chart)
```

## The agent

The agent is a single Go binary packaged as a distroless Docker image (`patryk2402/guardmap-agent:latest`). It runs as a Kubernetes `CronJob` inside your cluster.

It needs only **read** permissions on cluster resources — it never modifies anything.

**What it discovers:**
- Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets
- Services, Ingresses, Endpoints, NetworkPolicies
- ServiceAccounts, Roles, ClusterRoles, RoleBindings, ClusterRoleBindings
- Nodes (for K8s version and node count)
- AWS IAM roles via IRSA annotations (on EKS)

**What it sends to GuardMap:**
- Full graph data (nodes + edges)
- Security findings (type, severity, resource, description)
- Aggregated counts (critical / high / medium / low)
- Security score (0–100)
- Cluster metadata (K8s version, node count, region)
- Scan duration

## Security model

The agent authenticates using an **API key** that is:
- Stored as a Kubernetes `Secret` in your cluster
- Never stored in plaintext — only its SHA-256 hash lives in the database
- Scoped to a single organisation — cannot read or write data from other tenants

The `submit_scan` RPC is a `SECURITY DEFINER` Postgres function. The agent has no direct database access — it can only call this one function, which validates the key and writes to the correct cluster only.

**Protections built in:**
- Rate limit: max 10 scans per cluster per hour
- Payload size limit: 8 MB for graph data, 2 MB for findings
- Score validation: must be 0–100
- Scan results are append-only — no deletes, no updates

## Data flow in the dashboard

When you open the dashboard, `useGraphData` fetches the **latest scan** for the selected cluster from Supabase. All views (Overview, Findings, Graph, Topology, RBAC) are powered by this single scan record.

The **History** tab queries all scans for the cluster and renders a trend chart.

Both use Supabase's Row Level Security — you can only ever see data belonging to your own organisation.
