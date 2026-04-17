import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts'
import { Clock, TrendingUp, TrendingDown, Minus, Activity, AlertCircle, AlertTriangle, Info, Zap } from 'lucide-react'
import type { ScanSummary } from '../../hooks/useScanHistory'
import { useScanHistory } from '../../hooks/useScanHistory'
import type { DataSource } from '../../hooks/useGraphData'

// ── helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 90) return '#1d8348'
  if (score >= 70) return '#f5d40f'
  if (score >= 50) return '#ff9900'
  if (score >= 30) return '#ff7043'
  return '#d13212'
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Passed'
  if (score >= 70) return 'Low Risk'
  if (score >= 50) return 'Medium Risk'
  if (score >= 30) return 'High Risk'
  return 'Critical'
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function fmtDateFull(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as ScanSummary & { label: string }
  const color = scoreColor(d.securityScore)
  return (
    <div className="rounded-xl px-3 py-2.5 text-[12px]"
      style={{ background: 'rgba(10,15,26,0.97)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
      <div className="font-mono text-slate-400 mb-1.5">{fmtDateFull(d.scannedAt)}</div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg font-bold font-mono" style={{ color }}>{d.securityScore}</span>
        <span className="text-slate-500">{scoreLabel(d.securityScore)}</span>
      </div>
      <div className="flex items-center gap-3 text-[11px]">
        {d.criticalCount > 0 && <span style={{ color: '#d13212' }}>{d.criticalCount} critical</span>}
        {d.highCount > 0     && <span style={{ color: '#ff7043' }}>{d.highCount} high</span>}
        {d.mediumCount > 0   && <span style={{ color: '#ff9900' }}>{d.mediumCount} medium</span>}
      </div>
    </div>
  )
}

// ── Trend icon ────────────────────────────────────────────────────────────────
function Trend({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous === undefined) return null
  const diff = current - previous
  if (Math.abs(diff) < 2) return <Minus size={12} className="text-slate-600" />
  if (diff > 0) return (
    <span className="flex items-center gap-0.5 text-emerald-400 text-[11px] font-mono">
      <TrendingUp size={11} />+{diff}
    </span>
  )
  return (
    <span className="flex items-center gap-0.5 text-red-400 text-[11px] font-mono">
      <TrendingDown size={11} />{diff}
    </span>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ isMock }: { isMock: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Activity size={24} className="text-slate-700" />
      </div>
      <div className="text-center">
        <div className="text-sm font-sans font-semibold text-slate-400">
          {isMock ? 'History not available for demo' : 'No scan history yet'}
        </div>
        <div className="text-xs font-sans text-slate-600 mt-1 max-w-xs leading-relaxed">
          {isMock
            ? 'Connect a live cluster to see scan trends and historical data.'
            : 'Run your first scan by triggering the agent CronJob or waiting for the scheduled run.'}
        </div>
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────
interface HistoryViewProps {
  source: DataSource
}

export function HistoryView({ source }: HistoryViewProps) {
  const clusterId = source === 'mock' ? null : source.clusterId
  const { scans, loading } = useScanHistory(clusterId)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const isMock = source === 'mock'

  // Chart data — oldest first for the trend line
  const chartData = [...scans].reverse().map(s => ({
    ...s,
    label: fmtDate(s.scannedAt),
  }))

  const latest  = scans[0]
  const prev    = scans[1]

  // Stats
  const avgScore  = scans.length ? Math.round(scans.reduce((a, s) => a + s.securityScore, 0) / scans.length) : 0
  const bestScore = scans.length ? Math.max(...scans.map(s => s.securityScore)) : 0
  const totalCrit = scans.reduce((a, s) => a + s.criticalCount, 0)

  if (isMock || (!loading && scans.length === 0)) {
    return (
      <div className="absolute inset-0">
        <EmptyState isMock={isMock} />
      </div>
    )
  }

  return (
    <div className="absolute inset-0 overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: 'Latest score', value: latest?.securityScore ?? '—',
              sub: latest ? scoreLabel(latest.securityScore) : '',
              color: latest ? scoreColor(latest.securityScore) : '#475569',
              icon: <Activity size={13} />,
            },
            {
              label: 'Average score', value: avgScore || '—',
              sub: `over ${scans.length} scans`,
              color: scoreColor(avgScore),
              icon: <TrendingUp size={13} />,
            },
            {
              label: 'Best score', value: bestScore || '—',
              sub: 'all time high',
              color: scoreColor(bestScore),
              icon: <Zap size={13} />,
            },
            {
              label: 'Total criticals', value: totalCrit,
              sub: 'across all scans',
              color: totalCrit > 0 ? '#d13212' : '#1d8348',
              icon: <AlertCircle size={13} />,
            },
          ].map(card => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-2" style={{ color: card.color }}>
                {card.icon}
                <span className="text-slate-500">{card.label}</span>
              </div>
              <div className="text-2xl font-bold font-mono" style={{ color: card.color }}>{card.value}</div>
              <div className="text-[11px] text-slate-600 mt-0.5">{card.sub}</div>
            </motion.div>
          ))}
        </div>

        {/* ── Score trend chart ── */}
        {chartData.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl p-5"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-[13px] font-semibold text-slate-300 flex items-center gap-2">
                <TrendingUp size={13} className="text-cyan-400" />
                Security score trend
              </div>
              <div className="text-[11px] font-mono text-slate-600">{scans.length} scans</div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={90} stroke="#1d8348" strokeDasharray="4 4" strokeOpacity={0.3} />
                <ReferenceLine y={50} stroke="#ff9900" strokeDasharray="4 4" strokeOpacity={0.3} />
                <Area
                  type="monotone" dataKey="securityScore"
                  stroke="#22d3ee" strokeWidth={2}
                  fill="url(#scoreGrad)"
                  dot={{ fill: '#22d3ee', strokeWidth: 0, r: 3 }}
                  activeDot={{ fill: '#22d3ee', r: 5, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* ── Scan list ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <Clock size={12} className="text-slate-500" />
            <span className="text-[12px] font-semibold text-slate-400">Scan history</span>
          </div>

          <div className="divide-y divide-white/5">
            {scans.map((scan, i) => {
              const color = scoreColor(scan.securityScore)
              const isSelected = selectedId === scan.id
              return (
                <motion.div
                  key={scan.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => setSelectedId(isSelected ? null : scan.id)}
                  className="flex items-center gap-4 px-4 py-3 cursor-pointer transition-all"
                  style={{ background: isSelected ? 'rgba(34,211,238,0.04)' : undefined }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)' }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {/* Score pill */}
                  <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-[15px] font-bold font-mono"
                    style={{ background: color + '14', color, border: `1px solid ${color}25` }}>
                    {scan.securityScore}
                  </div>

                  {/* Date + label */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-slate-200">{fmtDateFull(scan.scannedAt)}</span>
                      {i === 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-900/40 text-cyan-400 border border-cyan-500/30">LATEST</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[11px]" style={{ color }}>{scoreLabel(scan.securityScore)}</span>
                      <span className="text-[11px] text-slate-600">{timeAgo(scan.scannedAt)}</span>
                      {scan.durationMs && (
                        <span className="text-[11px] text-slate-700">{scan.durationMs}ms</span>
                      )}
                    </div>
                  </div>

                  {/* Counts */}
                  <div className="flex items-center gap-3 shrink-0">
                    {scan.criticalCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-mono" style={{ color: '#d13212' }}>
                        <AlertCircle size={10} />{scan.criticalCount}
                      </span>
                    )}
                    {scan.highCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-mono" style={{ color: '#ff7043' }}>
                        <AlertTriangle size={10} />{scan.highCount}
                      </span>
                    )}
                    {scan.mediumCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-mono" style={{ color: '#ff9900' }}>
                        <Info size={10} />{scan.mediumCount}
                      </span>
                    )}
                    {scan.criticalCount === 0 && scan.highCount === 0 && scan.mediumCount === 0 && (
                      <span className="text-[11px] text-emerald-500">Clean</span>
                    )}
                    <Trend current={scan.securityScore} previous={scans[i + 1]?.securityScore} />
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
