import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Copy, Check, X, ChevronRight, Terminal,
  RefreshCw, Trash2, Key, AlertCircle, CheckCircle2,
  Clock, ShieldCheck, Activity, Cloud, Loader2,
  ExternalLink, Eye, EyeOff, Shield, ArrowLeft,
} from 'lucide-react'
import { supabase, db } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { OrgSwitcher } from '../components/OrgSwitcher'
import type { Cluster, ApiKey } from '../lib/database.types'

// ── helpers ───────────────────────────────────────────────────────────────────

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(40)))
    .map(b => chars[b % chars.length]).join('')
  return `gm_live_${rand}`
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)   return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400)return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function scoreColor(score: number | null): string {
  if (score === null) return '#475569'
  if (score >= 90) return '#1d8348'
  if (score >= 70) return '#f5d40f'
  if (score >= 50) return '#ff9900'
  if (score >= 30) return '#ff7043'
  return '#d13212'
}

const REGIONS = [
  'us-east-1','us-east-2','us-west-1','us-west-2',
  'eu-west-1','eu-west-2','eu-west-3','eu-central-1','eu-north-1',
  'ap-southeast-1','ap-southeast-2','ap-northeast-1','ap-south-1',
]

// ── Install manifest generator ────────────────────────────────────────────────
function buildManifest(clusterName: string, apiKey: string, orgId: string): string {
  return `apiVersion: v1
kind: Namespace
metadata:
  name: guardmap
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: guardmap-agent
  namespace: guardmap
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: guardmap-agent
rules:
  - apiGroups: [""]
    resources: ["pods","serviceaccounts","services","namespaces","nodes"]
    verbs: ["get","list"]
  - apiGroups: ["apps"]
    resources: ["deployments","statefulsets","daemonsets","replicasets"]
    verbs: ["get","list"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses","networkpolicies"]
    verbs: ["get","list"]
  - apiGroups: ["rbac.authorization.k8s.io"]
    resources: ["roles","clusterroles","rolebindings","clusterrolebindings"]
    verbs: ["get","list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: guardmap-agent
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: guardmap-agent
subjects:
  - kind: ServiceAccount
    name: guardmap-agent
    namespace: guardmap
---
apiVersion: v1
kind: Secret
metadata:
  name: guardmap-credentials
  namespace: guardmap
type: Opaque
stringData:
  GUARDMAP_API_KEY: "${apiKey}"
  GUARDMAP_ORG_ID: "${orgId}"
  SUPABASE_URL: "${import.meta.env.VITE_SUPABASE_URL}"
  SUPABASE_ANON_KEY: "${import.meta.env.VITE_SUPABASE_ANON_KEY}"
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: guardmap-scanner
  namespace: guardmap
spec:
  schedule: "0 */6 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: guardmap-agent
          restartPolicy: OnFailure
          containers:
            - name: scanner
              image: patryk2402/guardmap-agent:latest
              imagePullPolicy: Always
              envFrom:
                - secretRef:
                    name: guardmap-credentials
              env:
                - name: CLUSTER_NAME
                  value: "${clusterName}"
              resources:
                requests:
                  cpu: 100m
                  memory: 128Mi
                limits:
                  cpu: 500m
                  memory: 256Mi`
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className={`flex items-center gap-1.5 transition-colors ${className}`}>
      {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
      <span className="text-xs font-sans">{copied ? 'Copied!' : 'Copy'}</span>
    </button>
  )
}

// ── Add Cluster Modal ─────────────────────────────────────────────────────────
function AddClusterModal({ orgId, onClose, onCreated }: {
  orgId: string
  onClose: () => void
  onCreated: () => void
}) {
  const { user } = useAuth()
  const [step, setStep]       = useState<'form' | 'key' | 'install'>('form')
  const [name, setName]       = useState('')
  const [region, setRegion]   = useState('eu-central-1')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [plainKey, setPlainKey] = useState('')
  const [manifest, setManifest] = useState('')

  async function handleCreate() {
    if (!name.trim()) return
    setError(null); setLoading(true)
    try {
      const { data: cluster, error: clusterErr } = await db.clusters().insert({
        organization_id: orgId,
        name: name.trim(),
        region,
        created_by: user?.id,
        status: 'pending',
      }).select().single()
      if (clusterErr) throw clusterErr

      const key = generateApiKey()
      const hash = await sha256hex(key)
      const prefix = key.slice(0, 16) + '...'

      const { error: keyErr } = await db.apiKeys().insert({
        organization_id: orgId,
        name: `${name.trim()} agent`,
        key_hash: hash,
        key_prefix: prefix,
        created_by: user?.id,
      })
      if (keyErr) throw keyErr

      setPlainKey(key)
      setManifest(buildManifest(cluster.name, key, orgId))
      setStep('key')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create cluster')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative w-full max-w-2xl rounded-2xl flex flex-col"
        style={{
          background: 'rgba(10,15,26,0.98)',
          backdropFilter: 'blur(32px)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
          maxHeight: '90vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            {/* Step pills */}
            {(['form','key','install'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <ChevronRight size={12} className="text-slate-700" />}
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold"
                    style={step === s
                      ? { background: 'rgba(0,212,255,0.15)', color: '#22d3ee', border: '1px solid rgba(0,212,255,0.3)' }
                      : ['form','key','install'].indexOf(step) > i
                        ? { background: 'rgba(16,185,129,0.15)', color: '#10b981' }
                        : { background: 'rgba(255,255,255,0.04)', color: '#334155' }
                    }>
                    {['form','key','install'].indexOf(step) > i ? <Check size={10} /> : i + 1}
                  </div>
                  <span className="text-xs font-sans hidden sm:block"
                    style={{ color: step === s ? '#94a3b8' : '#334155' }}>
                    {s === 'form' ? 'Configure' : s === 'key' ? 'API Key' : 'Install'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-300 transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)' }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">

            {/* Step 1: Form */}
            {step === 'form' && (
              <motion.div key="form" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-5">
                <div>
                  <div className="text-lg font-sans font-bold text-slate-100 mb-1">Connect a cluster</div>
                  <div className="text-sm font-sans text-slate-500">Name your cluster and we'll generate an install manifest with a pre-configured API key.</div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-sans text-slate-400 mb-1.5 block">Cluster name</label>
                    <input
                      type="text" value={name} onChange={e => setName(e.target.value)}
                      placeholder="production-eu-west-1"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono text-slate-200 placeholder-slate-600 outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                      onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,212,255,0.35)'}
                      onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-sans text-slate-400 mb-1.5 block">AWS Region</label>
                    <select
                      value={region} onChange={e => setRegion(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono text-slate-200 outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    {error}
                  </div>
                )}

                <button
                  onClick={handleCreate}
                  disabled={loading || !name.trim()}
                  className="w-full py-2.5 rounded-xl text-sm font-sans font-semibold flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: !name.trim() ? 'rgba(255,255,255,0.04)' : 'rgba(0,212,255,0.12)',
                    border: `1px solid ${!name.trim() ? 'rgba(255,255,255,0.06)' : 'rgba(0,212,255,0.25)'}`,
                    color: !name.trim() ? '#334155' : '#22d3ee',
                  }}
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                  Generate API key & manifest
                </button>
              </motion.div>
            )}

            {/* Step 2: API Key — shown ONCE */}
            {step === 'key' && (
              <motion.div key="key" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-5">
                <div className="flex items-start gap-3 p-4 rounded-xl"
                  style={{ background: 'rgba(245,212,15,0.07)', border: '1px solid rgba(245,212,15,0.2)' }}>
                  <AlertCircle size={15} className="text-yellow-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-sans font-semibold text-yellow-300">Save your API key now</div>
                    <div className="text-xs font-sans text-yellow-600 mt-0.5">This key is shown only once. It's already embedded in the manifest below.</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-sans text-slate-400 mb-1.5">API Key</div>
                  <div className="flex items-center gap-2 p-3 rounded-xl font-mono text-sm text-cyan-300 break-all"
                    style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)' }}>
                    <span className="flex-1">{plainKey}</span>
                    <CopyButton text={plainKey} className="text-slate-500 hover:text-cyan-400 shrink-0" />
                  </div>
                </div>

                <button
                  onClick={() => setStep('install')}
                  className="w-full py-2.5 rounded-xl text-sm font-sans font-semibold flex items-center justify-center gap-2"
                  style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)', color: '#22d3ee' }}
                >
                  <Terminal size={14} />
                  Show install command
                  <ChevronRight size={14} />
                </button>
              </motion.div>
            )}

            {/* Step 3: Install */}
            {step === 'install' && (
              <motion.div key="install" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-5">
                <div>
                  <div className="text-lg font-sans font-bold text-slate-100 mb-1">Install the agent</div>
                  <div className="text-sm font-sans text-slate-500">Run this command on any machine with <span className="font-mono text-slate-400">kubectl</span> access to your cluster.</div>
                </div>

                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center justify-between px-4 py-2.5"
                    style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2">
                      <Terminal size={12} className="text-slate-500" />
                      <span className="text-xs font-mono text-slate-500">kubectl apply</span>
                    </div>
                    <CopyButton
                      text={`kubectl apply -f - <<'EOF'\n${manifest}\nEOF`}
                      className="text-slate-500 hover:text-slate-200"
                    />
                  </div>
                  <pre className="px-4 py-3 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-72 overflow-y-auto"
                    style={{ background: 'rgba(0,0,0,0.3)' }}>
                    {`kubectl apply -f - <<'EOF'\n${manifest}\nEOF`}
                  </pre>
                </div>

                <div className="space-y-2">
                  {[
                    { icon: <CheckCircle2 size={13} />, color: '#10b981', text: 'Creates a dedicated guardmap namespace' },
                    { icon: <CheckCircle2 size={13} />, color: '#10b981', text: 'ClusterRole with read-only permissions only' },
                    { icon: <CheckCircle2 size={13} />, color: '#10b981', text: 'CronJob runs every 6h, no persistent footprint' },
                    { icon: <CheckCircle2 size={13} />, color: '#10b981', text: 'API key stored as K8s Secret, not in image' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <span style={{ color: item.color }}>{item.icon}</span>
                      <span className="text-xs font-sans text-slate-400">{item.text}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => { onCreated(); onClose() }}
                  className="w-full py-2.5 rounded-xl text-sm font-sans font-semibold flex items-center justify-center gap-2"
                  style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#34d399' }}
                >
                  <CheckCircle2 size={14} />
                  Done — waiting for first scan
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

// ── Cluster Card ──────────────────────────────────────────────────────────────
function ClusterCard({ cluster, onDelete }: { cluster: Cluster; onDelete: () => void }) {
  const isOnline  = cluster.status === 'active'
  const isPending = cluster.status === 'pending'
  const score     = cluster.last_scan_score
  const sColor    = scoreColor(score)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5"
      style={{
        background: 'rgba(255,255,255,0.025)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.05)',
        boxShadow: `0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: 'rgba(255,153,0,0.1)' }}>
            <Cloud size={16} className="text-orange-400" />
          </div>
          <div>
            <div className="text-sm font-sans font-semibold text-slate-100">{cluster.name}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-mono text-slate-500">{cluster.region ?? '—'}</span>
              {cluster.k8s_version && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md text-cyan-400"
                  style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)' }}>
                  {cluster.k8s_version}
                </span>
              )}
              {cluster.node_count != null && (
                <span className="text-[10px] font-mono text-slate-600">{cluster.node_count}n</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-sans font-medium"
            style={isOnline
              ? { background: 'rgba(16,185,129,0.1)', color: '#34d399' }
              : isPending
                ? { background: 'rgba(245,212,15,0.1)', color: '#fbbf24' }
                : { background: 'rgba(239,68,68,0.1)', color: '#f87171' }
            }>
            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : isPending ? 'bg-yellow-400' : 'bg-red-400'}`} />
            {isOnline ? 'Online' : isPending ? 'Pending' : 'Error'}
          </div>
          <button onClick={onDelete}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-700 hover:text-red-400 transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center py-2.5 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="text-lg font-mono font-bold leading-none" style={{ color: sColor }}>
            {score ?? '—'}
          </div>
          <div className="text-[9px] font-sans text-slate-600 mt-1">Score</div>
        </div>
        <div className="flex flex-col items-center py-2.5 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          {cluster.last_scan_critical != null && cluster.last_scan_critical > 0
            ? <div className="text-lg font-mono font-bold leading-none text-red-400">{cluster.last_scan_critical}</div>
            : <div className="text-lg font-mono font-bold leading-none text-slate-600">0</div>
          }
          <div className="text-[9px] font-sans text-slate-600 mt-1">Critical</div>
        </div>
        <div className="flex flex-col items-center py-2.5 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="text-xs font-sans text-slate-400 text-center leading-tight">
            {timeAgo(cluster.last_scan_at)}
          </div>
          <div className="text-[9px] font-sans text-slate-600 mt-1">Last scan</div>
        </div>
      </div>

      {/* Pending hint */}
      {isPending && (
        <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl text-xs font-sans text-yellow-600"
          style={{ background: 'rgba(245,212,15,0.05)', border: '1px solid rgba(245,212,15,0.12)' }}>
          <Clock size={11} className="shrink-0" />
          Waiting for first agent scan — apply the manifest to your cluster
        </div>
      )}
    </motion.div>
  )
}

// ── API Key row ───────────────────────────────────────────────────────────────
function ApiKeyRow({ apiKey, onRevoke }: { apiKey: ApiKey; onRevoke: () => void }) {
  const isRevoked = !!apiKey.revoked_at
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl transition-colors"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: isRevoked ? 'rgba(255,255,255,0.04)' : 'rgba(0,212,255,0.08)' }}>
        <Key size={13} style={{ color: isRevoked ? '#334155' : '#22d3ee' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-sans font-medium" style={{ color: isRevoked ? '#475569' : '#cbd5e1' }}>
          {apiKey.name}
        </div>
        <div className="text-xs font-mono text-slate-600 mt-0.5">{apiKey.key_prefix}</div>
      </div>
      <div className="text-xs font-sans text-slate-600 shrink-0">
        {isRevoked ? (
          <span className="text-red-500/60">Revoked</span>
        ) : apiKey.last_used_at ? (
          `Used ${timeAgo(apiKey.last_used_at)}`
        ) : (
          'Never used'
        )}
      </div>
      {!isRevoked && (
        <button onClick={onRevoke}
          className="text-xs font-sans text-slate-700 hover:text-red-400 transition-colors px-2 py-1 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.04)' }}>
          Revoke
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function IntegrationsPage() {
  const { activeOrg } = useAuth()
  const navigate = useNavigate()
  const orgId = activeOrg?.organization_id ?? null

  const [clusters, setClusters]   = useState<Cluster[]>([])
  const [apiKeys, setApiKeys]     = useState<ApiKey[]>([])
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [{ data: c }, { data: k }] = await Promise.all([
      db.clusters().select('*').eq('organization_id', orgId).is('deleted_at', null).order('created_at', { ascending: false }),
      db.apiKeys().select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
    ])
    setClusters((c ?? []) as Cluster[])
    setApiKeys((k ?? []) as ApiKey[])
    setLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  async function handleDeleteCluster(id: string) {
    if (!confirm('Remove this cluster? The agent manifest will stop reporting.')) return
    const { error } = await db.clusters()
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', orgId!)
    if (error) { alert('Failed to remove cluster: ' + error.message); return }
    await load()
  }

  async function handleRevokeKey(id: string) {
    if (!confirm('Revoke this API key? The agent using it will stop working.')) return
    const { error } = await db.apiKeys()
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', orgId!)
    if (error) { alert('Failed to revoke key: ' + error.message); return }
    await load()
  }

  if (!orgId) return null

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 20% 50%, #0a1628 0%, #080c14 60%)' }}
    >
      {/* ── Topbar ── */}
      <header
        className="shrink-0 flex items-center px-5 gap-4 sticky top-0 z-20"
        style={{ height: 52, background: 'rgba(8,12,20,0.85)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        {/* Logo */}
        <button
          onClick={() => navigate('/overview')}
          className="flex items-center gap-2.5 shrink-0 cursor-pointer select-none group"
        >
          <div className="relative">
            <Shield size={16} className="text-cyan-400" />
            <div className="absolute inset-0 animate-ping opacity-15">
              <Shield size={16} className="text-cyan-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-0">
            <span className="text-[14px] font-sans font-bold text-cyan-400">Guard</span>
            <span className="text-[14px] font-sans font-bold text-slate-100">Map</span>
          </div>
        </button>

        <div className="h-5 w-px bg-white/8 shrink-0" />

        <OrgSwitcher />

        <div className="h-5 w-px bg-white/8 shrink-0" />

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-slate-600">
          <span className="text-[12px] font-sans">Dashboard</span>
          <ChevronRight size={11} />
          <span className="text-[12px] font-sans font-medium text-slate-300 flex items-center gap-1.5">
            <Activity size={11} className="text-cyan-400" />
            Agent Integrations
          </span>
        </div>

        <div className="flex-1" />

        {/* Back button */}
        <button
          onClick={() => navigate('/overview')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-400 hover:text-slate-100 transition-all text-xs font-sans"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <ArrowLeft size={12} />
          Back to dashboard
        </button>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 space-y-8">

        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-sans font-bold text-slate-100 mb-1">Agent Integrations</h1>
            <p className="text-sm font-sans text-slate-500">
              Connect your Kubernetes clusters with a single <span className="font-mono text-slate-400">kubectl apply</span>. The agent scans automatically every 6 hours.
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-sans font-semibold transition-all shrink-0"
            style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: '#22d3ee' }}
          >
            <Plus size={14} />
            Add cluster
          </button>
        </div>

        {/* Clusters */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Cloud size={14} className="text-orange-400" />
              <span className="text-sm font-sans font-semibold text-slate-300">Clusters</span>
              <span className="text-xs font-mono text-slate-600 px-1.5 py-0.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                {clusters.length} / {activeOrg?.plan === 'free' ? 3 : '∞'}
              </span>
            </div>
            <button onClick={load} className="text-slate-600 hover:text-slate-400 transition-colors">
              <RefreshCw size={13} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="text-slate-700 animate-spin" />
            </div>
          ) : clusters.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-14 rounded-2xl gap-4"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.07)' }}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                <Cloud size={20} className="text-slate-700" />
              </div>
              <div className="text-center">
                <div className="text-sm font-sans font-medium text-slate-500">No clusters connected</div>
                <div className="text-xs font-sans text-slate-700 mt-1">Click "Add cluster" to get started</div>
              </div>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-sans font-semibold"
                style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#22d3ee' }}
              >
                <Plus size={13} />
                Connect first cluster
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {clusters.map(c => (
                <ClusterCard key={c.id} cluster={c} onDelete={() => handleDeleteCluster(c.id)} />
              ))}
            </div>
          )}
        </section>

        {/* API Keys */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Key size={14} className="text-cyan-400" />
            <span className="text-sm font-sans font-semibold text-slate-300">API Keys</span>
            <span className="text-xs font-sans text-slate-600">— used by agents to authenticate scans</span>
          </div>

          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {apiKeys.length === 0 ? (
              <div className="text-center py-8 text-sm font-sans text-slate-600">
                No API keys yet — they're created automatically when you add a cluster
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {apiKeys.map(k => (
                  <div key={k.id} className="px-2 py-1">
                    <ApiKeyRow apiKey={k} onRevoke={() => handleRevokeKey(k.id)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* How it works */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={14} className="text-violet-400" />
            <span className="text-sm font-sans font-semibold text-slate-300">How it works</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              { n: '01', title: 'Add cluster', desc: 'Name your cluster and generate an API key', color: '#22d3ee' },
              { n: '02', title: 'kubectl apply', desc: 'Paste one command — installs agent in guardmap namespace', color: '#a78bfa' },
              { n: '03', title: 'Auto-scan', desc: 'CronJob runs every 6h, discovers IRSA, RBAC, network config', color: '#f59e0b' },
              { n: '04', title: 'See results', desc: 'Findings, score and graph appear in your dashboard instantly', color: '#10b981' },
            ].map(step => (
              <div key={step.n} className="rounded-2xl p-4"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="text-2xl font-mono font-bold mb-2" style={{ color: `${step.color}40` }}>{step.n}</div>
                <div className="text-sm font-sans font-semibold text-slate-200 mb-1">{step.title}</div>
                <div className="text-xs font-sans text-slate-500 leading-relaxed">{step.desc}</div>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* Add cluster modal */}
      <AnimatePresence>
        {showAdd && (
          <AddClusterModal
            orgId={orgId}
            onClose={() => setShowAdd(false)}
            onCreated={load}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
