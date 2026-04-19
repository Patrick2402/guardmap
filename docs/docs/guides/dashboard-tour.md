---
id: dashboard-tour
title: Dashboard tour
sidebar_position: 3
---

# Dashboard tour

## Overview

The Overview tab is your landing page after selecting a cluster. It shows:

- **Security score ring** — current score with colour coding (green → yellow → orange → red)
- **Severity breakdown** — bar chart of critical / high / medium / low counts
- **Cluster stats** — namespaces, workloads, pods, services, ingresses, RBAC roles
- **Namespace health** — a card per namespace showing its status and top issues. Click any card to jump to that namespace in Topology.
- **Quick navigation** — shortcuts to Topology, RBAC, Findings, and the IRSA Graph

When viewing a live cluster, the score and counts come directly from the last scan in the database. The scan timestamp and duration are shown below the score label.

## IRSA Graph

Visualises the IAM permission chain:

```
Deployment → Pod → ServiceAccount → IAM Role → AWS Resource
```

**How to use:**
- Click a workload to activate **Blast Radius** — highlights everything that workload can reach
- Hover any node to dim unrelated nodes
- The sidebar shows detailed IAM permissions grouped by AWS service
- Use the namespace filter toolbar to focus on a specific namespace

:::note
IRSA graph nodes (IAM Roles, AWS Resources) only appear for EKS clusters with IRSA annotations. On minikube you'll see K8s topology only.
:::

## Topology

Shows the K8s network topology — workloads, pods, services, ingresses, and network policies — without IAM nodes.

Click a namespace group header to fit-view that namespace. Click any node to see its details in the sidebar.

## RBAC

Renders the RBAC graph — roles, cluster roles, role bindings, service accounts. Useful for spotting overly permissive roles or wildcard bindings.

Roles are colour-coded by danger level:
- 🔴 **Red** — wildcard verbs or resources (critical)
- 🟠 **Orange** — access to sensitive resources like secrets or nodes (high)
- 🟡 **Yellow** — elevated but scoped permissions (medium)
- ⚪ **Grey** — standard low-risk roles

## Findings

Lists every security issue from the last scan, sourced directly from the database.

Use the **severity filter** to focus on critical/high only. Each finding includes the affected resource and remediation steps.

## Benchmarks

Maps your findings against five security frameworks:

| Framework | Controls |
|-----------|----------|
| CIS Kubernetes Benchmark v1.8 | 26 |
| MITRE ATT&CK for Containers | 16 |
| NSA/CISA Kubernetes Hardening Guide 2022 | 13 |
| AWS EKS Security Best Practices | 7 |
| OWASP Kubernetes Top 10 | 10 |

Each framework card shows coverage % and how many controls are actively triggered by findings in your cluster. Click any control row to open a detail sheet with the full description, attack scenario, step-by-step remediation, and links to active findings.

## History

Shows your security score over time as an area chart, plus a list of all past scans with trend indicators (↑↓).

The chart has reference lines at 90 (Passed) and 50 (Medium Risk). Scan rows show the timestamp, score delta (↑/↓), and breakdown of finding counts.

## Explorer

A raw data explorer — search and filter all nodes and edges discovered in your cluster. Filter by node type (pod, deployment, IAM role, service…), sort by label or namespace, and inspect raw metadata. Useful for verifying what the agent discovered or exporting data for external tooling.
