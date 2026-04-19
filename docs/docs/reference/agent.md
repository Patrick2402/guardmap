---
id: agent
title: Agent reference
sidebar_position: 1
---

# Agent reference

## Docker image

```
patryk2402/guardmap-agent:latest
```

Public image on Docker Hub. Built from `gcr.io/distroless/static-debian12:nonroot` — no shell, no package manager, minimal attack surface.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GUARDMAP_API_KEY` | ✓ | API key generated in the Integrations page |
| `SUPABASE_URL` | ✓ | GuardMap Supabase endpoint |
| `SUPABASE_ANON_KEY` | ✓ | GuardMap Supabase anon key |
| `CLUSTER_NAME` | ✓ | Must match the cluster name in the dashboard exactly |
| `KUBECONFIG` | | Path to kubeconfig. Leave empty for in-cluster config (recommended) |

## Required RBAC permissions

The agent needs read-only access to:

```yaml
rules:
- apiGroups: [""]
  resources: [pods, serviceaccounts, services, endpoints, nodes, namespaces, secrets, configmaps]
  verbs: [get, list, watch]
- apiGroups: ["apps"]
  resources: [deployments, statefulsets, daemonsets, replicasets]
  verbs: [get, list, watch]
- apiGroups: ["networking.k8s.io"]
  resources: [ingresses, networkpolicies]
  verbs: [get, list, watch]
- apiGroups: ["batch"]
  resources: [jobs, cronjobs]
  verbs: [get, list, watch]
- apiGroups: ["rbac.authorization.k8s.io"]
  resources: [roles, clusterroles, rolebindings, clusterrolebindings]
  verbs: [get, list, watch]
```

The agent **never writes** to your cluster.

## Schedule

Default: every 6 hours (`0 */6 * * *`). To change:

```bash
kubectl patch cronjob guardmap-scanner -n guardmap \
  -p '{"spec":{"schedule":"0 */12 * * *"}}'
```

## Manual trigger

```bash
kubectl create job -n guardmap \
  --from=cronjob/guardmap-scanner \
  guardmap-manual-$(date +%s)
```

## What the agent sends

| Field | Description |
|-------|-------------|
| `graph_data` | Full node/edge graph (K8s topology + IRSA chains) |
| `findings` | Array of `{type, severity, resource, description}` |
| `security_score` | 0–100 computed score |
| `critical_count` | Number of critical findings |
| `high_count` | Number of high findings |
| `medium_count` | Number of medium findings |
| `low_count` | Number of low findings |
| `duration_ms` | Scan duration in milliseconds |
| `k8s_version` | Kubernetes version from node info |
| `node_count` | Number of nodes in the cluster |
| `region` | AWS/cloud region from node labels |

## Server-side limits

- Max 10 scans per cluster per hour
- `graph_data` max 8 MB
- `findings` max 2 MB
- `security_score` must be 0–100
