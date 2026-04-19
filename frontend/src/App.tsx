import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useNavigate, useParams, useLocation, Routes, Route, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, RefreshCw, AlertCircle, ChevronDown, Cloud, BookOpen, Activity, Plus } from 'lucide-react'
import { GuardMapSymbol } from './components/GuardMapLogo'

import { useGraphData, DataSource } from './hooks/useGraphData'
import { useClusters }    from './hooks/useClusters'
import { useBlastRadius }  from './hooks/useBlastRadius'
import { GraphNode, WORKLOAD_TYPES } from './types'
import { Graph }           from './components/Graph'
import { Sidebar }         from './components/Sidebar'
import { Legend }          from './components/Legend'
import { Nav, TabId }      from './components/Nav'
import { Toolbar }         from './components/Toolbar'
import { ExplorerView }    from './components/Explorer/ExplorerView'
import { TopologyView }    from './components/Topology/TopologyView'
import { RBACView }        from './components/RBAC/RBACView'
import { FindingsView, countCriticalFindings } from './components/Findings/FindingsView'
import { BenchmarksView } from './components/Benchmarks/BenchmarksView'
import { OverviewView }    from './components/Overview/OverviewView'
import { HistoryView }     from './components/History/HistoryView'
import { LoginPage }          from './pages/LoginPage'
import { OnboardingPage }     from './pages/OnboardingPage'
import { IntegrationsPage }   from './pages/IntegrationsPage'
import { LandingPage }        from './pages/LandingPage'
import { SettingsPage }       from './pages/SettingsPage'
import { InvitePage }         from './pages/InvitePage'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { OrgSwitcher }        from './components/OrgSwitcher'

const VALID_TABS = new Set<TabId>(['overview', 'graph', 'topology', 'rbac', 'findings', 'benchmarks', 'explorer', 'history'])

// ── Redirect logged-in users away from auth pages ────────────────────────────
function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { user, orgs, initialLoading, loading } = useAuth()
  if (initialLoading || loading) return null   // wait for orgs to settle
  if (user) return <Navigate to={orgs.length === 0 ? '/onboarding' : '/overview'} replace />
  return <>{children}</>
}

// ── Requires login but does NOT redirect away based on orgs ──────────────────
function RequireAuthOnly({ children }: { children: React.ReactNode }) {
  const { user, initialLoading } = useAuth()
  if (initialLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

// ── Protected route wrapper ───────────────────────────────────────────────────
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, orgs, initialLoading, loading } = useAuth()

  if (initialLoading || loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center"
        style={{ background: '#080c14' }}>
        <GuardMapSymbol size={28} />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (orgs.length === 0) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

// ── Cluster selector (topbar) ─────────────────────────────────────────────────
function ClusterSelector({ source, onSelect }: {
  source: DataSource
  onSelect: (s: DataSource) => void
}) {
  const { activeOrg } = useAuth()
  const { clusters } = useClusters(activeOrg?.organization_id ?? null)
  const [open, setOpen] = useState(false)

  const activeCluster = typeof source !== 'string'
    ? clusters.find(c => c.id === source.clusterId)
    : null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl cursor-pointer transition-all shrink-0"
        style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)' }}
      >
        <div className={`w-2 h-2 rounded-full ${activeCluster?.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
        <span className="text-[13px] font-sans font-medium text-slate-300 max-w-[140px] truncate">
          {source === 'mock' ? 'mock-cluster' : (activeCluster?.name ?? 'Select cluster')}
        </span>
        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-lg ${
          source !== 'mock'
            ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-500/30'
            : 'bg-slate-800/60 text-slate-500 border border-slate-700/40'
        }`}>
          {source === 'mock' ? 'MOCK' : 'LIVE'}
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
              {/* Mock option */}
              <div className="px-3 py-2 border-b border-white/5">
                <div className="text-[10px] font-sans font-semibold text-slate-600 uppercase tracking-wider">Demo</div>
              </div>
              <button
                onClick={() => { onSelect('mock'); setOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-left"
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <BookOpen size={12} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-sans font-medium text-slate-400">mock-cluster</div>
                  <div className="text-xs font-mono text-slate-600">Sample data</div>
                </div>
                {source === 'mock' && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />}
              </button>

              {/* Live clusters */}
              {clusters.length > 0 && (
                <>
                  <div className="px-3 py-2 border-t border-b border-white/5">
                    <div className="text-[10px] font-sans font-semibold text-slate-600 uppercase tracking-wider">Live clusters</div>
                  </div>
                  {clusters.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { onSelect({ clusterId: c.id }); setOpen(false) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-left"
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(255,153,0,0.1)' }}>
                        <Cloud size={12} className="text-orange-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-sans font-medium text-slate-200 truncate">{c.name}</div>
                        <div className="text-xs font-mono text-slate-600">{c.region ?? 'unknown region'}</div>
                      </div>
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.status === 'active' ? 'bg-emerald-400' : 'bg-yellow-500'}`} />
                    </button>
                  ))}
                </>
              )}

              {clusters.length === 0 && (
                <div className="px-3 py-3 border-t border-white/5">
                  <div className="text-xs font-sans text-slate-600 mb-2">No clusters connected yet</div>
                  <button
                    onClick={() => { window.location.href = '/integrations'; setOpen(false) }}
                    className="text-xs font-sans text-cyan-500 hover:text-cyan-400 transition-colors flex items-center gap-1"
                  >
                    <Plus size={11} />
                    Connect a cluster
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── No clusters empty state ───────────────────────────────────────────────────
function NoClustersState() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Cloud size={28} className="text-slate-700" />
      </div>
      <div className="text-center">
        <div className="text-base font-sans font-semibold text-slate-400">No cluster connected</div>
        <div className="text-sm font-sans text-slate-600 mt-1.5 max-w-xs leading-relaxed">
          Connect your first Kubernetes cluster to start seeing live security data.
        </div>
      </div>
      <a
        href="/integrations"
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-sans font-semibold transition-all"
        style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: '#22d3ee' }}
      >
        <Activity size={14} />
        Go to Integrations
      </a>
      <div className="text-xs font-sans text-slate-600">
        Or switch to <button
          onClick={() => window.location.href = '/?demo=1'}
          className="text-slate-500 hover:text-slate-300 underline transition-colors"
        >
          demo mode
        </button> to explore with sample data
      </div>
    </div>
  )
}

// ── Main cluster view ─────────────────────────────────────────────────────────
function ClusterView() {
  const { tab = 'overview' } = useParams<{ tab: string }>()
  const navigate  = useNavigate()
  const location  = useLocation()
  const { activeOrg } = useAuth()
  const { clusters, loading: clustersLoading } = useClusters(activeOrg?.organization_id ?? null)

  const activeTab = (VALID_TABS.has(tab as TabId) ? tab : 'overview') as TabId

  const [graphHintDismissed, setGraphHintDismissed] = useState(
    () => localStorage.getItem('gm_graph_hint_dismissed') === '1'
  )
  function dismissGraphHint() {
    localStorage.setItem('gm_graph_hint_dismissed', '1')
    setGraphHintDismissed(true)
  }

  // Default: mock if no clusters, otherwise first live cluster
  const [dataSource, setDataSource] = useState<DataSource>('mock')
  const { data, loading, error, scanMeta } = useGraphData(dataSource)

  // SECURITY: reset source whenever org changes — never show data from another org
  const [userPickedSource, setUserPickedSource] = useState(false)
  const orgId = activeOrg?.organization_id ?? null
  useEffect(() => {
    setDataSource('mock')
    setUserPickedSource(false)
  }, [orgId])

  // Once clusters load, auto-switch to first live cluster (skip if user picked mock manually)
  useEffect(() => {
    if (userPickedSource || clustersLoading) return
    if (clusters.length > 0) setDataSource({ clusterId: clusters[0].id })
  }, [clusters, clustersLoading, userPickedSource])

  function handleSelectSource(s: DataSource) {
    setDataSource(s)
    setUserPickedSource(true)
  }

  const clusterName = dataSource === 'mock'
    ? 'mock-cluster'
    : (clusters.find(c => c.id === (dataSource as { clusterId: string }).clusterId)?.name ?? 'live-cluster')

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [blastStartId, setBlastStartId] = useState<string | null>(null)
  const [search, setSearch]             = useState('')
  const [activeNs, setActiveNs]         = useState<string | null>('production')
  const focusFnRef = useRef<((nodeIds: string[]) => void) | null>(null)

  const handleFocusNode = useCallback((nodeId: string) => {
    focusFnRef.current?.([nodeId])
  }, [])

  const blastRadius = useBlastRadius(data, blastStartId)

  const namespaces = useMemo(() => {
    if (!data) return []
    return [...new Set(data.nodes.filter(n => n.namespace).map(n => n.namespace!))]
  }, [data])

  const findingCount = useMemo(() => {
    if (scanMeta) return scanMeta.criticalCount + scanMeta.highCount
    return data ? countCriticalFindings(data) : 0
  }, [data, scanMeta])

  const handleTabChange = useCallback((newTab: TabId) => {
    setSelectedNode(null); setBlastStartId(null); setSearch('')
    navigate(`/${newTab}`)
  }, [navigate])

  const handleNavigate = useCallback((newTab: TabId, nodeId?: string) => {
    setSelectedNode(null); setBlastStartId(null); setSearch('')
    navigate(`/${newTab}`, { state: { focusNodeId: nodeId ?? null } })
  }, [navigate])

  const handleNodeClick = useCallback((node: GraphNode | null) => {
    setSelectedNode(node)
    if (node && (WORKLOAD_TYPES.includes(node.type) || node.type === 'pod')) {
      setBlastStartId(prev => prev === node.id ? null : node.id)
    } else {
      setBlastStartId(null)
    }
  }, [])

  const handleSidebarClose = useCallback(() => {
    setSelectedNode(null); setBlastStartId(null)
  }, [])

  const pendingFocusNodeId = (location.state as { focusNodeId?: string } | null)?.focusNodeId ?? null

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 20% 50%, #0a1628 0%, #080c14 60%)' }}
    >
      {/* ── Topbar ── */}
      <header className="shrink-0 flex items-center px-5 z-20 gap-4"
        style={{ height: 52, background: 'rgba(8,12,20,0.75)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>

        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0 cursor-pointer select-none" onClick={() => handleTabChange('overview')}>
          <GuardMapSymbol size={18} />
          <div className="flex items-baseline gap-0">
            <span className="text-[14px] font-sans font-bold text-cyan-400">Guard</span>
            <span className="text-[14px] font-sans font-bold text-slate-100">Map</span>
          </div>
        </div>

        <div className="h-5 w-px bg-white/8 shrink-0" />

        {/* Org switcher */}
        <OrgSwitcher />

        <div className="h-5 w-px bg-white/8 shrink-0" />

        {/* Cluster selector */}
        <ClusterSelector source={dataSource} onSelect={handleSelectSource} />

        {/* Nav tabs — centered */}
        <div className="flex-1 flex justify-center">
          <Nav active={activeTab} onChange={handleTabChange} findingCount={findingCount} />
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 shrink-0">
          {blastRadius && activeTab === 'graph' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-yellow-500/35 bg-yellow-950/25"
            >
              <Zap size={11} className="text-yellow-400" />
              <span className="text-xs font-sans font-semibold text-yellow-300">Blast Radius active</span>
            </motion.div>
          )}

          <button
            onClick={() => navigate('/integrations')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-slate-500 hover:text-cyan-400 transition-all text-xs font-sans"
            style={{ background: 'rgba(255,255,255,0.04)' }}
            title="Agent Integrations"
          >
            <Activity size={12} />
            <span className="hidden sm:block">Integrations</span>
          </button>

          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-slate-500 hover:text-slate-200 transition-all text-xs font-sans"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <RefreshCw size={12} />
            <span className="hidden sm:block">Refresh</span>
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 relative overflow-hidden">
        {/* No clusters connected + live source selected */}
        {!clustersLoading && clusters.length === 0 && dataSource !== 'mock' && (
          <NoClustersState />
        )}
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20"
            >
              <GuardMapSymbol size={36} />
              <p className="text-[11px] font-mono text-slate-500 animate-pulse">Scanning cluster security graph...</p>
            </motion.div>
          )}

          {error && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-20"
            >
              <AlertCircle size={28} className="text-red-500" />
              <p className="text-[11px] font-mono text-red-400">{error}</p>
            </motion.div>
          )}

          {/* History + Overview render independently of graph data */}
          {activeTab === 'history' && !loading && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0">
              <HistoryView source={dataSource} />
            </motion.div>
          )}

          {activeTab === 'overview' && !loading && (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0">
              <OverviewView data={data} scanMeta={scanMeta ?? undefined} onNavigate={handleNavigate} />
            </motion.div>
          )}

          {data && !loading && activeTab !== 'history' && activeTab !== 'overview' && (
            <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0">

              {activeTab === 'graph' && (
                <>
                  <div className="absolute top-0 left-0 right-0 z-10 border-b border-cyber-border/30 bg-cyber-panel/20 backdrop-blur-sm">
                    {blastRadius ? (
                      <p className="px-5 py-1.5 text-[10px] font-mono text-slate-700 pointer-events-none">
                        Blast radius active — {blastRadius.fullTargets.length} full-access + {blastRadius.writeTargets.length} write targets exposed
                      </p>
                    ) : !graphHintDismissed ? (
                      <div className="flex items-center justify-between px-5 py-2 gap-3"
                        style={{ background: 'rgba(34,211,238,0.04)', borderBottom: '1px solid rgba(34,211,238,0.08)' }}>
                        <p className="text-[11px] font-sans text-cyan-400/80">
                          <span className="font-semibold text-cyan-400">Tip:</span> Click any workload node to inspect its IAM permissions and blast radius · Scroll to zoom · Drag to pan
                        </p>
                        <button onClick={dismissGraphHint}
                          className="text-slate-600 hover:text-slate-400 transition-colors shrink-0 text-[11px] font-mono">
                          Got it ✕
                        </button>
                      </div>
                    ) : (
                      <p className="px-5 py-1.5 text-[10px] font-mono text-slate-700 pointer-events-none">
                        Click a Workload to see Blast Radius & IAM permissions · Scroll to zoom · Drag to pan
                      </p>
                    )}
                  </div>
                  <div className="absolute inset-0 pt-8">
                    <Toolbar search={search} onSearch={setSearch} namespaces={namespaces} activeNs={activeNs} onNsChange={setActiveNs} />
                    <Graph
                      data={data} blastRadius={blastRadius} onNodeClick={handleNodeClick}
                      onFocusReady={fn => { focusFnRef.current = fn }} search={search} activeNs={activeNs}
                      focusNodeId={activeTab === 'graph' ? pendingFocusNodeId : null}
                    />
                  </div>
                  <Legend />
                  <Sidebar blastRadius={blastRadius} selectedNode={selectedNode} data={data} onClose={handleSidebarClose} onFocusNode={handleFocusNode} dbFindings={scanMeta?.findings} onViewFindings={() => handleNavigate('findings')} />
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/8 to-transparent animate-scan" />
                  </div>
                </>
              )}

              {activeTab === 'topology'   && <TopologyView   data={data} focusNodeId={pendingFocusNodeId} />}
              {activeTab === 'rbac'       && <RBACView       data={data} focusNodeId={pendingFocusNodeId} />}
              {activeTab === 'findings'   && <FindingsView   data={data} dbFindings={scanMeta?.findings} onNavigate={handleNavigate} />}
              {activeTab === 'benchmarks' && <BenchmarksView data={data} dbFindings={scanMeta?.findings} onNavigate={handleNavigate} />}
              {activeTab === 'explorer'   && <ExplorerView   data={data} clusterName={clusterName} />}

            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login"         element={<RedirectIfAuth><LoginPage /></RedirectIfAuth>} />
        <Route path="/onboarding"    element={<RequireAuthOnly><OnboardingPage /></RequireAuthOnly>} />
        <Route path="/integrations"  element={<RequireAuth><IntegrationsPage /></RequireAuth>} />
        <Route path="/settings"      element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/:tab/focus/:focusId" element={<RequireAuth><ClusterView /></RequireAuth>} />
        <Route path="/:tab"                element={<RequireAuth><ClusterView /></RequireAuth>} />
        <Route path="/"                    element={<RedirectIfAuth><LandingPage /></RedirectIfAuth>} />
      </Routes>
    </AuthProvider>
  )
}
