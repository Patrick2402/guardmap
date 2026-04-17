import { useEffect, useState, useCallback } from 'react'
import { db } from '../lib/supabase'
import type { Cluster } from '../lib/database.types'

export function useClusters(orgId: string | null) {
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [loading, setLoading]   = useState(true)

  const load = useCallback(async () => {
    if (!orgId) { setClusters([]); setLoading(false); return }
    setLoading(true)
    const { data } = await db.clusters()
      .select('*')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    setClusters((data ?? []) as Cluster[])
    setLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  return { clusters, loading, reload: load }
}
