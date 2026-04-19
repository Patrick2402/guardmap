---
id: benchmarks
title: Benchmarks
sidebar_position: 5
---

# Benchmarks

The **Benchmarks** tab maps your cluster's security findings against five industry frameworks, giving you a compliance-style coverage view in addition to the raw Findings list.

## Supported frameworks

| Framework | Controls | What it covers |
|-----------|----------|---------------|
| **CIS Kubernetes Benchmark v1.8** | 26 | RBAC (5.1), Pod Security (5.2), Network (5.3), Secrets (5.4) |
| **MITRE ATT&CK for Containers** | 16 | Tactics: Execution, Persistence, Privilege Escalation, Credential Access, Discovery, etc. |
| **NSA/CISA Kubernetes Hardening Guide 2022** | 13 | Pod security, network separation, authentication, secrets management, audit logging |
| **AWS EKS Security Best Practices** | 7 | IRSA scoping, RBAC, network policy, supply chain, workload isolation |
| **OWASP Kubernetes Top 10** | 10 | K01 (insecure workloads) through K10 (outdated components) |

## Coverage status

Each control has one of three statuses:

- ✅ **Covered** — GuardMap has at least one detection rule that maps to this control
- ⚠️ **Active** — Covered and currently triggered by a finding in your cluster
- ➖ **Not applicable** — Control requires runtime analysis, admission controllers, or external tooling that GuardMap cannot inspect statically

## Control detail sheet

Click any control row to open a detail sheet with:

- **Description** — what the control requires and why it matters
- **Attack scenario** — how an attacker exploits this gap
- **Remediation steps** — concrete `kubectl` commands and YAML patches
- **GuardMap detection rules** — which rule IDs cover this control
- **Active findings** — findings currently triggering this control, with a "View" button to jump to the node in Topology or the IRSA Graph

## Coverage gaps

Some controls are intentionally marked ➖. These require capabilities outside static K8s API analysis:

- **Runtime monitoring** — detecting active exploit attempts (Falco, eBPF)
- **Admission controller inspection** — OPA/Kyverno policy content is not accessible via the K8s API
- **External secret store configuration** — HashiCorp Vault, AWS Secrets Manager state
- **Audit log analysis** — requires reading actual audit logs, not cluster state

These are real controls but GuardMap cannot evaluate them without additional data sources.
