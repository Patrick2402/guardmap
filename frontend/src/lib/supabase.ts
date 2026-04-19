import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars')
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// Typed helpers for common queries

export const db = {
  orgs: () => supabase.from('organizations'),
  members: () => supabase.from('organization_members'),
  clusters: () => supabase.from('clusters'),
  scans: () => supabase.from('scan_results'),
  apiKeys: () => supabase.from('api_keys'),
  auditLogs: () => supabase.from('audit_logs'),
  invitations: () => supabase.from('invitations'),
  profiles: () => supabase.from('user_profiles'),
  myPermissions: () => supabase.from('my_org_permissions'),
  notificationChannels: () => supabase.from('notification_channels'),
}
