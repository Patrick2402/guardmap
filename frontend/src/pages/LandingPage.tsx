import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useInView, useMotionValue, useSpring, AnimatePresence } from 'framer-motion'
import {
  Shield, ArrowRight, GitGraph, Network, ShieldAlert,
  Zap, Activity, Lock, Eye, ChevronRight, Terminal,
  Cloud, Check, AlertTriangle, AlertCircle, Info, Sparkles,
} from 'lucide-react'

// ── Animated hero graph ───────────────────────────────────────────────────────

const GRAPH_NODES = [
  { id: 'deploy',  x: 80,  y: 160, label: 'payments-api',  type: 'workload', color: '#22d3ee' },
  { id: 'pod',     x: 230, y: 100, label: 'pod',           type: 'pod',      color: '#64748b' },
  { id: 'pod2',    x: 230, y: 220, label: 'pod',           type: 'pod',      color: '#64748b' },
  { id: 'sa',      x: 380, y: 160, label: 'payment-sa',    type: 'sa',       color: '#a78bfa' },
  { id: 'role',    x: 530, y: 100, label: 'PaymentRole',   type: 'iam',      color: '#f59e0b' },
  { id: 'role2',   x: 530, y: 220, label: 'LoggingRole',   type: 'iam',      color: '#f59e0b' },
  { id: 'svc1',    x: 680, y:  60, label: 'DynamoDB',      type: 'aws',      color: '#ef4444', critical: true },
  { id: 'svc2',    x: 680, y: 160, label: 'S3',            type: 'aws',      color: '#f59e0b' },
  { id: 'svc3',    x: 680, y: 260, label: 'CloudWatch',    type: 'aws',      color: '#22c55e' },
]

const GRAPH_EDGES = [
  { from: 'deploy', to: 'pod',   label: 'manages' },
  { from: 'deploy', to: 'pod2',  label: 'manages' },
  { from: 'pod',    to: 'sa',    label: 'uses' },
  { from: 'pod2',   to: 'sa',    label: 'uses' },
  { from: 'sa',     to: 'role',  label: 'IRSA →', highlight: true },
  { from: 'sa',     to: 'role2', label: 'IRSA →', highlight: true },
  { from: 'role',   to: 'svc1',  label: 'dynamodb:*', critical: true },
  { from: 'role',   to: 'svc2',  label: 's3:GetObject' },
  { from: 'role2',  to: 'svc3',  label: 'logs:PutLogEvents' },
]

function nodeCenter(id: string) {
  const n = GRAPH_NODES.find(n => n.id === id)
  return n ? { x: n.x + 42, y: n.y + 18 } : { x: 0, y: 0 }
}

const NODE_ICONS: Record<string, React.ReactNode> = {
  workload: <Activity size={11} />,
  pod:      <div className="w-2 h-2 rounded-full bg-current" />,
  sa:       <Shield size={11} />,
  iam:      <Lock size={11} />,
  aws:      <Cloud size={11} />,
}

function HeroGraph() {
  const [pulse, setPulse] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setPulse(p => (p + 1) % GRAPH_EDGES.length), 600)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="relative w-full h-[320px] select-none pointer-events-none">
      <svg className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(100,116,139,0.5)" />
          </marker>
          <marker id="arrow-hi" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#a78bfa" />
          </marker>
          <marker id="arrow-crit" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#ef4444" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {GRAPH_EDGES.map((e, i) => {
          const from = nodeCenter(e.from)
          const to   = nodeCenter(e.to)
          const active = pulse === i
          const color = e.critical ? '#ef4444' : e.highlight ? '#a78bfa' : 'rgba(100,116,139,0.35)'
          const marker = e.critical ? 'url(#arrow-crit)' : e.highlight ? 'url(#arrow-hi)' : 'url(#arrow)'
          return (
            <g key={i}>
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={color} strokeWidth={active ? 1.5 : 1}
                strokeDasharray={e.highlight || e.critical ? undefined : '4 3'}
                markerEnd={marker}
                opacity={active ? 1 : 0.5}
                filter={active ? 'url(#glow)' : undefined}
                style={{ transition: 'all 0.3s' }}
              />
              {active && (
                <circle r={3} fill={color} filter="url(#glow)">
                  <animateMotion dur="0.6s" fill="freeze"
                    path={`M${from.x},${from.y} L${to.x},${to.y}`} />
                </circle>
              )}
            </g>
          )
        })}
      </svg>

      {GRAPH_NODES.map((n, i) => (
        <motion.div
          key={n.id}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.08, type: 'spring', damping: 20 }}
          className="absolute flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-sans font-medium"
          style={{
            left: n.x, top: n.y,
            color: n.color,
            background: n.critical
              ? 'rgba(239,68,68,0.12)'
              : 'rgba(15,23,42,0.85)',
            border: `1px solid ${n.critical ? 'rgba(239,68,68,0.4)' : n.color + '30'}`,
            boxShadow: n.critical ? '0 0 12px rgba(239,68,68,0.2)' : undefined,
            backdropFilter: 'blur(8px)',
          }}
        >
          {NODE_ICONS[n.type]}
          <span>{n.label}</span>
          {n.critical && (
            <span className="text-[9px] font-bold bg-red-500/20 text-red-400 px-1 py-0.5 rounded-md border border-red-500/30">
              CRITICAL
            </span>
          )}
        </motion.div>
      ))}
    </div>
  )
}

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = size * 0.38
  const circ = 2 * Math.PI * r
  const color = score >= 90 ? '#1d8348' : score >= 70 ? '#f5d40f' : score >= 50 ? '#ff9900' : score >= 30 ? '#ff7043' : '#d13212'
  const dash  = (score / 100) * circ

  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
      <motion.circle
        cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', filter: `drop-shadow(0 0 6px ${color}60)` }}
      />
      <text x={size/2} y={size/2 + 5} textAnchor="middle" fill={color} fontSize={size * 0.22} fontWeight="700" fontFamily="monospace">
        {score}
      </text>
    </svg>
  )
}

// ── Counter animation ─────────────────────────────────────────────────────────
function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { damping: 30, stiffness: 100 })

  useEffect(() => { if (inView) mv.set(to) }, [inView, to, mv])

  const [display, setDisplay] = useState(0)
  useEffect(() => spring.on('change', v => setDisplay(Math.round(v))), [spring])

  return <span ref={ref}>{display.toLocaleString()}{suffix}</span>
}

// ── Section wrapper with fade-in ──────────────────────────────────────────────
function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ── Mock findings list ────────────────────────────────────────────────────────
const MOCK_FINDINGS = [
  { sev: 'critical', icon: <AlertCircle size={12} />, color: '#d13212', bg: 'rgba(209,50,18,0.1)', border: 'rgba(209,50,18,0.25)', type: 'privileged_container', resource: 'kube-proxy/kube-proxy', desc: 'Container runs in privileged mode — full host access' },
  { sev: 'critical', icon: <AlertCircle size={12} />, color: '#d13212', bg: 'rgba(209,50,18,0.1)', border: 'rgba(209,50,18,0.25)', type: 'iam_wildcard_access', resource: 'role:arn:aws:iam::123456789:role/PaymentRole', desc: 'IAM role grants full/wildcard access to DynamoDB' },
  { sev: 'high',     icon: <AlertTriangle size={12} />, color: '#ff7043', bg: 'rgba(255,112,67,0.08)', border: 'rgba(255,112,67,0.2)', type: 'privilege_escalation_allowed', resource: 'payments/payments-api-xxx', desc: 'allowPrivilegeEscalation not set to false' },
  { sev: 'high',     icon: <AlertTriangle size={12} />, color: '#ff7043', bg: 'rgba(255,112,67,0.08)', border: 'rgba(255,112,67,0.2)', type: 'runs_as_root', resource: 'default/nginx-deployment-yyy', desc: 'Container may run as root (UID 0)' },
  { sev: 'medium',   icon: <Info size={12} />, color: '#ff9900', bg: 'rgba(255,153,0,0.08)', border: 'rgba(255,153,0,0.2)', type: 'no_network_policy', resource: 'namespace: production', desc: 'Namespace has no NetworkPolicy' },
  { sev: 'medium',   icon: <Info size={12} />, color: '#ff9900', bg: 'rgba(255,153,0,0.08)', border: 'rgba(255,153,0,0.2)', type: 'unpinned_image', resource: 'api-gateway/gateway:latest', desc: 'Image uses :latest tag — supply-chain risk' },
]

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: <GitGraph size={18} />, color: '#22d3ee', title: 'IRSA Graph',
    desc: 'Visualize the full chain: Deployment → Pod → ServiceAccount → IAM Role → AWS Resource. See exactly who can touch what.',
  },
  {
    icon: <Network size={18} />, color: '#a78bfa', title: 'K8s Topology',
    desc: 'Map Services, Ingresses and NetworkPolicies. Understand your blast radius before attackers do.',
  },
  {
    icon: <ShieldAlert size={18} />, color: '#d13212', title: 'Security Findings',
    desc: '40+ checks: privileged containers, wildcard IAM, missing network policies, unpinned images, host namespace access and more.',
  },
  {
    icon: <Zap size={18} />, color: '#f59e0b', title: 'Blast Radius',
    desc: 'Click any workload to instantly trace all AWS resources reachable through its identity. Full + write + read paths.',
  },
  {
    icon: <Activity size={18} />, color: '#10b981', title: 'Auto-Scan Agent',
    desc: 'One kubectl apply deploys the CronJob agent. Scans every 6 hours, pushes results to your dashboard automatically.',
  },
  {
    icon: <Eye size={18} />, color: '#38bdf8', title: 'RBAC Explorer',
    desc: 'Deep-dive into Roles and ClusterRoles. Find over-permissioned bindings before they become incidents.',
  },
]

// ── Terminal install demo ─────────────────────────────────────────────────────
const TERMINAL_SCRIPT = [
  { delay: 0,    prompt: true,  text: 'kubectl apply -f https://guardmap.io/install.yaml',  color: '#22d3ee' },
  { delay: 900,  prompt: false, text: 'namespace/guardmap created',                          color: '#64748b' },
  { delay: 1200, prompt: false, text: 'serviceaccount/guardmap-agent created',               color: '#64748b' },
  { delay: 1500, prompt: false, text: 'clusterrole.rbac.authorization.k8s.io/guardmap created', color: '#64748b' },
  { delay: 1800, prompt: false, text: 'clusterrolebinding.rbac.authorization.k8s.io/guardmap created', color: '#64748b' },
  { delay: 2100, prompt: false, text: 'cronjob.batch/guardmap-scanner created',              color: '#64748b' },
  { delay: 2400, prompt: false, text: 'cronjob.batch/guardmap-heartbeat created',            color: '#64748b' },
  { delay: 2900, prompt: true,  text: '# First scan starts automatically…',                  color: '#475569' },
  { delay: 3400, prompt: false, text: '✓  Discovered 47 workloads, 23 service accounts',    color: '#10b981' },
  { delay: 3800, prompt: false, text: '✓  Resolved 18 IAM roles, 142 policy statements',    color: '#10b981' },
  { delay: 4200, prompt: false, text: '⚠  3 critical findings — open dashboard to review',  color: '#f59e0b' },
]

function TerminalBlock() {
  const [visible, setVisible] = useState<number[]>([])
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })

  useEffect(() => {
    if (!inView) return
    TERMINAL_SCRIPT.forEach(({ delay }, i) => {
      setTimeout(() => setVisible(v => [...v, i]), delay)
    })
  }, [inView])

  const done = visible.length >= TERMINAL_SCRIPT.length

  return (
    <div
      ref={ref}
      className="rounded-2xl overflow-hidden font-mono text-[12px] leading-relaxed"
      style={{ background: '#060a12', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* chrome */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5"
        style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
        </div>
        <span className="text-slate-600 text-[11px] ml-1">bash — guardmap setup</span>
      </div>
      {/* body */}
      <div className="p-5 space-y-1.5 min-h-[200px]">
        {TERMINAL_SCRIPT.map((line, i) => (
          <AnimatePresence key={i}>
            {visible.includes(i) && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-start gap-2"
              >
                {line.prompt && (
                  <span className="text-cyan-600 shrink-0 select-none">$</span>
                )}
                {!line.prompt && (
                  <span className="text-slate-700 shrink-0 select-none w-3" />
                )}
                <span style={{ color: line.color }}>{line.text}</span>
              </motion.div>
            )}
          </AnimatePresence>
        ))}
        {!done && visible.length > 0 && (
          <span className="inline-block w-2 h-3.5 rounded-sm bg-cyan-500/60 animate-pulse ml-5" />
        )}
      </div>
    </div>
  )
}

// ── Pricing ───────────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    sub: '1 cluster included',
    color: '#22d3ee',
    border: 'rgba(34,211,238,0.2)',
    bg: 'rgba(34,211,238,0.04)',
    features: [
      '1 cluster',
      'Unlimited scans',
      '40+ security checks',
      '7-day scan history',
      'IRSA graph & topology',
      'Blast radius analysis',
      'Up to 3 team members',
    ],
    cta: 'Get started free',
    ctaSecondary: false,
    popular: false,
  },
  {
    name: 'Teams',
    price: '$79',
    period: 'per month',
    sub: 'Up to 5 clusters',
    color: '#a78bfa',
    border: 'rgba(167,139,250,0.3)',
    bg: 'rgba(167,139,250,0.06)',
    features: [
      'Up to 5 clusters',
      'Unlimited scans',
      '1-year scan history',
      'Unlimited team members',
      'Slack & webhook alerts',
      'Custom scan intervals',
      'REST API access',
      'Priority support',
    ],
    cta: 'Start 14-day trial',
    ctaSecondary: false,
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    sub: 'Unlimited clusters',
    color: '#f59e0b',
    border: 'rgba(245,158,11,0.2)',
    bg: 'rgba(245,158,11,0.04)',
    features: [
      'Unlimited clusters',
      'Dedicated scan infrastructure',
      'SSO / SAML integration',
      'Compliance exports (SOC2, CIS)',
      'Custom retention policy',
      'SLA guarantee',
      'Dedicated Slack channel',
      'On-prem / private cloud option',
    ],
    cta: 'Contact sales',
    ctaSecondary: true,
    popular: false,
  },
]

// ── Main landing page ─────────────────────────────────────────────────────────
export function LandingPage() {
  const navigate = useNavigate()
  const [findingIndex, setFindingIndex] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setFindingIndex(i => (i + 1) % MOCK_FINDINGS.length), 2200)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      className="min-h-screen text-slate-100 overflow-x-hidden"
      style={{ background: '#080c14', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
    >
      {/* ── Background grid ── */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 60% at 20% 10%, rgba(34,211,238,0.05) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(167,139,250,0.05) 0%, transparent 60%)',
      }} />

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 h-14"
        style={{ background: 'rgba(8,12,20,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Shield size={16} className="text-cyan-400" />
            <div className="absolute inset-0 animate-ping opacity-20"><Shield size={16} className="text-cyan-400" /></div>
          </div>
          <span className="text-[14px] font-bold">
            <span className="text-cyan-400">Guard</span>
            <span className="text-slate-100">Map</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-6 text-[13px] text-slate-500">
          {[
            { label: 'Features',         href: '#features' },
            { label: 'How it works',     href: '#how-it-works' },
            { label: 'Security checks',  href: '#security-checks' },
            { label: 'Pricing',          href: '#pricing' },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="hover:text-slate-200 transition-colors cursor-pointer">{label}</a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/login')}
            className="text-[13px] text-slate-400 hover:text-slate-200 transition-colors px-3 py-1.5">
            Sign in
          </button>
          <button onClick={() => navigate('/login')}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all hover:opacity-90"
            style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.25)', color: '#22d3ee' }}>
            Get started free
            <ArrowRight size={13} />
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative px-8 pt-20 pb-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold mb-6"
              style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.18)', color: '#22d3ee' }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Real-time Kubernetes security visibility
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-5xl font-bold leading-tight mb-6"
              style={{ letterSpacing: '-0.02em' }}
            >
              <span>Map every </span>
              <span style={{
                background: 'linear-gradient(135deg, #22d3ee 0%, #a78bfa 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>IAM permission</span>
              <br />
              <span>in your </span>
              <span style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>Kubernetes cluster</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-[16px] text-slate-400 leading-relaxed mb-8 max-w-lg"
            >
              GuardMap automatically discovers the full IRSA chain — Deployment → ServiceAccount → IAM Role → AWS Resource — and surfaces misconfigurations before attackers do.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex items-center gap-3 flex-wrap"
            >
              <button
                onClick={() => navigate('/login')}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-bold transition-all hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(167,139,250,0.2) 100%)',
                  border: '1px solid rgba(34,211,238,0.35)',
                  color: '#22d3ee',
                  boxShadow: '0 0 24px rgba(34,211,238,0.15)',
                }}
              >
                Start for free
                <ArrowRight size={15} />
              </button>
              <button
                onClick={() => navigate('/overview')}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold text-slate-400 hover:text-slate-200 transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <Eye size={14} />
                Live demo
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex items-center gap-4 mt-8 flex-wrap"
            >
              {['No credit card', 'Free forever plan', 'Deploy in 2 min'].map(t => (
                <div key={t} className="flex items-center gap-1.5 text-[12px] text-slate-600">
                  <Check size={11} className="text-emerald-500" />
                  {t}
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — animated graph */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(10,15,26,0.7)',
              border: '1px solid rgba(255,255,255,0.07)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 0 60px rgba(34,211,238,0.06), 0 32px 64px rgba(0,0,0,0.5)',
            }}
          >
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
              <span className="text-[11px] font-mono text-slate-600 ml-2">IRSA Graph — payments cluster</span>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-500">LIVE</span>
              </div>
            </div>
            <div className="p-4">
              <HeroGraph />
            </div>
            {/* Bottom bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/5"
              style={{ background: 'rgba(0,0,0,0.2)' }}>
              <div className="flex items-center gap-4">
                <span className="text-[11px] font-mono text-slate-600">9 nodes · 9 edges</span>
                <span className="text-[10px] font-mono text-red-400 flex items-center gap-1">
                  <AlertCircle size={9} /> 1 critical finding
                </span>
              </div>
              <ScoreRing score={62} size={40} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Works with ── */}
      <FadeIn>
        <section className="py-6 px-8 max-w-7xl mx-auto">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <span className="text-[11px] text-slate-700 uppercase tracking-widest mr-2">Works with</span>
            {[
              { label: 'Amazon EKS',   color: '#f59e0b' },
              { label: 'AWS IAM',      color: '#f59e0b' },
              { label: 'Kubernetes',   color: '#22d3ee' },
              { label: 'kubectl',      color: '#a78bfa' },
              { label: 'Helm',         color: '#10b981' },
              { label: 'Terraform',    color: '#a78bfa' },
            ].map(({ label, color }) => (
              <span key={label}
                className="text-[11px] font-semibold px-3 py-1 rounded-full"
                style={{ color, background: color + '12', border: `1px solid ${color}20` }}>
                {label}
              </span>
            ))}
          </div>
        </section>
      </FadeIn>

      {/* ── Stats ── */}
      <FadeIn>
        <section className="py-10 px-8 max-w-7xl mx-auto">
          <div className="rounded-2xl px-8 py-6 grid grid-cols-2 md:grid-cols-4 gap-6"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            {[
              { n: 3200,  s: '+', label: 'Vulnerabilities detected',  color: '#ef4444' },
              { n: 180,   s: '+', label: 'Clusters scanned',          color: '#22d3ee' },
              { n: 30,    s: '+', label: 'Security checks',           color: '#a78bfa' },
              { n: 99,    s: '%', label: 'Detection accuracy',        color: '#10b981' },
            ].map(({ n, s, label, color }) => (
              <div key={label} className="text-center">
                <div className="text-3xl font-bold font-mono mb-1" style={{ color }}>
                  <Counter to={n} suffix={s} />
                </div>
                <div className="text-[12px] text-slate-500">{label}</div>
              </div>
            ))}
          </div>
        </section>
      </FadeIn>

      {/* ── Features ── */}
      <section id="features" className="py-16 px-8 max-w-7xl mx-auto">
        <FadeIn className="text-center mb-12">
          <div className="text-[11px] font-semibold text-cyan-400 uppercase tracking-widest mb-3">Features</div>
          <h2 className="text-3xl font-bold mb-4" style={{ letterSpacing: '-0.02em' }}>
            Everything you need to secure your Kubernetes clusters
          </h2>
          <p className="text-slate-500 text-[15px] max-w-xl mx-auto">
            From IRSA chain visualization to real-time blast radius analysis — all in one dashboard.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <FadeIn key={f.title} delay={i * 0.07}>
              <div
                className="group rounded-2xl p-5 h-full transition-all duration-300 cursor-default"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = `${f.color}08`
                  ;(e.currentTarget as HTMLElement).style.borderColor = f.color + '30'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.05)'
                }}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: f.color + '14', color: f.color, border: `1px solid ${f.color}25` }}>
                  {f.icon}
                </div>
                <div className="text-[14px] font-semibold text-slate-100 mb-2">{f.title}</div>
                <div className="text-[13px] text-slate-500 leading-relaxed">{f.desc}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-16 px-8 max-w-7xl mx-auto">
        <FadeIn className="text-center mb-12">
          <div className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-3">How it works</div>
          <h2 className="text-3xl font-bold" style={{ letterSpacing: '-0.02em' }}>
            Up and running in under 2 minutes
          </h2>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          {[
            { n: '01', icon: <Shield size={16} />, color: '#22d3ee', title: 'Create account', desc: 'Sign up free, create your organization. No credit card needed.' },
            { n: '02', icon: <Terminal size={16} />, color: '#a78bfa', title: 'kubectl apply', desc: 'One command deploys the GuardMap agent into a guardmap namespace.' },
            { n: '03', icon: <Activity size={16} />, color: '#f59e0b', title: 'Auto-scan', desc: 'Agent runs every 6h, discovers all IRSA, RBAC and network config.' },
            { n: '04', icon: <Eye size={16} />, color: '#10b981', title: 'See results', desc: 'Interactive graph, security score and findings appear instantly.' },
          ].map((step, i) => (
            <FadeIn key={step.n} delay={i * 0.1}>
              <div className="relative rounded-2xl p-5"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-4xl font-mono font-bold mb-4 leading-none"
                  style={{ color: step.color + '25' }}>{step.n}</div>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: step.color + '12', color: step.color }}>
                  {step.icon}
                </div>
                <div className="text-[14px] font-semibold text-slate-100 mb-1.5">{step.title}</div>
                <div className="text-[13px] text-slate-500 leading-relaxed">{step.desc}</div>
                {i < 3 && (
                  <div className="hidden md:block absolute top-8 -right-3 z-10">
                    <ChevronRight size={16} className="text-slate-700" />
                  </div>
                )}
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Terminal demo */}
        <FadeIn delay={0.2}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-3">One command install</div>
              <h3 className="text-2xl font-bold mb-3" style={{ letterSpacing: '-0.015em' }}>
                No Helm charts.<br />
                <span style={{ background: 'linear-gradient(135deg, #a78bfa, #22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  No complex config.
                </span>
              </h3>
              <p className="text-slate-500 text-[14px] leading-relaxed mb-5">
                A single <code className="text-violet-400 bg-violet-400/10 px-1.5 py-0.5 rounded-md text-[13px]">kubectl apply</code> deploys the agent as a CronJob. It uses your cluster's IRSA identity to authenticate — no API keys to manage.
              </p>
              <div className="space-y-2.5">
                {[
                  { t: 'Least-privilege RBAC', d: 'Read-only ClusterRole, no write permissions.' },
                  { t: 'Air-gapped compatible', d: 'Agent pushes to GuardMap API, never pulls from internet.' },
                  { t: 'Configurable interval', d: 'Default 6h, override with a single env var.' },
                ].map(({ t, d }) => (
                  <div key={t} className="flex items-start gap-2.5">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)' }}>
                      <Check size={9} className="text-violet-400" />
                    </div>
                    <div>
                      <span className="text-[13px] font-semibold text-slate-200">{t} </span>
                      <span className="text-[13px] text-slate-600">{d}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <TerminalBlock />
          </div>
        </FadeIn>
      </section>

      {/* ── Security checks ── */}
      <section id="security-checks" className="py-16 px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <FadeIn>
            <div className="text-[11px] font-semibold text-red-400 uppercase tracking-widest mb-3">Security checks</div>
            <h2 className="text-3xl font-bold mb-4" style={{ letterSpacing: '-0.02em' }}>
              40+ checks across<br />
              <span style={{ background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                K8s, RBAC and IAM
              </span>
            </h2>
            <p className="text-slate-500 text-[14px] leading-relaxed mb-6">
              Every scan runs a comprehensive audit — from privileged containers and missing network policies to wildcard IAM roles and unpinned images.
            </p>

            <div className="space-y-2">
              {[
                { label: 'Privileged containers', sev: 'critical', color: '#d13212' },
                { label: 'IAM wildcard access', sev: 'critical', color: '#d13212' },
                { label: 'hostPID / hostNetwork', sev: 'critical', color: '#d13212' },
                { label: 'Privilege escalation allowed', sev: 'high', color: '#ff7043' },
                { label: 'Containers running as root', sev: 'high', color: '#ff7043' },
                { label: 'Missing NetworkPolicy', sev: 'medium', color: '#ff9900' },
                { label: 'Unpinned :latest images', sev: 'medium', color: '#ff9900' },
                { label: 'No resource limits', sev: 'medium', color: '#ff9900' },
              ].map(({ label, sev, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-[13px] text-slate-300 flex-1">{label}</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg"
                    style={{ color, background: color + '15', border: `1px solid ${color}25` }}>
                    {sev}
                  </span>
                </div>
              ))}
            </div>
          </FadeIn>

          {/* Live findings panel */}
          <FadeIn delay={0.15}>
            <div className="rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(10,15,26,0.7)',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 0 40px rgba(0,0,0,0.4)',
              }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-[12px] font-mono text-slate-400 flex items-center gap-2">
                  <ShieldAlert size={12} className="text-red-400" />
                  Live findings — production
                </span>
                <div className="flex items-center gap-3">
                  {[
                    { label: '2 critical', color: '#d13212' },
                    { label: '4 high', color: '#ff7043' },
                    { label: '2 medium', color: '#ff9900' },
                  ].map(b => (
                    <span key={b.label} className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg"
                      style={{ color: b.color, background: b.color + '15' }}>
                      {b.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3 space-y-2">
                {MOCK_FINDINGS.map((f, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0.4 }}
                    animate={{ opacity: findingIndex === i ? 1 : 0.4 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-start gap-3 p-3 rounded-xl transition-all"
                    style={{
                      background: findingIndex === i ? f.bg : 'transparent',
                      border: `1px solid ${findingIndex === i ? f.border : 'transparent'}`,
                    }}
                  >
                    <div className="mt-0.5 shrink-0" style={{ color: f.color }}>{f.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold uppercase" style={{ color: f.color }}>{f.sev}</span>
                        <span className="text-[10px] font-mono text-slate-600">{f.type}</span>
                      </div>
                      <div className="text-[12px] text-slate-300 truncate">{f.desc}</div>
                      <div className="text-[11px] font-mono text-slate-600 truncate mt-0.5">{f.resource}</div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/5"
                style={{ background: 'rgba(0,0,0,0.2)' }}>
                <span className="text-[11px] font-mono text-slate-600">Scanned 44ms ago · 170 nodes</span>
                <div className="flex items-center gap-1.5">
                  <ScoreRing score={34} size={36} />
                  <span className="text-[10px] font-mono text-red-400">needs attention</span>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-16 px-8 max-w-7xl mx-auto">
        <FadeIn className="text-center mb-12">
          <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-widest mb-3">Pricing</div>
          <h2 className="text-3xl font-bold mb-4" style={{ letterSpacing: '-0.02em' }}>
            Simple, transparent pricing
          </h2>
          <p className="text-slate-500 text-[15px] max-w-md mx-auto">
            Start free. Upgrade when your team needs more clusters or advanced features.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {PLANS.map((plan, i) => (
            <FadeIn key={plan.name} delay={i * 0.1}>
              <div
                className="relative rounded-2xl p-6 flex flex-col h-full"
                style={{
                  background: plan.bg,
                  border: `1px solid ${plan.border}`,
                  boxShadow: plan.popular ? `0 0 40px ${plan.color}12` : undefined,
                }}
              >
                {plan.popular && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap"
                    style={{ background: plan.color, color: '#0a0f1a' }}
                  >
                    <Sparkles size={10} />
                    Most popular
                  </div>
                )}

                <div className="mb-5">
                  <div className="text-[13px] font-semibold mb-1" style={{ color: plan.color }}>{plan.name}</div>
                  <div className="flex items-end gap-1.5 mb-1">
                    <span className="text-3xl font-bold text-slate-100">{plan.price}</span>
                    {plan.period && (
                      <span className="text-[13px] text-slate-500 mb-0.5">/ {plan.period}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600">{plan.sub}</div>
                </div>

                <div className="space-y-2 flex-1 mb-6">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-center gap-2.5">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: plan.color + '15', border: `1px solid ${plan.color}30` }}>
                        <Check size={9} style={{ color: plan.color }} />
                      </div>
                      <span className="text-[13px] text-slate-300">{f}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => navigate('/login')}
                  className="w-full py-2.5 rounded-xl text-[13px] font-bold transition-all hover:opacity-90"
                  style={plan.ctaSecondary ? {
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${plan.border}`,
                    color: plan.color,
                  } : {
                    background: plan.popular
                      ? `linear-gradient(135deg, ${plan.color}30, ${plan.color}18)`
                      : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${plan.border}`,
                    color: plan.popular ? plan.color : '#94a3b8',
                    boxShadow: plan.popular ? `0 0 20px ${plan.color}15` : undefined,
                  }}
                >
                  {plan.cta}
                </button>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.2}>
          <p className="text-center text-[12px] text-slate-700 mt-8">
            All plans include SSO, audit log, and 99.9% uptime SLA.
            Need more? <button onClick={() => navigate('/login')} className="text-cyan-600 hover:text-cyan-400 transition-colors">Contact us.</button>
          </p>
        </FadeIn>
      </section>

      {/* ── CTA ── */}
      <FadeIn>
        <section className="py-20 px-8 max-w-7xl mx-auto">
          <div className="relative rounded-3xl overflow-hidden p-12 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(34,211,238,0.07) 0%, rgba(167,139,250,0.07) 50%, rgba(245,158,11,0.05) 100%)',
              border: '1px solid rgba(34,211,238,0.15)',
            }}>
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(34,211,238,0.06) 0%, transparent 70%)' }} />

            <div className="relative">
              <div className="text-[11px] font-semibold text-cyan-400 uppercase tracking-widest mb-4">Get started today</div>
              <h2 className="text-4xl font-bold mb-4" style={{ letterSpacing: '-0.02em' }}>
                See your cluster's attack surface<br />
                <span style={{ background: 'linear-gradient(135deg, #22d3ee, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  in under 2 minutes
                </span>
              </h2>
              <p className="text-slate-400 text-[15px] mb-8 max-w-lg mx-auto">
                Free plan includes 3 clusters, unlimited scans and all security checks. No credit card required.
              </p>

              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button
                  onClick={() => navigate('/login')}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-[15px] font-bold transition-all hover:opacity-90"
                  style={{
                    background: 'linear-gradient(135deg, rgba(34,211,238,0.25), rgba(167,139,250,0.25))',
                    border: '1px solid rgba(34,211,238,0.4)',
                    color: '#22d3ee',
                    boxShadow: '0 0 32px rgba(34,211,238,0.2)',
                  }}
                >
                  Create free account
                  <ArrowRight size={16} />
                </button>
                <button
                  onClick={() => navigate('/overview')}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-[15px] font-semibold text-slate-400 hover:text-slate-200 transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Try live demo
                </button>
              </div>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-10 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield size={14} className="text-cyan-400" />
                <span className="text-[14px] font-bold">
                  <span className="text-cyan-400">Guard</span>Map
                </span>
              </div>
              <p className="text-[12px] text-slate-600 max-w-[200px] leading-relaxed">
                IRSA security visualization for Kubernetes engineers.
              </p>
            </div>

            {/* Links */}
            <div className="flex gap-12">
              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">Product</div>
                <div className="space-y-2">
                  {['Features', 'Pricing', 'Live demo', 'Changelog'].map(l => (
                    <div key={l}>
                      <a href="#" className="text-[13px] text-slate-600 hover:text-slate-300 transition-colors">{l}</a>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">Company</div>
                <div className="space-y-2">
                  {['About', 'Blog', 'Security', 'Contact'].map(l => (
                    <div key={l}>
                      <a href="#" className="text-[13px] text-slate-600 hover:text-slate-300 transition-colors">{l}</a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="text-[12px] text-slate-700">
              © 2025 GuardMap. Built for Kubernetes security engineers.
            </div>
            <div className="flex items-center gap-4">
              {['Privacy', 'Terms', 'Security'].map(l => (
                <a key={l} href="#" className="text-[12px] text-slate-700 hover:text-slate-400 transition-colors">{l}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
