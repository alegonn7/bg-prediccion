'use client'
import { useEffect, useRef, useState } from 'react'
import type { IntradayScorecardStats } from './intradayScorecardStats'

/**
 * Igual patrón que useClosedPredictions (Etapa 16): siembra desde `initialStats` (ya calculado
 * por SSR para el rango default) y sólo pega contra /api/intraday-scorecard-stats cuando el
 * usuario cambia de rango.
 */
export function useIntradayScorecardStats(
  range: string,
  initialStats: IntradayScorecardStats,
): { stats: IntradayScorecardStats; loading: boolean } {
  const [stats, setStats] = useState<IntradayScorecardStats>(initialStats)
  const [loading, setLoading] = useState(false)
  const skipNext = useRef(true)

  useEffect(() => {
    if (skipNext.current) { skipNext.current = false; return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/intraday-scorecard-stats?range=${range}`)
      .then(r => r.json())
      .then(json => { if (!cancelled && json.ok) setStats(json.stats) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range])

  return { stats, loading }
}
