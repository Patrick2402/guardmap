import { useMemo, useState } from 'react'
import type { DbFinding } from '../../hooks/useGraphData'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldAlert, ShieldCheck, Network, Key, Lock,
  ArrowRight, AlertTriangle, XCircle, Info, X,
  Wrench, FileText, Target, ChevronRight, Search,
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
  benchmarks?: string[]
}

const SKIP_NS  = new Set(['kube-system', 'kube-public', 'kube-node-lease', 'ingress-nginx', 'cert-manager'])
const WORKLOAD_SET = new Set(['deployment', 'statefulset', 'daemonset', 'job', 'cronjob', 'pod'])

// CIS K8s Benchmark / MITRE ATT&CK / NSA-CISA / AWS EKS Best Practices tags per rule type
// Sources:
//   CIS  = CIS Kubernetes Benchmark v1.8  (cisecurity.org)
//   MITRE = MITRE ATT&CK for Containers   (attack.mitre.org/matrices/enterprise/containers)
//   NSA  = NSA/CISA Kubernetes Hardening Guide 2022
//   AWS  = AWS EKS Security Best Practices (aws.github.io/aws-eks-best-practices)
export const BENCHMARK_MAP: Record<string, string[]> = {
  // Pod / Container security — CIS 5.2.x
  privileged_container:           ['CIS 5.2.1', 'MITRE T1610'],
  host_pid:                       ['CIS 5.2.2', 'MITRE T1611'],
  host_ipc:                       ['CIS 5.2.3', 'MITRE T1611'],
  host_network:                   ['CIS 5.2.4', 'MITRE T1611'],
  privilege_escalation_allowed:   ['CIS 5.2.5', 'MITRE T1548'],
  runs_as_root:                   ['CIS 5.2.6', 'MITRE T1548'],
  no_seccomp_profile:             ['CIS 5.2.7'],
  dangerous_capability:           ['CIS 5.2.8', 'MITRE T1548'],
  no_drop_all_caps:               ['CIS 5.2.8'],
  host_path_mount:                ['CIS 5.2.9', 'MITRE T1611'],
  host_port:                      ['CIS 5.2.10'],
  writable_root_fs:               ['CIS 5.2.12'],
  no_resource_limits:             ['CIS 5.2.13', 'MITRE T1499'],
  // RBAC — CIS 5.1.x
  wildcard_clusterrole:           ['CIS 5.1.1', 'MITRE T1068'],
  wildcard_sensitive_resource:    ['CIS 5.1.1', 'MITRE T1068'],
  cluster_admin_binding:          ['CIS 5.1.2', 'MITRE T1068'],
  rbac_escalate_verb:             ['CIS 5.1.3', 'MITRE T1068'],
  create_pods_perm:               ['CIS 5.1.4', 'MITRE T1610'],
  default_sa_role_binding:        ['CIS 5.1.5'],
  default_sa_in_use:              ['CIS 5.1.6'],
  automount_default_sa_token:     ['CIS 5.1.6', 'MITRE T1552'],
  irsa_automount_token:           ['CIS 5.1.6', 'AWS EKS BP'],
  system_masters_binding:         ['CIS 5.1.7', 'MITRE T1068'],
  wildcard_pv_access:             ['CIS 5.1.9'],
  // Secrets — CIS 5.4.x
  secret_as_env:                  ['CIS 5.4.1', 'MITRE T1552'],
  // Network — NSA/CISA + CIS 5.3.x
  no_network_policy:              ['CIS 5.3.1', 'NSA/CISA', 'MITRE T1599'],
  allow_all_ingress:              ['CIS 5.3.2', 'NSA/CISA'],
  allow_all_egress:               ['NSA/CISA'],
  node_port_service:              ['NSA/CISA'],
  public_loadbalancer:            ['NSA/CISA'],
  // Image supply chain
  unpinned_image:                 ['MITRE T1525'],
  // IAM / IRSA — AWS EKS BP + MITRE
  iam_wildcard_access:            ['AWS EKS BP', 'MITRE T1078'],
  iam_write_access:               ['AWS EKS BP', 'MITRE T1530'],
  shared_role_cross_env:          ['AWS EKS BP'],
  iam_broad_access:               ['AWS EKS BP', 'MITRE T1078'],
  irsa_shared_cross_env:          ['AWS EKS BP'],
  // Batch
  cj_concurrent_allow:            ['NSA/CISA'],
  cj_missing_deadline:            ['NSA/CISA'],
  job_no_ttl:                     [],
  // New rules
  sensitive_env_plaintext:        ['OWASP K08', 'MITRE T1552'],
  public_registry_image:          ['NSA/CISA', 'MITRE T1525'],
  default_namespace_workload:     ['NSA/CISA'],
  sa_unused_irsa:                 ['AWS EKS BP'],
  rbac_get_secrets:               ['CIS 5.1.2', 'MITRE T1552'],
  rbac_exec_pods:                 ['CIS 5.1.1', 'MITRE T1609'],
  rbac_nodes_access:              ['CIS 5.1.1', 'MITRE T1613'],
  orphaned_secret:                ['NSA/CISA'],
}

export function computeFindings(data: GraphData): Finding[] {
  const findings: Finding[] = []
  let idx = 0
  const add = (f: Omit<Finding, 'id'>) => findings.push({ ...f, id: `f${idx++}` })

  for (const node of data.nodes) {
    const ns = node.namespace ?? ''
    if (SKIP_NS.has(ns)) continue
    const m = node.metadata ?? {}

    // ── RBAC checks ──────────────────────────────────────────────────────────
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
          benchmarks: isEscalate ? BENCHMARK_MAP.rbac_escalate_verb : BENCHMARK_MAP.wildcard_clusterrole,
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
          benchmarks: BENCHMARK_MAP.wildcard_sensitive_resource,
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
          benchmarks: ['CIS 5.1.1', 'MITRE T1609'],
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
          benchmarks: BENCHMARK_MAP.wildcard_sensitive_resource,
        })
      }
    }

    // ── Pod / workload security checks ────────────────────────────────────────
    if (WORKLOAD_SET.has(node.type) && !SKIP_NS.has(ns)) {
      if (m.privileged === 'true') add({
        severity: 'critical', category: 'pod-security',
        title: 'Privileged container',
        description: 'Container runs with full host kernel capabilities (privileged: true). Any container escape grants root access to the underlying node, potentially compromising the entire cluster.',
        remediation: [
          'Set securityContext.privileged: false in the pod/container spec',
          'Use capabilities.add to grant only specific Linux capabilities needed instead of full privilege',
          'Enforce Pod Security Standards: kubectl label namespace <ns> pod-security.kubernetes.io/enforce=restricted',
          'If the workload genuinely needs node-level access, isolate it to a dedicated node group',
        ],
        nodeId: node.id, nodeLabel: node.label, namespace: ns || undefined,
        navTab: 'topology', navNodeId: node.id,
        benchmarks: BENCHMARK_MAP.privileged_container,
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
        benchmarks: BENCHMARK_MAP.runs_as_root,
      })
      if (m.hostNetwork === 'true') add({
        severity: 'high', category: 'pod-security',
        title: 'Host network namespace shared',
        description: "Pod shares the node's network namespace. It can listen on any node port, sniff all network traffic on the node, reach node-local APIs (e.g. metadata endpoint), and bypass NetworkPolicy controls.",
        remediation: [
          'Remove hostNetwork: true from the pod spec unless absolutely required',
          'Use a Kubernetes Service with appropriate type (ClusterIP/NodePort/LoadBalancer) for network exposure',
          'For monitoring workloads that need host metrics, use the Kubernetes metrics API instead',
          'If hostNetwork is required (e.g. some CNI plugins), isolate to a dedicated privileged node pool',
        ],
        nodeId: node.id, nodeLabel: node.label, namespace: ns || undefined,
        navTab: 'topology', navNodeId: node.id,
        benchmarks: BENCHMARK_MAP.host_network,
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
        benchmarks: BENCHMARK_MAP.host_pid,
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
        benchmarks: BENCHMARK_MAP.host_path_mount,
      })
    }
  }

  // ── NetworkPolicy checks ────────────────────────────────────────────────────
  const netpolNs = new Set(data.nodes.filter(n => n.type === 'networkpolicy').map(n => n.namespace ?? ''))
  const workloadNs = new Set(
    data.nodes
      .filter(n => ['deployment', 'statefulset', 'daemonset', 'job', 'cronjob'].includes(n.type) && !SKIP_NS.has(n.namespace ?? ''))
      .map(n => n.namespace ?? '')
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
        benchmarks: BENCHMARK_MAP.no_network_policy,
      })
    }
  }

  // ── IAM / IRSA checks ───────────────────────────────────────────────────────
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
          benchmarks: BENCHMARK_MAP.iam_wildcard_access,
        })
      }
    }
  }

  // ── Cross-environment IAM role sharing ──────────────────────────────────────
  const roleToNs = new Map<string, string[]>()
  for (const edge of data.edges) {
    if (edge.source.startsWith('sa:') && edge.target.startsWith('role:')) {
      const ns = edge.source.replace('sa:', '').split('/')[0]
      if (ns) {
        if (!roleToNs.has(edge.target)) roleToNs.set(edge.target, [])
        roleToNs.get(edge.target)!.push(ns)
      }
    }
  }
  const PROD_PATTERNS  = ['prod', 'production']
  const STAGE_PATTERNS = ['staging', 'stage', 'dev', 'development', 'test']
  for (const [roleId, nsList] of roleToNs) {
    const hasProd  = nsList.some(ns => PROD_PATTERNS.some(p => ns.toLowerCase().includes(p)))
    const hasStage = nsList.some(ns => STAGE_PATTERNS.some(p => ns.toLowerCase().includes(p)))
    if (hasProd && hasStage) {
      const roleNode = data.nodes.find(n => n.id === roleId)
      if (roleNode) {
        add({
          severity: 'high', category: 'irsa',
          title: 'IAM role shared across environments',
          description: `IAM role "${roleNode.label}" is used by workloads in both production and non-production namespaces (${[...new Set(nsList)].join(', ')}). A compromise in a lower environment could pivot to production AWS resources.`,
          remediation: [
            'Create separate IAM roles for each environment — production roles must never be reused',
            'Use IRSA trust-policy conditions (StringEquals aws:PrincipalTag/kubernetes-namespace) to enforce namespace isolation',
            'Run AWS IAM Access Analyzer to identify overly permissive trust policies',
            'Tag IAM roles with environment labels and enforce via SCP',
          ],
          nodeId: roleId, nodeLabel: roleNode.label,
          navTab: 'graph', navNodeId: roleId,
          benchmarks: BENCHMARK_MAP.shared_role_cross_env,
        })
      }
    }
  }

  // ── IAM role with broad cross-service access (3+ services) ─────────────────
  const roleToSvcCount = new Map<string, number>()
  for (const edge of data.edges) {
    if (!edge.accessLevel || !edge.source.startsWith('role:')) continue
    if (edge.accessLevel === 'full' || edge.accessLevel === 'write') {
      roleToSvcCount.set(edge.source, (roleToSvcCount.get(edge.source) ?? 0) + 1)
    }
  }
  for (const [roleId, count] of roleToSvcCount) {
    if (count >= 3) {
      const roleNode = data.nodes.find(n => n.id === roleId)
      if (roleNode && !SKIP_NS.has(roleNode.namespace ?? '')) {
        add({
          severity: 'high', category: 'irsa',
          title: 'IAM role with broad cross-service access',
          description: `IAM role "${roleNode.label}" has write or full access to ${count} AWS services. Overly broad roles maximize blast radius — a single pod compromise grants access to multiple cloud services.`,
          remediation: [
            'Split into separate IAM roles scoped to individual services',
            'Apply principle of least privilege: one role per workload, one purpose per role',
            'Use AWS Service Control Policies to limit what services roles can access',
            'Review with AWS IAM Access Advisor which services are actually accessed',
          ],
          nodeId: roleId, nodeLabel: roleNode.label,
          navTab: 'graph', navNodeId: roleId,
          benchmarks: BENCHMARK_MAP.iam_broad_access,
        })
      }
    }
  }

  // ── Default ServiceAccount in active use ────────────────────────────────────
  const defaultSaNodes = data.nodes.filter(
    n => n.type === 'serviceaccount' && n.label === 'default' && !SKIP_NS.has(n.namespace ?? '')
  )
  for (const saNode of defaultSaNodes) {
    const podIds = data.edges.filter(e => e.label === 'uses' && e.target === saNode.id).map(e => e.source)
    if (podIds.length > 0) {
      add({
        severity: 'medium', category: 'rbac',
        title: 'Workload uses default ServiceAccount',
        description: `Workloads in namespace "${saNode.namespace}" use the default ServiceAccount. This makes it impossible to apply least-privilege RBAC or IRSA policies to individual workloads, and any bound role affects all pods that didn't opt out.`,
        remediation: [
          'Create a dedicated ServiceAccount for each workload: kubectl create sa <name>-sa -n <namespace>',
          'Reference it in the workload spec: spec.serviceAccountName: <name>-sa',
          'Set automountServiceAccountToken: false on the default SA if no workloads need it',
          'Set automountServiceAccountToken: false on individual pods that do not call the K8s API',
        ],
        nodeId: saNode.id, nodeLabel: saNode.label, namespace: saNode.namespace,
        navTab: 'graph', navNodeId: saNode.id,
        benchmarks: BENCHMARK_MAP.default_sa_in_use,
      })
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
type CatFilter = 'all' | Category

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
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>

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
              {finding.benchmarks && finding.benchmarks.length > 0 && finding.benchmarks.map(b => (
                <span key={b} className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {b}
                </span>
              ))}
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

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
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

          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={13} className="text-slate-500" />
              <span className="text-xs font-sans text-slate-500 uppercase tracking-wider">What is this?</span>
            </div>
            <p className="text-sm font-sans text-slate-300 leading-relaxed">{finding.description}</p>
          </div>

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
  unpinned_image:              { category: 'pod-security', title: 'Unpinned image tag',                navTab: 'topology', remediation: ['Use a specific image digest or version tag instead of :latest'] },
  writable_root_fs:            { category: 'pod-security', title: 'Writable root filesystem',          navTab: 'topology', remediation: ['Set securityContext.readOnlyRootFilesystem: true', 'Mount writable paths as emptyDir volumes'] },
  no_resource_requests:        { category: 'pod-security', title: 'Missing resource requests',         navTab: 'topology', remediation: ['Set resources.requests.cpu and resources.requests.memory'] },
  no_liveness_probe:           { category: 'pod-security', title: 'No liveness probe',                 navTab: 'topology', remediation: ['Add livenessProbe to detect and restart unhealthy containers'] },
  no_seccomp_profile:          { category: 'pod-security', title: 'No seccomp profile',                navTab: 'topology', remediation: ['Set securityContext.seccompProfile.type: RuntimeDefault', 'Avoid Unconfined seccomp profile'] },
  automount_default_sa_token:  { category: 'pod-security', title: 'Default SA token automounted',      navTab: 'topology', remediation: ['Set automountServiceAccountToken: false on pods that do not need K8s API access', 'Use a dedicated ServiceAccount per workload'] },
  irsa_automount_token:        { category: 'pod-security', title: 'IRSA SA still automounts K8s token', navTab: 'topology', remediation: ['Set automountServiceAccountToken: false — the pod already uses IRSA for AWS access', 'The K8s SA token is unnecessary and adds attack surface'] },
  no_drop_all_caps:            { category: 'pod-security', title: 'Capabilities not dropped',          navTab: 'topology', remediation: ['Add capabilities.drop: [ALL] to securityContext', 'Then re-add only the specific capabilities the container needs'] },
  host_port:                   { category: 'pod-security', title: 'Container exposes host port',       navTab: 'topology', remediation: ['Remove hostPort — use a Kubernetes Service to expose the workload', 'If hostPort is required, restrict via NetworkPolicy'] },
  secret_as_env:               { category: 'pod-security', title: 'Secret exposed as env variable',   navTab: 'topology', remediation: ['Mount the secret as a file volume instead of an env var', 'Env vars are visible in /proc, logs and crash dumps'] },
  no_readiness_probe:          { category: 'pod-security', title: 'No readiness probe',               navTab: 'topology', remediation: ['Add readinessProbe so traffic is only sent to ready containers'] },
  no_network_policy:           { category: 'network',      title: 'No NetworkPolicy in namespace',    navTab: 'topology', remediation: ['Create a default-deny NetworkPolicy', 'Add explicit allow rules for required traffic'] },
  allow_all_ingress:           { category: 'network',      title: 'NetworkPolicy allows all ingress', navTab: 'topology', remediation: ['Restrict ingress with specific podSelector and namespaceSelector rules'] },
  allow_all_egress:            { category: 'network',      title: 'NetworkPolicy allows all egress',  navTab: 'topology', remediation: ['Add egress rules to limit outbound traffic to required endpoints'] },
  node_port_service:           { category: 'network',      title: 'Service uses NodePort',            navTab: 'topology', remediation: ['Replace NodePort with ClusterIP + Ingress controller', 'NodePort binds on every node and bypasses external firewall rules'] },
  public_loadbalancer:         { category: 'network',      title: 'Public LoadBalancer service',      navTab: 'topology', remediation: ['Add internal-load-balancer annotation if external access is not required', 'Restrict with SecurityGroups / firewall rules to known CIDRs'] },
  wildcard_clusterrole:        { category: 'rbac',         title: 'Wildcard ClusterRole',             navTab: 'rbac',     remediation: ['Replace wildcards (*) with explicit API groups, resources and verbs', 'Follow principle of least privilege'] },
  wildcard_sensitive_resource: { category: 'rbac',         title: 'Wildcard on sensitive resource',   navTab: 'rbac',     remediation: ['Scope verbs to only what is needed', 'Avoid wildcard on secrets, pods, deployments'] },
  cluster_admin_binding:       { category: 'rbac',         title: 'cluster-admin binding',            navTab: 'rbac',     remediation: ['Replace cluster-admin with a scoped ClusterRole', 'Use namespace-scoped Roles where possible'] },
  default_sa_role_binding:     { category: 'rbac',         title: 'Default SA has role binding',      navTab: 'rbac',     remediation: ['Create a dedicated ServiceAccount', 'Do not bind roles to the default ServiceAccount'] },
  rbac_escalate_verb:          { category: 'rbac',         title: 'Privilege escalation verb in role',navTab: 'rbac',     remediation: ['Remove escalate, bind, impersonate verbs from ClusterRole rules', 'Audit all subjects bound to this role'] },
  create_pods_perm:            { category: 'rbac',         title: 'Role can create pods',             navTab: 'rbac',     remediation: ['Remove create/patch verbs on pods unless strictly necessary', 'If needed, scope to specific namespaces via Role (not ClusterRole)'] },
  system_masters_binding:      { category: 'rbac',         title: 'system:masters group binding',     navTab: 'rbac',     remediation: ['Remove system:masters from ClusterRoleBinding subjects', 'Use explicit ClusterRoles with least-privilege permissions instead'] },
  wildcard_pv_access:          { category: 'rbac',         title: 'Wildcard PersistentVolume access', navTab: 'rbac',     remediation: ['Scope PV/PVC verbs to specific resources', 'Wildcard access can expose persistent data across namespaces'] },
  iam_wildcard_access:         { category: 'irsa',         title: 'IAM wildcard access',              navTab: 'graph',    remediation: ['Replace Action: "*" with specific IAM actions', 'Use resource-level conditions to limit scope'] },
  iam_write_access:            { category: 'irsa',         title: 'IAM write access',                 navTab: 'graph',    remediation: ['Audit whether write access is required', 'Consider read-only policies where possible'] },
  shared_role_cross_env:       { category: 'irsa',         title: 'IAM role shared across environments', navTab: 'graph', remediation: ['Create separate IAM roles per environment', 'Use IRSA trust-policy namespace conditions'] },
  iam_broad_access:            { category: 'irsa',         title: 'IAM role with broad cross-service access', navTab: 'graph', remediation: ['Split into separate IAM roles scoped to individual services', 'Apply principle of least privilege: one role per workload'] },
  job_no_ttl:                  { category: 'pod-security', title: 'Job has no TTL',                   navTab: 'topology', remediation: ['Set spec.ttlSecondsAfterFinished on the Job (e.g. 3600)', 'Use a CronJob cleanup controller if managing many jobs'] },
  cj_concurrent_allow:         { category: 'pod-security', title: 'CronJob allows concurrent runs',   navTab: 'topology', remediation: ['Set concurrencyPolicy: Forbid or Replace to prevent job pile-up', 'Forbid skips the run if previous is still running; Replace cancels and restarts'] },
  cj_missing_deadline:         { category: 'pod-security', title: 'CronJob missing deadline',         navTab: 'topology', remediation: ['Set spec.startingDeadlineSeconds (e.g. 300) to limit how late a missed job can start', 'Prevents permanent job stoppage after 100 missed schedules'] },
  sensitive_env_plaintext:     { category: 'pod-security', title: 'Plaintext credential in env var',  navTab: 'topology', remediation: ['Replace the literal value with a secretKeyRef to a Kubernetes Secret', 'kubectl create secret generic <name> --from-literal=<KEY>=<value> -n <ns>', 'Never commit credentials to source control or container specs'] },
  public_registry_image:       { category: 'pod-security', title: 'Image from public registry',       navTab: 'topology', remediation: ['Mirror approved images to a private registry (ECR, Artifact Registry)', 'Enable image scanning on the private registry before promoting images', 'Use an ImagePolicyWebhook to block unapproved registries'] },
  default_namespace_workload:  { category: 'pod-security', title: 'Workload in default namespace',    navTab: 'topology', remediation: ['Move the workload to a dedicated namespace: kubectl create ns <name>', 'Apply NetworkPolicy, RBAC and ResourceQuota to the new namespace', 'Set automountServiceAccountToken: false on the default SA in default namespace'] },
  sa_unused_irsa:              { category: 'irsa',         title: 'Unused IRSA-annotated SA',         navTab: 'graph',    remediation: ['Remove the eks.amazonaws.com/role-arn annotation if no pods use this SA', 'Review the IAM trust policy to remove the no-longer-needed Kubernetes condition', 'Orphaned IRSA bindings keep the IAM trust relationship open unnecessarily'] },
  rbac_get_secrets:            { category: 'rbac',         title: 'ClusterRole can read secrets',     navTab: 'rbac',     remediation: ['Restrict access to only specific secrets using resourceNames', 'Replace cluster-scoped access with a namespace-scoped Role', 'Use a secrets manager (Vault, AWS SM) to avoid storing secrets in etcd'] },
  rbac_exec_pods:              { category: 'rbac',         title: 'ClusterRole allows pod exec',      navTab: 'rbac',     remediation: ['Remove pods/exec and pods/attach from ClusterRole rules', 'For debugging, use a time-limited break-glass ServiceAccount', 'Log and alert on any exec/attach events via Kubernetes audit policy'] },
  rbac_nodes_access:           { category: 'rbac',         title: 'ClusterRole has node access',      navTab: 'rbac',     remediation: ['Remove node resource access unless the workload is a system agent (e.g. DaemonSet CNI)', 'Replace ClusterRole with a narrower Role if namespace-scoped access is sufficient', 'Audit subjects bound to this role — node access enables host enumeration'] },
  orphaned_secret:             { category: 'pod-security', title: 'Orphaned Secret (unreferenced)',    navTab: 'topology', remediation: ['Delete the Secret if no longer needed: kubectl delete secret <name> -n <ns>', 'If still needed, ensure it is referenced by the correct workload', 'Rotate the credentials in the Secret before deleting to prevent reuse'] },
}

export function convertDbFindings(dbFindings: DbFinding[]): Finding[] {
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
      benchmarks:  BENCHMARK_MAP[f.type] ?? [],
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

  const [catFilter, setCatFilter]   = useState<CatFilter>('all')
  const [sevFilter, setSevFilter]   = useState<Set<Severity>>(new Set(['critical', 'high', 'medium', 'low']))
  const [search, setSearch]         = useState('')
  const [nsFilter, setNsFilter]     = useState('all')
  const [selected, setSelected]     = useState<Finding | null>(null)

  const namespaces = useMemo(() =>
    [...new Set(findings.map(f => f.namespace).filter((ns): ns is string => !!ns))].sort()
  , [findings])

  const visible = useMemo(() => {
    const q = search.toLowerCase()
    return findings
      .filter(f => catFilter === 'all' || f.category === catFilter)
      .filter(f => sevFilter.has(f.severity))
      .filter(f => nsFilter === 'all' || f.namespace === nsFilter)
      .filter(f => !q || f.title.toLowerCase().includes(q) ||
                        f.nodeLabel.toLowerCase().includes(q) ||
                        (f.namespace ?? '').toLowerCase().includes(q))
      .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
  }, [findings, catFilter, sevFilter, nsFilter, search])

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

  const toggleSev = (s: Severity) => {
    setSevFilter(prev => {
      const next = new Set(prev)
      if (next.has(s) && next.size > 1) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const hasActiveFilters = catFilter !== 'all' || sevFilter.size < 4 || nsFilter !== 'all' || search !== ''

  return (
    <div className="absolute inset-0 overflow-auto">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10"
        style={{ background: 'rgba(8,12,20,0.88)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>

        {/* Row 1: title + counts */}
        <div className="flex items-center gap-4 px-6 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={16} className="text-slate-400" />
            <span className="text-base font-sans font-bold text-slate-100">Security Findings</span>
          </div>
          <div className="flex items-center gap-4 ml-1">
            {(['critical', 'high', 'medium', 'low'] as Severity[]).map(s => {
              const cfg = SEV_CFG[s]
              return (
                <div key={s} className="flex items-center gap-1.5">
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

        {/* Row 2: category tabs */}
        <div className="flex items-center gap-2 px-6 py-2 overflow-x-auto"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {(['all', 'rbac', 'pod-security', 'network', 'irsa'] as CatFilter[]).map(f => {
            const count    = catCounts[f] ?? 0
            const isActive = catFilter === f
            const cat      = f !== 'all' ? CAT_CFG[f as Category] : null
            return (
              <button key={f} onClick={() => setCatFilter(f)}
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

        {/* Row 3: severity toggles + search + namespace */}
        <div className="flex items-center gap-3 px-6 py-2 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            {(['critical', 'high', 'medium', 'low'] as Severity[]).map(s => {
              const cfg    = SEV_CFG[s]
              const active = sevFilter.has(s)
              return (
                <button key={s} onClick={() => toggleSev(s)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-sans font-semibold transition-all whitespace-nowrap"
                  style={active ? {
                    background: `${cfg.color}18`,
                    border: `1px solid ${cfg.color}35`,
                    color: cfg.color,
                  } : {
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: '#334155',
                  }}
                >
                  <span style={{ color: active ? cfg.color : '#334155' }}>{cfg.icon}</span>
                  {cfg.label}
                </button>
              )
            })}
          </div>

          <div className="flex-1 relative min-w-[160px] max-w-[280px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search findings..."
              className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs font-sans text-slate-300 placeholder-slate-600 outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: search ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.06)',
              }}
            />
          </div>

          {namespaces.length > 0 && (
            <select
              value={nsFilter}
              onChange={e => setNsFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono text-slate-400 outline-none transition-all cursor-pointer"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: nsFilter !== 'all' ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.06)',
                color: nsFilter !== 'all' ? '#e2e8f0' : '#64748b',
              }}
            >
              <option value="all">All namespaces</option>
              {namespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
            </select>
          )}

          {hasActiveFilters && (
            <button
              onClick={() => { setCatFilter('all'); setSevFilter(new Set(['critical', 'high', 'medium', 'low'])); setNsFilter('all'); setSearch('') }}
              className="text-xs font-sans text-slate-600 hover:text-slate-400 transition-colors whitespace-nowrap px-2 py-1 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* ── Findings list ── */}
      <div className="px-6 py-5 max-w-5xl mx-auto space-y-2.5">
        {visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ShieldCheck size={36} className="text-emerald-500/30" />
            <p className="text-base font-sans text-slate-600">
              {hasActiveFilters ? 'No findings match the current filters' : 'No findings in this category'}
            </p>
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
              transition={{ delay: i * 0.02 }}
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
                    <div className="flex-1 min-w-0">
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
                      <span className="hidden sm:block">Details</span>
                      <ChevronRight size={14} className="text-slate-700" />
                    </div>
                  </div>
                  <p className="text-sm font-sans text-slate-400 mt-2 leading-relaxed line-clamp-2">{f.description}</p>

                  {/* Benchmark tags */}
                  {f.benchmarks && f.benchmarks.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                      {f.benchmarks.map(b => (
                        <span key={b} className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md"
                          style={{ background: 'rgba(255,255,255,0.04)', color: '#475569', border: '1px solid rgba(255,255,255,0.06)' }}>
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
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
