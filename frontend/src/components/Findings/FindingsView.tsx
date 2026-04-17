import { useMemo, useState } from 'react'
import type { DbFinding } from '../../hooks/useGraphData'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldAlert, ShieldCheck, Network, Key, Lock,
  ArrowRight, AlertTriangle, XCircle, Info, X,
  Wrench, FileText, Target, ChevronRight,
} from 'lucide-react'
import { GraphData } from '../../types'
import { TabId } from '../Nav'

type Severity = 'critical' | 'high' | 'medium' | 'low'
type Category = 'rbac' | 'pod-security' | 'network' | 'irsa'

export interface Finding {
  id: string
  severity: Severity
  category: Category
  title: string
  description: string
  remediation: string[]
  nodeId: string
  nodeLabel: string
  namespace?: string
  navTab: TabId
  navNodeId?: string
}

const SKIP_NS  = new Set(['kube-system', 'kube-public', 'kube-node-lease', 'ingress-nginx', 'cert-manager'])
const WORKLOAD_SET = new Set(['deployment', 'statefulset', 'daemonset', 'pod'])

function computeFindings(data: GraphData): Finding[] {
  const findings: Finding[] = []
  let idx = 0
  const add = (f: Omit<Finding, 'id'>) => findings.push({ ...f, id: `f${idx++}` })

  for (const node of data.nodes) {
    const ns = node.namespace ?? ''
    if (SKIP_NS.has(ns)) continue
    const m = node.metadata ?? {}

    if (node.type === 'k8s_role' || node.type === 'k8s_clusterrole') {
      const danger = m.danger ?? 'low'
      const rules  = m.rules ?? ''
      if (danger === 'critical') {
        const isEscalate = rules.includes('escalate') || rules.includes('impersonate')
        add({
          severity: 'critical', category: 'rbac',
          title: isEscalate ? 'Privilege escalation verbs' : 'Wildcard permissions',
          description: isEscalate
            ? 'Role grants escalate, bind or impersonate verbs — this allows bypassing RBAC entirely and gaining any permission in the cluster.'
            : 'Role grants wildcard (*) resource or verb access. This is equivalent to cluster-admin and gives full control over the namespace or cluster.',
          remediation: isEscalate
            ? [
                'Remove escalate, bind and impersonate verbs from the role rules',
                'If privilege escalation is needed for CI/CD, use a dedicated service account with scoped permissions',
                'Audit all subjects bound to this role via RoleBinding/ClusterRoleBinding',
                'Enable audit logging to detect when these verbs are exercised',
              ]
            : [
                'Replace wildcards (*) with explicit API groups, resources and verbs',
                'Apply principle of least privilege — grant only what the workload needs',
                'Use `kubectl auth can-i --list --as=system:serviceaccount:<ns>:<sa>` to audit current permissions',
                'Consider splitting into multiple roles with narrower scopes',
              ],
          nodeId: node.id, nodeLabel: node.label, namespace: ns || undefined,
          navTab: 'rbac', navNodeId: node.id,
        })
      } else if (danger === 'high') {
        const hasSecrets = rules.includes('secrets')
        const hasExec    = rules.includes('pods/exec') || rules.includes('pods/attach')
        if (hasSecrets) add({
          severity: 'high', category: 'rbac',
          title: 'Secrets read access',
          description: 'Role can read and list Kubernetes Secrets. Secrets often contain database passwords, API tokens, TLS private keys and other sensitive credentials.',
          remediation: [
            'Restrict secret access using resourceNames to allow only specific secrets by name',
            'Use a secrets manager (AWS Secrets Manager, HashiCorp Vault) instead of K8s Secrets for sensitive data',
            'Audit which pods are actually using secrets via this role',
            'Enable Secret encryption at rest if not already configured',
          ],
          nodeId: node.id, nodeLabel: node.label, namespace: ns || undefined,
          navTab: 'rbac', navNodeId: node.id,
        })
        if (hasExec) add({
          severity: 'high', category: 'rbac',
          title: 'Pod exec / attach allowed',
          description: 'Role can exec into or attach to running pods. This allows arbitrary code execution inside containers, environment variable extraction, and credential harvesting.',
          remediation: [
            'Remove pods/exec and pods/attach verbs from the role',
            'If developer debugging access is required, implement a time-limited break-glass procedure',
            'Use kubectl debug ephemeral containers instead, which can be more tightly controlled',
            'Log and alert on any exec/attach events via audit policy',
          ],
          nodeId: node.id, nodeLabel: node.label, namespace: ns || undefined,
          navTab: 'rbac', navNodeId: node.id,
        })
        if (!hasSecrets && !hasExec) add({
          severity: 'high', category: 'rbac',
          title: 'High-risk permissions',
          description: 'Role has permissions that could enable lateral movement or data exfiltration within the cluster.',
          remediation: [
            'Review the full rule set and remove permissions not required for the workload',
            'Apply principle of least privilege and scope to minimum necessary resources',
            'Audit subjects bound to this role for unexpected service accounts',
          ],
          nodeId: node.id, nodeLabel: node.label, namespace: ns || undefined,
          navTab: 'rbac', navNodeId: node.id,
        })
      }
    }

    if (WORKLOAD_SET.has(node.type) && !SKIP_NS.has(ns)) {
      if (m.privileged === 'true') add({
        severity: 'critical', category: 'pod-security',
        title: 'Privileged container',
        description: 'Container runs with full host kernel capabilities (privileged: true). Any container escape grants root access to the underlying node, potentially compromising the entire cluster.',
        remediation: [
          'Set securityContext.privileged: false in the pod/container spec',
          'Use capabilities.add to grant only specific Linux capabilities needed (e.g. NET_ADMIN) instead of full privilege',
          'Enforce Pod Security Standards at namespace level: kubectl label namespace <ns> pod-security.kubernetes.io/enforce=restricted',
          'If the workload genuinely needs node-level access, isolate it to a dedicated node group',
        ],
        nodeId: node.id, nodeLabel: node.label, namespace: ns || undefined,
        navTab: 'topology', navNodeId: node.id,
      })
      if (m.runAsRoot === 'true') add({
        severity: 'high', category: 'pod-security',
        title: 'Running as root (UID 0)',
        description: 'Container process runs as root user. If an attacker exploits a vulnerability in the application, they inherit root privileges, making container escapes much more impactful.',
        remediation: [
          'Set securityContext.runAsNonRoot: true and runAsUser: 1000 (or any non-zero UID)',
          'Update the container image to use a non-root user — add USER 1000 to the Dockerfile',
          'Set securityContext.allowPrivilegeEscalation: false as an additional control',
          'If the image requires root, consider using a distroless or minimal base image',
        ],
        nodeId: node.id, nodeLabel: node.label, namespace: ns || undefined,
        navTab: 'topology', navNodeId: node.id,
      })
      if (m.hostNetwork === 'true') add({
        severity: 'high', category: 'pod-security',
        title: 'Host network namespace shared',
        description: 'Pod shares the node\'s network namespace. It can listen on any node port, sniff all network traffic on the node, reach node-local APIs (e.g. metadata endpoint), and bypass NetworkPolicy controls.',
        remediation: [
          'Remove hostNetwork: true from the pod spec unless absolutely required',
          'Use a Kubernetes Service with appropriate type (ClusterIP/NodePort/LoadBalancer) for network exposure',
          'For monitoring workloads that need host metrics, use the Kubernetes metrics API instead',
          'If hostNetwork is required (e.g. some CNI plugins), isolate to a dedicated privileged node pool',
        ],
        nodeId: node.id, nodeLabel: node.label, namespace: ns || undefined,
        navTab: 'topology', navNodeId: node.id,
      })
      if (m.hostPID === 'true') add({
        severity: 'high', category: 'pod-security',
        title: 'Host PID namespace shared',
        description: 'Pod can see and signal all processes running on the host. This enables credential harvesting from /proc, process injection, and monitoring of all node activity.',
        remediation: [
          'Remove hostPID: true from the pod spec',
          'For process monitoring, use the Kubernetes metrics API or dedicated agents (Falco, Datadog)',
          'If debugging access is needed, use kubectl debug with ephemeral containers instead',
        ],
        nodeId: node.id, nodeLabel: node.label, namespace: ns || undefined,
        navTab: 'topology', navNodeId: node.id,
      })
      if (m.hostPath === 'true') add({
        severity: 'medium', category: 'pod-security',
        title: 'HostPath volume mounted',
        description: 'Pod mounts a path from the host filesystem. Depending on the path, this may expose kubelet credentials, container runtime sockets, or sensitive host configuration files.',
        remediation: [
          'Replace hostPath volumes with ConfigMap, Secret, or emptyDir where possible',
          'If hostPath is required (e.g. log collection), mount as readOnly: true',
          'Restrict the path to the minimum necessary (avoid /, /etc, /var/run/docker.sock)',
          'Use PodSecurityContext.fsGroup to control file permissions on mounted volumes',
        ],
        nodeId: node.id, nodeLabel: node.label, namespace: ns || undefined,
        navTab: 'topology', navNodeId: node.id,
      })
    }
  }

  const netpolNs = new Set(data.nodes.filter(n => n.type === 'networkpolicy').map(n => n.namespace ?? ''))
  const workloadNs = new Set(
    data.nodes.filter(n => ['deployment','statefulset','daemonset'].includes(n.type) && !SKIP_NS.has(n.namespace ?? '')).map(n => n.namespace ?? '')
  )
  for (const ns of workloadNs) {
    if (ns && !netpolNs.has(ns)) {
      add({
        severity: 'high', category: 'network',
        title: 'No NetworkPolicy',
        description: `Namespace "${ns}" contains workloads but has no NetworkPolicy defined. All pod-to-pod traffic is unrestricted — any compromised pod can reach any other pod in any namespace.`,
        remediation: [
          'Start with a default-deny-all ingress policy: apply a NetworkPolicy with empty podSelector and no ingress rules',
          'Then add explicit allow rules for legitimate traffic paths (e.g., frontend → backend on port 8080)',
          'Use namespace selectors to allow cross-namespace traffic only where needed',
          'Consider tools like Cilium or Calico for policy management and visualization',
          `kubectl apply -f - <<EOF\napiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: default-deny\n  namespace: ${ns}\nspec:\n  podSelector: {}\n  policyTypes: [Ingress, Egress]\nEOF`,
        ],
        nodeId: `ns:${ns}`, nodeLabel: ns, namespace: ns,
        navTab: 'topology', navNodeId: `topo-group:${ns}`,
      })
    }
  }

  for (const edge of data.edges) {
    if (edge.accessLevel === 'full') {
      const src = data.nodes.find(n => n.id === edge.source)
      const tgt = data.nodes.find(n => n.id === edge.target)
      if (src && tgt && !SKIP_NS.has(src.namespace ?? '')) {
        add({
          severity: 'high', category: 'irsa',
          title: 'Wildcard IAM access via IRSA',
          description: `IAM role "${src.label}" has wildcard (*) action access to ${tgt.label}. Any pod using this role's service account can perform any action on this AWS resource.`,
          remediation: [
            'Replace Action: "*" with specific IAM actions needed (e.g., ["s3:GetObject", "s3:PutObject"])',
            'Use Resource ARNs to scope access to specific buckets/tables/queues rather than *',
            'Apply AWS IAM Access Analyzer to identify and right-size overly permissive policies',
            'Use IRSA condition keys (StringEquals aws:RequestedRegion) to add additional constraints',
            'Regularly review permissions with AWS IAM Access Advisor (Last Accessed tab)',
          ],
          nodeId: src.id, nodeLabel: src.label, namespace: src.namespace,
          navTab: 'graph', navNodeId: src.id,
        })
      }
    }
  }

  return findings
}

// ── Visual config ─────────────────────────────────────────────────────────────

const SEV_CFG = {
  critical: { color: '#ef4444', glow: 'rgba(239,68,68,0.2)',  badgeBg: 'rgba(239,68,68,0.12)', label: 'Critical', icon: <XCircle size={14} /> },
  high:     { color: '#f97316', glow: 'rgba(249,115,22,0.15)',badgeBg: 'rgba(249,115,22,0.1)', label: 'High',     icon: <AlertTriangle size={14} /> },
  medium:   { color: '#eab308', glow: 'rgba(234,179,8,0.12)', badgeBg: 'rgba(234,179,8,0.08)', label: 'Medium',   icon: <AlertTriangle size={14} /> },
  low:      { color: '#64748b', glow: 'rgba(100,116,139,0.1)',badgeBg: 'rgba(100,116,139,0.08)',label: 'Low',      icon: <Info size={14} /> },
} as const

const CAT_CFG: Record<Category, { icon: React.ReactNode; label: string; color: string }> = {
  'rbac':         { icon: <Lock size={11} />,        label: 'RBAC',         color: '#a78bfa' },
  'pod-security': { icon: <ShieldAlert size={11} />, label: 'Pod Security', color: '#22d3ee' },
  'network':      { icon: <Network size={11} />,     label: 'Network',      color: '#2dd4bf' },
  'irsa':         { icon: <Key size={11} />,         label: 'IAM / IRSA',   color: '#60a5fa' },
}

const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
type Filter = 'all' | Category

// ── Finding Detail Sheet ──────────────────────────────────────────────────────

function FindingSheet({ finding, onClose, onNavigate }: {
  finding: Finding
  onClose: () => void
  onNavigate?: (tab: TabId, nodeId?: string) => void
}) {
  const sev = SEV_CFG[finding.severity]
  const cat = CAT_CFG[finding.category]
  const isCode = (s: string) => s.startsWith('kubectl') || s.startsWith('apiVersion') || s.includes('\n')

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <motion.div
        key="sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{
          height: '60vh',
          background: 'rgba(10,15,26,0.97)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          boxShadow: `0 -20px 60px rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.06), 0 -40px 80px ${sev.glow}`,
          borderTop: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '20px 20px 0 0',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Header */}
        <div className="flex items-start gap-4 px-6 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: sev.badgeBg }}>
            <span style={{ color: sev.color }}>{sev.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-sans font-bold uppercase tracking-wider" style={{ color: sev.color }}>
                {sev.label}
              </span>
              <span className="flex items-center gap-1.5 text-xs font-sans font-medium px-2 py-0.5 rounded-lg"
                style={{ background: `${cat.color}15`, color: cat.color }}>
                {cat.icon} {cat.label}
              </span>
              {finding.namespace && (
                <span className="text-xs font-mono text-slate-500 px-2 py-0.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>
                  {finding.namespace}
                </span>
              )}
            </div>
            <div className="text-lg font-sans font-bold text-slate-100 mt-1">{finding.title}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onNavigate && (
              <button
                onClick={() => { onNavigate(finding.navTab, finding.navNodeId); onClose() }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-sans font-semibold transition-all hover:opacity-80"
                style={{ background: sev.badgeBg, color: sev.color, border: `1px solid ${sev.color}30` }}
              >
                View in {finding.navTab}
                <ArrowRight size={14} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-200 transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Affected resource */}
          <div className="flex items-start gap-3 p-3.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <Target size={14} className="text-slate-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-sans text-slate-500 uppercase tracking-wider mb-1">Affected resource</div>
              <div className="flex items-center gap-2 flex-wrap">
                {finding.namespace && (
                  <>
                    <span className="text-sm font-mono text-slate-400">{finding.namespace}</span>
                    <ChevronRight size={12} className="text-slate-700" />
                  </>
                )}
                <span className="text-sm font-mono font-semibold text-slate-200">{finding.nodeLabel}</span>
              </div>
            </div>
          </div>

          {/* What is this */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={13} className="text-slate-500" />
              <span className="text-xs font-sans text-slate-500 uppercase tracking-wider">What is this?</span>
            </div>
            <p className="text-sm font-sans text-slate-300 leading-relaxed">{finding.description}</p>
          </div>

          {/* Remediation */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wrench size={13} style={{ color: sev.color }} />
              <span className="text-xs font-sans uppercase tracking-wider font-semibold" style={{ color: sev.color }}>
                How to fix it
              </span>
            </div>
            <div className="space-y-2">
              {finding.remediation.map((step, i) => (
                <div key={i}>
                  {isCode(step) ? (
                    <pre className="text-xs font-mono text-slate-300 p-3 rounded-xl overflow-x-auto leading-relaxed"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      {step}
                    </pre>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-mono font-bold"
                        style={{ background: `${sev.color}20`, color: sev.color }}>
                        {i + 1}
                      </div>
                      <p className="text-sm font-sans text-slate-300 leading-relaxed">{step}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── DB findings converter ─────────────────────────────────────────────────────

const TYPE_META: Record<string, { category: Category; title: string; remediation: string[]; navTab: TabId }> = {
  host_pid:                    { category: 'pod-security', title: 'Host PID namespace shared',         navTab: 'topology', remediation: ['Set spec.hostPID: false', 'Use process namespaces isolation'] },
  host_network:                { category: 'pod-security', title: 'Host network namespace shared',     navTab: 'topology', remediation: ['Set spec.hostNetwork: false', 'Use CNI network policies instead'] },
  host_ipc:                    { category: 'pod-security', title: 'Host IPC namespace shared',         navTab: 'topology', remediation: ['Set spec.hostIPC: false'] },
  privileged_container:        { category: 'pod-security', title: 'Privileged container',              navTab: 'topology', remediation: ['Set securityContext.privileged: false', 'Use specific capabilities instead'] },
  dangerous_capability:        { category: 'pod-security', title: 'Dangerous Linux capability',        navTab: 'topology', remediation: ['Remove capability from securityContext.capabilities.add', 'Use drop: [ALL] and only add needed caps'] },
  privilege_escalation_allowed:{ category: 'pod-security', title: 'Privilege escalation allowed',      navTab: 'topology', remediation: ['Set securityContext.allowPrivilegeEscalation: false'] },
  runs_as_root:                { category: 'pod-security', title: 'Container runs as root',            navTab: 'topology', remediation: ['Set securityContext.runAsNonRoot: true', 'Set securityContext.runAsUser to a non-zero UID'] },
  host_path_mount:             { category: 'pod-security', title: 'Host path volume mounted',          navTab: 'topology', remediation: ['Replace hostPath with emptyDir or a PVC', 'If required, use readOnly: true'] },
  no_resource_limits:          { category: 'pod-security', title: 'Missing resource limits',           navTab: 'topology', remediation: ['Set resources.limits.cpu and resources.limits.memory'] },
  unpinned_image:              { category: 'pod-security', title: 'Unpinned image tag',               navTab: 'topology', remediation: ['Use a specific image digest or version tag instead of :latest'] },
  writable_root_fs:            { category: 'pod-security', title: 'Writable root filesystem',          navTab: 'topology', remediation: ['Set securityContext.readOnlyRootFilesystem: true', 'Mount writable paths as emptyDir volumes'] },
  no_resource_requests:        { category: 'pod-security', title: 'Missing resource requests',         navTab: 'topology', remediation: ['Set resources.requests.cpu and resources.requests.memory'] },
  no_liveness_probe:           { category: 'pod-security', title: 'No liveness probe',                navTab: 'topology', remediation: ['Add livenessProbe to detect and restart unhealthy containers'] },
  no_network_policy:           { category: 'network',      title: 'No NetworkPolicy in namespace',    navTab: 'topology', remediation: ['Create a default-deny NetworkPolicy', 'Add explicit allow rules for required traffic'] },
  allow_all_ingress:           { category: 'network',      title: 'NetworkPolicy allows all ingress', navTab: 'topology', remediation: ['Restrict ingress with specific podSelector and namespaceSelector rules'] },
  allow_all_egress:            { category: 'network',      title: 'NetworkPolicy allows all egress',  navTab: 'topology', remediation: ['Add egress rules to limit outbound traffic to required endpoints'] },
  wildcard_clusterrole:        { category: 'rbac',         title: 'Wildcard ClusterRole',             navTab: 'rbac',     remediation: ['Replace wildcard verbs/resources with specific permissions', 'Follow principle of least privilege'] },
  wildcard_sensitive_resource: { category: 'rbac',         title: 'Wildcard on sensitive resource',   navTab: 'rbac',     remediation: ['Scope verbs to only what is needed', 'Avoid wildcard on secrets, pods, deployments'] },
  cluster_admin_binding:       { category: 'rbac',         title: 'cluster-admin binding',            navTab: 'rbac',     remediation: ['Replace cluster-admin with a scoped ClusterRole', 'Use namespace-scoped Roles where possible'] },
  default_sa_role_binding:     { category: 'rbac',         title: 'Default SA has role binding',      navTab: 'rbac',     remediation: ['Create a dedicated ServiceAccount', 'Do not bind roles to the default ServiceAccount'] },
  iam_wildcard_access:         { category: 'irsa',         title: 'IAM wildcard access',              navTab: 'graph',    remediation: ['Replace Action: "*" with specific IAM actions', 'Use resource-level conditions to limit scope'] },
  iam_write_access:            { category: 'irsa',         title: 'IAM write access',                 navTab: 'graph',    remediation: ['Audit whether write access is required', 'Consider read-only policies where possible'] },
}

function convertDbFindings(dbFindings: DbFinding[]): Finding[] {
  return dbFindings.map((f, i) => {
    const meta = TYPE_META[f.type] ?? {
      category: 'pod-security' as Category,
      title: f.type.replace(/_/g, ' '),
      remediation: [],
      navTab: 'overview' as TabId,
    }
    const parts = f.resource.split('/')
    return {
      id:          `db-${i}`,
      severity:    f.severity as Severity,
      category:    meta.category,
      title:       meta.title,
      description: f.description,
      remediation: meta.remediation,
      nodeId:      f.resource,
      nodeLabel:   parts[parts.length - 1] ?? f.resource,
      namespace:   parts.length > 1 ? parts[0] : undefined,
      navTab:      meta.navTab,
    }
  })
}

// ── Main view ─────────────────────────────────────────────────────────────────

interface FindingsViewProps {
  data: GraphData
  dbFindings?: DbFinding[]
  onNavigate?: (tab: TabId, nodeId?: string) => void
}

export function FindingsView({ data, dbFindings, onNavigate }: FindingsViewProps) {
  const computed   = useMemo(() => computeFindings(data), [data])
  const fromDb     = useMemo(() => dbFindings && dbFindings.length > 0 ? convertDbFindings(dbFindings) : null, [dbFindings])
  const findings   = fromDb ?? computed
  const [filter, setFilter]         = useState<Filter>('all')
  const [selected, setSelected]     = useState<Finding | null>(null)

  const visible = useMemo(() =>
    (filter === 'all' ? findings : findings.filter(f => f.category === filter))
      .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
  , [findings, filter])

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 }
    findings.forEach(f => c[f.severity]++)
    return c
  }, [findings])

  const catCounts = useMemo(() => {
    const c: Record<string, number> = { all: findings.length, rbac: 0, 'pod-security': 0, network: 0, irsa: 0 }
    findings.forEach(f => { c[f.category] = (c[f.category] ?? 0) + 1 })
    return c
  }, [findings])

  return (
    <div className="absolute inset-0 overflow-auto">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10"
        style={{ background: 'rgba(8,12,20,0.88)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>

        <div className="flex items-center gap-6 px-6 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={16} className="text-slate-400" />
            <span className="text-base font-sans font-bold text-slate-100">Security Findings</span>
          </div>
          <div className="flex items-center gap-5 ml-1">
            {(['critical', 'high', 'medium', 'low'] as Severity[]).map(s => {
              const cfg = SEV_CFG[s]
              return (
                <div key={s} className="flex items-center gap-2">
                  <span style={{ color: cfg.color }}>{cfg.icon}</span>
                  <span className="text-lg font-mono font-bold" style={{ color: counts[s] > 0 ? cfg.color : '#1e293b' }}>
                    {counts[s]}
                  </span>
                  <span className="text-xs font-sans text-slate-500 hidden sm:block">{cfg.label}</span>
                </div>
              )
            })}
          </div>
          {findings.length === 0 && (
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-xl"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <ShieldCheck size={14} className="text-emerald-400" />
              <span className="text-sm font-sans text-emerald-300">No security issues found</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 py-2.5 overflow-x-auto">
          {(['all', 'rbac', 'pod-security', 'network', 'irsa'] as Filter[]).map(f => {
            const count    = catCounts[f] ?? 0
            const isActive = filter === f
            const cat      = f !== 'all' ? CAT_CFG[f as Category] : null
            return (
              <button key={f} onClick={() => setFilter(f)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-sans font-medium transition-all whitespace-nowrap"
                style={isActive ? {
                  background: cat ? `${cat.color}18` : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${cat ? `${cat.color}35` : 'rgba(255,255,255,0.12)'}`,
                  color: cat ? cat.color : '#e2e8f0',
                } : {
                  background: 'transparent', border: '1px solid transparent', color: '#64748b',
                }}
              >
                {cat && <span style={{ color: isActive ? cat.color : '#475569' }}>{cat.icon}</span>}
                {f === 'all' ? 'All findings' : cat?.label}
                <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded-lg"
                  style={{ background: isActive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', color: isActive ? '#e2e8f0' : '#475569' }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Findings list ── */}
      <div className="px-6 py-5 max-w-5xl mx-auto space-y-2.5">
        {visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ShieldCheck size={36} className="text-emerald-500/30" />
            <p className="text-base font-sans text-slate-600">No findings in this category</p>
          </div>
        )}

        {visible.map((f, i) => {
          const sev = SEV_CFG[f.severity]
          const cat = CAT_CFG[f.category]
          return (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.025 }}
              onClick={() => setSelected(f)}
              className="rounded-2xl overflow-hidden cursor-pointer transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.025)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: `0 2px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)`,
                border: '1px solid rgba(255,255,255,0.04)',
              }}
              whileHover={{
                boxShadow: `0 4px 24px rgba(0,0,0,0.3), 0 0 30px ${sev.glow}, inset 0 1px 0 rgba(255,255,255,0.07)`,
                scale: 1.005,
              }}
            >
              <div className="flex items-start gap-4 p-4">
                <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: sev.badgeBg }}>
                    <span style={{ color: sev.color }}>{sev.icon}</span>
                  </div>
                  <span className="text-[9px] font-sans font-bold uppercase tracking-wider" style={{ color: sev.color }}>
                    {sev.label}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[15px] font-sans font-semibold text-slate-100 leading-tight">{f.title}</div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1.5 text-xs font-sans font-medium px-2 py-0.5 rounded-lg"
                          style={{ background: `${cat.color}15`, color: cat.color }}>
                          {cat.icon} {cat.label}
                        </span>
                        {f.namespace && (
                          <span className="text-xs font-mono text-slate-500 px-2 py-0.5 rounded-lg"
                            style={{ background: 'rgba(255,255,255,0.04)' }}>
                            {f.namespace}
                          </span>
                        )}
                        <span className="text-xs font-mono text-slate-500 px-2 py-0.5 rounded-lg truncate max-w-[200px]"
                          style={{ background: 'rgba(255,255,255,0.03)' }}>
                          {f.nodeLabel}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-xs font-sans text-slate-500">
                      <span className="hidden sm:block">Click for details</span>
                      <ChevronRight size={14} className="text-slate-700" />
                    </div>
                  </div>
                  <p className="text-sm font-sans text-slate-400 mt-2 leading-relaxed line-clamp-2">{f.description}</p>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* ── Detail sheet ── */}
      <AnimatePresence>
        {selected && (
          <FindingSheet
            finding={selected}
            onClose={() => setSelected(null)}
            onNavigate={onNavigate}
          />
        )}
      </AnimatePresence>

    </div>
  )
}

export function countCriticalFindings(data: GraphData): number {
  return computeFindings(data).filter(f => f.severity === 'critical' || f.severity === 'high').length
}
