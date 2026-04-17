---
id: understanding-score
title: Understanding your score
sidebar_position: 2
---

# Understanding your score

## Score ranges

| Score | Label | Meaning |
|-------|-------|---------|
| 90–100 | **Passed** | No significant issues — cluster is well hardened |
| 70–89 | **Low Risk** | Minor issues found, no immediate action required |
| 50–69 | **Medium Risk** | Several issues detected — review recommended soon |
| 30–49 | **High Risk** | Significant vulnerabilities found — action required |
| 0–29 | **Critical** | Cluster has critical security issues — act immediately |

## The formula

The score uses a **diminishing-returns** penalty model — fixing your first critical finding has more impact than fixing your 10th.

```
penalty(count, perIssue, cap) = min(cap, perIssue × (1 − 0.75ⁿ) / 0.25)

score = 100
      − penalty(critical, 18, 42)
      − penalty(high,     10, 28)
      − penalty(medium,    4, 14)
      − penalty(low,       1,  6)
```

### Max deduction per severity

| Severity | Per issue | Max deduction |
|----------|-----------|---------------|
| Critical | −18 pts | −42 pts |
| High | −10 pts | −28 pts |
| Medium | −4 pts | −14 pts |
| Low | −1 pt | −6 pts |

### Example scores

| Findings | Score |
|----------|-------|
| 0 of everything | 100 |
| 1 critical | 72 |
| 4 critical, 30 high, 6 medium, 31 low | 13 |
| 2 high, 5 medium | 73 |

## Why does my fresh minikube score so low?

minikube is not hardened by default. A typical scan finds:

- `kube-proxy` running with `hostNetwork: true` → critical
- Missing NetworkPolicies on all namespaces → high
- Containers with `allowPrivilegeEscalation` not set to false → high (one per container)
- Images using `:latest` tag → medium
- Missing resource limits → medium

This is expected — minikube is a local dev tool, not a production cluster. On a properly hardened EKS cluster you'd typically score 70+.

## Improving your score

The **Findings** tab shows every issue with a remediation guide. Sort by severity and work top-down. Fixing 1 critical finding typically adds 15–20 points.
