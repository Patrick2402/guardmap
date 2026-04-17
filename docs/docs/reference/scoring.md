---
id: scoring
title: Scoring reference
sidebar_position: 2
---

# Scoring reference

## Formula

```
penalty(count, perIssue, cap) =
  count == 0 ? 0 : min(cap, perIssue × (1 − 0.75ⁿ) / 0.25)

score = max(0, round(
  100
  − penalty(critical, 18, 42)
  − penalty(high,     10, 28)
  − penalty(medium,    4, 14)
  − penalty(low,       1,  6)
))
```

The same formula runs in both the Go agent and the React frontend.

## Parameters

| Severity | `perIssue` | `cap` |
|----------|-----------|-------|
| Critical | 18 | 42 |
| High | 10 | 28 |
| Medium | 4 | 14 |
| Low | 1 | 6 |

## Diminishing returns

Each additional finding contributes less than the previous:

| # findings | Marginal penalty (critical) |
|------------|----------------------------|
| 1st | −18 pts |
| 2nd | −13.5 pts |
| 3rd | −10.1 pts |
| 4th | −7.6 pts |
| 5th+ | diminishing toward cap of −42 |

## Score lookup table

| Critical | High | Medium | Low | Score |
|----------|------|--------|-----|-------|
| 0 | 0 | 0 | 0 | **100** |
| 1 | 0 | 0 | 0 | **72** |
| 0 | 1 | 0 | 0 | **90** |
| 1 | 2 | 3 | 5 | **64** |
| 4 | 30 | 6 | 31 | **13** |
| 10+ | 10+ | 10+ | 10+ | **0** |
