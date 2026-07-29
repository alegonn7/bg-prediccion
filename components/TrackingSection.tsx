'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { InfoTip } from './InfoTip'
import {
  computeCapitalCurve, formatMoney, classifyCosto,
  type Currency, type TrackingPortfolio, type TrackingTrade,
} from '@/lib/tracking'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase     = createBrowserClient(SUPABASE_URL, ANON_KEY)

const CURRENCIES: Currency[] = ['ars', 'usd']
const CURRENCY_LABEL: Record<Currency, string> = { ars: 'ARS / CEDEARs', usd: 'USD' }

type PredictionSource = 'daily' | 'intraday'

type OpenPrediction = {
  id: string
  asset_id: string
  direction: string
  stop_loss_pct: number | null
  horizon_label: string
  horizon_value: number
  final_pct_predicted: number
  assets: { ticker: string; name: string; currency: Currency } | null
}

const inp: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '6px 10px', fontSize: 13, color: 'var(--text)', outline: 'none',
  fontFamily: MONO,
}
const btn: React.CSSProperties = {
  background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 6,
  padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: MONO,
}
const card: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
}

async function fetchJson(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts)
  const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
  return { ...j, status: r.status }
}

// ── Curva de capital ─────────────────────────────────────────────────────
function CapitalCurveChart({ curve, currency }: { curve: { date: string; capital: number }[]; currency: Currency }) {
  if (curve.length < 2) {
    return <p style={{ fontSize: 12, color: 'var(--text-hint)' }}>La curva aparece cuando se cierre la primera operación.</p>
  }
  const data = curve.map(p => ({ date: new Date(p.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }), capital: p.capital }))
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tick={{ fontFamily: MONO, fontSize: 9, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} />
        <YAxis hide domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: MONO, fontSize: 11 }}
          formatter={(v) => [formatMoney(Number(v), currency), 'Capital']}
        />
        <Line type="monotone" dataKey="capital" stroke="var(--text)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Card de portfolio (por moneda) ──────────────────────────────────────
function PortfolioCard({
  currency, portfolio, trades, onCreated, onUpdated,
}: {
  currency: Currency
  portfolio: TrackingPortfolio | null
  trades: TrackingTrade[]
  onCreated: (p: TrackingPortfolio) => void
  onUpdated: (p: TrackingPortfolio) => void
}) {
  const [capitalInput, setCapitalInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Etapa 21: costo de ida y vuelta configurable — el default (tabla Balanz) ya viene cargado
  // en `portfolio` desde la creación (columnas con default en la migración), esto sólo permite
  // editarlo después.
  const [costoNormal, setCostoNormal] = useState('')
  const [costoIntradia, setCostoIntradia] = useState('')
  const [savingCosto, setSavingCosto] = useState(false)
  const [costoError, setCostoError] = useState<string | null>(null)
  const [costoSaved, setCostoSaved] = useState(false)

  useEffect(() => {
    if (!portfolio) return
    setCostoNormal(String(portfolio.costo_ida_vuelta_pct))
    setCostoIntradia(String(portfolio.costo_ida_vuelta_intradia_pct))
  }, [portfolio?.costo_ida_vuelta_pct, portfolio?.costo_ida_vuelta_intradia_pct])

  async function handleSaveCosto() {
    const normal = Number(costoNormal)
    const intradia = Number(costoIntradia)
    if (!Number.isFinite(normal) || normal < 0 || !Number.isFinite(intradia) || intradia < 0) {
      setCostoError('Ingresá porcentajes válidos (≥ 0)'); return
    }
    setSavingCosto(true); setCostoError(null); setCostoSaved(false)
    const res = await fetchJson('/api/tracking/portfolios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency, costo_ida_vuelta_pct: normal, costo_ida_vuelta_intradia_pct: intradia }),
    })
    setSavingCosto(false)
    if (res.ok) {
      onUpdated(res.portfolio)
      setCostoSaved(true)
      setTimeout(() => setCostoSaved(false), 2000)
    } else {
      setCostoError(res.error ?? 'No se pudo guardar')
    }
  }

  async function handleCreate() {
    const capital = Number(capitalInput)
    if (!Number.isFinite(capital) || capital <= 0) { setError('Ingresá un capital inicial válido'); return }
    setCreating(true); setError(null)
    const res = await fetchJson('/api/tracking/portfolios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency, capital_inicial: capital }),
    })
    setCreating(false)
    if (res.ok) onCreated(res.portfolio)
    else setError(res.error ?? 'No se pudo crear el portfolio')
  }

  if (!portfolio) {
    return (
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{CURRENCY_LABEL[currency]}</div>
        <p style={{ fontSize: 12, color: 'var(--text-hint)', marginBottom: 10 }}>
          Todavía no cargaste capital inicial para este portfolio.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number" placeholder="Capital inicial" value={capitalInput}
            onChange={e => setCapitalInput(e.target.value)}
            style={{ ...inp, width: 160 }}
          />
          <button style={btn} disabled={creating} onClick={handleCreate}>
            {creating ? 'Creando...' : 'Crear portfolio'}
          </button>
        </div>
        {error && <p style={{ fontSize: 11, color: 'var(--down)', marginTop: 8 }}>{error}</p>}
      </div>
    )
  }

  const portfolioTrades = trades.filter(t => t.portfolio_id === portfolio.id)
  const { curve, capitalActual, retornoPct } = computeCapitalCurve(portfolio, portfolioTrades)
  const abiertas = portfolioTrades.filter(t => t.status === 'abierta').length

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{CURRENCY_LABEL[currency]}</div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Capital inicial</div>
          <div style={{ fontFamily: MONO, fontSize: 15 }}>{formatMoney(portfolio.capital_inicial, currency)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Capital actual</div>
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{formatMoney(capitalActual, currency)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Retorno</div>
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: retornoPct >= 0 ? 'var(--up)' : 'var(--down)' }}>
            {retornoPct >= 0 ? '+' : ''}{retornoPct.toFixed(2)}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Abiertas</div>
          <div style={{ fontFamily: MONO, fontSize: 15 }}>{abiertas}</div>
        </div>
      </div>
      <CapitalCurveChart curve={curve} currency={currency} />
      <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 8 }}>
        Capital actual = capital inicial + P&amp;L realizado de operaciones ya cerradas. Las operaciones
        abiertas no mueven este número hasta que cierren.
      </div>

      {/* Etapa 21: costo de ida y vuelta configurable, usado por los badges ✓/✗ de "Predicciones
          activas" e "Intradiario" y por el aviso al cargar una operación acá abajo. */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
          Costo de ida y vuelta (Balanz)
          <InfoTip text="Comisión + IVA de comprar y vender, usado por el filtro de costo (badges ✓/✗ en Predicciones activas e Intradiario, y el aviso al cargar una operación acá abajo). Default calculado de la tabla de comisiones Balanz 2026 confirmada por vos: 0.50% online + IVA 21% = 0.605% por pata. 'Normal' (1.21% = 0.605%×2) aplica a predicciones diarias; 'Intradía' (0.605% = 0.3025%×2, con la bonificación del 50% de Balanz por mismo plazo/moneda/especie) aplica a predicciones intradiarias. No incluye derechos de mercado de BYMA (margen chico, no cuantificado)." />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Normal %</div>
            <input type="number" step="0.01" value={costoNormal} onChange={e => setCostoNormal(e.target.value)} style={{ ...inp, width: 90 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Intradía %</div>
            <input type="number" step="0.01" value={costoIntradia} onChange={e => setCostoIntradia(e.target.value)} style={{ ...inp, width: 90 }} />
          </div>
          <button style={{ ...btn, opacity: savingCosto ? 0.6 : 1 }} disabled={savingCosto} onClick={handleSaveCosto}>
            {savingCosto ? 'Guardando...' : costoSaved ? 'Guardado ✓' : 'Guardar'}
          </button>
        </div>
        {costoError && <p style={{ fontSize: 11, color: 'var(--down)', marginTop: 6 }}>{costoError}</p>}
      </div>
    </div>
  )
}

// ── Buscador + carga de operación ───────────────────────────────────────
function LoadTradeForm({
  portfolios, onCreated,
}: {
  portfolios: TrackingPortfolio[]
  onCreated: (t: TrackingTrade) => void
}) {
  const [source, setSource] = useState<PredictionSource>('daily')
  const [predictions, setPredictions] = useState<OpenPrediction[]>([])
  const [loadingPreds, setLoadingPreds] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<OpenPrediction | null>(null)
  const [monto, setMonto] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPredictions = useCallback(async (src: PredictionSource) => {
    setLoadingPreds(true)
    if (src === 'daily') {
      const { data } = await supabase
        .from('consensus_predictions')
        .select('id, asset_id, direction, horizon_days, stop_loss_pct, final_pct_predicted, assets(ticker, name, currency)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(500)
      setPredictions((data ?? []).map((p: any) => ({
        id: p.id, asset_id: p.asset_id, direction: p.direction, stop_loss_pct: p.stop_loss_pct,
        horizon_label: `${p.horizon_days}d`, horizon_value: p.horizon_days,
        final_pct_predicted: p.final_pct_predicted, assets: p.assets,
      })))
    } else {
      const { data } = await supabase
        .from('consensus_predictions_intraday')
        .select('id, asset_id, direction, horizon_minutes, stop_loss_pct, final_pct_predicted, assets(ticker, name, currency)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(500)
      setPredictions((data ?? []).map((p: any) => ({
        id: p.id, asset_id: p.asset_id, direction: p.direction, stop_loss_pct: p.stop_loss_pct,
        horizon_label: `${p.horizon_minutes}min`, horizon_value: p.horizon_minutes,
        final_pct_predicted: p.final_pct_predicted, assets: p.assets,
      })))
    }
    setLoadingPreds(false)
  }, [])

  useEffect(() => { loadPredictions(source) }, [source, loadPredictions])

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase()
    if (!q) return predictions.slice(0, 30)
    return predictions.filter(p => p.assets?.ticker.toUpperCase().includes(q)).slice(0, 30)
  }, [predictions, search])

  // Etapa 21: mismo filtro de costo que los badges de "Predicciones activas"/"Intradiario",
  // acá como aviso no bloqueante al elegir qué operación cargar.
  const selectedCosto = useMemo(() => {
    if (!selected?.assets) return null
    const portfolio = portfolios.find(p => p.currency === selected.assets!.currency)
    return classifyCosto({
      finalPctPredicted: selected.final_pct_predicted,
      source,
      horizonValue: selected.horizon_value,
      costoConfig: portfolio
        ? { normal: portfolio.costo_ida_vuelta_pct, intradia: portfolio.costo_ida_vuelta_intradia_pct }
        : undefined,
    })
  }, [selected, source, portfolios])

  function pick(p: OpenPrediction) {
    setSelected(p)
    setMonto('')
    setStopLoss(p.stop_loss_pct != null ? String(p.stop_loss_pct) : '')
    setError(null)
  }

  async function confirm() {
    if (!selected?.assets) return
    const currency = selected.assets.currency
    const portfolio = portfolios.find(p => p.currency === currency)
    if (!portfolio) { setError(`Creá primero el portfolio ${CURRENCY_LABEL[currency]}`); return }

    const montoNum = Number(monto)
    const stopLossNum = Number(stopLoss)
    if (!Number.isFinite(montoNum) || montoNum <= 0) { setError('Ingresá un monto invertido válido'); return }
    if (!Number.isFinite(stopLossNum)) { setError('Ingresá un stop-loss válido'); return }

    setSubmitting(true); setError(null)
    try {
      const quote = await fetchJson(`/api/finnhub/quote?symbol=${encodeURIComponent(selected.assets.ticker)}`)
      const entryPrice = quote?.c as number | undefined
      if (!entryPrice || entryPrice <= 0) { setError('No se pudo obtener el precio en vivo del activo'); return }

      const res = await fetchJson('/api/tracking/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: selected.asset_id,
          prediction_type: source,
          daily_prediction_id: source === 'daily' ? selected.id : null,
          intraday_prediction_id: source === 'intraday' ? selected.id : null,
          direction: selected.direction,
          monto_invertido: montoNum,
          stop_loss_sugerido_pct: selected.stop_loss_pct,
          stop_loss_usado_pct: stopLossNum,
          entry_price: entryPrice,
        }),
      })
      if (res.ok) {
        onCreated(res.trade)
        setSelected(null); setMonto(''); setStopLoss('')
      } else {
        setError(res.error ?? 'No se pudo cargar la operación')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Cargar operación</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button onClick={() => { setSource('daily'); setSelected(null) }}
          style={{ ...btn, background: source === 'daily' ? 'var(--text)' : 'var(--bg-muted)', color: source === 'daily' ? 'var(--bg)' : 'var(--text-muted)' }}>
          Diario
        </button>
        <button onClick={() => { setSource('intraday'); setSelected(null) }}
          style={{ ...btn, background: source === 'intraday' ? 'var(--text)' : 'var(--bg-muted)', color: source === 'intraday' ? 'var(--bg)' : 'var(--text-muted)' }}>
          Intradiario
        </button>
        <input type="text" placeholder="Buscar ticker..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inp, flex: 1, minWidth: 120 }} />
      </div>

      {loadingPreds ? (
        <p style={{ fontSize: 12, color: 'var(--text-hint)' }}>Cargando predicciones abiertas...</p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-hint)' }}>No hay predicciones abiertas que coincidan.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto', marginBottom: selected ? 14 : 0 }}>
          {filtered.map(p => (
            <button key={p.id} onClick={() => pick(p)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 6, textAlign: 'left', cursor: 'pointer',
                background: selected?.id === p.id ? 'var(--bg-muted)' : 'transparent',
                border: `1px solid ${selected?.id === p.id ? 'var(--text-muted)' : 'var(--border)'}`,
                fontFamily: MONO, fontSize: 12, color: 'var(--text)',
              }}>
              <span>{p.assets?.ticker ?? '?'}</span>
              <span style={{ color: p.direction === 'up' ? 'var(--up)' : 'var(--down)' }}>
                {p.direction === 'up' ? '↑' : '↓'} {p.horizon_label}
              </span>
              <span style={{ color: 'var(--text-hint)', fontSize: 11 }}>
                {p.stop_loss_pct != null ? `stop ${p.stop_loss_pct.toFixed(2)}%` : 'sin stop sugerido'}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ fontSize: 12, marginBottom: 10 }}>
            Cargando <strong>{selected.assets?.ticker}</strong> ({selected.direction === 'up' ? 'sube' : 'baja'}, {selected.horizon_label})
          </div>
          {selectedCosto && !selectedCosto.superaCosto && (
            <div style={{
              background: 'var(--down-soft)', border: '1px solid var(--down)33', borderRadius: 8,
              padding: '8px 12px', marginBottom: 10, fontSize: 11, color: 'var(--down)',
            }}>
              ⚠ El movimiento esperado ({selectedCosto.movimientoEsperadoPct.toFixed(2)}%) no supera el costo
              de ida y vuelta configurado ({selectedCosto.costoPct.toFixed(2)}%){!selectedCosto.calibrado
                ? ' — además, la magnitud de este horizonte todavía no está calibrada, puede estar mal escalada'
                : ''}. No bloquea la carga, es sólo información — puede haber otras razones para operarla igual.
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Monto invertido</div>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)} style={{ ...inp, width: 130 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                Stop-loss %
                <InfoTip text="Prellenado con el stop-loss sugerido (Etapa 18, percentil 10 empírico). Es negativo: magnitud del movimiento adverso máximo antes de cerrar la operación. Editable." />
              </div>
              <input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)} style={{ ...inp, width: 100 }} />
            </div>
            <button style={btn} disabled={submitting} onClick={confirm}>
              {submitting ? 'Cargando...' : 'Confirmar operación'}
            </button>
            <button onClick={() => setSelected(null)}
              style={{ ...btn, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Cancelar
            </button>
          </div>
          {error && <p style={{ fontSize: 11, color: 'var(--down)', marginTop: 8 }}>{error}</p>}
        </div>
      )}
    </div>
  )
}

// ── Listado de operaciones ───────────────────────────────────────────────
function TradesList({ trades, portfolios }: { trades: TrackingTrade[]; portfolios: TrackingPortfolio[] }) {
  const portfolioCurrency = (portfolioId: string): Currency =>
    portfolios.find(p => p.id === portfolioId)?.currency ?? 'usd'

  if (trades.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--text-hint)' }}>Todavía no cargaste ninguna operación.</p>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-hint)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>Ticker</th>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>Dir.</th>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>Monto</th>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>Estado</th>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>P&amp;L</th>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>Abierta</th>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>Cerrada</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(t => {
            const currency = portfolioCurrency(t.portfolio_id)
            return (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', fontFamily: MONO }}>
                <td style={{ padding: '6px 8px' }}>{t.assets?.ticker ?? '?'}</td>
                <td style={{ padding: '6px 8px', color: t.direction === 'up' ? 'var(--up)' : 'var(--down)' }}>
                  {t.direction === 'up' ? '↑' : '↓'}
                </td>
                <td style={{ padding: '6px 8px' }}>{formatMoney(t.monto_invertido, currency)}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                  {t.status === 'abierta' ? 'Abierta' : t.status === 'cerrada_por_stop' ? 'Cerrada · stop' : 'Cerrada · normal'}
                </td>
                <td style={{ padding: '6px 8px', color: t.pnl_pct == null ? 'var(--text-hint)' : t.pnl_pct >= 0 ? 'var(--up)' : 'var(--down)' }}>
                  {t.pnl_pct == null ? '—' : `${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct.toFixed(2)}%`}
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--text-hint)' }}>{new Date(t.opened_at).toLocaleDateString('es-AR')}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-hint)' }}>{t.closed_at ? new Date(t.closed_at).toLocaleDateString('es-AR') : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Sección principal ─────────────────────────────────────────────────────
export function TrackingSection() {
  const [portfolios, setPortfolios] = useState<TrackingPortfolio[]>([])
  const [trades, setTrades] = useState<TrackingTrade[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [pRes, tRes] = await Promise.all([
      fetchJson('/api/tracking/portfolios'),
      fetchJson('/api/tracking/trades'),
    ])
    if (pRes.ok) setPortfolios(pRes.portfolios)
    if (tRes.ok) setTrades(tRes.trades)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  if (loading) return <p style={{ fontSize: 13, color: 'var(--text-hint)' }}>Cargando...</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {CURRENCIES.map(currency => (
          <PortfolioCard
            key={currency}
            currency={currency}
            portfolio={portfolios.find(p => p.currency === currency) ?? null}
            trades={trades}
            onCreated={p => setPortfolios(prev => [...prev.filter(x => x.currency !== p.currency), p])}
            onUpdated={p => setPortfolios(prev => prev.map(x => x.currency === p.currency ? p : x))}
          />
        ))}
      </div>

      <LoadTradeForm portfolios={portfolios} onCreated={t => setTrades(prev => [t, ...prev])} />

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Operaciones</div>
        <TradesList trades={trades} portfolios={portfolios} />
      </div>
    </div>
  )
}
