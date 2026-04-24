import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  ShieldAlert, ShieldCheck, Network, Lock, Server,
  Layers, ArrowRight, Globe, Container, GitGraph,
  AlertTriangle, CheckCircle, XCircle, Boxes, BookMarked,
  KeyRound, FileText, Flame,
} from 'lucide-react'
import { GraphData, NodeType } from '../../types'
import { TabId } from '../Nav'
import { countCriticalFindings } from '../Findings/FindingsView'
import type { ScanMeta, DbFinding } from '../../hooks/useGraphData'

const SKIP_NS    = new Set(['kube-system', 'kube-public', 'kube-node-lease', 'ingress-nginx', 'cert-manager'])
const WORKLOAD_T = new Set(['deployment', 'statefulset', 'daemonset'])

function scoreToGrade(score: number) {
  if (score >= 90) return { score, color: '#1d8348', trackColor: 'rgba(29,131,72,0.18)',  glow: 'rgba(29,131,72,0.2)',   label: 'Passed',      sub: 'No significant issues — cluster is well hardened' }
  if (score >= 70) return { score, color: '#f5d40f', trackColor: 'rgba(245,212,15,0.15)', glow: 'rgba(245,212,15,0.18)', label: 'Low Risk',    sub: 'Minor issues found, no immediate action required' }
  if (score >= 50) return { score, color: '#ff9900', trackColor: 'rgba(255,153,0,0.15)',  glow: 'rgba(255,153,0,0.18)',  label: 'Medium Risk', sub: 'Several issues detected — review recommended soon' }
  if (score >= 30) return { score, color: '#ff7043', trackColor: 'rgba(255,112,67,0.15)', glow: 'rgba(255,112,67,0.18)', label: 'High Risk',   sub: 'Significant vulnerabilities found — action required' }
  return             { score, color: '#d13212', trackColor: 'rgba(209,50,18,0.18)',  glow: 'rgba(209,50,18,0.22)',  label: 'Critical',    sub: 'Cluster has critical security issues — act immediately' }
}

function securityGrade(critical: number, high: number, medium = 0, low = 0) {
  const deduct = (count: number, perIssue: number, cap: number) =>
    count === 0 ? 0 : Math.min(cap, perIssue * (1 - Math.pow(0.75, count)) / (1 - 0.75))
  const penalty =
    deduct(critical, 18, 42) +
    deduct(high,     10, 28) +
    deduct(medium,    4, 14) +
    deduct(low,       1,  6)
  return scoreToGrade(Math.max(0, Math.round(100 - penalty)))
}

// Circular progress ring (SVG-based, like Security Hub)
function ScoreRing({ score, color, trackColor }: { score: number; color: string; trackColor: string }) {
  const r = 54
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ

  return (
    <div className="relative flex items-center justify-center" style={{ width: 148, height: 148 }}>
      <svg width={148} height={148} style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
        {/* Track */}
        <circle cx={74} cy={74} r={r} fill="none" stroke={trackColor} strokeWidth={10} />
        {/* Progress */}
        <motion.circle
          cx={74} cy={74} r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.1 }}
          style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      </svg>
      {/* Center score */}
      <div className="flex flex-col items-center" style={{ position: 'relative' }}>
        <motion.span
          className="font-mono font-bold leading-none"
          style={{ fontSize: 42, color, textShadow: `0 0 24px ${color}80` }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {score}
        </motion.span>
        <span className="text-[11px] font-sans text-slate-400 mt-1 tracking-wider">/100</span>
      </div>
    </div>
  )
}

function useClusterStats(data: GraphData) {
  return useMemo(() => {
    const nodes = data.nodes
    const userNs = [...new Set(
      nodes.filter(n => n.namespace && !SKIP_NS.has(n.namespace)).map(n => n.namespace!)
    )]

    const workloads  = nodes.filter(n => WORKLOAD_T.has(n.type) && !SKIP_NS.has(n.namespace ?? '')).length
    const pods       = nodes.filter(n => n.type === 'pod'        && !SKIP_NS.has(n.namespace ?? '')).length
    const services   = nodes.filter(n => n.type === 'k8s_service').length
    const ingresses  = nodes.filter(n => n.type === 'ingress').length
    const rbacRoles  = nodes.filter(n => (n.type === 'k8s_role' || n.type === 'k8s_clusterrole') && !SKIP_NS.has(n.namespace ?? '')).length
    const secrets    = nodes.filter(n => n.type === 'secret'    && !SKIP_NS.has(n.namespace ?? '')).length
    const configmaps = nodes.filter(n => n.type === 'configmap' && !SKIP_NS.has(n.namespace ?? '')).length

    let critical = 0, high = 0, medium = 0, low = 0
    nodes.forEach(n => {
      if ((n.type === 'k8s_role' || n.type === 'k8s_clusterrole') && !SKIP_NS.has(n.namespace ?? '')) {
        const d = n.metadata?.danger ?? 'low'
        if (d === 'critical') critical++
        else if (d === 'high') high++
        else if (d === 'medium') medium++
        else low++
      }
      if (WORKLOAD_T.has(n.type) || n.type === 'pod') {
        const m = n.metadata ?? {}
        if (m.privileged === 'true') critical++
        if (m.runAsRoot === 'true' || m.hostNetwork === 'true' || m.hostPID === 'true') high++
        if (m.hostPath === 'true') medium++
      }
    })
    const netpolNs = new Set(nodes.filter(n => n.type === 'networkpolicy').map(n => n.namespace ?? ''))
    userNs.forEach(ns => { if (!netpolNs.has(ns)) high++ })
    data.edges.forEach(e => { if (e.accessLevel === 'full') high++ })

    const nsHealth = userNs.map(ns => {
      const nsNodes = nodes.filter(n => n.namespace === ns)
      const wls     = nsNodes.filter(n => WORKLOAD_T.has(n.type)).length
      const ps      = nsNodes.filter(n => n.type === 'pod').length
      const svcs    = nsNodes.filter(n => n.type === 'k8s_service').length
      const ings    = nsNodes.filter(n => n.type === 'ingress').length
      const hasNetpol = nsNodes.some(n => n.type === 'networkpolicy')
      const issues: string[] = []
      nsNodes.forEach(n => {
        if ((n.type === 'k8s_role' || n.type === 'k8s_clusterrole') && n.metadata?.danger === 'critical') issues.push('Wildcard RBAC')
        if ((n.type === 'k8s_role' || n.type === 'k8s_clusterrole') && n.metadata?.danger === 'high') issues.push('High-risk RBAC')
        if (n.metadata?.privileged === 'true') issues.push('Privileged container')
        if (n.metadata?.runAsRoot === 'true') issues.push('Running as root')
        if (n.metadata?.hostNetwork === 'true') issues.push('Host network')
      })
      if (!hasNetpol && wls > 0) issues.push('No NetworkPolicy')
      const danger = issues.some(i => i.includes('Wildcard') || i.includes('Privileged')) ? 'critical'
        : issues.length > 0 ? 'high'
        : !hasNetpol && wls > 0 ? 'medium' : 'ok'
      return { ns, wls, ps, svcs, ings, hasNetpol, danger, issues }
    }).filter(n => n.wls > 0 || n.ps > 0)
      .sort((a, b) => {
        const o: Record<string, number> = { critical: 0, high: 1, medium: 2, ok: 3 }
        return (o[a.danger] ?? 4) - (o[b.danger] ?? 4)
      })

    return { namespaces: userNs.length, workloads, pods, services, ingresses, rbacRoles, secrets, configmaps, nsHealth, sev: { critical, high, medium, low } }
  }, [data])
}

// ── Glass card base styles ─────────────────────────────────────────────────────

const glass = {
  background: 'rgba(255,255,255,0.03)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.05)',
} as const

// ── Severity bars ─────────────────────────────────────────────────────────────

function SevStrip({ counts }: { counts: { critical: number; high: number; medium: number; low: number } }) {
  const total = counts.critical + counts.high + counts.medium + counts.low
  const items = [
    { label: 'Critical', color: '#ef4444', count: counts.critical },
    { label: 'High',     color: '#f97316', count: counts.high     },
    { label: 'Medium',   color: '#eab308', count: counts.medium   },
    { label: 'Low',      color: '#64748b', count: counts.low      },
  ]
  return (
    <div className="space-y-2">
      {items.map(({ label, color, count }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-xs font-sans text-slate-400 w-14">{label}</span>
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: total > 0 ? `${(count / total) * 100}%` : '0%' }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
              className="h-full rounded-full"
              style={{ background: count > 0 ? color : 'transparent' }}
            />
          </div>
          <span className="text-sm font-mono font-bold w-6 text-right" style={{ color: count > 0 ? color : '#1e293b' }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Namespace tile ────────────────────────────────────────────────────────────

const STATUS_CFG = {
  critical: { color: '#ef4444', glow: 'rgba(239,68,68,0.12)', icon: <XCircle size={14} />,       label: 'Critical' },
  high:     { color: '#f97316', glow: 'rgba(249,115,22,0.1)', icon: <AlertTriangle size={14} />, label: 'Warning'  },
  medium:   { color: '#eab308', glow: 'rgba(234,179,8,0.08)', icon: <AlertTriangle size={14} />, label: 'Review'   },
  ok:       { color: '#10b981', glow: 'rgba(16,185,129,0.07)',icon: <CheckCircle size={14} />,   label: 'Healthy'  },
}

function NsTile({ ns, wls, ps, svcs, ings, hasNetpol, danger, issues, onNavigate }: {
  ns: string; wls: number; ps: number; svcs: number; ings: number
  hasNetpol: boolean; danger: string; issues: string[]
  onNavigate: (tab: TabId, nodeId?: string) => void
}) {
  const cfg = STATUS_CFG[danger as keyof typeof STATUS_CFG] ?? STATUS_CFG.ok

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.015 }}
      onClick={() => onNavigate('topology', `topo-group:${ns}`)}
      className="w-full text-left rounded-2xl p-4 transition-all duration-200 group"
      style={{
        background: `rgba(255,255,255,0.025)`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: `0 4px 20px rgba(0,0,0,0.25), 0 0 40px ${cfg.glow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span style={{ color: cfg.color }}>{cfg.icon}</span>
          <span className="text-sm font-sans font-semibold text-slate-100">{ns}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-sans font-semibold px-2 py-0.5 rounded-full"
            style={{ background: `${cfg.color}18`, color: cfg.color }}>
            {cfg.label}
          </span>
          <ArrowRight size={12} className="text-slate-400 group-hover:text-slate-400 transition-colors" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {[
          { icon: <Layers size={10} />, v: wls, l: 'workloads', c: '#3b82f6' },
          { icon: <Container size={10} />, v: ps, l: 'pods', c: '#06b6d4' },
          { icon: <Network size={10} />, v: svcs, l: 'services', c: '#14b8a6' },
          { icon: <Globe size={10} />, v: ings, l: 'routes', c: '#22c55e' },
        ].map(({ icon, v, l, c }) => (
          <div key={l} className="flex flex-col items-center py-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)' }}>
            <span style={{ color: c }}>{icon}</span>
            <span className="text-sm font-mono font-bold mt-0.5" style={{ color: c }}>{v}</span>
            <span className="text-[9px] font-sans text-slate-400 leading-none mt-0.5">{l}</span>
          </div>
        ))}
      </div>

      {/* Issues */}
      {issues.length > 0 ? (
        <div className="space-y-1">
          {issues.slice(0, 2).map((issue, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full shrink-0" style={{ background: cfg.color }} />
              <span className="text-xs font-sans" style={{ color: cfg.color }}>{issue}</span>
            </div>
          ))}
          {issues.length > 2 && (
            <span className="text-xs font-sans text-slate-400">+{issues.length - 2} more</span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full bg-emerald-500" />
          <span className="text-xs font-sans text-emerald-600">No issues found</span>
        </div>
      )}
    </motion.button>
  )
}

// ── Top Risky Workloads ───────────────────────────────────────────────────────

interface RiskyWorkload {
  id: string
  name: string
  namespace: string
  type: string
  critical: number
  high: number
  medium: number
  low: number
  flags: string[]
}

function useTopRiskyWorkloads(data: GraphData, findings: DbFinding[]): RiskyWorkload[] {
  return useMemo(() => {
    const workloads = data.nodes.filter(n => WORKLOAD_T.has(n.type) && !SKIP_NS.has(n.namespace ?? ''))
    return workloads.map(n => {
      const key = `${n.namespace}/${n.label}`
      const related = findings.filter(f => f.resource.includes(n.label ?? '') || f.resource.includes(key))
      const counts = { critical: 0, high: 0, medium: 0, low: 0 }
      related.forEach(f => { counts[f.severity] = (counts[f.severity] ?? 0) + 1 })
      const flags: string[] = []
      if (n.metadata?.privileged === 'true') flags.push('Privileged')
      if (n.metadata?.runAsRoot === 'true') flags.push('Runs as root')
      if (n.metadata?.hostNetwork === 'true') flags.push('Host network')
      if (n.metadata?.hostPID === 'true') flags.push('Host PID')
      return { id: n.id, name: n.label ?? '', namespace: n.namespace ?? '', type: n.type, ...counts, flags }
    })
    .filter(w => w.critical + w.high + w.medium + w.low + w.flags.length > 0)
    .sort((a, b) => {
      if (b.critical !== a.critical) return b.critical - a.critical
      if (b.high !== a.high) return b.high - a.high
      return b.flags.length - a.flags.length
    })
    .slice(0, 5)
  }, [data, findings])
}

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#64748b',
}

function RiskyWorkloadRow({ w, onNavigate, index }: {
  w: RiskyWorkload
  onNavigate: (tab: TabId, nodeId?: string) => void
  index: number
}) {
  const topSev = w.critical > 0 ? 'critical' : w.high > 0 ? 'high' : w.medium > 0 ? 'medium' : 'low'
  const color = SEV_COLOR[topSev]
  const totalFindings = w.critical + w.high + w.medium + w.low

  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ x: 2 }}
      onClick={() => onNavigate('graph', w.id)}
      className="w-full text-left flex items-center gap-4 px-4 py-3 rounded-xl group transition-colors"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}
    >
      {/* Rank */}
      <span className="text-[11px] font-mono text-slate-400 w-4 shrink-0">#{index + 1}</span>

      {/* Name + namespace */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-200 truncate">{w.name}</span>
          <span className="text-[10px] font-mono text-slate-400 shrink-0">{w.type}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-slate-400">{w.namespace}</span>
          {w.flags.map(f => (
            <span key={f} className="text-[10px] px-1.5 py-0.5 rounded-md font-mono"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5' }}>{f}</span>
          ))}
        </div>
      </div>

      {/* Severity pills */}
      <div className="flex items-center gap-1.5 shrink-0">
        {(['critical', 'high', 'medium', 'low'] as const).map(s => {
          const count = w[s]
          if (!count) return null
          return (
            <span key={s} className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${SEV_COLOR[s]}18`, color: SEV_COLOR[s] }}>
              {count}
            </span>
          )
        })}
        <span className="text-[11px] text-slate-400 ml-1">
          {totalFindings} finding{totalFindings !== 1 ? 's' : ''}
        </span>
      </div>

      <ArrowRight size={12} className="text-slate-400 group-hover:text-slate-400 transition-colors shrink-0" />
    </motion.button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [] }

interface OverviewViewProps {
  data?: GraphData | null
  onNavigate: (tab: TabId, nodeId?: string) => void
  onNavigateToExplorer?: (filter: NodeType | 'all') => void
  scanMeta?: ScanMeta | null
}

function fmtScanTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function OverviewView({ data, onNavigate, onNavigateToExplorer, scanMeta }: OverviewViewProps) {
  const stats = useClusterStats(data ?? EMPTY_GRAPH)
  const { sev: graphSev } = stats
  const riskyWorkloads = useTopRiskyWorkloads(data ?? EMPTY_GRAPH, scanMeta?.findings ?? [])

  const sev = scanMeta
    ? { critical: scanMeta.criticalCount, high: scanMeta.highCount, medium: scanMeta.mediumCount, low: scanMeta.lowCount }
    : graphSev

  const grade = scanMeta
    ? scoreToGrade(scanMeta.securityScore)
    : securityGrade(graphSev.critical, graphSev.high, graphSev.medium, graphSev.low)

  const totalFindings = scanMeta
    ? scanMeta.criticalCount + scanMeta.highCount
    : countCriticalFindings(data ?? EMPTY_GRAPH)
  const needsAttention = stats.nsHealth.filter(n => n.danger !== 'ok').length

  return (
    <div className="absolute inset-0 overflow-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">

        {/* ── Security Score Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6"
          style={{
            background: `linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)`,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: `0 8px 40px rgba(0,0,0,0.4), 0 0 80px ${grade.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center gap-8">
            {/* Score ring */}
            <div className="shrink-0">
              <ScoreRing score={grade.score} color={grade.color} trackColor={grade.trackColor} />
            </div>

            <div className="w-px h-24 shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-xs font-sans font-semibold uppercase tracking-widest text-slate-400">Security Score</span>
                <span className="text-xs font-sans font-bold px-2.5 py-0.5 rounded-full"
                  style={{ background: `${grade.color}18`, color: grade.color, border: `1px solid ${grade.color}35` }}>
                  {grade.label}
                </span>
              </div>
              <div className="text-sm font-sans text-slate-400 leading-relaxed">{grade.sub}</div>
              {totalFindings > 0 && (
                <button
                  onClick={() => onNavigate('findings')}
                  className="mt-3 flex items-center gap-2 text-sm font-sans font-semibold transition-opacity hover:opacity-70"
                  style={{ color: grade.color }}
                >
                  View {totalFindings} security findings
                  <ArrowRight size={14} />
                </button>
              )}
              {totalFindings === 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  <span className="text-sm font-sans text-emerald-400">All checks passed</span>
                </div>
              )}
              {scanMeta && (
                <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                  <span>Scanned {fmtScanTime(scanMeta.scannedAt)}</span>
                  {scanMeta.durationMs && <span>{scanMeta.durationMs}ms</span>}
                </div>
              )}
              <button
                onClick={() => onNavigate('graph')}
                className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-cyan-400 transition-colors"
              >
                <GitGraph size={11} />
                Open IRSA graph → click any workload to inspect its IAM permissions
              </button>
            </div>

            <div className="w-px h-24 shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />

            <div className="w-56 shrink-0">
              <SevStrip counts={sev} />
            </div>
          </div>
        </motion.div>

        {/* ── Cluster Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {([
            { icon: <Server    size={13} />, value: stats.namespaces,  label: 'Namespaces',  color: '#a78bfa', explorerFilter: null,          tab: 'topology' as TabId },
            { icon: <Layers    size={13} />, value: stats.workloads,   label: 'Workloads',   color: '#3b82f6', explorerFilter: 'deployment'   as NodeType, tab: 'explorer' as TabId },
            { icon: <Container size={13} />, value: stats.pods,        label: 'Pods',        color: '#06b6d4', explorerFilter: 'pod'          as NodeType, tab: 'explorer' as TabId },
            { icon: <Network   size={13} />, value: stats.services,    label: 'Services',    color: '#14b8a6', explorerFilter: 'k8s_service'  as NodeType, tab: 'explorer' as TabId },
            { icon: <Globe     size={13} />, value: stats.ingresses,   label: 'Ingresses',   color: '#22c55e', explorerFilter: 'ingress'      as NodeType, tab: 'explorer' as TabId },
            { icon: <Lock      size={13} />, value: stats.rbacRoles,   label: 'RBAC Roles',  color: '#8b5cf6', explorerFilter: 'k8s_role'     as NodeType, tab: 'explorer' as TabId },
            { icon: <KeyRound  size={13} />, value: stats.secrets,     label: 'Secrets',     color: '#f59e0b', explorerFilter: 'secret'       as NodeType, tab: 'explorer' as TabId },
            { icon: <FileText  size={13} />, value: stats.configmaps,  label: 'ConfigMaps',  color: '#6366f1', explorerFilter: 'configmap'    as NodeType, tab: 'explorer' as TabId },
          ] as const).map(({ icon, value, label, color, explorerFilter, tab }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => {
                if (explorerFilter && onNavigateToExplorer) onNavigateToExplorer(explorerFilter)
                onNavigate(tab)
              }}
              className="rounded-2xl px-4 py-3.5 flex flex-col gap-1.5 cursor-pointer group transition-all duration-150"
              style={{
                background: `rgba(255,255,255,0.025)`,
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: `0 4px 20px rgba(0,0,0,0.25), 0 0 30px ${color}0d, inset 0 1px 0 rgba(255,255,255,0.05)`,
                border: '1px solid rgba(255,255,255,0.04)',
              }}
              whileHover={{ scale: 1.03, boxShadow: `0 4px 24px rgba(0,0,0,0.3), 0 0 30px ${color}22, inset 0 1px 0 rgba(255,255,255,0.07)` }}
              whileTap={{ scale: 0.97 }}
            >
              <div className="flex items-center gap-1.5">
                <span style={{ color }}>{icon}</span>
                <div className="text-2xl font-mono font-bold leading-none" style={{ color }}>{value}</div>
              </div>
              <div className="text-xs font-sans text-slate-400 whitespace-nowrap group-hover:text-slate-400 transition-colors">{label}</div>
            </motion.div>
          ))}
        </div>

        {/* ── Top Risky Workloads ── */}
        {riskyWorkloads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.02)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div>
                <div className="flex items-center gap-2.5">
                  <Flame size={15} className="text-orange-400" />
                  <span className="text-base font-sans font-bold text-slate-100">Top Risky Workloads</span>
                </div>
                <div className="text-xs font-sans text-slate-400 mt-0.5">Click any workload to explore its IAM permissions in the graph</div>
              </div>
              <button
                onClick={() => onNavigate('findings')}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
              >
                View all findings <ArrowRight size={11} />
              </button>
            </div>
            <div className="p-3 space-y-1.5">
              {riskyWorkloads.map((w, i) => (
                <RiskyWorkloadRow key={w.id} w={w} onNavigate={onNavigate} index={i} />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Namespace Health ── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.02)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div>
              <div className="flex items-center gap-2.5">
                <Boxes size={15} className="text-violet-400" />
                <span className="text-base font-sans font-bold text-slate-100">Namespace Health</span>
              </div>
              <div className="text-xs font-sans text-slate-400 mt-0.5">Click any namespace to explore its topology</div>
            </div>
            {needsAttention > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)' }}>
                <AlertTriangle size={12} className="text-orange-400" />
                <span className="text-sm font-sans font-semibold text-orange-300">
                  {needsAttention} namespace{needsAttention > 1 ? 's' : ''} need attention
                </span>
              </div>
            )}
          </div>

          <div className="p-4">
            {stats.nsHealth.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Server size={28} className="text-slate-400" />
                <p className="text-sm font-sans text-slate-400">No namespace data — switch to Live mode</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {stats.nsHealth.map((n, i) => (
                  <motion.div
                    key={n.ns}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <NsTile {...n} onNavigate={onNavigate} />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Quick Navigation ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pb-2">
          {[
            { tab: 'findings'   as TabId, icon: <ShieldAlert size={18} />, label: 'Security Findings',  desc: `${sev.critical + sev.high} active risks to review`,   color: sev.critical > 0 ? '#ef4444' : sev.high > 0 ? '#f97316' : '#10b981', badge: sev.critical > 0 || sev.high > 0 ? 'Start here' : undefined },
            { tab: 'graph'      as TabId, icon: <GitGraph    size={18} />, label: 'IRSA / IAM Graph',   desc: 'Click a workload → see IAM permissions & blast radius', color: '#f59e0b', badge: 'IAM chains' },
            { tab: 'topology'   as TabId, icon: <Network     size={18} />, label: 'Topology',          desc: 'Workloads, pods, services and how they connect',      color: '#3b82f6' },
            { tab: 'rbac'       as TabId, icon: <Lock        size={18} />, label: 'RBAC / Permissions', desc: 'Visualize who can do what across the cluster',         color: '#8b5cf6' },
            { tab: 'benchmarks' as TabId, icon: <BookMarked  size={18} />, label: 'Benchmarks',         desc: 'CIS, MITRE, NSA/CISA, OWASP K10 compliance coverage', color: '#22d3ee' },
          ].map(({ tab, icon, label, desc, color, badge }) => (
            <motion.button
              key={tab}
              whileHover={{ scale: 1.02 }}
              onClick={() => onNavigate(tab)}
              className="rounded-2xl px-5 py-4 text-left flex items-start gap-4 group"
              style={{
                background: 'rgba(255,255,255,0.025)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: `0 4px 20px rgba(0,0,0,0.25), 0 0 30px ${color}0a, inset 0 1px 0 rgba(255,255,255,0.05)`,
                border: '1px solid rgba(255,255,255,0.05)',
                transition: 'box-shadow 0.2s',
              }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: `${color}15` }}>
                <span style={{ color }}>{icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-sans font-semibold text-slate-200">{label}</span>
                  {badge && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
                      style={{ background: `${color}20`, color }}>
                      {badge}
                    </span>
                  )}
                </div>
                <div className="text-xs font-sans text-slate-400 mt-1 leading-relaxed">{desc}</div>
              </div>
              <ArrowRight size={14} className="text-slate-400 group-hover:text-slate-400 transition-colors mt-1.5 shrink-0" />
            </motion.button>
          ))}
        </div>

      </div>
    </div>
  )
}
