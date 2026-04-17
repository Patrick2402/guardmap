---
id: connect-cluster
title: Connect a cluster
sidebar_position: 1
---

# Connect a cluster

## EKS cluster

EKS clusters work out of the box. The agent automatically detects the AWS region from node labels and discovers IRSA bindings.

```bash
# Make sure kubectl points at your EKS cluster
kubectl config current-context

# Apply the manifest from the Integrations page
kubectl apply -f guardmap-agent.yaml
```

The IRSA graph (ServiceAccount → IAM Role → AWS Resource) only appears for pods with the `eks.amazonaws.com/role-arn` annotation on their ServiceAccount.

## minikube

minikube is fully supported. IAM/IRSA nodes won't appear (no AWS), but all K8s security checks still run.

```bash
minikube start
kubectl apply -f guardmap-agent.yaml
```

## Other clusters (GKE, AKS, on-prem)

Any CNCF-conformant Kubernetes cluster works. The agent uses standard K8s APIs only.

```bash
kubectl apply -f guardmap-agent.yaml
```

:::note
Region detection relies on the `topology.kubernetes.io/region` node label. On non-AWS clusters this will be empty — you can set the region manually when creating the cluster in the dashboard.
:::

## Verifying the agent

```bash
# Check the CronJob is running
kubectl get cronjob -n guardmap

# Trigger a manual scan
kubectl create job -n guardmap --from=cronjob/guardmap-scanner guardmap-manual

# Watch the logs
kubectl logs -n guardmap job/guardmap-manual -f
```

A successful scan looks like:

```json
{"msg":"scan complete","nodes":173,"edges":68,"findings":71,"score":13,"k8s_version":"v1.34.0","node_count":1}
{"msg":"scan submitted","scan_id":"52134294-da94-4efa-9c34-520b3180bb72"}
```

## Troubleshooting

<details>
<summary>Status stays Pending after applying the manifest</summary>

The agent hasn't submitted its first scan yet. Trigger one manually:
```bash
kubectl create job -n guardmap --from=cronjob/guardmap-scanner guardmap-manual
kubectl logs -n guardmap job/guardmap-manual
```
</details>

<details>
<summary>invalid_api_key error in logs</summary>

The API key in the Secret is wrong or has been revoked. Delete the old manifest, generate a new token in Integrations, and re-apply.
</details>

<details>
<summary>cluster_not_found error in logs</summary>

The `CLUSTER_NAME` env var in the Secret doesn't match the name you entered in the dashboard. Both must be identical.
</details>

<details>
<summary>rate_limit_exceeded error</summary>

More than 10 scans were submitted in the last hour for this cluster. Wait and try again.
</details>
