import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, Building2, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { supabase, db } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [name, setName]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const slug = slugify(name)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null); setLoading(true)

    try {
      const { error } = await db.orgs().insert({ name: name.trim(), slug })
      if (error) throw error
      // Hard reload so AuthContext re-fetches orgs fresh
      window.location.href = '/overview'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create organization')
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse at 30% 40%, #0a1628 0%, #080c14 70%)' }}
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(124,58,237,0.05) 0%, transparent 70%)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <Shield size={18} className="text-cyan-400" />
          <div className="flex items-baseline">
            <span className="text-[16px] font-sans font-bold text-cyan-400">Guard</span>
            <span className="text-[16px] font-sans font-bold text-slate-100">Map</span>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 justify-center mb-8">
          {[
            { n: 1, label: 'Account', done: true },
            { n: 2, label: 'Organization', done: false },
            { n: 3, label: 'First cluster', done: false },
          ].map((step, i) => (
            <div key={step.n} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />}
              <div className="flex items-center gap-1.5">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono font-bold"
                  style={step.done
                    ? { background: 'rgba(16,185,129,0.15)', color: '#10b981' }
                    : step.n === 2
                      ? { background: 'rgba(0,212,255,0.12)', color: '#22d3ee', border: '1px solid rgba(0,212,255,0.3)' }
                      : { background: 'rgba(255,255,255,0.04)', color: '#334155' }}
                >
                  {step.done ? <CheckCircle2 size={12} /> : step.n}
                </div>
                <span className="text-xs font-sans hidden sm:block"
                  style={{ color: step.n === 2 ? '#94a3b8' : step.done ? '#10b981' : '#334155' }}>
                  {step.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-start gap-4 mb-7">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)' }}>
              <Building2 size={18} className="text-violet-400" />
            </div>
            <div>
              <div className="text-lg font-sans font-bold text-slate-100">Create your organization</div>
              <div className="text-sm font-sans text-slate-500 mt-0.5">
                Your organization groups clusters and team members together.
              </div>
            </div>
          </div>

          <form onSubmit={handleCreate} className="space-y-5">
            <div>
              <label className="text-xs font-sans text-slate-400 mb-1.5 block">Organization name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Acme Corp"
                required
                maxLength={64}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-sans text-slate-200 placeholder-slate-600 outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
              {slug && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-xs font-sans text-slate-600">URL slug:</span>
                  <span className="text-xs font-mono text-slate-500">{slug}</span>
                </div>
              )}
            </div>

            {/* Plan info */}
            <div className="rounded-xl p-3.5 space-y-2"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="text-xs font-sans font-semibold text-slate-400 uppercase tracking-wider mb-2">Free plan includes</div>
              {[
                'Up to 3 clusters',
                'Up to 5 team members',
                'Full security scanning & findings',
                'RBAC, IRSA, Network topology',
              ].map(f => (
                <div key={f} className="flex items-center gap-2">
                  <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                  <span className="text-xs font-sans text-slate-400">{f}</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl text-sm font-sans"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-sans font-semibold transition-all flex items-center justify-center gap-2"
              style={{
                background: !name.trim() || loading ? 'rgba(255,255,255,0.04)' : 'rgba(0,212,255,0.12)',
                border: `1px solid ${!name.trim() || loading ? 'rgba(255,255,255,0.06)' : 'rgba(0,212,255,0.25)'}`,
                color: !name.trim() || loading ? '#334155' : '#22d3ee',
              }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              Create organization
            </button>
          </form>
        </div>

        <div className="flex items-center justify-center mt-5">
          <span className="text-xs font-sans text-slate-700">
            Signed in as <span className="text-slate-500">{user?.email}</span>
          </span>
          <span className="mx-2 text-slate-800">·</span>
          <button onClick={signOut} className="text-xs font-sans text-slate-700 hover:text-slate-400 transition-colors">
            Sign out
          </button>
        </div>
      </motion.div>
    </div>
  )
}
