# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EKS GuardMap is a security visualization tool that maps the IRSA (IAM Roles for Service Accounts) permission chain in EKS clusters: **Deployment → ServiceAccount → IAM Role → IAM Policy → AWS Resource**. It exposes a `/api/map` endpoint returning a graph JSON consumed by a React Flow frontend.

---

## Commands

### Backend (Go)

```bash
cd backend

# Run — auto-discovers kubeconfig (in-cluster → ~/.kube/config → -kubeconfig flag)
go run ./cmd/server/...

# Run with explicit kubeconfig (minikube, EKS, any cluster)
go run ./cmd/server/... -kubeconfig ~/.kube/config -addr :8080

# Build binary
go build -o guardmap-server ./cmd/server/...

# Run tests
go test ./...
```

AWS credentials are resolved via the default chain (`~/.aws/credentials`, env vars, EC2/EKS instance metadata). The backend requires:
- K8s RBAC: `get`/`list` on pods, serviceaccounts, deployments, statefulsets, daemonsets, replicasets, services, ingresses, networkpolicies
- IAM: `iam:GetRolePolicy`, `iam:ListRolePolicies`, `iam:ListAttachedRolePolicies`, `iam:GetPolicy`, `iam:GetPolicyVersion`

For **minikube** (no AWS IAM): backend returns K8s topology but IAM nodes will be absent (no IRSA annotations). Use MOCK mode in the frontend for full demo.

For **EKS**: needs AWS credentials with IAM read permissions and a kubeconfig pointing at the cluster.

### Frontend (React/Vite)

```bash
cd frontend

npm install
npm run dev        # dev server on :3000, proxies /api → :8080
npm run build      # production build → dist/
npx tsc --noEmit   # type check only
```

Toggle `MOCK/LIVE` in the top-right corner. Mock mode fetches `frontend/public/data.json`.

---

## Architecture

### Data flow

```
K8s API (client-go)                         AWS IAM API (aws-sdk-go-v2)
     │                                                │
     ▼                                                ▼
discovery/k8s.go → ClusterSnapshot        discovery/iam.go → ResolvedRole
(Pods, Deployments, StatefulSets,
 DaemonSets, ReplicaSets, Services,
 Ingresses, NetworkPolicies, SAs)
     │                                                │
     └──────────────────┬─────────────────────────────┘
                        ▼
               discovery/graph.go → GraphData{Nodes, Edges}
                        │
                        ▼
               api/handler.go → GET /api/map (JSON)
                        │
                        ▼
               frontend: useGraphData hook → React Flow
```

### Node ID conventions (must match between backend and frontend)

| Type | ID format |
|---|---|
| Pod | `pod:{ns}/{name}` |
| ServiceAccount | `sa:{ns}/{name}` |
| Deployment | `deploy:{ns}/{name}` |
| StatefulSet | `ss:{ns}/{name}` |
| DaemonSet | `ds:{ns}/{name}` |
| Service | `k8s-svc:{ns}/{name}` |
| Ingress | `ing:{ns}/{name}` |
| NetworkPolicy | `netpol:{ns}/{name}` |
| IAM Role | `role:{arn}` |
| AWS Resource | `svc:{arn}` |

### Edge labels (frontend filters on these)

| Label | Meaning |
|---|---|
| `manages` | Workload → Pod (IRSA graph + Topology) |
| `uses` | Pod → ServiceAccount |
| `IRSA →` | ServiceAccount → IAM Role |
| `selects` | K8s Service → Workload (Topology only) |
| `routes →` | Ingress → K8s Service (Topology only) |
| action string | IAM Role → AWS Resource (with `accessLevel`) |

### Backend packages

- **`internal/models`** — shared structs + NodeType constants for all 10 node types.

- **`internal/discovery/k8s.go`** — `DiscoverCluster(ctx)` fetches `ClusterSnapshot` in one scan (all resource types). `IRSABindingsFromSnapshot` filters pods with IRSA annotations. Auto-selects in-cluster → `~/.kube/config` → `-kubeconfig` flag.

- **`internal/discovery/iam.go`** — fetches inline + managed policies for a role ARN. Handles URL-encoded JSON and `Action: string | []string`. `ClassifyAccess` → `read/write/full`. `ServiceFromARN` → human label. `serviceShortName` → lowercase service key for frontend icons.

- **`internal/discovery/graph.go`** — builds full graph from `ClusterSnapshot`:
  1. Maps pods to workloads via `ownerReferences` (RS→Deployment chain)
  2. Emits `manages` edges (workload→pod)
  3. IRSA chain: `pod→SA→role→aws_service` with `accessLevel`
  4. Topology: Services with label-selector matching → `selects` edges; Ingress rules → `routes →` edges; NetworkPolicy nodes with inferred `effect`
  5. Deduplicates edges by `source|target|label`

- **`internal/api/handler.go`** — single `GET /api/map` handler with 60s context timeout. CORS `*`.

### Frontend architecture

- **`src/types.ts`** — all types including 10 NodeTypes, WORKLOAD_TYPES, NETWORKING_TYPES, IRSA_TYPES.

- **`src/hooks/useBlastRadius`** — BFS from a workload or pod node. For workloads, seeds BFS from all managed pods (traverses `manages` edges first).

- **`src/utils/layout.ts`** — `applyNamespacedLayout`: swimlanes with [Workloads|SAs] groups per namespace, then IAM Roles, then AWS Services. `applyTopologyLayout`: [Workloads|Pods|Networking] groups per namespace.

- **`src/components/Graph.tsx`** — IRSA graph. Hides pods (shown only as topology). Computes transitive `workload→SA` edges from `workload→pod + pod→SA`. Deduplicates edges. Hover BFS (forward+backward) dims unrelated nodes. Click triggers `fitView` on full connected path. OffscreenOverlay shows edge-of-screen indicators for off-canvas connected nodes.

- **`src/components/Topology/TopologyView.tsx`** — K8s topology graph (no IAM). Filters to topology types and edge labels.

- **`src/components/Sidebar.tsx`** — IAM Permissions panel (grouped by AWS service, searchable). Direct Access Map (click to teleport to AWS node). Blast Radius stats.

### Styling conventions

Tailwind custom tokens: `cyber-bg`, `cyber-panel`, `cyber-border` in `tailwind.config.js`. Glassmorphism: `backdrop-blur-sm` + translucent backgrounds. All node components have a colored type-header strip for immediate identification (no legend needed).

### Mock data

`frontend/public/data.json` — 168 nodes, 151 edges across 7 namespaces. Has intentional vulnerabilities (shared roles, wildcards, cross-env access). Use for UI development without a cluster.

---

## Sync rule — UI, docs and manifests must stay consistent

After every change, check and update **all three** if affected:

1. **UI** (`frontend/src/`) — labels, copy, feature descriptions, checklists, terminal demos
2. **Docs** (`docs/docs/`) — counts ("30+ checks"), CronJob descriptions, install steps, quickstart
3. **K8s manifests** (`k8s/`) — must match `buildManifest()` in `IntegrationsPage.tsx` exactly

**Concrete things that drift and must stay in sync:**
- Number of security checks: source of truth is `internal/discovery/security.go` — reflect in docs and landing page copy
- CronJob names/schedules: `k8s/agent/install.yaml` ↔ `buildManifest()` ↔ `quickstart.md` ↔ `LandingPage.tsx` terminal demo
- Agent install checklist in `IntegrationsPage.tsx` step 3 ↔ what the manifest actually creates
- Docker image tag: `Dockerfile` build ↔ `install.yaml` ↔ `buildManifest()`

Do not close a task without checking these. If something is out of sync, fix it in the same response.
