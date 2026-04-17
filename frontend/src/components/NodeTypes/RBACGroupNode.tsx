import { memo } from 'react'
import { NodeProps } from 'reactflow'
import { ShieldCheck } from 'lucide-react'

interface RBACGroupData { bindingCount: number; roleCount: number }

export const RBACGroupNode = memo(({ data }: NodeProps<RBACGroupData>) => (
  <div
    className="h-full w-full rounded-2xl pointer-events-none flex flex-col"
    style={{
      border: '1.5px solid rgba(139,92,246,0.28)',
      boxShadow: 'inset 0 0 80px 0 rgba(139,92,246,0.04)',
    }}
  >
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-t-2xl shrink-0"
      style={{ background: 'rgba(139,92,246,0.12)' }}
    >
      <ShieldCheck size={10} className="text-violet-400" />
      <span className="text-[10px] font-mono font-semibold text-violet-300 uppercase tracking-widest">
        Cluster RBAC
      </span>
      <span className="text-[9px] font-mono ml-auto text-violet-400/40">
        {data.bindingCount} bindings · {data.roleCount} roles
      </span>
    </div>
  </div>
))
