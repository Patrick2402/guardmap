import { useState, useEffect } from 'react'
import { GraphData } from '../types'
import { db } from '../lib/supabase'

export type DataSource = 'mock' | { clusterId: string }

export interface DbFinding {
  type: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  resource: string
  description: string
}

export interface ScanMeta {
  scanId: string
  scannedAt: string
  securityScore: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  durationMs: number | null
  findings: DbFinding[]
}

export function useGraphData(source: DataSource = 'mock') {
  const [data, setData]           = useState<GraphData | null>(null)
  const [scanMeta, setScanMeta]   = useState<ScanMeta | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    setData(null); setScanMeta(null); setError(null); setLoading(true)

    if (source === 'mock') {
      fetch('/data.json')
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
        .then((d: GraphData) => { setData(d); setLoading(false) })
        .catch(e => { setError(e.message); setLoading(false) })
      return
    }

    db.scans()
      .select('id, graph_data, findings, scanned_at, security_score, critical_count, high_count, medium_count, low_count, duration_ms')
      .eq('cluster_id', source.clusterId)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data: row, error: err }) => {
        if (err || !row?.graph_data) {
          setError('No scan data yet — trigger a scan from your cluster agent')
          setLoading(false)
          return
        }
        setData(row.graph_data as unknown as GraphData)
        setScanMeta({
          scanId:        row.id,
          scannedAt:     row.scanned_at,
          securityScore: row.security_score ?? 0,
          criticalCount: row.critical_count ?? 0,
          highCount:     row.high_count ?? 0,
          mediumCount:   row.medium_count ?? 0,
          lowCount:      row.low_count ?? 0,
          durationMs:    row.duration_ms ?? null,
          findings:      (row.findings ?? []) as unknown as DbFinding[],
        })
        setLoading(false)
      })
  }, [typeof source === 'string' ? source : source.clusterId])

  return { data, loading, error, scanMeta }
}
