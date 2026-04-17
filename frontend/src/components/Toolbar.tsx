import { Search, X, SlidersHorizontal } from 'lucide-react'

interface ToolbarProps {
  search: string
  onSearch: (v: string) => void
  namespaces: string[]
  activeNs: string | null
  onNsChange: (ns: string | null) => void
}

export function Toolbar({ search, onSearch, namespaces, activeNs, onNsChange }: ToolbarProps) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-cyber-border bg-cyber-panel/90 backdrop-blur-md shadow-lg">
        <Search size={12} className="text-slate-500 shrink-0" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="search nodes..."
          className="bg-transparent text-[11px] font-mono text-slate-300 placeholder-slate-600 outline-none w-40"
        />
        {search && (
          <button onClick={() => onSearch('')} className="text-slate-600 hover:text-slate-300 transition-colors">
            <X size={11} />
          </button>
        )}
      </div>

      {/* Namespace filter */}
      {namespaces.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-cyber-border bg-cyber-panel/90 backdrop-blur-md shadow-lg">
          <SlidersHorizontal size={11} className="text-slate-500 shrink-0" />
          <button
            onClick={() => onNsChange(null)}
            className={`px-2 py-0.5 rounded-md text-[10px] font-mono transition-colors ${
              activeNs === null ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            all
          </button>
          {namespaces.map((ns) => (
            <button
              key={ns}
              onClick={() => onNsChange(activeNs === ns ? null : ns)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-mono transition-colors ${
                activeNs === ns ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40' : 'text-slate-500 hover:text-slate-300'
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
