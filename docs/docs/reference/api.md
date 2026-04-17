---
id: api
title: API reference
sidebar_position: 3
---

# API reference

:::note
This endpoint is used internally by the GuardMap agent. You only need this if you're building a custom integration.
:::

## `POST /rest/v1/rpc/submit_scan`

Submits a scan result for a cluster. Authenticated via API key.

### Headers

```
Content-Type: application/json
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
```

### Request body

```json
{
  "p_api_key":        "gm_live_...",
  "p_cluster_name":   "my-cluster",
  "p_graph_data":     { "nodes": [], "edges": [] },
  "p_findings":       [
    {
      "type":        "privileged_container",
      "severity":    "critical",
      "resource":    "production/my-app/my-container",
      "description": "Container runs in privileged mode"
    }
  ],
  "p_security_score":  73,
  "p_critical_count":  1,
  "p_high_count":      4,
  "p_medium_count":    3,
  "p_low_count":       8,
  "p_duration_ms":     142,
  "p_k8s_version":    "v1.34.0",
  "p_node_count":     3,
  "p_region":         "eu-central-1"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `p_api_key` | string | ✓ | API key from the dashboard |
| `p_cluster_name` | string | ✓ | Must match cluster name exactly |
| `p_graph_data` | object | ✓ | Graph JSON, max 8 MB |
| `p_findings` | array | | Security findings array, max 2 MB |
| `p_security_score` | integer | | Score 0–100 |
| `p_critical_count` | integer | | Count of critical findings |
| `p_high_count` | integer | | Count of high findings |
| `p_medium_count` | integer | | Count of medium findings |
| `p_low_count` | integer | | Count of low findings |
| `p_duration_ms` | integer | | Scan duration in ms |
| `p_k8s_version` | string | | e.g. `v1.34.0` |
| `p_node_count` | integer | | Number of cluster nodes |
| `p_region` | string | | Cloud region |

### Response

```json
"52134294-da94-4efa-9c34-520b3180bb72"
```

Returns the UUID of the created scan record.

### Error codes

| Error | Meaning |
|-------|---------|
| `invalid_api_key` | Key not found, revoked, or expired |
| `cluster_not_found` | No cluster with that name in the key's organisation |
| `rate_limit_exceeded` | More than 10 scans in the last hour |
| `payload_too_large` | `graph_data` > 8 MB or `findings` > 2 MB |
| `invalid_score` | `security_score` outside 0–100 |
