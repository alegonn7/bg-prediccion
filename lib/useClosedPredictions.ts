'use client'
import { useEffect, useRef, useState } from 'react'

type FetchResult<T> = { rows: T[]; truncated: boolean; loading: boolean }

/**
 * Etapa 16 — reemplaza el filtro de fecha client-side sobre un array ya truncado por
 * page.tsx por una query real al servidor (/api/closed-predictions) cada vez que cambia
 * `range`. El primer render usa `initialRows`/`initialTruncated` (ya traídos por SSR para el
 * rango por defecto de cada componente) para no disparar un fetch redundante apenas monta.
 */
export function useClosedPredictions<T>(
  type: 'daily' | 'intraday',
  range: string,
  initialRows: T[],
  initialTruncated: boolean,
): FetchResult<T> {
  const [rows, setRows] = useState<T[]>(initialRows)
  const [truncated, setTruncated] = useState(initialTruncated)
  const [loading, setLoading] = useState(false)
  const skipNext = useRef(true)

  useEffect(() => {
    if (skipNext.current) { skipNext.current = false; return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/closed-predictions?type=${type}&range=${range}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        if (json.ok) { setRows(json.rows); setTruncated(json.truncated) }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [type, range])

  return { rows, truncated, loading }
}
