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

## History

Shows your security score over time as an area chart, plus a list of all past scans with trend indicators (↑↓).

The chart has reference lines at 90 (Passed) and 50 (Medium Risk).

## Explorer

A raw data explorer — browse all nodes and edges in the graph. Useful for debugging or verifying discovered resources.
