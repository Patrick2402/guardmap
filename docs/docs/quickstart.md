---
id: quickstart
title: Quick Start
sidebar_position: 2
---

# Quick Start

Connect your EKS or Kubernetes cluster to GuardMap in under 5 minutes.

## Prerequisites

- A Kubernetes cluster (EKS, minikube, or any conformant K8s)
- `kubectl` configured and pointing at your cluster
- A GuardMap account

## Step 1 — Create an organisation

After signing up, you'll be prompted to create an organisation. This is your tenant — all clusters, API keys, and scan history live under it.

## Step 2 — Add a cluster

1. Go to **Integrations** in the top bar
2. Click **Add cluster**
3. Enter a name and region for your cluster
4. Copy the generated API token — you'll need it in the next step

## Step 3 — Deploy the agent

In the Integrations page, click **View manifest** on your cluster card. This generates a ready-to-apply Kubernetes manifest with your credentials pre-filled.

```bash
# Copy the manifest from the dashboard, then:
kubectl apply -f guardmap-agent.yaml
```

The manifest creates:
- A `guardmap` namespace
- A `ServiceAccount` with read-only cluster permissions
- A `Secret` with your API key
- A `CronJob` that runs every 6 hours

## Step 4 — Trigger the first scan

The agent runs automatically every 6 hours. To trigger an immediate scan:

```bash
kubectl create job -n guardmap --from=cronjob/guardmap-scanner guardmap-manual
```

## Step 5 — View results

Go back to the dashboard and click **Refresh**. You'll see:

- **Overview** — security score and namespace health
- **Findings** — all detected issues with remediation steps
- **History** — trend chart of your score over time

:::note
The first scan takes 30–120 seconds depending on cluster size. If the status stays **Pending**, check the agent logs:
```bash
kubectl logs -n guardmap -l app=guardmap-agent --tail=50
```
:::
