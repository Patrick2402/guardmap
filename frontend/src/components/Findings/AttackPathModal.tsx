import { useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Globe, Layers, Container, Shield, KeyRound, HardDrive,
  Database, MessageSquare, Lock, BarChart2, Box, ChevronRight,
  AlertTriangle, GitBranch, Clock, Cpu,
} from 'lucide-react'
import { GraphData, GraphNode } from '../../types'
import type { Finding } from './FindingsView'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PathStep {
  node: GraphNode | VirtualNode
  edgeLabel?: string
  accessLevel?: string
}

interface VirtualNode {
  id: string
  type: string
  label: string
  namespace?: string
}

// ── Step config ───────────────────────────────────────────────────────────────

const STEP_CFG: Record<string, { color: string; label: string; Icon: React.ElementType }> = {
  internet:       { color: '#ef4444', label: 'Internet',        Icon: Globe        },
  ingress:        { color: '#22c55e', label: 'Ingress',         Icon: Globe        },
  k8s_service:    { color: '#14b8a6', label: 'Service',         Icon: Layers       },
  deployment:     { color: '#3b82f6', label: 'Deployment',      Icon: Layers       },
  statefulset:    { color: '#a855f7', label: 'StatefulSet',     Icon: Layers       },
  daemonset:      { color: '#f97316', label: 'DaemonSet',       Icon: GitBranch    },
  job:            { color: '#16a34a', label: 'Job',             Icon: Cpu          },
  cronjob:        { color: '#0d9488', label: 'CronJob',         Icon: Clock        },
  pod:            { color: '#06b6d4', label: 'Pod',             Icon: Container    },
  serviceaccount: { color: '#8b5cf6', label: 'ServiceAccount',  Icon: Shield       },
  iam_role:       { color: '#f59e0b', label: 'IAM Role',        Icon: KeyRound     },
  aws_service:    { color: '#10b981', label: 'AWS Resource',    Icon: HardDrive    },
}

function awsIcon(label: string): React.ReactNode {
  const l = label.toLowerCase()
  if (l.includes('s3'))                           return <HardDrive size={14} />
  if (l.includes('rds') || l.includes('dynamodb')) return <Database size={14} />
  if (l.includes('sqs') || l.includes('sns'))      return <MessageSquare size={14} />
  if (l.includes('secret') || l.includes('kms'))   return <Lock size={14} />
  if (l.includes('cloudwatch'))                    return <BarChart2 size={14} />
  return <Box size={14} />
}

const ACCESS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  full:  { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444', label: 'FULL ACCESS'  },
  write: { bg: 'rgba(249,115,22,0.15)', color: '#f97316', label: 'WRITE ACCESS' },
  read:  { bg: 'rgba(16,185,129,0.12)', color: '#10b981', label: 'READ ACCESS'  },
}

// ── Path builder ──────────────────────────────────────────────────────────────

const WORKLOAD_TYPES = new Set(['deployment', 'statefulset', 'daemonset', 'job', 'cronjob'])
const IRSA_LABELS    = new Set(['IRSA →', 'assumes (IRSA)', 'irsa', 'IRSA'])

function buildAttackPath(finding: Finding, data: GraphData): PathStep[] {
  const { nodes, edges } = data

  const outEdges = new Map<string, typeof edges[0][]>()
  const inEdges  = new Map<string, typeof edges[0][]>()
  edges.forEach(e => {
    if (!outEdges.has(e.source)) outEdges.set(e.source, [])
    outEdges.get(e.source)!.push(e)
    if (!inEdges.has(e.target)) inEdges.set(e.target, [])
    inEdges.get(e.target)!.push(e)
  })
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Find anchor workload
  const anchor = nodes.find(n =>
    (WORKLOAD_TYPES.has(n.type) || n.type === 'pod') &&
    (n.label === finding.nodeLabel || n.id.endsWith(`/${finding.nodeLabel}`)) &&
    (!finding.namespace || n.namespace === finding.namespace)
  )
  if (!anchor) return []

  let workload: GraphNode = anchor
  if (anchor.type === 'pod') {
    const parentEdge = (inEdges.get(anchor.id) ?? []).find(e => e.label === 'manages')
    if (parentEdge) workload = nodeMap.get(parentEdge.source) ?? anchor
  }

  // Resolve pod → SA → IAM → AWS
  let pod: GraphNode | undefined
  if (workload.type === 'pod') {
    pod = workload
  } else {
    const podEdge = (outEdges.get(workload.id) ?? []).find(e => e.label === 'manages')
    if (podEdge) pod = nodeMap.get(podEdge.target)
  }

  let sa: GraphNode | undefined
  if (pod) {
    const saEdge = (outEdges.get(pod.id) ?? []).find(e => e.label === 'uses')
    if (saEdge) sa = nodeMap.get(saEdge.target)
  }

  let role: GraphNode | undefined
  if (sa) {
    const roleEdge = (outEdges.get(sa.id) ?? []).find(e => IRSA_LABELS.has(e.label ?? ''))
    if (roleEdge) role = nodeMap.get(roleEdge.target)
  }

  const awsSteps: PathStep[] = []
  if (role) {
    const awsEdges = (outEdges.get(role.id) ?? [])
      .filter(e => e.target.startsWith('svc:'))
      .sort((a, b) => {
        const o: Record<string, number> = { full: 0, write: 1, read: 2 }
        return (o[a.accessLevel ?? ''] ?? 3) - (o[b.accessLevel ?? ''] ?? 3)
      })
    awsEdges.slice(0, 4).forEach(e => {
      const aws = nodeMap.get(e.target)
      if (aws) awsSteps.push({ node: aws, edgeLabel: e.label, accessLevel: e.accessLevel })
    })
  }

  // Backward chain: svc → ingress → internet
  const svcEdges = (inEdges.get(workload.id) ?? []).filter(e => e.label === 'selects')
  const svc      = svcEdges.length > 0 ? nodeMap.get(svcEdges[0].source) : undefined

  let ing: GraphNode | undefined
  if (svc) {
    const ingressEdges = (inEdges.get(svc.id) ?? []).filter(e => e.label === 'routes →')
    if (ingressEdges.length > 0) ing = nodeMap.get(ingressEdges[0].source)
  }

  const path: PathStep[] = []

  if (ing && svc) {
    const internet: VirtualNode = { id: '__internet__', type: 'internet', label: 'Internet' }
    path.push({ node: internet as unknown as GraphNode })
    path.push({ node: ing,      edgeLabel: '→'        })
    path.push({ node: svc,      edgeLabel: 'routes →' })
    path.push({ node: workload, edgeLabel: 'selects'  })
  } else if (svc) {
    path.push({ node: svc })
    path.push({ node: workload, edgeLabel: 'selects' })
  } else {
    path.push({ node: workload })
  }

  if (pod && pod.id !== workload.id) path.push({ node: pod,  edgeLabel: 'manages'  })
  if (sa)                            path.push({ node: sa,   edgeLabel: 'uses'     })
  if (role)                          path.push({ node: role, edgeLabel: 'IRSA →'   })
  awsSteps.forEach(s => path.push(s))

  return path
}

// ── Step card ─────────────────────────────────────────────────────────────────

function StepCard({ step }: { step: PathStep }) {
  const n = step.node
  const cfg = STEP_CFG[n.type] ?? { color: '#94a3b8', label: n.type, Icon: Box }
  const icon = n.type === 'aws_service' ? awsIcon(n.label) : <cfg.Icon size={13} />
  const accessBadge = step.accessLevel ? ACCESS_BADGE[step.accessLevel] : null
  const edgeColor = STEP_CFG[n.type]?.color ?? '#64748b'

  return (
    <div className="flex items-center gap-0 shrink-0">
      {step.edgeLabel !== undefined && (
        <div className="flex flex-col items-center gap-0.5 shrink-0 mx-2">
          <div className="flex items-center gap-0.5">
            <div className="w-7 h-px" style={{ background: `${edgeColor}40` }} />
            <ChevronRight size={10} style={{ color: edgeColor }} />
          </div>
          <span className="text-[9px] font-mono text-slate-500 whitespace-nowrap">{step.edgeLabel}</span>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-2 p-4 rounded-xl shrink-0"
        style={{
          background: n.type === 'internet' ? 'rgba(239,68,68,0.08)' : `${cfg.color}0d`,
          border: `1px solid ${cfg.color}28`,
          minWidth: 140,
          maxWidth: 220,
          boxShadow: `0 0 20px ${cfg.color}10`,
        }}
      >
        <div className="flex items-center gap-1.5">
          <span style={{ color: cfg.color }}>{icon}</span>
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
        </div>
        <div className="text-sm font-mono font-semibold text-slate-100 leading-snug" style={{ wordBreak: 'break-word' }}>
          {n.label}
        </div>
        {n.namespace && (
          <div className="text-[10px] font-mono text-slate-500">{n.namespace}</div>
        )}
        {accessBadge && (
          <span className="self-start text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md"
            style={{ background: accessBadge.bg, color: accessBadge.color }}>
            {accessBadge.label}
          </span>
        )}
      </motion.div>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface AttackPathModalProps {
  finding: Finding
  data: GraphData
  onClose: () => void
}

export function AttackPathModal({ finding, data, onClose }: AttackPathModalProps) {
  const path = useMemo(() => buildAttackPath(finding, data), [finding, data])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Horizontal scroll via mouse wheel
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [path])

  const sev = {
    critical: { color: '#ef4444', label: 'Critical' },
    high:     { color: '#f97316', label: 'High'     },
    medium:   { color: '#eab308', label: 'Medium'   },
    low:      { color: '#64748b', label: 'Low'      },
  }[finding.severity] ?? { color: '#64748b', label: 'Low' }

  const hasIAM     = path.some(s => s.node.type === 'iam_role' || s.node.type === 'aws_service')
  const hasIngress = path.some(s => s.node.type === 'internet' || s.node.type === 'ingress')

  const worstAccess = path.reduce<string>((m, s) => {
    if (s.accessLevel === 'full')  return 'full'
    if (s.accessLevel === 'write' && m !== 'full') return 'write'
    return m
  }, 'none')

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="ap-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        key="ap-modal"
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 16 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="fixed inset-x-6 top-16 z-50 rounded-2xl flex flex-col overflow-hidden max-w-5xl mx-auto max-h-[calc(100vh-7rem)]"
        style={{
          background: 'rgba(8,12,20,0.97)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          border: `1px solid ${sev.color}28`,
          boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 60px ${sev.color}12`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 px-7 py-5 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: `${sev.color}0a` }}>
          <AlertTriangle size={20} style={{ color: sev.color }} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] mb-1" style={{ color: sev.color }}>
              {sev.label} · Attack Path
            </div>
            <div className="text-2xl font-mono font-bold text-slate-100 leading-tight break-all">
              {finding.title}
            </div>
            {finding.description && (
              <div className="text-sm font-sans text-slate-400 mt-2 leading-relaxed">{finding.description}</div>
            )}
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors shrink-0"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Context badges */}
        <div className="flex items-center gap-2 px-7 py-3 shrink-0 flex-wrap"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.015)' }}>
          {hasIngress && (
            <span className="flex items-center gap-1.5 text-xs font-mono px-3 py-1 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
              <Globe size={11} /> Externally reachable
            </span>
          )}
          {hasIAM && (
            <span className="flex items-center gap-1.5 text-xs font-mono px-3 py-1 rounded-lg"
              style={{ background: 'rgba(245,158,11,0.1)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.2)' }}>
              <KeyRound size={11} /> IAM access exposed
            </span>
          )}
          {worstAccess !== 'none' && ACCESS_BADGE[worstAccess] && (
            <span className="flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1 rounded-lg"
              style={{ background: ACCESS_BADGE[worstAccess].bg, color: ACCESS_BADGE[worstAccess].color, border: `1px solid ${ACCESS_BADGE[worstAccess].color}30` }}>
              {ACCESS_BADGE[worstAccess].label}
            </span>
          )}
          <span className="text-xs font-mono text-slate-500 ml-auto">
            {path.length} steps · scroll right for full chain
          </span>
        </div>

        {/* Path visualization */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {path.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 text-slate-400 px-7">
              <AlertTriangle size={32} className="opacity-40" />
              <div className="text-center">
                <p className="text-base font-mono text-slate-400">Could not resolve attack path</p>
                <p className="text-sm font-sans text-slate-600 mt-1">
                  Workload <span className="text-slate-400 font-mono">{finding.nodeLabel}</span> not found in current graph data
                </p>
              </div>
            </div>
          ) : (
            <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-none px-7 py-8 flex items-center">
              <div className="flex items-start gap-0 min-w-max">
                {path.map((step, i) => (
                  <StepCard key={step.node.id + i} step={step} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-7 py-3.5 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
          <p className="text-xs font-mono text-slate-600">
            Path reconstructed from live graph data
          </p>
          <button onClick={onClose}
            className="text-sm font-sans text-slate-400 hover:text-slate-200 transition-colors px-4 py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            Close
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
