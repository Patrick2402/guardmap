import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Building2, ChevronDown, Activity, Plus, LogOut, Settings } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export function OrgSwitcher() {
  const { orgs, activeOrg, setActiveOrg, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all shrink-0"
        style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)' }}
      >
        <Building2 size={12} className="text-violet-400" />
        <span className="text-[13px] font-sans font-medium text-slate-300 max-w-[120px] truncate">
          {activeOrg?.organization_name ?? 'No org'}
        </span>
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-lg bg-violet-900/40 text-violet-400 border border-violet-500/30">
          {activeOrg?.role?.toUpperCase() ?? '—'}
        </span>
        <ChevronDown size={11} className="text-slate-600" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-full mt-2 z-40 min-w-[220px] rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(10,15,26,0.97)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
            >
              <div className="px-3 py-2 border-b border-white/5">
                <div className="text-[10px] font-sans font-semibold text-slate-600 uppercase tracking-wider">Organizations</div>
              </div>

              {orgs.map(org => (
                <button
                  key={org.organization_id}
                  onClick={() => { setActiveOrg(org); setOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/5 text-left"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(124,58,237,0.15)' }}>
                    <Building2 size={12} className="text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-sans font-medium text-slate-200 truncate">{org.organization_name}</div>
                    <div className="text-xs font-mono text-slate-600">{org.role}</div>
                  </div>
                  {org.organization_id === activeOrg?.organization_id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                  )}
                </button>
              ))}

              <div className="border-t border-white/5">
                <button
                  onClick={() => { navigate('/settings'); setOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/5 text-left"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(124,58,237,0.1)' }}>
                    <Settings size={12} className="text-violet-400" />
                  </div>
                  <span className="text-sm font-sans text-slate-400">Settings</span>
                </button>
                <button
                  onClick={() => { navigate('/integrations'); setOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/5 text-left"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(0,212,255,0.08)' }}>
                    <Activity size={12} className="text-cyan-500" />
                  </div>
                  <span className="text-sm font-sans text-slate-400">Agent integrations</span>
                </button>
                <button
                  onClick={() => { navigate('/onboarding'); setOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/5 text-left"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <Plus size={12} className="text-slate-500" />
                  </div>
                  <span className="text-sm font-sans text-slate-500">New organization</span>
                </button>
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/5 text-left"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(239,68,68,0.08)' }}>
                    <LogOut size={12} className="text-red-500" />
                  </div>
                  <span className="text-sm font-sans text-red-500">Sign out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
