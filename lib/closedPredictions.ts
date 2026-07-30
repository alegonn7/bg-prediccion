import type { SupabaseClient } from '@supabase/supabase-js'

// El proyecto de Supabase cap-ea cada respuesta de PostgREST a 1000 filas por pedido,
// sin importar qué .limit()/.range() mande el cliente (confirmado con un curl directo:
// pedir Range 0-9999 devuelve Content-Range 0-999/N). Etapa 16 — para traer más de 1000
// filas hay que paginar de verdad, no alcanza con subir un número.
export const PAGE_SIZE = 1000

// Techo defensivo — `consensus_predictions` (diario) crece ~55 filas/día, a ese ritmo este
// techo no se pisa en años. (El equivalente intradiario ya no hace falta: Backlog post-16 movió
// esas estadísticas a `intraday_scorecard_stats`, agregado en SQL sin límite de filas — ver
// dashboard/lib/intradayScorecardStats.ts.)
export const MAX_ROWS_DAILY = 20000

export const DAILY_CLOSED_SELECT = `id, direction, confidence, direction_correct, actual_final_pct,
    final_pct_predicted, agreement_pct, target_date, horizon_days, created_at,
    asset_id, assets(ticker, name, currency)`

export type ClosedRange = '7d' | '30d' | '90d' | 'month' | 'all'

/** Fecha de corte para un rango, en el formato que espera cada columna (`target_date` es
 *  `date`, `closed_at` es `timestamptz`). `null` = sin piso (rango 'all'). */
export function sinceFor(range: ClosedRange, dateCol: 'target_date' | 'closed_at'): string | null {
  const now = new Date()
  let cutoff: Date
  if (range === '7d') cutoff = new Date(now.getTime() - 7 * 86400000)
  else if (range === '30d') cutoff = new Date(now.getTime() - 30 * 86400000)
  else if (range === '90d') cutoff = new Date(now.getTime() - 90 * 86400000)
  else if (range === 'month') cutoff = new Date(now.getFullYear(), now.getMonth(), 1)
  else return null

  return dateCol === 'target_date' ? cutoff.toISOString().slice(0, 10) : cutoff.toISOString()
}

/**
 * Trae todas las filas `status='closed'` de `table` que cumplan `dateCol >= since` (o todo el
 * historial si `since` es null), paginando de a PAGE_SIZE para esquivar el cap de PostgREST,
 * hasta `maxRows` (las más recientes primero). `truncated=true` avisa que puede haber más
 * filas de las devueltas — el caller tiene que mostrarlo, no esconderlo.
 */
export async function fetchClosedPaginated(
  supabase: SupabaseClient,
  opts: { table: string; dateCol: 'target_date' | 'closed_at' | 'created_at'; select: string; since: string | null; maxRows: number }
): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
  const { table, dateCol, select, since, maxRows } = opts
  const rows: Record<string, unknown>[] = []
  let from = 0

  while (from < maxRows) {
    const to = Math.min(from + PAGE_SIZE, maxRows) - 1
    let query = supabase
      .from(table)
      .select(select)
      .eq('status', 'closed')
      .order(dateCol, { ascending: false })
      .range(from, to)
    if (since) query = query.gte(dateCol, since)

    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break

    // `select`/`table` son strings dinámicos (no literales), así que el cliente de Supabase no
    // puede inferir la forma de la fila y cae a un tipo sentinela — el shape real lo define el
    // `select` que pasa cada caller (page.tsx / la API route), no esta función genérica.
    const page = data as unknown as Record<string, unknown>[]
    rows.push(...page)
    if (page.length < (to - from + 1)) break // página parcial: se acabaron los datos reales
    from += PAGE_SIZE
  }

  return { rows, truncated: rows.length >= maxRows }
}
