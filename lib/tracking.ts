export type Currency = 'usd' | 'ars'

export type TrackingPortfolio = {
  id: string
  currency: Currency
  capital_inicial: number
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
  entry_price: number
  status: 'abierta' | 'cerrada_normal' | 'cerrada_por_stop'
  exit_price: number | null
  pnl_pct: number | null
  pnl_monto: number | null
  opened_at: string
  closed_at: string | null
  assets: { ticker: string; name: string } | null
}

export type CapitalCurvePoint = { date: string; capital: number }

/**
 * Curva de capital = capital_inicial + P&L realizado acumulado (sólo trades cerrados,
 * en orden de cierre). Los trades `abierta` no mueven el capital todavía — ver nota de
 * diseño en REDISENO/STATUS.md, entrada de Etapa 20.
 */
export function computeCapitalCurve(portfolio: TrackingPortfolio, trades: TrackingTrade[]) {
  const closed = trades
    .filter(t => t.status !== 'abierta' && t.closed_at != null && t.pnl_monto != null)
    .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime())

  const curve: CapitalCurvePoint[] = [{ date: portfolio.created_at, capital: portfolio.capital_inicial }]
  let running = portfolio.capital_inicial
  for (const t of closed) {
    running += t.pnl_monto!
    curve.push({ date: t.closed_at!, capital: running })
  }

  const capitalActual = running
  const retornoPct = portfolio.capital_inicial > 0
    ? ((capitalActual - portfolio.capital_inicial) / portfolio.capital_inicial) * 100
    : 0

  return { curve, capitalActual, retornoPct }
}

export function formatMoney(n: number, currency: Currency): string {
  return currency === 'usd'
    ? `US$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    : `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}
