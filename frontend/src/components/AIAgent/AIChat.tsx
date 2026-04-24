import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Send, Trash2, AlertCircle, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { GraphData } from '../../types'
import { DbFinding } from '../../hooks/useGraphData'
import { useAIChat, ChatMessage } from '../../hooks/useAIChat'

interface AIChatProps {
  data: GraphData | null
  clusterName: string
  dbFindings?: DbFinding[]
  scanStats?: { critical: number; high: number; medium: number; low: number }
}

const SUGGESTIONS = [
  'What are my most critical security issues?',
  'Which workloads have wildcard IAM access?',
  'How do I fix the privileged container findings?',
  'What is the blast radius if payments-api is compromised?',
  'Are there shared IAM roles across environments?',
  'Which services route to redis?',
]

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-xl flex items-center justify-center mt-0.5"
          style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(167,139,250,0.2) 100%)', border: '1px solid rgba(34,211,238,0.25)' }}>
          <Sparkles size={13} className="text-cyan-400" />
        </div>
      )}
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm font-sans leading-relaxed ${
          isUser ? 'rounded-tr-sm text-slate-100' : 'rounded-tl-sm text-slate-200'
        }`}
        style={isUser
          ? { background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.2)' }
          : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }
        }
      >
        {isUser ? (
          <span>{msg.content}</span>
        ) : (
          <ReactMarkdown
            components={{
              p:          ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong:     ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
              em:         ({ children }) => <em className="italic text-slate-300">{children}</em>,
              ul:         ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2 last:mb-0">{children}</ul>,
              ol:         ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2 last:mb-0">{children}</ol>,
              li:         ({ children }) => <li className="text-slate-300">{children}</li>,
              h3:         ({ children }) => <h3 className="font-semibold text-slate-100 mt-2 mb-1">{children}</h3>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-cyan-500/40 pl-3 text-slate-400 italic my-1">{children}</blockquote>,
              pre:        ({ children }) => <>{children}</>,
              code: ({ children, className }) => {
                const isBlock = className?.includes('language-')
                return isBlock
                  ? <code className="block bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-xs font-mono text-cyan-300 overflow-x-auto my-2 whitespace-pre">{children}</code>
                  : <code className="bg-black/30 border border-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-cyan-300">{children}</code>
              },
            }}
          >
            {msg.content}
          </ReactMarkdown>
        )}
      </div>
    </motion.div>
  )
}

function TypingIndicator() {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <div className="shrink-0 w-7 h-7 rounded-xl flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(167,139,250,0.2) 100%)', border: '1px solid rgba(34,211,238,0.25)' }}>
        <Sparkles size={13} className="text-cyan-400" />
      </div>
      <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-tl-sm"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {[0, 1, 2].map(i => (
          <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
        ))}
      </div>
    </motion.div>
  )
}

export function AIChat({ data, clusterName, dbFindings, scanStats }: AIChatProps) {
  const [open, setOpen]             = useState(false)
  const [input, setInput]           = useState('')
  const [showSuggestions, setShowSuggestions] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  const { messages, loading, error, send, clear } = useAIChat(data, clusterName, dbFindings, scanStats)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200)
  }, [open])

  function handleSend() {
    if (!input.trim() || loading) return
    setShowSuggestions(false)
    send(input)
    setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function handleSuggestion(s: string) {
    setShowSuggestions(false)
    send(s)
  }

  const hasData = data !== null

  return (
    <>
      {/* ── Floating trigger button ─────────────────────────────────────── */}
      <motion.button
        onClick={() => setOpen(v => !v)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 pl-3 pr-4 h-11 rounded-2xl shadow-2xl"
        style={{
          background: open
            ? 'rgba(10,15,26,0.95)'
            : 'linear-gradient(135deg, rgba(34,211,238,0.18) 0%, rgba(167,139,250,0.18) 100%)',
          border: open
            ? '1px solid rgba(255,255,255,0.1)'
            : '1px solid rgba(34,211,238,0.35)',
          boxShadow: open
            ? '0 8px 32px rgba(0,0,0,0.4)'
            : '0 8px 32px rgba(34,211,238,0.15), 0 0 0 1px rgba(34,211,238,0.08)',
        }}
        title="GuardMap AI"
      >
        <Sparkles size={15} className={open ? 'text-slate-500' : 'text-cyan-400'} />
        <span className={`text-sm font-sans font-semibold ${open ? 'text-slate-400' : 'text-slate-200'}`}>
          {open ? 'Close AI' : 'Ask AI'}
        </span>
      </motion.button>

      {/* ── Side panel ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — subtle, doesn't block graph interaction */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(1px)' }}
              onClick={() => setOpen(false)}
            />

            <motion.div
              key="panel"
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
              style={{
                width: 460,
                background: 'rgba(7,11,18,0.98)',
                backdropFilter: 'blur(40px)',
                borderLeft: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '-24px 0 80px rgba(0,0,0,0.6)',
              }}
            >
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between px-5 py-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(167,139,250,0.2) 100%)', border: '1px solid rgba(34,211,238,0.3)' }}>
                    <Sparkles size={15} className="text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-[15px] font-sans font-semibold text-slate-100">GuardMap AI</div>
                    <div className="text-[11px] font-mono text-slate-500">{clusterName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <button onClick={clear}
                      className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
                      title="Clear conversation">
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button onClick={() => setOpen(false)}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-none">

                {/* Welcome + suggestions */}
                {messages.length === 0 && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <div className="flex gap-3">
                      <div className="shrink-0 w-7 h-7 rounded-xl flex items-center justify-center mt-0.5"
                        style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(167,139,250,0.2) 100%)', border: '1px solid rgba(34,211,238,0.25)' }}>
                        <Sparkles size={13} className="text-cyan-400" />
                      </div>
                      <div className="text-sm font-sans text-slate-300 leading-relaxed rounded-2xl rounded-tl-sm px-4 py-3"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        {hasData
                          ? <>Hi! I have full access to <span className="text-cyan-400 font-medium">{clusterName}</span> — findings, IAM chains, service bindings, RBAC. Ask me anything.</>
                          : 'Load a cluster scan first, then I can answer questions about your security posture.'
                        }
                      </div>
                    </div>

                    {hasData && showSuggestions && (
                      <div className="pl-10 space-y-1.5">
                        <p className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-2">Suggestions</p>
                        {SUGGESTIONS.map(s => (
                          <button key={s} onClick={() => handleSuggestion(s)}
                            className="w-full text-left px-3.5 py-2.5 rounded-xl text-[13px] font-sans text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all"
                            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

                {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                {loading && <TypingIndicator />}

                {error && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm font-sans text-red-300"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </motion.div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="shrink-0 px-4 pb-4 pt-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-end gap-2.5 rounded-2xl px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => {
                      setInput(e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={hasData ? 'Ask about your cluster…' : 'Load a cluster first…'}
                    disabled={!hasData || loading}
                    rows={1}
                    className="flex-1 bg-transparent text-sm font-sans text-slate-200 placeholder-slate-600 outline-none resize-none leading-relaxed"
                    style={{ maxHeight: 120, overflowY: 'auto' }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || loading || !hasData}
                    className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-25"
                    style={{
                      background: input.trim() && !loading && hasData
                        ? 'linear-gradient(135deg, rgba(34,211,238,0.3) 0%, rgba(167,139,250,0.3) 100%)'
                        : 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {loading
                      ? <Loader2 size={14} className="text-slate-400 animate-spin" />
                      : <Send size={14} className="text-cyan-400" />
                    }
                  </button>
                </div>
                <p className="text-[10px] font-mono text-slate-700 text-center mt-2">Enter to send · Shift+Enter for newline</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
