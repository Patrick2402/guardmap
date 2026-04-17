import { useState, FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, Mail, Lock, Eye, EyeOff, AlertCircle,
  Loader2, User, ArrowRight, Check, ArrowLeft,
  GitGraph, ShieldAlert, Zap, Activity,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type Mode = 'login' | 'signup' | 'reset'

// ── Password strength ─────────────────────────────────────────────────────────
function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length === 0) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Weak', color: '#d13212' }
  if (score <= 2) return { score, label: 'Fair', color: '#ff9900' }
  if (score <= 3) return { score, label: 'Good', color: '#f5d40f' }
  return { score, label: 'Strong', color: '#1d8348' }
}

// ── Floating node animation ───────────────────────────────────────────────────
const NODES = [
  { x: 15, y: 25, size: 6, color: '#22d3ee', delay: 0 },
  { x: 75, y: 15, size: 4, color: '#a78bfa', delay: 0.5 },
  { x: 85, y: 65, size: 7, color: '#f59e0b', delay: 1 },
  { x: 20, y: 75, size: 5, color: '#ef4444', delay: 1.5 },
  { x: 50, y: 45, size: 8, color: '#22d3ee', delay: 0.3 },
  { x: 35, y: 55, size: 4, color: '#a78bfa', delay: 0.8 },
  { x: 65, y: 35, size: 5, color: '#10b981', delay: 1.2 },
]

const CONNECTIONS = [
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 5], [4, 6],
]

function FloatingGraph() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {CONNECTIONS.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={NODES[a].x} y1={NODES[a].y}
            x2={NODES[b].x} y2={NODES[b].y}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={0.3}
            strokeDasharray="1 2"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.5, delay: i * 0.2, ease: 'easeOut' }}
          />
        ))}
      </svg>
      {NODES.map((n, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${n.x}%`, top: `${n.y}%`,
            width: n.size, height: n.size,
            background: n.color,
            boxShadow: `0 0 ${n.size * 3}px ${n.color}60`,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.8, 0.4, 0.8],
            scale: [0, 1, 0.9, 1],
            y: [0, -6, 0, 6, 0],
          }}
          transition={{
            opacity: { duration: 2, delay: n.delay, repeat: Infinity, repeatType: 'mirror' },
            scale: { duration: 0.4, delay: n.delay },
            y: { duration: 4 + i, delay: n.delay, repeat: Infinity, ease: 'easeInOut' },
          }}
        />
      ))}
    </div>
  )
}

// ── Input field component ─────────────────────────────────────────────────────
function Input({
  label, type, value, onChange, placeholder, required, minLength,
  icon, rightEl, autoComplete,
}: {
  label: string; type: string; value: string
  onChange: (v: string) => void; placeholder: string
  required?: boolean; minLength?: number
  icon: React.ReactNode; rightEl?: React.ReactNode
  autoComplete?: string
}) {
  const [focused, setFocused] = useState(false)

  return (
    <div>
      <label className="text-[12px] font-medium text-slate-400 mb-1.5 block">{label}</label>
      <div
        className="relative rounded-xl transition-all duration-200"
        style={{
          background: focused ? 'rgba(34,211,238,0.04)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${focused ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.08)'}`,
          boxShadow: focused ? '0 0 0 3px rgba(34,211,238,0.06)' : 'none',
        }}
      >
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none">
          {icon}
        </div>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          className="w-full pl-9 py-3 text-[14px] text-slate-200 placeholder-slate-600 outline-none bg-transparent"
          style={{ paddingRight: rightEl ? '2.5rem' : '0.875rem' }}
        />
        {rightEl && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightEl}</div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode]         = useState<Mode>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)

  const pwStrength = passwordStrength(password)

  function switchMode(m: Mode) {
    setMode(m); setError(null); setSuccess(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null); setSuccess(null); setLoading(true)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/')
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name } },
        })
        if (error) throw error
        setSuccess('Check your email to confirm your account.')
        switchMode('login')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
        setSuccess('Reset link sent — check your inbox.')
        switchMode('login')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // Floating label text
  const btnLabel = mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'

  return (
    <div
      className="min-h-screen flex"
      style={{ background: '#080c14' }}
    >
      {/* ── Left panel — branding ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 relative overflow-hidden p-10"
        style={{
          background: 'linear-gradient(145deg, #0a1628 0%, #080c14 60%)',
          borderRight: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {/* Background effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse 70% 50% at 30% 40%, rgba(34,211,238,0.07) 0%, transparent 60%)',
          }} />
        </div>

        <FloatingGraph />

        {/* Logo */}
        <div className="relative flex items-center gap-2.5">
          <div className="relative">
            <Shield size={18} className="text-cyan-400" />
            <div className="absolute inset-0 animate-ping opacity-20">
              <Shield size={18} className="text-cyan-400" />
            </div>
          </div>
          <span className="text-[16px] font-bold">
            <span className="text-cyan-400">Guard</span>
            <span className="text-slate-100">Map</span>
          </span>
        </div>

        {/* Middle content */}
        <div className="relative space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-100 leading-tight mb-3" style={{ letterSpacing: '-0.02em' }}>
              See your entire<br />
              <span style={{
                background: 'linear-gradient(135deg, #22d3ee 0%, #a78bfa 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>attack surface</span>
            </h2>
            <p className="text-[14px] text-slate-500 leading-relaxed">
              Map every IAM permission, detect misconfigurations and understand blast radius — automatically.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { icon: <GitGraph size={14} />, color: '#22d3ee', text: 'Full IRSA chain visualization' },
              { icon: <ShieldAlert size={14} />, color: '#ef4444', text: '30+ K8s & IAM security checks' },
              { icon: <Zap size={14} />, color: '#f59e0b', text: 'Blast radius analysis per workload' },
              { icon: <Activity size={14} />, color: '#10b981', text: 'Auto-scan agent — one kubectl apply' },
            ].map(f => (
              <div key={f.text} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: f.color + '14', color: f.color, border: `1px solid ${f.color}20` }}>
                  {f.icon}
                </div>
                <span className="text-[13px] text-slate-400">{f.text}</span>
              </div>
            ))}
          </div>

          {/* Mini score card */}
          <div className="rounded-xl p-4 flex items-center gap-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="relative w-12 h-12 shrink-0">
              <svg viewBox="0 0 48 48" className="w-full h-full">
                <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                <motion.circle
                  cx="24" cy="24" r="18"
                  fill="none" stroke="#f59e0b" strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={113}
                  initial={{ strokeDashoffset: 113 }}
                  animate={{ strokeDashoffset: 113 - 113 * 0.62 }}
                  transition={{ duration: 1.5, ease: 'easeOut', delay: 0.5 }}
                  style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', filter: 'drop-shadow(0 0 4px #f59e0b60)' }}
                />
                <text x="24" y="28" textAnchor="middle" fill="#f59e0b" fontSize="11" fontWeight="700" fontFamily="monospace">62</text>
              </svg>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-slate-200">Example cluster scan</div>
              <div className="text-[12px] text-slate-500 mt-0.5">2 critical · 4 high · 6 medium</div>
              <div className="text-[11px] text-orange-400 mt-1">Needs attention</div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="relative text-[12px] text-slate-700">
          Free plan includes 3 clusters · No credit card required
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 60% 50% at 60% 40%, rgba(167,139,250,0.04) 0%, transparent 60%)' }} />

        {/* Back to home */}
        <button
          onClick={() => navigate('/')}
          className="absolute top-6 left-6 flex items-center gap-1.5 text-[12px] text-slate-600 hover:text-slate-300 transition-colors"
        >
          <ArrowLeft size={13} />
          Back to home
        </button>

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-8">
          <Shield size={18} className="text-cyan-400" />
          <span className="text-[16px] font-bold">
            <span className="text-cyan-400">Guard</span>
            <span className="text-slate-100">Map</span>
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-[380px]"
        >
          {/* Mode switcher (login / signup) */}
          <AnimatePresence mode="wait">
            {mode !== 'reset' && (
              <div className="mb-6">
                <div className="flex rounded-xl p-1 mb-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {(['login', 'signup'] as Mode[]).map(m => (
                    <button
                      key={m}
                      onClick={() => switchMode(m)}
                      className="relative flex-1 py-2 rounded-lg text-[13px] font-semibold transition-colors duration-200"
                      style={{ color: mode === m ? '#e2e8f0' : '#64748b' }}
                    >
                      {mode === m && (
                        <motion.div
                          layoutId="tab-bg"
                          className="absolute inset-0 rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        />
                      )}
                      <span className="relative z-10">{m === 'login' ? 'Sign in' : 'Sign up'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </AnimatePresence>

          {/* Card */}
          <div
            className="rounded-2xl p-7"
            style={{
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 8px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <AnimatePresence mode="wait">
              <motion.form
                key={mode}
                initial={{ opacity: 0, x: mode === 'reset' ? 0 : 10, y: mode === 'reset' ? 8 : 0 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: mode === 'reset' ? 0 : -10 }}
                transition={{ duration: 0.18 }}
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                {/* Form title */}
                <div className="mb-5">
                  <h1 className="text-[18px] font-bold text-slate-100">
                    {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset password'}
                  </h1>
                  <p className="text-[13px] text-slate-500 mt-1">
                    {mode === 'login'
                      ? 'Sign in to your GuardMap dashboard'
                      : mode === 'signup'
                      ? 'Start securing your Kubernetes clusters for free'
                      : 'Enter your email to receive a reset link'}
                  </p>
                </div>

                {/* Name — signup only */}
                {mode === 'signup' && (
                  <Input
                    label="Full name"
                    type="text"
                    value={name}
                    onChange={setName}
                    placeholder="Jane Smith"
                    required
                    autoComplete="name"
                    icon={<User size={14} />}
                  />
                )}

                {/* Email */}
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  icon={<Mail size={14} />}
                />

                {/* Password */}
                {mode !== 'reset' && (
                  <div className="space-y-1.5">
                    <Input
                      label="Password"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={setPassword}
                      placeholder="••••••••"
                      required
                      minLength={8}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      icon={<Lock size={14} />}
                      rightEl={
                        <button type="button" onClick={() => setShowPw(v => !v)}
                          className="text-slate-600 hover:text-slate-400 transition-colors">
                          {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      }
                    />

                    {/* Password strength bar — signup only */}
                    {mode === 'signup' && password.length > 0 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                        <div className="flex gap-1 mb-1">
                          {[1, 2, 3, 4].map(i => (
                            <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
                              style={{ background: i <= pwStrength.score ? pwStrength.color : 'rgba(255,255,255,0.08)' }} />
                          ))}
                        </div>
                        <div className="text-[11px]" style={{ color: pwStrength.color }}>{pwStrength.label}</div>
                      </motion.div>
                    )}

                    {/* Forgot password link */}
                    {mode === 'login' && (
                      <div className="flex justify-end">
                        <button type="button" onClick={() => switchMode('reset')}
                          className="text-[12px] text-slate-600 hover:text-cyan-400 transition-colors">
                          Forgot password?
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Error / success banners */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="flex items-start gap-2.5 p-3 rounded-xl text-[13px]"
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}
                    >
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      {error}
                    </motion.div>
                  )}
                  {success && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="flex items-start gap-2.5 p-3 rounded-xl text-[13px]"
                      style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#6ee7b7' }}
                    >
                      <Check size={14} className="shrink-0 mt-0.5" />
                      {success}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit button */}
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 rounded-xl text-[14px] font-semibold transition-all flex items-center justify-center gap-2 mt-2"
                  style={{
                    background: loading
                      ? 'rgba(34,211,238,0.05)'
                      : 'linear-gradient(135deg, rgba(34,211,238,0.18), rgba(167,139,250,0.18))',
                    border: `1px solid ${loading ? 'rgba(34,211,238,0.1)' : 'rgba(34,211,238,0.3)'}`,
                    color: loading ? '#475569' : '#e2e8f0',
                    boxShadow: loading ? 'none' : '0 0 20px rgba(34,211,238,0.1)',
                  }}
                >
                  {loading
                    ? <Loader2 size={14} className="animate-spin" />
                    : <ArrowRight size={14} />
                  }
                  {btnLabel}
                </motion.button>

                {/* Back to sign in (reset mode) */}
                {mode === 'reset' && (
                  <button type="button" onClick={() => switchMode('login')}
                    className="w-full text-center text-[13px] text-slate-600 hover:text-slate-300 transition-colors flex items-center justify-center gap-1.5">
                    <ArrowLeft size={12} />
                    Back to sign in
                  </button>
                )}
              </motion.form>
            </AnimatePresence>
          </div>

          {/* Footer note */}
          <p className="text-center text-[12px] text-slate-700 mt-5">
            {mode === 'signup'
              ? 'Free forever · 3 clusters · No credit card'
              : 'Kubernetes security visibility for your entire organization'}
          </p>
        </motion.div>
      </div>
    </div>
  )
}
