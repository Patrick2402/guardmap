import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, db } from '../lib/supabase'
import type { OrgPermissions } from '../lib/database.types'

interface AuthContextValue {
  user: User | null
  session: Session | null
  orgs: OrgPermissions[]
  activeOrg: OrgPermissions | null
  setActiveOrg: (org: OrgPermissions) => void
  loading: boolean
  /** True only during the very first auth check on mount — never becomes true again after that */
  initialLoading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]           = useState<User | null>(null)
  const [session, setSession]     = useState<Session | null>(null)
  const [orgs, setOrgs]           = useState<OrgPermissions[]>([])
  const [activeOrg, setActiveOrg] = useState<OrgPermissions | null>(null)
  const [loading, setLoading]         = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)

  // Prevent onAuthStateChange from running before getSession() finishes
  // (Supabase fires INITIAL_SESSION which would double-load orgs)
  const initialised = useRef(false)
  // Track whether orgs have been loaded at least once — Supabase fires SIGNED_IN
  // again on tab focus (token re-validation), we don't want a full loading screen then
  const orgsLoaded = useRef(false)

  async function loadOrgs(userId: string) {
    try {
      const { data } = await db.myPermissions().select('*')
      const list = (data ?? []) as OrgPermissions[]
      setOrgs(list)
      const saved = localStorage.getItem(`guardmap_active_org_${userId}`)
      const match = list.find(o => o.organization_id === saved) ?? list[0] ?? null
      setActiveOrg(match)
    } catch {
      // network/auth error — leave orgs empty, user can retry
      setOrgs([])
      setActiveOrg(null)
    }
  }

  useEffect(() => {
    // 1. Check current session on mount (synchronous-ish, usually < 50ms)
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          await loadOrgs(session.user.id)
          orgsLoaded.current = true
        }
      })
      .catch(() => { /* no-op — supabase client error */ })
      .finally(() => {
        initialised.current = true
        setLoading(false)
        setInitialLoading(false) // latches false — never goes back to true
      })

    // 2. Listen for sign-in / sign-out events AFTER init
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Skip INITIAL_SESSION — getSession() already handled it
        if (!initialised.current) return

        setSession(session)
        setUser(session?.user ?? null)

        if (event === 'SIGNED_IN') {
          if (!orgsLoaded.current) {
            // First login — show loading screen
            setLoading(true)
            await loadOrgs(session!.user!.id)
            orgsLoaded.current = true
            setLoading(false)
          } else {
            // Tab refocus / token re-validation — reload silently, no spinner
            loadOrgs(session!.user!.id)
          }
        } else if (event === 'SIGNED_OUT') {
          orgsLoaded.current = false
          setOrgs([])
          setActiveOrg(null)
          setLoading(false)
        }
        // TOKEN_REFRESHED, USER_UPDATED etc: just update session silently, no loading screen
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  function handleSetActiveOrg(org: OrgPermissions) {
    setActiveOrg(org)
    if (user) localStorage.setItem(`guardmap_active_org_${user.id}`, org.organization_id ?? '')
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, orgs, activeOrg, setActiveOrg: handleSetActiveOrg, loading, initialLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
