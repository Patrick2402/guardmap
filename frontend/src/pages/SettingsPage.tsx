import { useState, useEffect, useCallback, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, ChevronRight, ArrowLeft, Settings, Users, FileText,
  Building2, Mail, Trash2, RefreshCw, Loader2, AlertCircle,
  CheckCircle2, Copy, Check, Crown, Code2, Eye, UserPlus,
  Link, X, ShieldAlert, Save, Clock, TriangleAlert,
} from 'lucide-react'
import { supabase, db } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { GuardMapSymbol } from '../components/GuardMapLogo'
import { OrgSwitcher } from '../components/OrgSwitcher'
import type { Invitation, AuditLog, Organization } from '../lib/database.types'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'members' | 'invitations' | 'audit' | 'org'

interface OrgMemberDetail {
  user_id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  role: 'admin' | 'developer' | 'readonly'
  joined_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function initials(email: string, name?: string | null): string {
  if (name) return name.slice(0, 2).toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

const ROLE_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  admin:     { label: 'Admin',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: <Crown size={10} /> },
  developer: { label: 'Developer', color: '#22d3ee', bg: 'rgba(34,211,238,0.12)',  icon: <Code2 size={10} /> },
  readonly:  { label: 'Readonly',  color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',  icon: <Eye size={10} /> },
}

const ACTION_LABELS: Record<string, string> = {
  'cluster.created':      'Created cluster',
  'cluster.updated':      'Updated cluster',
  'cluster.deleted':      'Deleted cluster',
  'cluster.scanned':      'Scanned cluster',
  'member.invited':       'Invited member',
  'member.joined':        'Member joined',
  'member.role_changed':  'Changed member role',
  'member.removed':       'Removed member',
  'org.created':          'Created organization',
  'org.updated':          'Updated organization',
  'api_key.created':      'Created API key',
  'api_key.revoked':      'Revoked API key',
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="flex items-center gap-1 text-xs font-sans transition-colors px-2 py-1 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.04)', color: copied ? '#34d399' : '#64748b' }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── RoleBadge ─────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role] ?? ROLE_META.readonly
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-sans font-semibold"
      style={{ background: m.bg, color: m.color }}>
      {m.icon}
      {m.label}
    </span>
  )
}

// ── Members Tab ───────────────────────────────────────────────────────────────

function MembersTab({ orgId, isAdmin, currentUserId }: {
  orgId: string
  isAdmin: boolean
  currentUserId: string
}) {
  const [members, setMembers]     = useState<OrgMemberDetail[]>([])
  const [loading, setLoading]     = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole]   = useState<'admin' | 'developer' | 'readonly'>('developer')
  const [inviting, setInviting]   = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteLink, setInviteLink]   = useState<string | null>(null)
  const [changingRole, setChangingRole] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('get_org_members', { p_org_id: orgId })
    setMembers((data ?? []) as OrgMemberDetail[])
    setLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    setInviteError(null); setInviting(true)
    try {
      const { data, error } = await db.invitations()
        .insert({ organization_id: orgId, email: inviteEmail.trim(), role: inviteRole })
        .select('token').single()
      if (error) throw error
      setInviteLink(`${window.location.origin}/invite/${data.token}`)
      setInviteEmail('')
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setInviting(false)
    }
  }

  async function handleChangeRole(userId: string, newRole: 'admin' | 'developer' | 'readonly') {
    setChangingRole(userId)
    await db.members().update({ role: newRole }).eq('user_id', userId).eq('organization_id', orgId)
    await load()
    setChangingRole(null)
  }

  async function handleRemove(userId: string, email: string) {
    if (!confirm(`Remove ${email} from this organization?`)) return
    await db.members().delete().eq('user_id', userId).eq('organization_id', orgId)
    await load()
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-sans font-semibold text-slate-100">Team members</div>
          <div className="text-xs font-sans text-slate-500 mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</div>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowInvite(v => !v); setInviteLink(null); setInviteError(null) }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-sans font-semibold transition-all"
            style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: '#22d3ee' }}
          >
            <UserPlus size={13} />
            Invite member
          </button>
        )}
      </div>

      {/* Invite form */}
      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl p-5 space-y-4"
              style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.15)' }}>
              <div className="text-sm font-sans font-semibold text-cyan-300 flex items-center gap-2">
                <Mail size={13} />
                Send invitation
              </div>

              {inviteLink ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 p-3 rounded-xl"
                    style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-sans font-medium text-emerald-300">Invitation created</div>
                      <div className="text-xs font-sans text-emerald-600 mt-0.5">Share this link with the invitee:</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-xl font-mono text-xs text-slate-400 break-all"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <Link size={11} className="text-slate-600 shrink-0" />
                    <span className="flex-1 break-all">{inviteLink}</span>
                    <CopyButton text={inviteLink} />
                  </div>
                  <button
                    onClick={() => { setShowInvite(false); setInviteLink(null) }}
                    className="text-xs font-sans text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com" required
                    className="flex-1 px-3.5 py-2 rounded-xl text-sm font-sans text-slate-200 placeholder-slate-600 outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,212,255,0.35)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                  />
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as 'admin' | 'developer' | 'readonly')}
                    className="px-3.5 py-2 rounded-xl text-sm font-sans text-slate-200 outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <option value="admin">Admin</option>
                    <option value="developer">Developer</option>
                    <option value="readonly">Readonly</option>
                  </select>
                  <button
                    type="submit" disabled={inviting || !inviteEmail.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-sans font-semibold transition-all shrink-0"
                    style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)', color: '#22d3ee' }}
                  >
                    {inviting ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                    Send invite
                  </button>
                </form>
              )}

              {inviteError && (
                <div className="flex items-center gap-2 text-xs font-sans text-red-400">
                  <AlertCircle size={12} />
                  {inviteError}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Members list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="text-slate-700 animate-spin" /></div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          {members.map((m, i) => (
            <div key={m.user_id}
              className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.02]"
              style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : undefined }}
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-mono font-bold text-slate-400"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                {initials(m.email, m.display_name)}
              </div>

              {/* Name / email */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-sans font-medium text-slate-200 truncate">
                  {m.display_name ?? m.email}
                  {m.user_id === currentUserId && (
                    <span className="ml-2 text-[10px] font-sans text-slate-600">(you)</span>
                  )}
                </div>
                {m.display_name && (
                  <div className="text-xs font-sans text-slate-600 truncate">{m.email}</div>
                )}
              </div>

              {/* Role */}
              {isAdmin && m.user_id !== currentUserId ? (
                <select
                  value={m.role}
                  disabled={changingRole === m.user_id}
                  onChange={e => handleChangeRole(m.user_id, e.target.value as 'admin' | 'developer' | 'readonly')}
                  className="text-xs font-sans rounded-lg px-2 py-1 outline-none transition-colors"
                  style={{
                    background: ROLE_META[m.role]?.bg ?? 'rgba(255,255,255,0.05)',
                    color: ROLE_META[m.role]?.color ?? '#94a3b8',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <option value="admin">Admin</option>
                  <option value="developer">Developer</option>
                  <option value="readonly">Readonly</option>
                </select>
              ) : (
                <RoleBadge role={m.role} />
              )}

              {/* Joined */}
              <div className="text-xs font-sans text-slate-600 shrink-0 hidden sm:block">
                {formatDate(m.joined_at)}
              </div>

              {/* Remove */}
              {isAdmin && m.user_id !== currentUserId && (
                <button
                  onClick={() => handleRemove(m.user_id, m.email)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-700 hover:text-red-400 transition-colors shrink-0"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                  title="Remove from org"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Invitations Tab ───────────────────────────────────────────────────────────

function InvitationsTab({ orgId }: { orgId: string }) {
  const [invites, setInvites] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db.invitations()
      .select('*')
      .eq('organization_id', orgId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    setInvites((data ?? []) as Invitation[])
    setLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  async function handleCancel(id: string) {
    if (!confirm('Cancel this invitation?')) return
    await db.invitations().delete().eq('id', id).eq('organization_id', orgId)
    await load()
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-sans font-semibold text-slate-100">Pending invitations</div>
        <div className="text-xs font-sans text-slate-500 mt-0.5">Invitations expire after 7 days</div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="text-slate-700 animate-spin" /></div>
      ) : invites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 rounded-2xl gap-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.07)' }}>
          <Mail size={22} className="text-slate-700" />
          <div className="text-sm font-sans text-slate-600">No pending invitations</div>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          {invites.map((inv, i) => (
            <div key={inv.id}
              className="flex items-center gap-4 px-5 py-3.5"
              style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : undefined }}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(245,158,11,0.1)' }}>
                <Mail size={13} className="text-amber-400" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-sans text-slate-200 truncate">{inv.email}</div>
                <div className="text-xs font-sans text-slate-600 mt-0.5 flex items-center gap-2">
                  <Clock size={10} />
                  Expires {formatDate(inv.expires_at)}
                </div>
              </div>

              <RoleBadge role={inv.role} />

              <CopyButton text={`${window.location.origin}/invite/${inv.token}`} />

              <button
                onClick={() => handleCancel(inv.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-700 hover:text-red-400 transition-colors shrink-0"
                style={{ background: 'rgba(255,255,255,0.04)' }}
                title="Cancel invitation"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Audit Log Tab ─────────────────────────────────────────────────────────────

function AuditLogTab({ orgId }: { orgId: string }) {
  const [logs, setLogs]       = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const PAGE = 25

  const load = useCallback(async (reset = true) => {
    setLoading(true)
    const from = reset ? 0 : logs.length
    const { data } = await db.auditLogs()
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    const rows = (data ?? []) as AuditLog[]
    setLogs(prev => reset ? rows : [...prev, ...rows])
    setHasMore(rows.length === PAGE)
    setLoading(false)
  }, [orgId, logs.length])

  useEffect(() => { load(true) }, [orgId])

  const ACTION_COLOR: Record<string, string> = {
    'cluster.deleted': '#f87171',
    'member.removed': '#f87171',
    'api_key.revoked': '#fb923c',
    'cluster.scanned': '#34d399',
    'member.joined': '#34d399',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-sans font-semibold text-slate-100">Audit log</div>
          <div className="text-xs font-sans text-slate-500 mt-0.5">All admin actions in this organization</div>
        </div>
        <button onClick={() => load(true)} className="text-slate-600 hover:text-slate-400 transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      {loading && logs.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="text-slate-700 animate-spin" /></div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 rounded-2xl gap-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.07)' }}>
          <FileText size={22} className="text-slate-700" />
          <div className="text-sm font-sans text-slate-600">No audit events yet</div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            {logs.map((log, i) => (
              <div key={log.id}
                className="flex items-start gap-4 px-5 py-3 transition-colors hover:bg-white/[0.015]"
                style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : undefined }}
              >
                <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                  style={{ background: ACTION_COLOR[log.action] ?? '#475569' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-sans text-slate-300">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                    {log.resource_name && (
                      <span className="text-xs font-mono text-slate-500 truncate max-w-[200px]">
                        {log.resource_name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-sans text-slate-600 mt-0.5">
                    {log.actor_email ?? 'System'} · {timeAgo(log.created_at)}
                  </div>
                </div>
                <div className="text-xs font-sans text-slate-700 shrink-0 hidden sm:block">
                  {formatDate(log.created_at)}
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={() => load(false)}
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-sans text-slate-500 hover:text-slate-300 transition-colors flex items-center justify-center gap-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : null}
              Load more
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Organization Tab ──────────────────────────────────────────────────────────

function OrgTab({ orgId }: { orgId: string }) {
  const { activeOrg, setActiveOrg, orgs } = useAuth()
  const navigate = useNavigate()
  const [org, setOrg]           = useState<Organization | null>(null)
  const [loading, setLoading]   = useState(true)
  const [name, setName]         = useState('')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Delete org state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleteConfirmCheck, setDeleteConfirmCheck] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true); setDeleteError(null)
    const { error: err } = await supabase.rpc('soft_delete_organization', { p_org_id: orgId })
    if (err) { setDeleteError(err.message); setDeleting(false); return }
    // Hard reload — AuthContext will have no orgs → redirect to /onboarding
    window.location.href = '/overview'
  }

  useEffect(() => {
    db.orgs().select('*').eq('id', orgId).single()
      .then(({ data }) => {
        if (data) { setOrg(data as Organization); setName(data.name) }
        setLoading(false)
      })
  }, [orgId])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || name === org?.name) return
    setSaving(true); setError(null)
    const { error: err } = await db.orgs().update({ name: name.trim() }).eq('id', orgId)
    if (err) { setError(err.message); setSaving(false); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    // Reflect new name in org switcher
    const updated = orgs.map(o =>
      o.organization_id === orgId ? { ...o, organization_name: name.trim() } : o
    )
    const updatedActive = updated.find(o => o.organization_id === orgId)
    if (updatedActive) setActiveOrg(updatedActive)
    setSaving(false)
  }

  const PLAN_META: Record<string, { label: string; color: string; bg: string }> = {
    free:       { label: 'Free',       color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
    pro:        { label: 'Pro',        color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
    enterprise: { label: 'Enterprise', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="text-slate-700 animate-spin" /></div>
  if (!org) return null

  const plan = PLAN_META[org.plan] ?? PLAN_META.free

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <div className="text-base font-sans font-semibold text-slate-100">Organization settings</div>
        <div className="text-xs font-sans text-slate-500 mt-0.5">Manage your organization details and plan</div>
      </div>

      {/* Plan badge */}
      <div className="flex items-center gap-3 p-4 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: plan.bg }}>
          <Shield size={16} style={{ color: plan.color }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-sans font-semibold text-slate-200">{activeOrg?.organization_name}</span>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg"
              style={{ background: plan.bg, color: plan.color }}>
              {plan.label.toUpperCase()}
            </span>
          </div>
          <div className="text-xs font-sans text-slate-600 mt-0.5">
            {org.max_clusters} clusters · {org.max_members} members · slug: {org.slug}
          </div>
        </div>
      </div>

      {/* Edit name */}
      <form onSubmit={handleSave} className="space-y-3 p-5 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="text-sm font-sans font-semibold text-slate-300">Display name</div>
        <div className="flex gap-3">
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            maxLength={64} required
            className="flex-1 px-3.5 py-2.5 rounded-xl text-sm font-sans text-slate-200 placeholder-slate-600 outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,212,255,0.35)'}
            onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
          />
          <button
            type="submit"
            disabled={saving || !name.trim() || name === org.name}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-sans font-semibold transition-all shrink-0"
            style={{
              background: saved ? 'rgba(16,185,129,0.12)' : 'rgba(0,212,255,0.1)',
              border: `1px solid ${saved ? 'rgba(16,185,129,0.25)' : 'rgba(0,212,255,0.2)'}`,
              color: saved ? '#34d399' : '#22d3ee',
              opacity: (name === org.name || !name.trim()) ? 0.4 : 1,
            }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-xs font-sans text-red-400">
            <AlertCircle size={12} />{error}
          </div>
        )}
      </form>

      {/* Danger Zone */}
      <div className="space-y-3 p-5 rounded-2xl"
        style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}>
        <div className="flex items-center gap-2 text-sm font-sans font-semibold text-red-400">
          <TriangleAlert size={14} />
          Danger Zone
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-sans font-medium text-slate-300">Delete this organization</div>
            <div className="text-xs font-sans text-slate-600 mt-0.5">
              Permanently deletes all clusters, scan history, API keys, and members. This cannot be undone.
            </div>
          </div>
          <button
            onClick={() => { setShowDeleteModal(true); setDeleteConfirmName(''); setDeleteConfirmCheck(false); setDeleteError(null) }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-sans font-semibold shrink-0 transition-all"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
          >
            <Trash2 size={13} />
            Delete org
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
              onClick={() => !deleting && setShowDeleteModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="relative w-full max-w-md rounded-2xl p-6 space-y-5"
              style={{
                background: 'rgba(10,15,26,0.98)',
                backdropFilter: 'blur(32px)',
                border: '1px solid rgba(239,68,68,0.2)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <TriangleAlert size={18} className="text-red-400" />
                </div>
                <div>
                  <div className="text-base font-sans font-bold text-slate-100">Delete organization</div>
                  <div className="text-sm font-sans text-slate-500 mt-0.5">
                    This will permanently delete <span className="text-slate-300 font-medium">{org.name}</span> and all its data.
                  </div>
                </div>
                <button onClick={() => setShowDeleteModal(false)}
                  className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-300 shrink-0"
                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <X size={13} />
                </button>
              </div>

              {/* What gets deleted */}
              <div className="rounded-xl p-3.5 space-y-1.5"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                {['All clusters and scan history', 'All API keys (agents will stop working)', 'All team members and invitations', 'All audit logs'].map(item => (
                  <div key={item} className="flex items-center gap-2 text-xs font-sans text-red-400/80">
                    <X size={10} className="shrink-0" />
                    {item}
                  </div>
                ))}
              </div>

              {/* Type org name */}
              <div className="space-y-1.5">
                <label className="text-xs font-sans text-slate-400">
                  Type <span className="font-mono text-slate-200">{org.name}</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={e => setDeleteConfirmName(e.target.value)}
                  placeholder={org.name}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono text-slate-200 placeholder-slate-700 outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'}
                />
              </div>

              {/* Checkbox */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setDeleteConfirmCheck(v => !v)}
                  className="w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 transition-all"
                  style={{
                    background: deleteConfirmCheck ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${deleteConfirmCheck ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  }}
                >
                  {deleteConfirmCheck && <Check size={10} className="text-red-400" />}
                </div>
                <span className="text-xs font-sans text-slate-400 leading-relaxed">
                  I understand this action is <span className="text-slate-200 font-medium">permanent and irreversible</span>. All data will be lost.
                </span>
              </label>

              {deleteError && (
                <div className="flex items-center gap-2 p-3 rounded-xl text-xs font-sans text-red-400"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertCircle size={12} />{deleteError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl text-sm font-sans font-medium text-slate-400 hover:text-slate-200 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || deleteConfirmName !== org.name || !deleteConfirmCheck}
                  className="flex-1 py-2.5 rounded-xl text-sm font-sans font-semibold flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: (deleteConfirmName === org.name && deleteConfirmCheck) ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${(deleteConfirmName === org.name && deleteConfirmCheck) ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.06)'}`,
                    color: (deleteConfirmName === org.name && deleteConfirmCheck) ? '#f87171' : '#334155',
                  }}
                >
                  {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  {deleting ? 'Deleting…' : 'Delete organization'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main SettingsPage ─────────────────────────────────────────────────────────

export function SettingsPage() {
  const navigate = useNavigate()
  const { activeOrg, user } = useAuth()
  const [tab, setTab] = useState<Tab>('members')

  const orgId    = activeOrg?.organization_id ?? null
  const isAdmin  = activeOrg?.role === 'admin'
  const userId   = user?.id ?? ''

  if (!orgId) return null

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'radial-gradient(ellipse at 20% 50%, #0a1628 0%, #080c14 60%)' }}>
        <div className="text-center space-y-3">
          <ShieldAlert size={32} className="text-slate-700 mx-auto" />
          <div className="text-base font-sans font-semibold text-slate-400">Admin access required</div>
          <div className="text-sm font-sans text-slate-600">Only organization admins can access settings.</div>
          <button
            onClick={() => navigate('/overview')}
            className="mt-2 text-sm font-sans text-cyan-500 hover:text-cyan-400 transition-colors"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'members',     label: 'Members',      icon: <Users size={13} /> },
    { id: 'invitations', label: 'Invitations',   icon: <Mail size={13} /> },
    { id: 'audit',       label: 'Audit log',     icon: <FileText size={13} /> },
    { id: 'org',         label: 'Organization',  icon: <Building2 size={13} /> },
  ]

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 20% 50%, #0a1628 0%, #080c14 60%)' }}
    >
      {/* Topbar */}
      <header
        className="shrink-0 flex items-center px-5 gap-4 sticky top-0 z-20"
        style={{ height: 52, background: 'rgba(8,12,20,0.85)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <button onClick={() => navigate('/overview')}
          className="flex items-center gap-2.5 shrink-0 cursor-pointer select-none">
          <GuardMapSymbol size={18} />
          <div className="flex items-baseline">
            <span className="text-[14px] font-sans font-bold text-cyan-400">Guard</span>
            <span className="text-[14px] font-sans font-bold text-slate-100">Map</span>
          </div>
        </button>

        <div className="h-5 w-px bg-white/8 shrink-0" />
        <OrgSwitcher />
        <div className="h-5 w-px bg-white/8 shrink-0" />

        <div className="flex items-center gap-2 text-slate-600">
          <button onClick={() => navigate('/overview')} className="text-[12px] font-sans hover:text-slate-300 transition-colors">Dashboard</button>
          <ChevronRight size={11} />
          <span className="text-[12px] font-sans font-medium text-slate-300 flex items-center gap-1.5">
            <Settings size={11} className="text-violet-400" />
            Settings
          </span>
        </div>

        <div className="flex-1" />

        <button
          onClick={() => navigate('/overview')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-400 hover:text-slate-100 transition-all text-xs font-sans"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <ArrowLeft size={12} />
          Back to dashboard
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-6 py-8">
        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-xl font-sans font-bold text-slate-100">Organization settings</h1>
          <p className="text-sm font-sans text-slate-500 mt-1">
            Manage members, invitations, and configuration for <span className="text-slate-300">{activeOrg?.organization_name}</span>
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 p-1 rounded-2xl w-fit"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-sans font-medium transition-all"
              style={tab === t.id
                ? { background: 'rgba(255,255,255,0.08)', color: '#e2e8f0' }
                : { color: '#475569' }
              }
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {tab === 'members'     && <MembersTab orgId={orgId} isAdmin={isAdmin} currentUserId={userId} />}
            {tab === 'invitations' && <InvitationsTab orgId={orgId} />}
            {tab === 'audit'       && <AuditLogTab orgId={orgId} />}
            {tab === 'org'         && <OrgTab orgId={orgId} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
