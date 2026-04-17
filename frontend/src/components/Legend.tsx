export function Legend() {
  return (
    <div className="absolute left-4 bottom-4 z-10 rounded-xl border border-cyber-border bg-cyber-panel/80 backdrop-blur-sm px-4 py-3 space-y-3">
      <div className="text-[9px] font-mono font-semibold text-slate-500 uppercase tracking-widest">IRSA Chain</div>

      <div className="space-y-1.5">
        {[
          { color: 'bg-blue-400',   label: 'Workload (Deploy/SS/DS)' },
          { color: 'bg-violet-400', label: 'ServiceAccount'          },
          { color: 'bg-amber-400',  label: 'IAM Role'                },
          { color: 'bg-slate-400',  label: 'AWS Resource'            },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
            <span className="text-[10px] font-mono text-slate-400">{label}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Access level</div>
        {[
          { hex: '#ef4444', label: 'Full (*)'  },
          { hex: '#f59e0b', label: 'Write'     },
          { hex: '#10b981', label: 'Read-only' },
        ].map(({ hex, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-4 h-px" style={{ background: hex }} />
            <span className="text-[10px] font-mono text-slate-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
