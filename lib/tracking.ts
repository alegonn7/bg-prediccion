export type Currency = 'usd' | 'ars'

export type TrackingPortfolio = {
  id: string
  currency: Currency
  capital_inicial: number
  costo_ida_vuelta_pct: number
  costo_ida_vuelta_intradia_pct: number
  created_at: string
}

export type TrackingTrade = {
  id: string
  portfolio_id: string
  asset_id: string
  prediction_type: 'daily' | 'intraday'
  daily_prediction_id: string | null
  intraday_prediction_id: string | null
  direction: 'up' | 'down'
  monto_invertido: number
  stop_loss_sugerido_pct: number | null
  stop_loss_usado_pct: number
  take_profit_pct: number | null
  entry_price: number
  status: 'abierta' | 'cerrada_normal' | 'cerrada_por_stop' | 'cerrada_por_take_profit'
  exit_price: number | null
  pnl_pct: number | null
  pnl_monto: number | null
  opened_at: string
  closed_at: string | null
  assets: { ticker: string; name: string } | null
}

export type TrackingCapitalMovement = {
  id: string
  portfolio_id: string
  amount: number  // positivo = fondeo, negativo = retiro
  created_at: string
}

export type CapitalCurvePoint = { date: string; capital: number }

/**
 * Curva de capital = capital_inicial + P&L realizado acumulado (trades cerrados) + fondeos/retiros
 * (Backlog post-21), cada uno aplicado en su fecha real — no al principio de la curva, para no
 * fingir que un depósito de hoy estuvo invertido desde el día 1. Los trades `abierta` no mueven el
 * capital todavía — ver nota de diseño en REDISENO/STATUS.md, entrada de Etapa 20.
 *
 * `retornoPct` usa capital total aportado (capital_inicial + fondeos - retiros) como base, no sólo
 * `capital_inicial` — sin esto, fondear la cuenta infla el retorno artificialmente (más capital
 * sin haber generado ese P&L). Es money-weighted, no time-weighted: no corrige por CUÁNDO entró
 * cada peso, así que con movimientos frecuentes es una aproximación, no una métrica de performance
 * exacta — aceptable para el alcance pedido (un tracker simple, no un sistema de atribución).
 */
export function computeCapitalCurve(portfolio: TrackingPortfolio, trades: TrackingTrade[], movements: TrackingCapitalMovement[] = []) {
  const events = [
    ...trades
      .filter(t => t.status !== 'abierta' && t.closed_at != null && t.pnl_monto != null)
      .map(t => ({ date: t.closed_at!, amount: t.pnl_monto! })),
    ...movements.map(m => ({ date: m.created_at, amount: m.amount })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const curve: CapitalCurvePoint[] = [{ date: portfolio.created_at, capital: portfolio.capital_inicial }]
  let running = portfolio.capital_inicial
  for (const e of events) {
    running += e.amount
    curve.push({ date: e.date, capital: running })
  }

  const capitalActual = running
  const totalAportado = portfolio.capital_inicial + movements.reduce((s, m) => s + m.amount, 0)
  const retornoPct = totalAportado > 0
    ? ((capitalActual - totalAportado) / totalAportado) * 100
    : 0

  return { curve, capitalActual, retornoPct, totalAportado }
}

export function formatMoney(n: number, currency: Currency): string {
  return currency === 'usd'
    ? `US$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    : `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

// ── Etapa 21: filtro de costo de operación ──────────────────────────────────────────────────
// Balanz (balanz.com/comisiones/, tabla pegada por el usuario 29/07/2026): 0.50% online + IVA
// 21% = 0.605%/pata. Aplica a ambas monedas (Balanz cobra lo mismo por acciones US y CEDEARs).
// normal 0.605%×2=1.21%, intradía (bonificación 50% de Balanz) 0.3025%×2=0.605%.
export const DEFAULT_COSTO_IDA_VUELTA_PCT = 1.21
export const DEFAULT_COSTO_IDA_VUELTA_INTRADIA_PCT = 0.605

// BYMA (PDF oficial "Derechos de Mercado sobre Operaciones", junio 2026, fuente primaria — ver
// REDISENO/STATUS.md entrada Etapa 21): CEDEARs en CONTADO/PPT pagan 0.05%/pata (0.03%
// negociación + 0.02% post-trade) + IVA = 0.0605%/pata. Bonificación propia de BYMA por Day
// Trading (misma sesión/comitente/especie/moneda/liquidación — condición equivalente a la de
// Balanz) del 30% para CEDEARs, pero SÓLO sobre el componente post-trade, no sobre el total.
// Sólo aplica al lado ARS/CEDEAR (ejecuta en BYMA) — el lado USD opera en mercados de EE.UU.,
// fuera de BYMA/A3/MAV, no le suma nada de esto (fees de esos mercados no investigados, fuera de
// alcance de esta etapa).
//   normal:    (0.605 Balanz + 0.05×1.21=0.0605 BYMA) × 2 = 1.331% ≈ 1.33%
//   intradía:  (0.3025 Balanz + (0.03+0.02×0.70)×1.21=0.05324 BYMA) × 2 = 0.71148% ≈ 0.71%
const COSTO_IDA_VUELTA_PCT_ARS = 1.33
const COSTO_IDA_VUELTA_INTRADIA_PCT_ARS = 0.71

export type CostoConfig = { normal: number; intradia: number }

export const DEFAULT_COSTO_CONFIG: Record<Currency, CostoConfig> = {
  usd: { normal: DEFAULT_COSTO_IDA_VUELTA_PCT, intradia: DEFAULT_COSTO_IDA_VUELTA_INTRADIA_PCT },
  ars: { normal: COSTO_IDA_VUELTA_PCT_ARS, intradia: COSTO_IDA_VUELTA_INTRADIA_PCT_ARS },
}

/**
 * Etapa 17 (diario, 1/7/14d) y Etapa 22 (intradiario, 60/120/240min) calibran `final_pct_predicted`
 * multiplicando la magnitud DESPUÉS de decidir dirección, así que el valor guardado ya es la mejor
 * estimación disponible — acá no hay que reaplicar ningún factor, sólo leer el campo. 30/60/90d
 * diario quedan sin calibrar (Etapa 17 no tenía muestra cerrada para esos horizontes todavía) —
 * el número crudo sigue siendo lo mejor disponible, pero hay que marcarlo como no calibrado para
 * no mentir sobre la incertidumbre (misión del proyecto, ver REDISENO/00-CONTEXTO.md).
 */
export function isMagnitudeCalibrated(source: 'daily' | 'intraday', horizonValue: number): boolean {
  if (source === 'intraday') return true
  return horizonValue === 1 || horizonValue === 7 || horizonValue === 14
}

export type CostoClassification = {
  movimientoEsperadoPct: number
  costoPct: number
  superaCosto: boolean
  calibrado: boolean
}

/**
 * Clasifica una predicción (diaria u intradiaria) contra el costo de ida y vuelta configurado.
 * `finalPctPredicted` tiene que venir de `final_pct_predicted` tal cual está en
 * `consensus_predictions`/`consensus_predictions_intraday` — ya incluye la calibración de
 * Etapa 17/22 cuando corresponde, no es el crudo de un voto individual.
 */
export function classifyCosto(params: {
  finalPctPredicted: number
  source: 'daily' | 'intraday'
  horizonValue: number
  costoConfig: CostoConfig | undefined
}): CostoClassification {
  const { finalPctPredicted, source, horizonValue, costoConfig } = params
  const costoPct = source === 'intraday'
    ? costoConfig?.intradia ?? DEFAULT_COSTO_IDA_VUELTA_INTRADIA_PCT
    : costoConfig?.normal ?? DEFAULT_COSTO_IDA_VUELTA_PCT
  const movimientoEsperadoPct = Math.abs(finalPctPredicted)
  return {
    movimientoEsperadoPct,
    costoPct,
    superaCosto: movimientoEsperadoPct > costoPct,
    calibrado: isMagnitudeCalibrated(source, horizonValue),
  }
}

