import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { KeyRound, FileText } from 'lucide-react'
import { NodeType } from '../../types'

interface ConfigSecretData {
  label: string
  namespace: string
  nodeType: NodeType
  secretType?: string
  keyCount?: string
  referenced?: string
  immutable?: string
  dimmed?: boolean
  selected?: boolean
}

const CFG = {
  secret: {
    icon: KeyRound,
    kind: 'Secret',
    border: 'border-amber-500/40',
    bg: 'rgba(40,25,0,0.55)',
    headerBg: 'rgba(245,158,11,0.07)',
    headerBorder: 'rgba(245,158,11,0.12)',
    text: 'text-amber-400',
    name: 'text-amber-200',
    handle: '!bg-amber-500',
  },
  configmap: {
    icon: FileText,
    kind: 'ConfigMap',
    border: 'border-sky-500/40',
    bg: 'rgba(0,20,40,0.55)',
    headerBg: 'rgba(56,189,248,0.07)',
    headerBorder: 'rgba(56,189,248,0.12)',
    text: 'text-sky-400',
    name: 'text-sky-200',
    handle: '!bg-sky-500',
  },
} as const

export const ConfigSecretNode = memo(({ data }: NodeProps<ConfigSecretData>) => {
  const { label, namespace, nodeType, secretType, keyCount, referenced, immutable, dimmed } = data
  const cfg = CFG[nodeType as keyof typeof CFG] ?? CFG.configmap
  const Icon = cfg.icon

  const orphaned = referenced === 'false'
  const dimCls = dimmed ? 'opacity-20 scale-95' : 'opacity-100'

  // Sub-label: secret type (shortened) or immutable flag
  let subLabel = ''
  if (nodeType === 'secret' && secretType) {
    subLabel = secretType.replace('kubernetes.io/', '')
  } else if (nodeType === 'configmap' && immutable === 'true') {
    subLabel = 'immutable'
  }

  return (
    <div
      className={`rounded-xl border backdrop-blur-sm cursor-pointer select-none overflow-hidden transition-all duration-300 hover:brightness-110 ${dimCls} ${cfg.border} ${orphaned ? 'opacity-60' : ''}`}
      style={{ minWidth: 190, background: cfg.bg }}
    >
      <div
        className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 border-b"
        style={{ background: cfg.headerBg, borderColor: cfg.headerBorder }}
      >
        <Icon size={9} className={cfg.text} />
        <span className={`text-[9px] font-mono font-bold tracking-widest uppercase ${cfg.text}`}>
          {cfg.kind}
        </span>
        {subLabel && (
          <span className="ml-auto text-[8px] font-mono text-slate-600 truncate max-w-[80px]">
            {subLabel}
          </span>
        )}
        {orphaned && (
          <span className="ml-auto text-[8px] font-mono text-orange-500 bg-orange-950/40 px-1 py-px rounded">
            orphaned
          </span>
        )}
      </div>
      <div className="px-2.5 py-1.5">
        <div className={`text-[12px] font-mono font-semibold leading-tight truncate ${cfg.name}`}>
          {label}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {namespace && <span className="text-[9px] font-mono text-slate-500">{namespace}</span>}
          {keyCount && keyCount !== '0' && (
            <span className="text-[8px] font-mono text-slate-600">{keyCount} key{keyCount !== '1' ? 's' : ''}</span>
          )}
        </div>
      </div>
      <Handle type="target" position={Position.Left}  className={`!w-2 !h-2 !border-cyber-bg ${cfg.handle}`} />
      <Handle type="source" position={Position.Right} className={`!w-2 !h-2 !border-cyber-bg ${cfg.handle}`} />
    </div>
  )
})
