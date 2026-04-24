import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Hash, ChevronRight, Shield, Zap, Cloud,
  AlertTriangle, Layers, GitBranch, Clock, Cpu,
} from 'lucide-react'
import { DbFinding } from '../hooks/useGraphData'

// ── Types ──────────────────────────────────────────────────────────────────────

interface AWSService { node: { id: string; label: string; type: string; metadata?: Record<string,string> }; accessLevel: string; actions: string[] }

interface IRSAChain {
  workload:       { id: string; label: string; type: string; namespace?: string; metadata?: Record<string,string> }
  serviceAccount: { id: string; label: string; type: string; namespace?: string } | null
  iamRole:        { id: string; label: string; type: string; metadata?: Record<string,string> } | null
  awsServices:    AWSService[]
}

interface IRSAChainModalProps {
  chain: IRSAChain
  findings?: DbFinding[]
  onClose: () => void
  onFinding?: (f: DbFinding) => void
}

// ── Visual config ──────────────────────────────────────────────────────────────

const WORKLOAD_CFG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  deployment:  { label: 'Deployment',  color: '#60a5fa', Icon: Layers    },
  statefulset: { label: 'StatefulSet', color: '#a78bfa', Icon: Layers    },
  daemonset:   { label: 'DaemonSet',   color: '#fb923c', Icon: GitBranch },
  job:         { label: 'Job',         color: '#34d399', Icon: Cpu       },
  cronjob:     { label: 'CronJob',     color: '#2dd4bf', Icon: Clock     },
}

const ACCESS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  full:  { label: 'FULL ACCESS',  color: '#f87171', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)'  },
  write: { label: 'WRITE ACCESS', color: '#fb923c', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)' },
  read:  { label: 'READ ACCESS',  color: '#4ade80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.2)' },
}

const FINDING_SEV: Record<string, string> = {
  critical: 'text-red-400 border-red-500/30 bg-red-900/20',
  high:     'text-orange-400 border-orange-500/30 bg-orange-900/20',
  medium:   'text-yellow-400 border-yellow-500/30 bg-yellow-900/15',
  low:      'text-slate-400 border-slate-600/30 bg-slate-800/30',
}

const EDGE_COLOR: Record<string, string> = {
  'manages':       '#3b82f6',
  'uses':          '#8b5cf6',
  'assumes (IRSA)':'#f59e0b',
  'IRSA →':        '#f59e0b',
}

// ── Chain step card ────────────────────────────────────────────────────────────

interface StepNode { label: string; type: string; sub?: string; color: string; Icon: React.ElementType; isFocal?: boolean; badge?: string; badgeColor?: string; badgeBg?: string }

function ChainStep({ step, edgeLabel }: { step: StepNode; edgeLabel?: string }) {
  const edgeColor = edgeLabel ? (EDGE_COLOR[edgeLabel] ?? '#64748b') : '#64748b'

  return (
    <div className="flex items-center gap-2 shrink-0">
      {edgeLabel !== undefined && (
        <div className="flex flex-col items-center gap-0.5 shrink-0 mx-2">
          <div className="flex items-center gap-0.5">
            <div className="w-6 h-px" style={{ background: `${edgeColor}50` }} />
            <ChevronRight size={11} style={{ color: edgeColor }} />
          </div>
          <span className="text-[9px] font-mono whitespace-nowrap" style={{ color: edgeColor }}>{edgeLabel}</span>
        </div>
      )}
      <div className="flex flex-col gap-2 p-4 rounded-xl shrink-0"
        style={{
          background: step.isFocal ? `${step.color}14` : 'rgba(255,255,255,0.03)',
          border: step.isFocal ? `1.5px solid ${step.color}55` : `1px solid ${step.color}22`,
          minWidth: 160,
          boxShadow: step.isFocal ? `0 0 28px ${step.color}22` : undefined,
        }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <step.Icon size={11} style={{ color: step.color }} />
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest" style={{ color: step.color }}>
            {step.type}
          </span>
          {step.isFocal && (
            <span className="text-[8px] font-mono px-1 py-0.5 rounded" style={{ background: `${step.color}20`, color: step.color }}>
              selected
            </span>
          )}
        </div>
        <div className="text-sm font-mono font-semibold text-slate-100 leading-snug" style={{ wordBreak: 'break-word', maxWidth: 220 }}>
          {step.label}
        </div>
        {step.sub && <div className="text-[10px] font-mono text-slate-500">{step.sub}</div>}
        {step.badge && (
          <span className="self-start text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md"
            style={{ color: step.badgeColor, background: step.badgeBg, border: `1px solid ${step.badgeColor}40` }}>
            {step.badge}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function IRSAChainModal({ chain, findings = [], onClose, onFinding }: IRSAChainModalProps) {
  const { workload, serviceAccount, iamRole, awsServices } = chain

  const wlCfg = WORKLOAD_CFG[workload.type] ?? { label: workload.type, color: '#60a5fa', Icon: Layers }

  const maxAccess = awsServices.reduce<string>((m, s) => {
    if (s.accessLevel === 'full') return 'full'
    if (s.accessLevel === 'write' && m !== 'full') return 'write'
    return m
  }, 'read')

  const riskMeta = awsServices.length > 0 ? ACCESS_META[maxAccess] : null

  const relatedFindings = useMemo(() =>
    findings.filter(f =>
      f.resource.toLowerCase().includes(workload.label.toLowerCase()) ||
      (workload.namespace && f.resource.toLowerCase().includes(workload.namespace.toLowerCase())) ||
      (iamRole && f.resource.toLowerCase().includes(iamRole.label.toLowerCase()))
    ).slice(0, 6)
  , [findings, workload, iamRole])

  const rep   = workload.metadata?.replicas   ? parseInt(workload.metadata.replicas) : null
  const avail = workload.metadata?.available  ? parseInt(workload.metadata.available) : null

  // Build chain steps
  const steps: { step: StepNode; edgeLabel?: string }[] = [
    {
      step: {
        label: workload.label,
        type: wlCfg.label,
        sub: workload.namespace,
        color: wlCfg.color,
        Icon: wlCfg.Icon,
        isFocal: true,
        badge: riskMeta?.label,
        badgeColor: riskMeta?.color,
        badgeBg: riskMeta?.bg,
      },
    },
  ]

  if (serviceAccount) {
    steps.push({
      edgeLabel: 'uses',
      step: { label: serviceAccount.label, type: 'ServiceAccount', sub: serviceAccount.namespace, color: '#8b5cf6', Icon: Shield },
    })
  }

  if (iamRole) {
    steps.push({
      edgeLabel: 'assumes (IRSA)',
      step: {
        label: iamRole.label,
        type: 'IAM Role',
        sub: iamRole.metadata?.arn ? `${iamRole.metadata.arn.slice(0, 40)}…` : undefined,
        color: '#f59e0b',
        Icon: Zap,
        badge: iamRole.metadata?.policies ? `${iamRole.metadata.policies} policies` : undefined,
        badgeColor: '#f59e0b',
        badgeBg: 'rgba(245,158,11,0.1)',
      },
    })
  }

  // Add up to 3 AWS services
  awsServices.slice(0, 3).forEach(s => {
    const am = ACCESS_META[s.accessLevel] ?? ACCESS_META.read
    steps.push({
      edgeLabel: s.actions[0] ?? '→',
      step: { label: s.node.label, type: 'AWS Resource', color: am.color, Icon: Cloud, badge: am.label, badgeColor: am.color, badgeBg: am.bg },
    })
  })

  return (
    <AnimatePresence>
      <motion.div
        key="irsa-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />

      <motion.div
        key="irsa-modal"
        initial={{ opacity: 0, scale: 0.97, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 14 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="fixed inset-x-6 top-16 z-50 rounded-2xl flex flex-col overflow-hidden max-w-3xl mx-auto max-h-[calc(100vh-7rem)]"
        style={{
          background: 'rgba(8,12,20,0.97)',
          backdropFilter: 'blur(32px)',
          border: `1px solid ${wlCfg.color}28`,
          boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 60px ${wlCfg.color}12`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 px-7 py-5 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: `${wlCfg.color}0a` }}>
          <wlCfg.Icon size={20} style={{ color: wlCfg.color }} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] mb-1" style={{ color: wlCfg.color }}>
              {wlCfg.label}
            </div>
            <div className="text-2xl font-mono font-bold text-slate-100 leading-tight break-all">
              {workload.label}
            </div>
            {workload.namespace && (
              <div className="flex items-center gap-1.5 mt-2">
                <Hash size={11} className="text-slate-500" />
                <span className="text-sm font-mono text-slate-500">{workload.namespace}</span>
              </div>
            )}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {rep !== null && (
                <span className="text-xs font-mono px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.05)', color: avail === rep ? '#4ade80' : '#f87171' }}>
                  {avail ?? '?'}/{rep} replicas
                </span>
              )}
              {riskMeta && (
                <span className="flex items-center gap-1.5 text-xs font-mono font-bold px-2.5 py-1 rounded-lg"
                  style={{ color: riskMeta.color, background: riskMeta.bg, border: `1px solid ${riskMeta.border}` }}>
                  <AlertTriangle size={11} /> {riskMeta.label}
                </span>
              )}
              {!iamRole && (
                <span className="text-xs font-mono text-slate-600 px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  no IRSA binding
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors shrink-0"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-none">

          {/* IRSA chain visualization */}
          {(serviceAccount || iamRole) && (
            <div className="px-7 py-5 border-b border-slate-800/50">
              <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-slate-500 mb-4">
                IRSA permission chain
              </div>
              <div className="overflow-x-auto scrollbar-none">
                <div className="flex items-center min-w-max gap-0 py-1">
                  {steps.map(({ step, edgeLabel }, i) => (
                    <ChainStep key={i} step={step} edgeLabel={i === 0 ? undefined : edgeLabel} />
                  ))}
                  {awsServices.length > 3 && (
                    <div className="ml-3 text-xs font-mono text-slate-500 self-center">
                      +{awsServices.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* AWS Services detail */}
          {awsServices.length > 0 && (
            <div className="px-7 py-5 border-b border-slate-800/50">
              <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-slate-500 mb-4">
                IAM permissions · {awsServices.length} services
              </div>
              <div className="space-y-3">
                {awsServices.map(s => {
                  const am = ACCESS_META[s.accessLevel] ?? ACCESS_META.read
                  return (
                    <div key={s.node.id} className="flex items-start gap-4 p-4 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${am.color}20` }}>
                      <Cloud size={16} style={{ color: am.color }} className="mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono text-slate-200 break-all">{s.node.label}</span>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md shrink-0"
                            style={{ color: am.color, background: am.bg, border: `1px solid ${am.border}` }}>
                            {am.label}
                          </span>
                        </div>
                        {s.actions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {s.actions.map(a => (
                              <span key={a} className="text-[10px] font-mono px-2 py-0.5 rounded-md"
                                style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
                                {a}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Related findings */}
          {relatedFindings.length > 0 && (
            <div className="px-7 py-5 border-b border-slate-800/50">
              <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-slate-500 mb-4">
                Related findings · {relatedFindings.length}
              </div>
              <div className="space-y-2">
                {relatedFindings.map((f, i) => (
                  <button key={i}
                    onClick={() => { onFinding?.(f); onClose() }}
                    className={`w-full text-left flex gap-3 p-3.5 rounded-xl border transition-all ${
                      onFinding ? 'cursor-pointer hover:brightness-125 hover:scale-[1.01]' : 'cursor-default'
                    } ${FINDING_SEV[f.severity] ?? FINDING_SEV.low}`}
                    style={{ transition: 'filter 0.15s, transform 0.15s' }}>
                    <span className="text-[10px] font-mono font-bold uppercase mt-0.5 shrink-0">{f.severity}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-mono text-slate-200 leading-snug">{f.type}</div>
                        {onFinding && <span className="text-[9px] font-mono text-slate-500 shrink-0">view →</span>}
                      </div>
                      <div className="text-xs font-sans text-slate-400 mt-1 leading-relaxed">{f.description}</div>
                      <div className="text-[10px] font-mono text-slate-600 mt-1.5">{f.resource}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="h-5" />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-7 py-3.5 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
          <p className="text-xs font-mono text-slate-600">
            Chain reconstructed from live graph edges
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
