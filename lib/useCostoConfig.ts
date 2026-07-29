import { useEffect, useState } from 'react'
import { DEFAULT_COSTO_CONFIG, type Currency, type CostoConfig, type TrackingPortfolio } from './tracking'

/**
 * Trae el costo configurado por moneda (`tracking_portfolios`, privada — por eso vía API route,
 * no query directa desde el browser). Si todavía no existe portfolio para una moneda, se queda
 * con el default de esa moneda (`DEFAULT_COSTO_CONFIG` en `tracking.ts`) — el badge de costo no
 * depende de que el usuario haya usado el módulo de Etapa 19/20 todavía.
 *
 * Separado de `tracking.ts` (Etapa 21): ese archivo lo importa también
 * `app/api/tracking/portfolios/route.ts`, un API route server-only — Next.js/Turbopack no deja
 * que un módulo con hooks de React (useEffect/useState) se importe desde ahí, aunque el route
 * sólo use los tipos/constantes y nunca el hook en sí.
 */
export function useCostoConfig(): { costoConfig: Record<Currency, CostoConfig>; loading: boolean } {
  const [costoConfig, setCostoConfig] = useState<Record<Currency, CostoConfig>>(DEFAULT_COSTO_CONFIG)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/tracking/portfolios')
      .then(r => r.json())
      .then((res: { ok: boolean; portfolios?: TrackingPortfolio[] }) => {
        if (cancelled || !res.ok || !res.portfolios) return
        setCostoConfig(prev => {
          const next = { ...prev }
          for (const p of res.portfolios!) {
            next[p.currency] = { normal: p.costo_ida_vuelta_pct, intradia: p.costo_ida_vuelta_intradia_pct }
          }
          return next
        })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { costoConfig, loading }
}
