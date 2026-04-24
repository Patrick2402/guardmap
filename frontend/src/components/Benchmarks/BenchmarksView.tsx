import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, XCircle, MinusCircle, ShieldCheck, AlertTriangle,
  X, Wrench, Info, Zap, BookOpen, ArrowRight, ChevronRight,
} from 'lucide-react'
import type { DbFinding } from '../../hooks/useGraphData'
import { GraphData } from '../../types'
import { TabId } from '../Nav'
import { computeFindings, convertDbFindings, BENCHMARK_MAP, Finding } from '../Findings/FindingsView'
import { CONTROL_INFO } from './controlInfo'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BenchmarkControl {
  id: string
  name: string
  category: string
  coveredBy: string[]
}

interface FrameworkDef {
  id: string
  name: string
  shortName: string
  color: string
  description: string
  controls: BenchmarkControl[]
}

// ── Framework data ────────────────────────────────────────────────────────────

const FRAMEWORKS: FrameworkDef[] = [
  {
    id: 'cis', name: 'CIS Kubernetes Benchmark v1.8', shortName: 'CIS K8s v1.8', color: '#60a5fa',
    description: 'Center for Internet Security controls covering RBAC, Pod Security, Network and Secrets (Section 5)',
    controls: [
      { id: 'CIS 5.1.1',  name: 'cluster-admin only used where required',              category: '5.1 RBAC',         coveredBy: ['wildcard_clusterrole', 'cluster_admin_binding', 'rbac_exec_pods', 'rbac_nodes_access'] },
      { id: 'CIS 5.1.2',  name: 'Minimize access to secrets',                          category: '5.1 RBAC',         coveredBy: ['wildcard_sensitive_resource', 'rbac_get_secrets'] },
      { id: 'CIS 5.1.3',  name: 'Minimize wildcard use in Roles and ClusterRoles',     category: '5.1 RBAC',         coveredBy: ['rbac_escalate_verb', 'wildcard_clusterrole'] },
      { id: 'CIS 5.1.4',  name: 'Minimize access to create pods',                      category: '5.1 RBAC',         coveredBy: ['create_pods_perm'] },
      { id: 'CIS 5.1.5',  name: 'Default service accounts not bound to active roles',  category: '5.1 RBAC',         coveredBy: ['default_sa_role_binding'] },
      { id: 'CIS 5.1.6',  name: 'SA tokens only mounted where necessary',              category: '5.1 RBAC',         coveredBy: ['automount_default_sa_token', 'irsa_automount_token'] },
      { id: 'CIS 5.1.7',  name: 'Avoid use of system:masters group',                   category: '5.1 RBAC',         coveredBy: ['system_masters_binding'] },
      { id: 'CIS 5.1.8',  name: 'Limit Bind, Impersonate and Escalate permissions',    category: '5.1 RBAC',         coveredBy: ['rbac_escalate_verb'] },
      { id: 'CIS 5.1.9',  name: 'Minimize access to create persistent volumes',        category: '5.1 RBAC',         coveredBy: ['wildcard_pv_access'] },
      { id: 'CIS 5.2.1',  name: 'Use AlwaysPullImages admission plugin',               category: '5.2 Pod Security', coveredBy: [] },
      { id: 'CIS 5.2.2',  name: 'Do not permit host PID namespace sharing',            category: '5.2 Pod Security', coveredBy: ['host_pid'] },
      { id: 'CIS 5.2.3',  name: 'Do not permit host IPC namespace sharing',            category: '5.2 Pod Security', coveredBy: ['host_ipc'] },
      { id: 'CIS 5.2.4',  name: 'Do not permit host network access',                   category: '5.2 Pod Security', coveredBy: ['host_network'] },
      { id: 'CIS 5.2.5',  name: 'Do not permit privileged containers',                 category: '5.2 Pod Security', coveredBy: ['privileged_container'] },
      { id: 'CIS 5.2.6',  name: 'Do not permit allowPrivilegeEscalation containers',   category: '5.2 Pod Security', coveredBy: ['privilege_escalation_allowed'] },
      { id: 'CIS 5.2.7',  name: 'Do not permit root containers',                       category: '5.2 Pod Security', coveredBy: ['runs_as_root'] },
      { id: 'CIS 5.2.8',  name: 'Do not permit containers with added capabilities',    category: '5.2 Pod Security', coveredBy: ['dangerous_capability', 'no_drop_all_caps'] },
      { id: 'CIS 5.2.9',  name: 'Do not permit host path mounts',                      category: '5.2 Pod Security', coveredBy: ['host_path_mount'] },
      { id: 'CIS 5.2.10', name: 'Do not permit containers with hostPort',              category: '5.2 Pod Security', coveredBy: ['host_port'] },
      { id: 'CIS 5.2.11', name: 'Do not permit containers requesting AppArmor profiles',category:'5.2 Pod Security', coveredBy: [] },
      { id: 'CIS 5.2.12', name: 'Do not permit containers with seccomp Unconfined',    category: '5.2 Pod Security', coveredBy: ['no_seccomp_profile'] },
      { id: 'CIS 5.2.13', name: 'Do not permit writable root filesystems',             category: '5.2 Pod Security', coveredBy: ['writable_root_fs'] },
      { id: 'CIS 5.3.1',  name: 'CNI supports NetworkPolicies',                        category: '5.3 Network',      coveredBy: ['no_network_policy'] },
      { id: 'CIS 5.3.2',  name: 'All namespaces have NetworkPolicies defined',         category: '5.3 Network',      coveredBy: ['no_network_policy', 'allow_all_ingress', 'allow_all_egress'] },
      { id: 'CIS 5.4.1',  name: 'Prefer secrets as files over environment variables',  category: '5.4 Secrets',      coveredBy: ['secret_as_env', 'sensitive_env_plaintext'] },
      { id: 'CIS 5.4.2',  name: 'Consider external secret storage',                   category: '5.4 Secrets',      coveredBy: [] },
    ],
  },
  {
    id: 'mitre', name: 'MITRE ATT&CK for Containers', shortName: 'MITRE ATT&CK', color: '#f97316',
    description: 'MITRE ATT&CK techniques targeting container environments and Kubernetes clusters',
    controls: [
      { id: 'T1610', name: 'Deploy Container',                         category: 'Execution',            coveredBy: ['privileged_container', 'create_pods_perm'] },
      { id: 'T1609', name: 'Container Administration Command',         category: 'Execution',            coveredBy: ['rbac_exec_pods'] },
      { id: 'T1059', name: 'Command and Scripting Interpreter',        category: 'Execution',            coveredBy: [] },
      { id: 'T1525', name: 'Implant Internal Image',                   category: 'Persistence',          coveredBy: ['unpinned_image', 'public_registry_image'] },
      { id: 'T1136', name: 'Create Account',                           category: 'Persistence',          coveredBy: [] },
      { id: 'T1611', name: 'Escape to Host',                           category: 'Privilege Escalation', coveredBy: ['host_pid', 'host_ipc', 'host_network', 'host_path_mount', 'dangerous_capability'] },
      { id: 'T1548', name: 'Abuse Elevation Control Mechanism',        category: 'Privilege Escalation', coveredBy: ['privilege_escalation_allowed', 'runs_as_root', 'dangerous_capability'] },
      { id: 'T1068', name: 'Exploitation for Privilege Escalation',    category: 'Privilege Escalation', coveredBy: ['wildcard_clusterrole', 'wildcard_sensitive_resource', 'rbac_escalate_verb', 'cluster_admin_binding', 'system_masters_binding'] },
      { id: 'T1562', name: 'Impair Defenses',                          category: 'Defense Evasion',      coveredBy: [] },
      { id: 'T1599', name: 'Network Boundary Bridging',                category: 'Defense Evasion',      coveredBy: ['no_network_policy', 'allow_all_egress'] },
      { id: 'T1552', name: 'Unsecured Credentials',                    category: 'Credential Access',    coveredBy: ['secret_as_env', 'sensitive_env_plaintext', 'irsa_automount_token', 'automount_default_sa_token'] },
      { id: 'T1528', name: 'Steal Application Access Token',           category: 'Credential Access',    coveredBy: [] },
      { id: 'T1613', name: 'Container and Resource Discovery',         category: 'Discovery',            coveredBy: ['rbac_nodes_access'] },
      { id: 'T1190', name: 'Exploit Public-Facing Application',        category: 'Initial Access',       coveredBy: [] },
      { id: 'T1078', name: 'Valid Accounts',                           category: 'Initial Access',       coveredBy: ['iam_wildcard_access', 'iam_broad_access', 'shared_role_cross_env'] },
      { id: 'T1530', name: 'Data from Cloud Storage',                  category: 'Collection',           coveredBy: ['iam_write_access', 'iam_wildcard_access'] },
      { id: 'T1499', name: 'Endpoint Denial of Service',               category: 'Impact',               coveredBy: ['no_resource_limits', 'cj_concurrent_allow'] },
    ],
  },
  {
    id: 'nsa', name: 'NSA/CISA Kubernetes Hardening Guide 2022', shortName: 'NSA/CISA', color: '#22d3ee',
    description: 'NSA and CISA hardening guidance for Kubernetes environments, covering pod security, network, authentication, and secrets',
    controls: [
      { id: 'NSA-PS-1',   name: 'Non-root containers and limited capabilities',        category: 'Pod Security',       coveredBy: ['runs_as_root', 'privileged_container', 'privilege_escalation_allowed', 'writable_root_fs', 'no_seccomp_profile', 'no_drop_all_caps'] },
      { id: 'NSA-PS-2',   name: 'Read-only filesystems and immutable containers',      category: 'Pod Security',       coveredBy: ['writable_root_fs'] },
      { id: 'NSA-PS-3',   name: 'Resource requests and limits for all containers',     category: 'Pod Security',       coveredBy: ['no_resource_limits', 'no_resource_requests'] },
      { id: 'NSA-NP-1',   name: 'Use NetworkPolicies to restrict traffic',             category: 'Network',            coveredBy: ['no_network_policy', 'allow_all_ingress', 'allow_all_egress'] },
      { id: 'NSA-NP-2',   name: 'Limit external exposure (no public LB / NodePort)',   category: 'Network',            coveredBy: ['public_loadbalancer', 'node_port_service'] },
      { id: 'NSA-AUTH-1', name: 'Use RBAC with principle of least privilege',          category: 'Authentication',     coveredBy: ['wildcard_clusterrole', 'cluster_admin_binding', 'default_sa_role_binding', 'rbac_escalate_verb'] },
      { id: 'NSA-SEC-1',  name: 'Prefer secret file mounts over env variables',        category: 'Secrets',            coveredBy: ['secret_as_env', 'sensitive_env_plaintext'] },
      { id: 'NSA-IMG-1',  name: 'Use trusted sources and scan container images',       category: 'Supply Chain',       coveredBy: ['unpinned_image', 'public_registry_image'] },
      { id: 'NSA-NS-1',   name: 'Use namespaces for workload isolation',               category: 'Workload Isolation', coveredBy: ['default_namespace_workload', 'no_network_policy'] },
      { id: 'NSA-CJ-1',   name: 'CronJob concurrency and deadline controls',           category: 'Workload Hardening', coveredBy: ['cj_concurrent_allow', 'cj_missing_deadline'] },
      { id: 'NSA-LOG-1',  name: 'Enable and monitor audit logging',                    category: 'Audit Logging',      coveredBy: [] },
      { id: 'NSA-UPD-1',  name: 'Keep Kubernetes and workloads up to date',            category: 'Maintenance',        coveredBy: ['unpinned_image'] },
    ],
  },
  {
    id: 'aws', name: 'AWS EKS Security Best Practices', shortName: 'AWS EKS BP', color: '#fb923c',
    description: 'AWS-recommended controls for EKS clusters, focusing on IRSA scoping, IAM isolation, and workload security',
    controls: [
      { id: 'EKS-IRSA-1', name: 'Scope IAM roles to minimum required permissions',    category: 'IAM / IRSA',         coveredBy: ['iam_wildcard_access', 'iam_write_access', 'iam_broad_access'] },
      { id: 'EKS-IRSA-2', name: 'Do not share IAM roles across environments',         category: 'IAM / IRSA',         coveredBy: ['shared_role_cross_env'] },
      { id: 'EKS-IRSA-3', name: 'Disable SA token automount when using IRSA',         category: 'IAM / IRSA',         coveredBy: ['irsa_automount_token'] },
      { id: 'EKS-IRSA-4', name: 'Remove unused IRSA annotations',                     category: 'IAM / IRSA',         coveredBy: ['sa_unused_irsa'] },
      { id: 'EKS-RBAC-1', name: 'Prefer namespace-scoped Roles over ClusterRoles',    category: 'RBAC',               coveredBy: ['wildcard_clusterrole', 'cluster_admin_binding'] },
      { id: 'EKS-NET-1',  name: 'Combine SecurityGroups and NetworkPolicies',         category: 'Network',            coveredBy: ['no_network_policy', 'public_loadbalancer'] },
      { id: 'EKS-IMG-1',  name: 'Use private ECR with vulnerability scanning',        category: 'Supply Chain',       coveredBy: ['public_registry_image', 'unpinned_image'] },
    ],
  },
  {
    id: 'owasp', name: 'OWASP Kubernetes Top 10', shortName: 'OWASP K10', color: '#a78bfa',
    description: 'OWASP top 10 security risks specific to Kubernetes environments (K01–K10)',
    controls: [
      { id: 'K01', name: 'Insecure Workload Configurations',            category: 'Application Security', coveredBy: ['privileged_container', 'runs_as_root', 'privilege_escalation_allowed', 'writable_root_fs', 'no_seccomp_profile', 'host_pid', 'host_network'] },
      { id: 'K02', name: 'Supply Chain Vulnerabilities',                category: 'Application Security', coveredBy: ['unpinned_image', 'public_registry_image'] },
      { id: 'K03', name: 'Overly Permissive RBAC Configurations',       category: 'Application Security', coveredBy: ['wildcard_clusterrole', 'cluster_admin_binding', 'rbac_escalate_verb', 'create_pods_perm', 'rbac_exec_pods', 'rbac_nodes_access', 'rbac_get_secrets'] },
      { id: 'K04', name: 'Lack of Centralized Policy Enforcement',      category: 'Application Security', coveredBy: [] },
      { id: 'K05', name: 'Inadequate Logging and Monitoring',           category: 'Application Security', coveredBy: [] },
      { id: 'K06', name: 'Broken Authentication Mechanisms',            category: 'Application Security', coveredBy: ['automount_default_sa_token', 'irsa_automount_token', 'default_sa_role_binding'] },
      { id: 'K07', name: 'Missing Network Segmentation Controls',       category: 'Application Security', coveredBy: ['no_network_policy', 'allow_all_ingress', 'allow_all_egress', 'public_loadbalancer'] },
      { id: 'K08', name: 'Secrets Management Failures',                 category: 'Application Security', coveredBy: ['secret_as_env', 'sensitive_env_plaintext', 'automount_default_sa_token'] },
      { id: 'K09', name: 'Misconfigured Cluster Components',            category: 'Application Security', coveredBy: ['system_masters_binding', 'wildcard_clusterrole'] },
      { id: 'K10', name: 'Outdated and Vulnerable Components',          category: 'Application Security', coveredBy: ['unpinned_image'] },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCovered(c: BenchmarkControl) { return c.coveredBy.length > 0 }

function getActiveFindings(c: BenchmarkControl, findings: Finding[]) {
  return findings.filter(f => f.benchmarks?.includes(c.id))
}

// ── Severity config (mirrors FindingsView) ────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#64748b',
}

// ── ControlSheet ──────────────────────────────────────────────────────────────

function ControlSheet({ control, fw, findings, onClose, onNavigate }: {
  control: BenchmarkControl
  fw: FrameworkDef
  findings: Finding[]
  onClose: () => void
  onNavigate?: (tab: TabId, nodeId?: string) => void
}) {
  const covered      = isCovered(control)
  const active       = getActiveFindings(control, findings)
  const info         = CONTROL_INFO[control.id]
  const isCode       = (s: string) => s.startsWith('kubectl') || s.startsWith('apiVersion') || s.includes('\n')

  const statusColor  = !covered ? '#475569' : active.length > 0 ? '#f87171' : '#34d399'
  const statusLabel  = !covered ? 'No detection rule' : active.length > 0 ? `${active.length} active finding${active.length > 1 ? 's' : ''}` : 'Clean — no findings'

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <motion.div
        key="sheet"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{
          height: '72vh',
          background: 'rgba(8,12,20,0.98)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '20px 20px 0 0',
          boxShadow: `0 -20px 60px rgba(0,0,0,0.7), 0 -40px 80px ${fw.color}0a`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Header */}
        <div className="flex items-start gap-4 px-6 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>

          <div className="shrink-0 mt-0.5">
            {!covered
              ? <MinusCircle size={22} style={{ color: '#475569' }} />
              : active.length > 0
                ? <AlertTriangle size={22} style={{ color: '#f87171' }} />
                : <CheckCircle2 size={22} style={{ color: '#34d399' }} />
            }
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg"
                style={{ background: `${fw.color}18`, color: fw.color, border: `1px solid ${fw.color}30` }}>
                {fw.shortName}
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg"
                style={{ background: `${fw.color}10`, color: fw.color }}>
                {control.id}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.04)', color: statusColor, border: `1px solid ${statusColor}30` }}>
                {statusLabel}
              </span>
            </div>
            <h2 className="text-lg font-sans font-bold text-slate-100 mt-1.5 leading-snug">{control.name}</h2>
            <p className="text-xs font-mono text-slate-400 mt-0.5">{control.category}</p>
          </div>

          <button onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)' }}>
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {info ? (
            <>
              {/* About */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen size={13} className="text-slate-400" />
                  <span className="text-xs font-sans uppercase tracking-wider text-slate-400">About this control</span>
                </div>
                <p className="text-sm font-sans text-slate-300 leading-relaxed">{info.description}</p>
              </section>

              {/* Attack scenario */}
              <section className="p-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={13} style={{ color: '#f87171' }} />
                  <span className="text-xs font-sans uppercase tracking-wider font-semibold" style={{ color: '#f87171' }}>Attack scenario</span>
                </div>
                <p className="text-sm font-sans text-slate-300 leading-relaxed">{info.why}</p>
              </section>

              {/* Remediation */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Wrench size={13} style={{ color: fw.color }} />
                  <span className="text-xs font-sans uppercase tracking-wider font-semibold" style={{ color: fw.color }}>How to fix it</span>
                </div>
                <div className="space-y-2">
                  {info.remediation.map((step, i) => (
                    <div key={i}>
                      {isCode(step) ? (
                        <pre className="text-xs font-mono text-slate-300 p-3 rounded-xl overflow-x-auto leading-relaxed whitespace-pre-wrap"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          {step}
                        </pre>
                      ) : (
                        <div className="flex items-start gap-3">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-mono font-bold"
                            style={{ background: `${fw.color}20`, color: fw.color }}>
                            {i + 1}
                          </div>
                          <p className="text-sm font-sans text-slate-300 leading-relaxed">{step}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div className="flex items-center gap-2 text-slate-400">
              <Info size={14} />
              <span className="text-sm font-sans">No additional details available for this control.</span>
            </div>
          )}

          {/* Detection rules */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={13} className="text-slate-400" />
              <span className="text-xs font-sans uppercase tracking-wider text-slate-400">GuardMap detection rules</span>
            </div>
            {covered ? (
              <div className="flex flex-wrap gap-2">
                {control.coveredBy.map(rule => {
                  const hasBm = !!BENCHMARK_MAP[rule]
                  return (
                    <span key={rule}
                      className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded-xl"
                      style={{
                        background: hasBm ? `${fw.color}12` : 'rgba(255,255,255,0.04)',
                        color:      hasBm ? fw.color : '#475569',
                        border:     `1px solid ${hasBm ? `${fw.color}25` : 'rgba(255,255,255,0.06)'}`,
                      }}>
                      {hasBm
                        ? <CheckCircle2 size={11} style={{ color: fw.color }} />
                        : <XCircle size={11} style={{ color: '#475569' }} />
                      }
                      {rule.replace(/_/g, ' ')}
                    </span>
                  )
                })}
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <MinusCircle size={15} className="text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-sans text-slate-400">No detection rule implemented for this control.</p>
                  <p className="text-xs font-mono text-slate-400 mt-1">This is a coverage gap — typically requires runtime monitoring or admission controller inspection.</p>
                </div>
              </div>
            )}
          </section>

          {/* Active findings */}
          {active.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={13} style={{ color: '#f87171' }} />
                <span className="text-xs font-sans uppercase tracking-wider font-semibold" style={{ color: '#f87171' }}>
                  Active findings ({active.length})
                </span>
              </div>
              <div className="space-y-2">
                {active.map(f => (
                  <div key={f.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: SEV_COLOR[f.severity] ?? '#64748b' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-sans font-medium text-slate-200">{f.title}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {f.namespace && <span className="text-xs font-mono text-slate-400">{f.namespace}</span>}
                        {f.namespace && <ChevronRight size={10} className="text-slate-400" />}
                        <span className="text-xs font-mono text-slate-400 truncate max-w-[240px]">{f.nodeLabel}</span>
                      </div>
                    </div>
                    {onNavigate && (
                      <button
                        onClick={() => { onNavigate(f.navTab, f.navNodeId); onClose() }}
                        className="shrink-0 flex items-center gap-1.5 text-xs font-sans font-medium px-2.5 py-1.5 rounded-lg transition-all hover:opacity-80"
                        style={{ background: `${SEV_COLOR[f.severity] ?? '#64748b'}15`, color: SEV_COLOR[f.severity] ?? '#64748b', border: `1px solid ${SEV_COLOR[f.severity] ?? '#64748b'}30` }}>
                        View
                        <ArrowRight size={11} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── ProgressBar ───────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <motion.div className="h-full rounded-full" style={{ background: color }}
        initial={{ width: 0 }} animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }} />
    </div>
  )
}

// ── FrameworkCard ─────────────────────────────────────────────────────────────

function FrameworkCard({ fw, findings, isActive, onClick }: {
  fw: FrameworkDef; findings: Finding[]; isActive: boolean; onClick: () => void
}) {
  const covered = fw.controls.filter(isCovered).length
  const total   = fw.controls.length
  const active  = fw.controls.reduce((n, c) => n + (getActiveFindings(c, findings).length > 0 ? 1 : 0), 0)
  const pct     = Math.round((covered / total) * 100)
  return (
    <motion.button onClick={onClick} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
      className="flex-1 min-w-[130px] max-w-[210px] p-4 rounded-2xl text-left transition-all"
      style={{
        background: isActive ? `${fw.color}12` : 'rgba(255,255,255,0.025)',
        border: isActive ? `1px solid ${fw.color}40` : '1px solid rgba(255,255,255,0.06)',
        boxShadow: isActive ? `0 0 28px ${fw.color}12` : 'none',
      }}>
      <div className="text-xs font-mono font-bold mb-1 truncate" style={{ color: fw.color }}>{fw.shortName}</div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-mono font-bold text-slate-100">{pct}</span>
        <span className="text-sm font-mono text-slate-400">%</span>
      </div>
      <ProgressBar value={covered} max={total} color={fw.color} />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs font-mono text-slate-400">{covered}/{total} controls</span>
        {active > 0 && (
          <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded-md"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            {active} active
          </span>
        )}
      </div>
    </motion.button>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

interface BenchmarksViewProps {
  data: GraphData
  dbFindings?: DbFinding[]
  onNavigate?: (tab: TabId, nodeId?: string) => void
}

export function BenchmarksView({ data, dbFindings, onNavigate }: BenchmarksViewProps) {
  const [activeFramework, setActiveFramework] = useState('cis')
  const [selectedControl, setSelectedControl] = useState<BenchmarkControl | null>(null)

  const findings = useMemo<Finding[]>(() => {
    const fromDb = dbFindings && dbFindings.length > 0 ? convertDbFindings(dbFindings) : null
    return fromDb ?? computeFindings(data)
  }, [data, dbFindings])

  const fw = FRAMEWORKS.find(f => f.id === activeFramework) ?? FRAMEWORKS[0]

  const totalControls   = useMemo(() => new Set(FRAMEWORKS.flatMap(f => f.controls.map(c => c.id))).size, [])
  const coveredControls = useMemo(() => new Set(FRAMEWORKS.flatMap(f => f.controls.filter(isCovered).map(c => c.id))).size, [])

  const byCategory = useMemo(() => {
    const map = new Map<string, BenchmarkControl[]>()
    for (const c of fw.controls) {
      if (!map.has(c.category)) map.set(c.category, [])
      map.get(c.category)!.push(c)
    }
    return map
  }, [fw])

  return (
    <div className="absolute inset-0 overflow-auto">

      {/* Header */}
      <div className="sticky top-0 z-10"
        style={{ background: 'rgba(8,12,20,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={16} className="text-emerald-400" />
            <span className="text-base font-sans font-bold text-slate-100">Benchmark Coverage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-mono font-bold text-emerald-400">{coveredControls}</span>
            <span className="text-xs font-mono text-slate-400">/ {totalControls} controls covered across {FRAMEWORKS.length} frameworks</span>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 max-w-5xl mx-auto space-y-6">

        {/* Framework cards */}
        <div className="flex gap-3 flex-wrap">
          {FRAMEWORKS.map(f => (
            <FrameworkCard key={f.id} fw={f} findings={findings}
              isActive={activeFramework === f.id} onClick={() => setActiveFramework(f.id)} />
          ))}
        </div>

        {/* Framework detail */}
        <div>
          <div className="mb-4">
            <div className="text-base font-sans font-bold text-slate-100">{fw.name}</div>
            <div className="text-xs font-sans text-slate-400 mt-1">{fw.description}</div>
          </div>

          <div className="space-y-4">
            {[...byCategory.entries()].map(([cat, controls]) => (
              <div key={cat}>
                <div className="text-xs font-mono font-bold uppercase tracking-[0.15em] text-slate-400 mb-2 px-1">{cat}</div>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
                  {controls.map((c, i) => {
                    const covered = isCovered(c)
                    const active  = getActiveFindings(c, findings)
                    return (
                      <motion.div key={c.id} whileHover={{ background: 'rgba(255,255,255,0.03)' }}
                        onClick={() => setSelectedControl(c)}
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                        style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>

                        <div className="shrink-0">
                          {!covered
                            ? <MinusCircle size={14} className="text-slate-400" />
                            : active.length > 0
                              ? <AlertTriangle size={14} style={{ color: '#f87171' }} />
                              : <CheckCircle2 size={14} style={{ color: '#34d399' }} />
                          }
                        </div>

                        <div className="shrink-0 w-[86px]">
                          <span className="text-xs font-mono font-bold"
                            style={{ color: covered ? fw.color : '#475569' }}>
                            {c.id}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-sans ${covered ? 'text-slate-300' : 'text-slate-400'}`}>
                            {c.name}
                          </span>
                          {covered && c.coveredBy.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {c.coveredBy.slice(0, 4).map(r => (
                                <span key={r} className="text-[10px] font-mono px-1.5 py-0.5 rounded-md"
                                  style={{ background: `${fw.color}10`, color: fw.color, border: `1px solid ${fw.color}20` }}>
                                  {r.replace(/_/g, ' ')}
                                </span>
                              ))}
                              {c.coveredBy.length > 4 && (
                                <span className="text-[10px] font-mono text-slate-400">+{c.coveredBy.length - 4} more</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {active.length > 0 ? (
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg"
                              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                              {active.length} finding{active.length > 1 ? 's' : ''}
                            </span>
                          ) : covered ? (
                            <span className="text-xs font-mono text-slate-400">clean</span>
                          ) : (
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg"
                              title="Requires cluster-level access (admission controller, audit logs, or runtime agent) — not detectable from K8s API alone"
                              style={{ background: 'rgba(100,116,139,0.12)', color: '#64748b', border: '1px solid rgba(100,116,139,0.2)', cursor: 'help' }}>
                              N/A
                            </span>
                          )}
                          <ChevronRight size={13} className="text-slate-400" />
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 mt-5 pt-4"
            style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={12} style={{ color: '#34d399' }} />
              <span className="text-xs font-sans text-slate-400">Covered, clean</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle size={12} style={{ color: '#f87171' }} />
              <span className="text-xs font-sans text-slate-400">Covered, active findings</span>
            </div>
            <div className="flex items-center gap-2">
              <MinusCircle size={12} className="text-slate-400" />
              <span className="text-xs font-sans text-slate-400">N/A — requires runtime/admission access</span>
            </div>
            <span className="ml-auto text-xs font-mono text-slate-400">click any row for full details</span>
          </div>
        </div>
      </div>

      {/* Control detail sheet */}
      <AnimatePresence>
        {selectedControl && (
          <ControlSheet
            control={selectedControl}
            fw={fw}
            findings={findings}
            onClose={() => setSelectedControl(null)}
            onNavigate={onNavigate}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
