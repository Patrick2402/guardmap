import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export interface ScanSummary {
  id: string
  scannedAt: string
  securityScore: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  durationMs: number | null
}

export function useScanHistory(clusterId: string | null, limit = 20) {
  const [scans, setScans]     = useState<ScanSummary[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clusterId) { setScans([]); return }
    setLoading(true)

    db.scans()
      .select('id, scanned_at, security_score, critical_count, high_count, medium_count, low_count, duration_ms')
      .eq('cluster_id', clusterId)
      .order('scanned_at', { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        setScans((data ?? []).map(r => ({
          id:            r.id,
          scannedAt:     r.scanned_at,
          securityScore: r.security_score ?? 0,
          criticalCount: r.critical_count ?? 0,
          highCount:     r.high_count ?? 0,
          mediumCount:   r.medium_count ?? 0,
          lowCount:      r.low_count ?? 0,
          durationMs:    r.duration_ms ?? null,
        })))
        setLoading(false)
      })
  }, [clusterId, limit])

  return { scans, loading }
}
