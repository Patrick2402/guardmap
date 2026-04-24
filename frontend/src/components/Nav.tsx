import { motion } from 'framer-motion'
import { GitGraph, Network, ShieldCheck, ShieldAlert, LayoutDashboard, FolderSearch, History, BookMarked } from 'lucide-react'

export type TabId = 'overview' | 'graph' | 'topology' | 'rbac' | 'findings' | 'benchmarks' | 'explorer' | 'history'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',    label: 'Overview',    icon: <LayoutDashboard size={13} /> },
  { id: 'graph',       label: 'IRSA Graph',  icon: <GitGraph        size={13} /> },
  { id: 'topology',    label: 'Topology',    icon: <Network         size={13} /> },
  { id: 'rbac',        label: 'RBAC',        icon: <ShieldCheck     size={13} /> },
  { id: 'findings',    label: 'Findings',    icon: <ShieldAlert     size={13} /> },
  { id: 'benchmarks',  label: 'Benchmarks',  icon: <BookMarked      size={13} /> },
  { id: 'history',     label: 'History',     icon: <History         size={13} /> },
  { id: 'explorer',    label: 'Explorer',    icon: <FolderSearch    size={13} /> },
]

interface NavProps {
  active: TabId
  onChange: (tab: TabId) => void
  findingCount?: number
}

export function Nav({ active, onChange, findingCount }: NavProps) {
  return (
    <div className="flex items-center gap-0.5 px-1 py-1 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="relative px-3 py-1.5 rounded-lg text-[12px] font-sans font-medium transition-colors duration-200 flex items-center gap-1.5"
          style={{ color: active === tab.id ? '#e2e8f0' : '#94a3b8' }}
        >
          {active === tab.id && (
            <motion.div
              layoutId="nav-pill"
              className="absolute inset-0 rounded-lg bg-white/8 border border-white/10"
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            />
          )}
          <span className="relative z-10">{tab.icon}</span>
          <span className="relative z-10">{tab.label}</span>
          {tab.id === 'findings' && !!findingCount && (
            <span className="relative z-10 text-[9px] font-bold bg-red-500 text-white px-1.5 py-px rounded-full min-w-[18px] text-center leading-tight">
              {findingCount > 99 ? '99+' : findingCount}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
