import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Send, Trash2, AlertCircle, Loader2, ChevronDown } from 'lucide-react'
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
  'What is the blast radius of the payments service?',
  'Are there any shared IAM roles across environments?',
]

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mt-0.5"
          style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(167,139,250,0.2) 100%)', border: '1px solid rgba(34,211,238,0.25)' }}>
          <Sparkles size={11} className="text-cyan-400" />
        </div>
      )}

      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm font-sans leading-relaxed whitespace-pre-wrap ${
        isUser
          ? 'rounded-tr-sm text-slate-100'
          : 'rounded-tl-sm text-slate-200'
      }`}
        style={isUser
          ? { background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.2)' }
          : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }
        }
      >
        {msg.content}
      </div>
    </motion.div>
  )
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5"
    >
      <div className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(167,139,250,0.2) 100%)', border: '1px solid rgba(34,211,238,0.25)' }}>
        <Sparkles size={11} className="text-cyan-400" />
      </div>
      <div className="flex items-center gap-1 px-3.5 py-3 rounded-2xl rounded-tl-sm"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-slate-400"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </motion.div>
  )
}

export function AIChat({ data, clusterName, dbFindings, scanStats }: AIChatProps) {
  const [open, setOpen]   = useState(false)
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  const { messages, loading, error, send, clear } = useAIChat(data, clusterName, dbFindings, scanStats)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  function handleSend() {
    if (!input.trim() || loading) return
    setShowSuggestions(false)
    send(input)
    setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSuggestion(s: string) {
    setShowSuggestions(false)
    send(s)
  }

  const hasData = data !== null

  return (
    <>
      {/* ── Floating button ──────────────────────────────────────────────── */}
      <motion.button
        onClick={() => setOpen(v => !v)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-2xl flex items-center justify-center shadow-2xl"
        style={{
          background: open
            ? 'rgba(10,15,26,0.95)'
            : 'linear-gradient(135deg, rgba(34,211,238,0.25) 0%, rgba(167,139,250,0.25) 100%)',
          border: open
            ? '1px solid rgba(255,255,255,0.1)'
            : '1px solid rgba(34,211,238,0.4)',
          boxShadow: open
            ? '0 8px 32px rgba(0,0,0,0.4)'
            : '0 8px 32px rgba(34,211,238,0.2), 0 0 0 1px rgba(34,211,238,0.1)',
        }}
        title="GuardMap AI"
      >
        <AnimatePresence mode="wait">
          {open
            ? <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <ChevronDown size={18} className="text-slate-400" />
              </motion.div>
            : <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <Sparkles size={18} className="text-cyan-400" />
              </motion.div>
          }
        </AnimatePresence>
      </motion.button>

      {/* ── Chat panel ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-20 right-5 z-50 flex flex-col rounded-2xl overflow-hidden"
            style={{
              width: 380,
              height: 520,
              background: 'rgba(8,12,20,0.97)',
              backdropFilter: 'blur(32px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,211,238,0.06)',
            }}
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(167,139,250,0.2) 100%)', border: '1px solid rgba(34,211,238,0.25)' }}>
                  <Sparkles size={13} className="text-cyan-400" />
                </div>
                <div>
                  <div className="text-sm font-sans font-semibold text-slate-100">GuardMap AI</div>
                  <div className="text-[10px] font-mono text-slate-500">{clusterName}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={clear} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 transition-colors" title="Clear chat">
                    <Trash2 size={13} />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 transition-colors">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-none">
              {/* Welcome */}
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <div className="flex gap-2.5">
                    <div className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mt-0.5"
                      style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(167,139,250,0.2) 100%)', border: '1px solid rgba(34,211,238,0.25)' }}>
                      <Sparkles size={11} className="text-cyan-400" />
                    </div>
                    <div className="text-sm font-sans text-slate-300 leading-relaxed"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '1rem', borderTopLeftRadius: '0.25rem', padding: '0.625rem 0.875rem' }}>
                      {hasData
                        ? `Hi! I've analysed "${clusterName}". Ask me anything about your security posture, IAM permissions, or specific findings.`
                        : 'Load a cluster scan first, then I can answer questions about your security posture.'
                      }
                    </div>
                  </div>

                  {/* Suggestions */}
                  {hasData && showSuggestions && (
                    <div className="space-y-1.5 pl-8">
                      {SUGGESTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => handleSuggestion(s)}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs font-sans text-slate-400 hover:text-slate-200 transition-all"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}

              {loading && <TypingIndicator />}

              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs font-sans text-red-300"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 px-3 pb-3 pt-2"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-end gap-2 rounded-xl px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={hasData ? 'Ask about your cluster…' : 'Load a cluster to start…'}
                  disabled={!hasData || loading}
                  rows={1}
                  className="flex-1 bg-transparent text-sm font-sans text-slate-200 placeholder-slate-600 outline-none resize-none leading-relaxed"
                  style={{ maxHeight: 80, overflowY: 'auto' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading || !hasData}
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                  style={{
                    background: input.trim() && !loading && hasData
                      ? 'linear-gradient(135deg, rgba(34,211,238,0.3) 0%, rgba(167,139,250,0.3) 100%)'
                      : 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {loading
                    ? <Loader2 size={13} className="text-slate-400 animate-spin" />
                    : <Send size={13} className="text-cyan-400" />
                  }
                </button>
              </div>
              <p className="text-[10px] font-mono text-slate-600 text-center mt-1.5">Enter to send · Shift+Enter for newline</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
