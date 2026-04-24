import { memo } from 'react'
import { NodeProps, Handle, Position } from 'reactflow'
import { Link2 } from 'lucide-react'

interface RBACBindingData {
  label: string
  namespace?: string
  nodeType: string
  roleRef?: string
  roleKind?: string
  dimmed?: boolean
}

export const RBACBindingNode = memo(({ data }: NodeProps<RBACBindingData>) => {
  const { label, namespace, nodeType, roleRef, dimmed } = data
  const isCluster = nodeType === 'k8s_clusterrolebinding'

  return (
    <div className={`rounded-xl border border-violet-500/35 bg-violet-950/25 backdrop-blur-sm
      transition-all duration-300 cursor-pointer select-none overflow-hidden
      ${dimmed ? 'opacity-20 scale-95' : 'opacity-100'}`}
      style={{ minWidth: 170 }}>
      <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 border-b border-white/5"
        style={{ background: 'rgba(139,92,246,0.06)' }}>
        <Link2 size={9} className="text-violet-400" />
        <span className="text-[9px] font-mono font-bold tracking-widest uppercase text-violet-400">
          {isCluster ? 'ClusterRoleBinding' : 'RoleBinding'}
        </span>
      </div>
      <div className="px-2.5 py-1.5">
        <div className="text-[12px] font-mono font-semibold leading-tight truncate text-violet-200">{label}</div>
        {namespace && <div className="text-[9px] font-mono text-slate-400 mt-0.5">{namespace}</div>}
        {roleRef && <div className="text-[9px] font-mono text-slate-400 mt-0.5 truncate">→ {roleRef}</div>}
      </div>
      <Handle type="target" position={Position.Left}  className="!w-2 !h-2 !bg-violet-500 !border-cyber-bg" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-violet-500 !border-cyber-bg" />
    </div>
  )
})
