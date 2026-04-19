---
id: batch
title: Batch & workload checks
sidebar_position: 6
---

# Batch & workload checks

These checks cover Jobs, CronJobs, and general workload hygiene that doesn't fit the pod-container scope.

## Medium

### `cj_concurrent_allow`
CronJob has `concurrencyPolicy: Allow` — if a run takes longer than the schedule interval, multiple instances can run simultaneously, causing duplicate processing, data corruption, or resource exhaustion.

**Remediation:** Use `Forbid` (skip if previous still running) or `Replace` (kill previous, start new):
```yaml
spec:
  concurrencyPolicy: Forbid
```

---

## Low

### `job_no_ttl`
Job has no `ttlSecondsAfterFinished` — completed Jobs accumulate indefinitely, cluttering the namespace and consuming etcd storage.

**Remediation:**
```yaml
spec:
  ttlSecondsAfterFinished: 86400  # clean up after 24h
```

---

### `cj_missing_deadline`
CronJob has no `startingDeadlineSeconds` — if the scheduler misses a run window (e.g. cluster was down), it may try to backfill all missed runs at once.

**Remediation:**
```yaml
spec:
  startingDeadlineSeconds: 300  # give up if >5 min late
```
