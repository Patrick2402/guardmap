export function GuardMapSymbol({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 30 L48 48 L74 30" stroke="#F5F7FA" strokeWidth="2.5" strokeLinecap="round" opacity="0.45" fill="none" />
      <path d="M48 48 L48 74" stroke="#5EEAD4" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="22" cy="30" r="8" fill="#F5F7FA" />
      <circle cx="74" cy="30" r="8" fill="#F5F7FA" />
      <circle cx="48" cy="48" r="10" fill="#5EEAD4" />
      <circle cx="48" cy="74" r="7" fill="#F5F7FA" />
      <circle cx="48" cy="48" r="16" stroke="#5EEAD4" strokeWidth="1.5" opacity="0.5" strokeDasharray="2 3" fill="none" />
    </svg>
  )
}

export function GuardMapWordmark({ size = 18 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <GuardMapSymbol size={size} />
      <span style={{ fontSize: size * 0.9 }} className="font-bold leading-none">
        <span className="text-cyan-400">Guard</span>
        <span className="text-slate-100">Map</span>
      </span>
    </div>
  )
}
