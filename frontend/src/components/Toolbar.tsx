import { Search, X, Layers } from 'lucide-react'

interface ToolbarProps {
  search: string
  onSearch: (v: string) => void
  namespaces: string[]
  activeNs: string | null
  onNsChange: (ns: string | null) => void
}

export function Toolbar({ search, onSearch, namespaces, activeNs, onNsChange }: ToolbarProps) {
  return (
    <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-0 rounded-xl border border-cyber-border bg-cyber-panel/90 backdrop-blur-md shadow-lg overflow-hidden">
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0">
        <Search size={13} className="text-slate-500 shrink-0" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="search nodes..."
          className="bg-transparent text-sm font-mono text-slate-300 placeholder-slate-600 outline-none w-36"
        />
        {search ? (
          <button onClick={() => onSearch('')} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={11} />
          </button>
        ) : (
          <div className="w-[11px]" />
        )}
      </div>

      {/* Divider */}
      {namespaces.length > 0 && (
        <div className="w-px self-stretch bg-cyber-border/60 shrink-0" />
      )}

      {/* Namespace filter — scrollable, no wrap */}
      {namespaces.length > 0 && (
        <div className="flex items-center gap-0 min-w-0 overflow-x-auto scrollbar-none px-2 py-1.5">
          <div className="flex items-center gap-1 shrink-0 mr-1">
            <Layers size={11} className="text-slate-500" />
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">ns</span>
          </div>

          {/* Divider before pills */}
          <div className="w-px h-4 bg-cyber-border/40 shrink-0 mr-2" />

          <button
            onClick={() => onNsChange(null)}
            className={`shrink-0 px-2.5 py-0.5 rounded-md text-xs font-mono transition-all ${
              activeNs === null
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            all
          </button>

          {namespaces.map((ns) => (
            <button
              key={ns}
              onClick={() => onNsChange(activeNs === ns ? null : ns)}
              className={`shrink-0 ml-0.5 px-2.5 py-0.5 rounded-md text-xs font-mono transition-all whitespace-nowrap ${
                activeNs === ns
                  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30 shadow-[0_0_8px_rgba(139,92,246,0.15)]'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`}
            >
              {ns}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
