import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Zap, Shield, AlertTriangle, KeyRound, ShieldCheck, Search, Crosshair,
  HardDrive, Database, MessageSquare, Lock, BarChart2, Box, ShieldAlert } from 'lucide-react'
import { BlastRadiusResult, GraphNode, GraphData, WORKLOAD_TYPES } from '../types'
import type { DbFinding } from '../hooks/useGraphData'

function ServiceIcon({ service }: { service: string }) {
  const s = service?.toLowerCase() ?? ''
  if (s === 's3')                             return <HardDrive size={11} />
  if (s === 'rds' || s === 'dynamodb')        return <Database size={11} />
  if (s === 'sqs' || s === 'sns')             return <MessageSquare size={11} />
  if (s === 'secretsmanager' || s === 'kms') return <Lock size={11} />
  if (s === 'cloudwatch')                     return <BarChart2 size={11} />
  return <Box size={11} />
}

interface SidebarProps {
  blastRadius: BlastRadiusResult | null
  selectedNode: GraphNode | null
  data: GraphData | null
  onClose: () => void
  onFocusNode?: (nodeId: string) => void
  dbFindings?: DbFinding[]
  onViewFindings?: () => void
}

const accessBadge = {
  full:  { cls: 'bg-red-500/20 text-red-400 border-red-500/40',        label: 'FULL'  },
  write: { cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', label: 'WRITE' },
  read:  { cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', label: 'READ' },
}

const nodeTypeLabel: Record<string, string> = {
  deployment: 'Deployment', statefulset: 'StatefulSet', daemonset: 'DaemonSet',
  serviceaccount: 'ServiceAccount', iam_role: 'IAM Role', aws_service: 'AWS Service', pod: 'Pod',
}

interface PermissionRow {
  roleLabel: string
  resourceId: string
  resourceLabel: string
  service: string
  actions: string[]
  accessLevel: 'full' | 'write' | 'read'
}

function usePermissions(node: GraphNode | null, data: GraphData | null): PermissionRow[] {
  return useMemo(() => {
    if (!node || !data) return []

    const edgeMap = new Map<string, typeof data.edges[0][]>()
    data.edges.forEach(e => {
      if (!edgeMap.has(e.source)) edgeMap.set(e.source, [])
      edgeMap.get(e.source)!.push(e)
    })
    const nodeMap = new Map(data.nodes.map(n => [n.id, n]))

    const roleIds = new Set<string>()

    if (WORKLOAD_TYPES.includes(node.type)) {
      const pods = (edgeMap.get(node.id) ?? []).filter(e => e.label === 'manages').map(e => e.target)
      pods.forEach(podId => {
        const saEdge = (edgeMap.get(podId) ?? []).find(e => e.target.startsWith('sa:'))
        if (!saEdge) return
        const roleEdge = (edgeMap.get(saEdge.target) ?? []).find(e => e.target.startsWith('role:'))
        if (roleEdge) roleIds.add(roleEdge.target)
      })
    } else if (node.type === 'serviceaccount') {
      const roleEdge = (edgeMap.get(node.id) ?? []).find(e => e.target.startsWith('role:'))
      if (roleEdge) roleIds.add(roleEdge.target)
    } else if (node.type === 'iam_role') {
      roleIds.add(node.id)
    }

    const rows: PermissionRow[] = []
    roleIds.forEach(roleId => {
      const role = nodeMap.get(roleId)
      if (!role) return
      ;(edgeMap.get(roleId) ?? []).forEach(e => {
        if (!e.target.startsWith('svc:') || !e.accessLevel) return
        const resource = nodeMap.get(e.target)
        if (!resource) return
        rows.push({
          roleLabel:     role.label,
          resourceId:    e.target,
          resourceLabel: resource.label,
          service:       resource.metadata?.service ?? 'aws',
          actions:       e.actions ?? (e.label ? [e.label] : []),
          accessLevel:   e.accessLevel,
        })
      })
    })

    return rows
  }, [node, data])
}

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#64748b',
}

export function Sidebar({ blastRadius, selectedNode, data, onClose, onFocusNode, dbFindings, onViewFindings }: SidebarProps) {
  const [permSearch, setPermSearch] = useState('')
  const isOpen = !!(blastRadius || selectedNode)
  const permissions = usePermissions(selectedNode, data)

  const nodeFindings = useMemo(() => {
    if (!selectedNode || !dbFindings?.length) return []
    const name = selectedNode.label ?? ''
    const nsName = `${selectedNode.namespace ?? ''}/${name}`
    return dbFindings.filter(f => f.resource.includes(name) || f.resource.includes(nsName))
  }, [selectedNode, dbFindings])

  const showPermissions = selectedNode &&
    (WORKLOAD_TYPES.includes(selectedNode.type) || selectedNode.type === 'serviceaccount' || selectedNode.type === 'iam_role')

  // Filter + group by service
  const groupedPermissions = useMemo(() => {
    const q = permSearch.toLowerCase()
    const filtered = q
      ? permissions.filter(p =>
          p.resourceLabel.toLowerCase().includes(q) ||
          p.service.toLowerCase().includes(q) ||
          p.actions.some(a => a.toLowerCase().includes(q))
        )
      : permissions

    const groups = new Map<string, PermissionRow[]>()
    filtered.forEach(p => {
      const key = p.service.toUpperCase() || 'AWS'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    })
    return groups
  }, [permissions, permSearch])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="sidebar"
          initial={{ x: 340, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 340, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute right-4 top-4 bottom-4 w-80 z-10 flex flex-col"
        >
          <div className="flex flex-col h-full rounded-2xl border border-cyber-border bg-cyber-panel/90 backdrop-blur-xl overflow-hidden shadow-2xl">

            {/* header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-cyber-border">
              <div className="flex items-center gap-2">
                {blastRadius
                  ? <Zap size={14} className="text-yellow-400" />
                  : selectedNode?.type === 'iam_role'
                    ? <ShieldCheck size={14} className="text-amber-400" />
                    : selectedNode?.type === 'serviceaccount'
                      ? <KeyRound size={14} className="text-violet-400" />
                      : <Shield size={14} className="text-cyan-400" />
                }
                <span className="text-[11px] font-mono font-semibold text-slate-200">
                  {blastRadius ? 'BLAST RADIUS' : 'NODE DETAILS'}
                </span>
              </div>
              <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">

              {/* Selected node meta */}
              {selectedNode && (
                <section>
                  <h3 className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest mb-2">
                    {nodeTypeLabel[selectedNode.type] ?? selectedNode.type}
                  </h3>
                  <div className="space-y-1.5">
                    <div className="text-[13px] font-mono font-semibold text-slate-100">{selectedNode.label}</div>
                    {selectedNode.namespace && (
                      <div className="text-[10px] font-mono text-slate-500">
                        namespace: <span className="text-violet-400">{selectedNode.namespace}</span>
                      </div>
                    )}
                    {selectedNode.metadata?.arn && (
                      <div className="text-[9px] font-mono text-slate-600 break-all">{selectedNode.metadata.arn}</div>
                    )}
                    {selectedNode.metadata?.replicas && (
                      <div className="text-[10px] font-mono text-slate-500">
                        replicas: <span className="text-blue-400">{selectedNode.metadata.replicas}</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* IAM Permissions — with search + grouped by service */}
              {showPermissions && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck size={10} className="text-slate-500" />
                    <h3 className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest flex-1">
                      IAM Permissions
                    </h3>
                    {permissions.length > 0 && (
                      <span className="text-[9px] font-mono text-slate-600">{permissions.length} total</span>
                    )}
                  </div>

                  {/* Search bar */}
                  {permissions.length > 2 && (
                    <div className="relative mb-3">
                      <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                      <input
                        value={permSearch}
                        onChange={e => setPermSearch(e.target.value)}
                        placeholder="Filter permissions…"
                        className="w-full bg-slate-900/60 border border-slate-700/60 rounded-lg pl-7 pr-3 py-1.5 text-[11px] font-mono text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 focus:bg-slate-900 transition-colors"
                      />
                    </div>
                  )}

                  {groupedPermissions.size === 0 ? (
                    <div className="text-[11px] font-mono text-slate-600 py-2">
                      {permSearch ? 'No matches' : 'No IAM permissions found'}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {[...groupedPermissions.entries()].map(([service, rows]) => (
                        <div key={service}>
                          {/* service group header */}
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <div className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">{service}</div>
                            <div className="flex-1 h-px bg-slate-800" />
                            <span className="text-[9px] font-mono text-slate-700">{rows.length}</span>
                          </div>

                          <div className="space-y-1.5">
                            {rows.map((row, i) => {
                              const badge = accessBadge[row.accessLevel]
                              return (
                                <div key={i} className="rounded-lg border border-white/5 bg-white/3 p-2.5 space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-mono font-semibold text-slate-200 truncate">{row.resourceLabel}</span>
                                    <span className={`shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded border font-bold ${badge.cls}`}>
                                      {badge.label}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {row.actions.map(a => (
                                      <span key={a} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 max-w-full truncate">
                                        {a}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Direct Access Map — quick-jump cards to AWS resources */}
              {showPermissions && permissions.length > 0 && onFocusNode && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <Crosshair size={10} className="text-cyan-500" />
                    <h3 className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest">
                      Direct Access Map
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {permissions.map((p, i) => {
                      const badge = accessBadge[p.accessLevel]
                      return (
                        <button
                          key={i}
                          onClick={() => onFocusNode(p.resourceId)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/5 bg-white/3 hover:bg-white/7 hover:border-cyan-500/20 transition-all text-left group"
                        >
                          <span className="text-slate-400 group-hover:text-cyan-400 transition-colors">
                            <ServiceIcon service={p.service} />
                          </span>
                          <span className="text-[11px] font-mono text-slate-300 truncate flex-1">{p.resourceLabel}</span>
                          <span className={`shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded border font-bold ${badge.cls}`}>
                            {badge.label}
                          </span>
                          <Crosshair size={9} className="shrink-0 text-slate-700 group-hover:text-cyan-500 transition-colors" />
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Security Findings for this node */}
              {nodeFindings.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={10} className="text-orange-400" />
                      <h3 className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest">
                        Security Findings
                      </h3>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400">
                        {nodeFindings.length}
                      </span>
                    </div>
                    {onViewFindings && (
                      <button onClick={onViewFindings}
                        className="text-[10px] font-mono text-slate-600 hover:text-cyan-400 transition-colors">
                        view all →
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {nodeFindings.slice(0, 5).map((f, i) => (
                      <div key={i} className="rounded-lg border border-white/5 bg-white/3 px-3 py-2 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                            style={{ background: `${SEV_COLOR[f.severity]}18`, color: SEV_COLOR[f.severity] }}>
                            {f.severity.toUpperCase()}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 truncate">{f.type}</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-snug">{f.description}</p>
                      </div>
                    ))}
                    {nodeFindings.length > 5 && (
                      <div className="text-[11px] font-mono text-slate-600 pl-1">
                        +{nodeFindings.length - 5} more findings
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Blast radius results */}
              {blastRadius && (
                <>
                  <section>
                    <h3 className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest mb-2">
                      Impact Summary
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-center">
                        <div className="text-2xl font-mono font-bold text-red-400">{blastRadius.fullTargets.length}</div>
                        <div className="text-[9px] font-mono text-red-500 mt-1">FULL ACCESS</div>
                      </div>
                      <div className="rounded-lg border border-yellow-500/30 bg-yellow-950/20 p-3 text-center">
                        <div className="text-2xl font-mono font-bold text-yellow-400">{blastRadius.writeTargets.length}</div>
                        <div className="text-[9px] font-mono text-yellow-500 mt-1">WRITE ACCESS</div>
                      </div>
                    </div>
                  </section>

                  {blastRadius.fullTargets.length > 0 && (
                    <section>
                      <h3 className="text-[10px] font-mono font-semibold text-red-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <AlertTriangle size={10} />
                        Full Access Targets
                      </h3>
                      <div className="space-y-1">
                        {blastRadius.fullTargets.map(n => (
                          <div key={n.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5 border border-white/5">
                            <span className="text-[11px] font-mono text-slate-300 truncate max-w-[60%]">{n.label}</span>
                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded border font-bold ${accessBadge.full.cls}`}>FULL</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {blastRadius.writeTargets.length > 0 && (
                    <section>
                      <h3 className="text-[10px] font-mono font-semibold text-yellow-500 uppercase tracking-widest mb-2">
                        Write Access Targets
                      </h3>
                      <div className="space-y-1">
                        {blastRadius.writeTargets.map(n => (
                          <div key={n.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5 border border-white/5">
                            <span className="text-[11px] font-mono text-slate-300 truncate max-w-[60%]">{n.label}</span>
                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded border font-bold ${accessBadge.write.cls}`}>WRITE</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <section>
                    <h3 className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest mb-2">
                      Reachable Nodes
                    </h3>
                    <div className="text-[11px] font-mono text-slate-300">
                      {blastRadius.reachableNodeIds.size} nodes across{' '}
                      {blastRadius.reachableEdgeIds.size} permission paths
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
