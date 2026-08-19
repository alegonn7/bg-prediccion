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
  cantidad: number | null
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
export function computeCapitalCurve(
  portfolio: Pick<TrackingPortfolio, 'capital_inicial' | 'created_at'>,
  trades: Pick<TrackingTrade, 'status' | 'closed_at' | 'pnl_monto'>[],
  movements: TrackingCapitalMovement[] = []
) {
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

// ── Etapa 21 (+ Etapa 30, recalibrado a IOL): filtro de costo de operación ────────────────────
// Etapa 30 (18/08/2026): reemplaza los defaults de Balanz por los de IOL invertironline
// (tarifario oficial pegado por el usuario, iol.invertironline.com/servicios/tarifas), que es el
// broker real contra el que va a operar el motor automático. Perfil Gold (el más conservador, el
// que aplica hasta $7.500.000/mes operado) — si el usuario sube de categoría, Platinum/Black bajan
// el costo y el filtro se vuelve más permisivo, nunca al revés, así que Gold es el default seguro.
//
// USD / EEUU directo (Cuenta Estados Unidos, activada vía CCL) y ADR argentino en NYSE
// (`core_bucket` 'us'/'adr_arg' — ver `routeInstrument()` más abajo): comisión 0.35%+IVA(21%) =
// 0.4235%/pata, mínimo US$2+IVA=US$2.42/operación (no modelado acá, es un piso aparte del %, ver
// nota en `routeInstrument`). IOL NO bonifica operatoria intradiaria en mercados de EE.UU. (la
// bonificación es sólo "mercado de Argentina", tarifario IOL) — mismo costo normal e intradía.
//   normal e intradía: 0.4235% × 2 = 0.847% ≈ 0.85%
export const DEFAULT_COSTO_IDA_VUELTA_PCT = 0.85
export const DEFAULT_COSTO_IDA_VUELTA_INTRADIA_PCT = 0.85

// ARS / CEDEAR / acción argentina local en BYMA (`core_bucket` 'cedear_arg'/'accion_arg_local'):
// comisión IOL 0.5%+IVA=0.605%/pata + derecho de mercado (acciones y CEDEARs) 0.05%+IVA=0.0605%/pata
// = 0.6655%/pata.
//   normal (2 patas, sin bonificación): 0.6655% × 2 = 1.331% ≈ 1.33%
//   intradía: IOL bonifica al 100% una de las dos patas ("operatoria intradiaria" — venta de lo
//   comprado hoy, o recompra de lo vendido hoy, mismo símbolo/plazo/moneda, cantidad ≤ la primera
//   pata), no un descuento parejo del 50% en ambas como hacía Balanz. Sólo paga 1 pata completa:
//   0.6655% × 1 = 0.6655% ≈ 0.67%
const COSTO_IDA_VUELTA_PCT_ARS = 1.33
const COSTO_IDA_VUELTA_INTRADIA_PCT_ARS = 0.67

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

// ── Etapa 30: ruteo de instrumento (CEDEAR/BYMA vs. EEUU directo) ──────────────────────────────
// `assets.core_bucket` real (confirmado por SQL, 18/08/2026): 'us' (36, acciones EEUU), 'adr_arg'
// (11, ADRs argentinos que cotizan directo en NYSE en USD), 'cedear_arg' (33, CEDEARs en BYMA en
// ARS), 'accion_arg_local' (20, acciones argentinas locales en BYMA en ARS), 'cedear_underlying'
// (8, la contraparte en USD de un CEDEAR — sólo señal, no siempre tiene venue propio).
export type CoreBucket = 'us' | 'adr_arg' | 'cedear_arg' | 'accion_arg_local' | 'cedear_underlying' | null

export type Venue = 'US' | 'BYMA' | null

/**
 * A qué mercado rutear la ejecución de un activo. 'US' = Cuenta Estados Unidos de IOL (más barato
 * sin operatoria intradía, más líquido, señal más limpia — ver REDISENO/ETAPA-30). 'BYMA' = CEDEAR/
 * acción local (más caro salvo intradía, donde la bonificación de IOL lo hace más barato que EEUU).
 * `cedear_underlying` no tiene venue propio: si la misma compañía ya está en el universo como 'us',
 * ejecutar ahí (evita abrir dos posiciones de la misma empresa); si no, devuelve null — esa fila es
 * sólo informativa (señal), no se opera directamente.
 */
export function routeInstrument(coreBucket: CoreBucket, hasUsCounterpart: boolean = false): Venue {
  if (coreBucket === 'us' || coreBucket === 'adr_arg') return 'US'
  if (coreBucket === 'cedear_arg' || coreBucket === 'accion_arg_local') return 'BYMA'
  if (coreBucket === 'cedear_underlying') return hasUsCounterpart ? 'US' : null
  return null
}

/** Costo a aplicar según venue, no según la moneda del portfolio — 'US' siempre paga el costo USD
 * (sin bonificación intradía) aunque el activo subyacente sea una empresa argentina (ADR). */
export function costoConfigForVenue(venue: Venue, costoConfig: Record<Currency, CostoConfig>): CostoConfig {
  return venue === 'US' ? costoConfig.usd : costoConfig.ars
}

// ── Etapa 30: motor de trading automático (papel) ───────────────────────────────────────────
export type AutoTradingConfig = {
  id: true
  kill_switch: boolean
  max_position_pct_capital: number
  max_daily_loss_pct: number
  max_concurrent_positions: number
  // Etapa 30 (continuación, 19/08/2026): controles de plata real, antes sólo editables por SQL.
  override_statistical_gate: boolean
  live_enabled_byma: boolean
  live_enabled_us: boolean
  live_position_pct: number
  live_capital_intraday_ars: number
  live_capital_daily_ars: number
  live_capital_usd: number
  // Etapa 30 (continuación, 19/08/2026): foto del efectivo real, la escribe python-api en cada
  // corrida — el dashboard no tiene acceso directo a IOL.
  last_known_ars_cash: number | null
  last_known_usd_cash: number | null
  last_known_cash_at: string | null
  updated_at: string
}

export type AutoPortfolio = {
  id: string
  currency: Currency
  capital_inicial: number
  created_at: string
}

export type AutoTrade = {
  id: string
  portfolio_id: string
  asset_id: string
  prediction_type: 'daily' | 'intraday'
  daily_prediction_id: string | null
  intraday_prediction_id: string | null
  direction: 'up'
  venue: 'BYMA' | 'US'
  modo: 'papel' | 'vivo'
  horizon_value: number
  horizon_unit: 'minutes' | 'days'
  bolsa_estado_al_entrar: string
  bolsa_expectancy_net_at_entry: number | null
  monto_invertido: number
  cantidad: number | null
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

