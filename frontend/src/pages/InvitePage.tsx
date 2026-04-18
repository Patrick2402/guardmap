import { useState, useEffect, FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Shield, Building2, Loader2, AlertCircle, CheckCircle2,
  ArrowRight, Lock, Eye, EyeOff, Mail, UserPlus,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface InviteDetails {
  id: string
  email: string
  role: string
  organization_name: string
  expires_at: string
  accepted_at: string | null
}

// ── Password strength ─────────────────────────────────────────────────────────

function passwordStrength(pw: string): { label: string; color: string; score: number } {
  if (!pw) return { label: '', color: '', score: 0 }
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  if (s <= 1) return { label: 'Weak',   color: '#ef4444', score: s }
  if (s <= 2) return { label: 'Fair',   color: '#f97316', score: s }
  if (s <= 3) return { label: 'Good',   color: '#eab308', score: s }
  return              { label: 'Strong', color: '#22c55e', score: s }
}

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  admin:     { label: 'Admin',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  developer: { label: 'Developer', color: '#22d3ee', bg: 'rgba(34,211,238,0.12)' },
  readonly:  { label: 'Readonly',  color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
}

// ── Main component ────────────────────────────────────────────────────────────

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user, initialLoading } = useAuth()

  const [invite, setInvite]       = useState<InviteDetails | null>(null)
  const [loadingInvite, setLoadingInvite] = useState(true)
  const [inviteError, setInviteError]     = useState<string | null>(null)

  // Auth form state
  const [mode, setMode]         = useState<'login' | 'signup'>('signup')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [authError, setAuthError]   = useState<string | null>(null)
  const [confirmPending, setConfirmPending] = useState(false)

  // Accepting state (for logged-in users)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted]   = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  // 1. Load invite details (no auth required — uses SECURITY DEFINER RPC)
  useEffect(() => {
    if (!token) { setInviteError('Invalid invitation link.'); setLoadingInvite(false); return }
    supabase.rpc('get_invitation_by_token', { p_token: token })
      .then(({ data, error }) => {
        if (error || !data || (data as InviteDetails[]).length === 0) {
          setInviteError('This invitation is invalid or has expired.')
        } else {
          const inv = (data as InviteDetails[])[0]
          setInvite(inv)
          setEmail(inv.email)
        }
        setLoadingInvite(false)
      })
  }, [token])

  // 2. Once user is logged in, accept the invitation automatically
  useEffect(() => {
    if (!user || !invite || accepted || accepting || !token) return
    if (initialLoading) return
    acceptInvite()
  }, [user, invite, initialLoading])

  async function acceptInvite() {
    if (!token) return
    setAccepting(true); setAcceptError(null)
    const { error } = await supabase.rpc('accept_invitation', { p_token: token })
    if (error) {
      setAcceptError(error.message)
      setAccepting(false)
      return
    }
    setAccepted(true)
    // Hard reload so AuthContext picks up the new org
    setTimeout(() => { window.location.href = '/overview' }, 2000)
  }

  async function handleAuth(e: FormEvent) {
    e.preventDefault()
    setAuthError(null); setSubmitting(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // Supabase requires email confirmation before firing SIGNED_IN
        setConfirmPending(true)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // SIGNED_IN fires → useEffect calls acceptInvite automatically
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setSubmitting(false)
    }
  }

  const pw = passwordStrength(password)
  const roleMeta = ROLE_META[invite?.role ?? 'developer'] ?? ROLE_META.developer

  // ── Loading invite ──
  if (loadingInvite || initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: '#080c14' }}>
        <div className="relative">
          <Shield size={28} className="text-cyan-900" />
          <Shield size={28} className="absolute inset-0 text-cyan-400 animate-ping opacity-30" />
        </div>
      </div>
    )
  }

  // ── Invalid/expired invite ──
  if (inviteError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'radial-gradient(ellipse at 30% 40%, #0a1628 0%, #080c14 70%)' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle size={22} className="text-red-400" />
          </div>
          <div>
            <div className="text-lg font-sans font-bold text-slate-100">Invitation not found</div>
            <div className="text-sm font-sans text-slate-500 mt-1">{inviteError}</div>
          </div>
          <button onClick={() => navigate('/login')}
            className="text-sm font-sans text-cyan-500 hover:text-cyan-400 transition-colors">
            Go to login →
          </button>
        </motion.div>
      </div>
    )
  }

  // ── Already accepted ──
  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'radial-gradient(ellipse at 30% 40%, #0a1628 0%, #080c14 70%)' }}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <CheckCircle2 size={22} className="text-emerald-400" />
          </div>
          <div>
            <div className="text-lg font-sans font-bold text-slate-100">Welcome to {invite.organization_name}!</div>
            <div className="text-sm font-sans text-slate-500 mt-1">Redirecting to dashboard…</div>
          </div>
          <div className="flex justify-center">
            <Loader2 size={16} className="text-slate-600 animate-spin" />
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse at 30% 40%, #0a1628 0%, #080c14 70%)' }}>

      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(0,212,255,0.04) 0%, transparent 70%)' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md space-y-5">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-2">
          <Shield size={18} className="text-cyan-400" />
          <div className="flex items-baseline">
            <span className="text-[16px] font-sans font-bold text-cyan-400">Guard</span>
            <span className="text-[16px] font-sans font-bold text-slate-100">Map</span>
          </div>
        </div>

        {/* Email confirmation pending */}
        {confirmPending && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-6 text-center space-y-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}>
              <Mail size={20} className="text-cyan-400" />
            </div>
            <div>
              <div className="text-base font-sans font-semibold text-slate-100">Check your email</div>
              <div className="text-sm font-sans text-slate-500 mt-1">
                We sent a confirmation link to <span className="text-slate-300">{email}</span>.
                After confirming, open this invite link again to join.
              </div>
            </div>
            <button onClick={() => setConfirmPending(false)}
              className="text-xs font-sans text-slate-600 hover:text-slate-400 transition-colors">
              ← Back
            </button>
          </motion.div>
        )}

        {/* Invite card + auth form — hidden while awaiting email confirmation */}
        {!confirmPending && <><div className="rounded-2xl p-5 flex items-center gap-4"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(16px)',
          }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)' }}>
            <Building2 size={18} className="text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-sans font-semibold text-slate-100">{invite.organization_name}</span>
              <span className="text-[11px] font-sans font-semibold px-2 py-0.5 rounded-lg"
                style={{ background: roleMeta.bg, color: roleMeta.color }}>
                {roleMeta.label}
              </span>
            </div>
            <div className="text-xs font-sans text-slate-500 mt-0.5 flex items-center gap-1.5">
              <UserPlus size={10} />
              You've been invited to join this organization
            </div>
          </div>
        </div>

        {/* If already logged in — show accept button */}
        {user ? (
          <div className="rounded-2xl p-6 space-y-4"
            style={{
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
            }}>
            <div className="text-center">
              <div className="text-base font-sans font-semibold text-slate-100">Accept invitation</div>
              <div className="text-sm font-sans text-slate-500 mt-1">
                Signed in as <span className="text-slate-300">{user.email}</span>
              </div>
              {user.email !== invite.email && (
                <div className="mt-3 flex items-start gap-2 p-3 rounded-xl text-xs font-sans text-amber-400"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <AlertCircle size={12} className="shrink-0 mt-0.5" />
                  This invitation was sent to <strong>{invite.email}</strong>. Make sure you're logged in with the correct account.
                </div>
              )}
            </div>

            {acceptError && (
              <div className="flex items-start gap-2 p-3 rounded-xl text-sm font-sans text-red-400"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                {acceptError}
              </div>
            )}

            <button onClick={acceptInvite} disabled={accepting}
              className="w-full py-2.5 rounded-xl text-sm font-sans font-semibold flex items-center justify-center gap-2 transition-all"
              style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)', color: '#22d3ee' }}>
              {accepting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Join {invite.organization_name}
            </button>
          </div>
        ) : (
          /* Not logged in — show auth form */
          <div className="rounded-2xl p-6 space-y-5"
            style={{
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}>

            {/* Mode toggle */}
            <div className="flex p-1 rounded-xl gap-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
              {(['signup', 'login'] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setAuthError(null) }}
                  className="flex-1 py-1.5 rounded-lg text-sm font-sans font-medium transition-all"
                  style={mode === m
                    ? { background: 'rgba(255,255,255,0.08)', color: '#e2e8f0' }
                    : { color: '#475569' }
                  }>
                  {m === 'signup' ? 'Create account' : 'Sign in'}
                </button>
              ))}
            </div>

            <div className="text-sm font-sans text-slate-400 text-center">
              {mode === 'signup'
                ? 'Create your account to accept the invitation'
                : 'Sign in to accept the invitation'}
            </div>

            <form onSubmit={handleAuth} className="space-y-3">
              {/* Email (pre-filled, locked to invite email) */}
              <div>
                <label className="text-xs font-sans text-slate-400 mb-1.5 block">Email</label>
                <div className="relative">
                  <Mail size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
                  <input
                    type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-sm font-sans text-slate-200 outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,212,255,0.35)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="text-xs font-sans text-slate-400 mb-1.5 block">Password</label>
                <div className="relative">
                  <Lock size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password} onChange={e => setPassword(e.target.value)}
                    required minLength={6}
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl text-sm font-sans text-slate-200 outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,212,255,0.35)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
                    {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                {mode === 'signup' && password && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex gap-0.5 flex-1">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className="h-1 flex-1 rounded-full transition-all"
                          style={{ background: i <= pw.score ? pw.color : 'rgba(255,255,255,0.06)' }} />
                      ))}
                    </div>
                    <span className="text-[11px] font-sans" style={{ color: pw.color }}>{pw.label}</span>
                  </div>
                )}
              </div>

              {authError && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-sm font-sans text-red-400"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  {authError}
                </div>
              )}

              <button type="submit" disabled={submitting}
                className="w-full py-2.5 rounded-xl text-sm font-sans font-semibold flex items-center justify-center gap-2 transition-all"
                style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)', color: '#22d3ee' }}>
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                {mode === 'signup' ? 'Create account & join' : 'Sign in & join'}
              </button>
            </form>
          </div>
        )}

        <p className="text-center text-xs font-sans text-slate-700">
          By joining you agree to GuardMap's terms of service
        </p>
        </>}
      </motion.div>
    </div>
  )
}
