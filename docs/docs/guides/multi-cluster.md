---
id: multi-cluster
title: Multi-cluster setup
sidebar_position: 4
---

# Multi-cluster setup

## How multi-cluster works

Each cluster gets its own API key and runs its own agent CronJob. The dashboard lets you switch between clusters using the cluster selector in the top bar.

Data is fully isolated per organisation — members of one organisation cannot see data from another.

## Adding multiple clusters

Repeat the [Connect a cluster](./connect-cluster) guide for each cluster. Each one needs:
- A unique cluster name within your organisation
- Its own API key (generated per-cluster in Integrations)
- The agent deployed into the cluster

## Switching clusters

Click the cluster selector in the top bar. You'll see all clusters belonging to your active organisation.

- 🟢 **Green dot** — cluster is active (has at least one scan)
- 🟡 **Yellow dot** — pending (no scan yet)

## Multiple organisations

The org switcher (top-left) lets you switch between organisations if you're a member of more than one.

:::warning
Switching organisations resets the cluster selection to mock mode. This is intentional — it prevents accidentally viewing data from the wrong organisation.
:::

## Member roles

| Role | Can view | Can trigger scan | Can manage keys | Can delete cluster |
|------|----------|-----------------|-----------------|-------------------|
| Readonly | ✓ | | | |
| Developer | ✓ | ✓ | | |
| Admin | ✓ | ✓ | ✓ | ✓ |
