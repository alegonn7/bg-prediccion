import type { SupabaseClient } from '@supabase/supabase-js'

export type IntradayScorecardStats = {
  overall: {
    n: number; ok: number; acc: number | null; mae: number | null
    capturedPct: number | null; capturedN: number
  }
  byHorizon: { label: string; n: number; ok: number; acc: number | null; mae: number | null }[]
}

export const EMPTY_INTRADAY_STATS: IntradayScorecardStats = {
  overall: { n: 0, ok: 0, acc: null, mae: null, capturedPct: null, capturedN: 0 },
  byHorizon: [],
}

/**
 * Backlog post-16: agregados de "¿Funciona?" para intradiario, calculados en SQL
 * (`intraday_scorecard_stats`, ver migración add_intraday_scorecard_stats_function) sobre TODO
 * el rango pedido — reemplaza el cálculo client-side que hacía Scorecard.tsx sobre filas crudas
 * traídas al navegador, que Etapa 16 había tenido que cappear a 10.000 filas por volumen.
 */
export async function fetchIntradayScorecardStats(
  supabase: SupabaseClient,
  since: string | null,
): Promise<IntradayScorecardStats> {
  const { data, error } = await supabase.rpc('intraday_scorecard_stats', { p_since: since })
  if (error) throw error
  return (data as IntradayScorecardStats) ?? EMPTY_INTRADAY_STATS
}
