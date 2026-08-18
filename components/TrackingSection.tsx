'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { InfoTip } from './InfoTip'
import {
  computeCapitalCurve, formatMoney, classifyCosto,
  type Currency, type TrackingPortfolio, type TrackingTrade, type TrackingCapitalMovement,
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
  assets: { ticker: string; name: string; currency: Currency; core_bucket: string | null } | null
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
  currency, portfolio, trades, movements, onCreated, onUpdated, onMovementAdded,
}: {
  currency: Currency
  portfolio: TrackingPortfolio | null
  trades: TrackingTrade[]
  movements: TrackingCapitalMovement[]
  onCreated: (p: TrackingPortfolio) => void
  onUpdated: (p: TrackingPortfolio) => void
  onMovementAdded: (m: TrackingCapitalMovement) => void
}) {
  const [capitalInput, setCapitalInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Etapa 21 (+ backlog, a pedido explícito del usuario): capital inicial y costo de ida y vuelta
  // configurables — el default de costo (tabla Balanz) ya viene cargado en `portfolio` desde la
  // creación (columnas con default en la migración), esto permite editar ambos cuando quiera.
  const [capitalEdit, setCapitalEdit] = useState('')
  const [costoNormal, setCostoNormal] = useState('')
  const [costoIntradia, setCostoIntradia] = useState('')
  const [savingCosto, setSavingCosto] = useState(false)
  const [costoError, setCostoError] = useState<string | null>(null)
  const [costoSaved, setCostoSaved] = useState(false)

  useEffect(() => {
    if (!portfolio) return
    setCapitalEdit(String(portfolio.capital_inicial))
    setCostoNormal(String(portfolio.costo_ida_vuelta_pct))
    setCostoIntradia(String(portfolio.costo_ida_vuelta_intradia_pct))
  }, [portfolio?.capital_inicial, portfolio?.costo_ida_vuelta_pct, portfolio?.costo_ida_vuelta_intradia_pct])

  async function handleSavePortfolio() {
    const capital = Number(capitalEdit)
    const normal = Number(costoNormal)
    const intradia = Number(costoIntradia)
    if (!Number.isFinite(capital) || capital <= 0) { setCostoError('Ingresá un capital inicial válido'); return }
    if (!Number.isFinite(normal) || normal < 0 || !Number.isFinite(intradia) || intradia < 0) {
      setCostoError('Ingresá porcentajes de costo válidos (≥ 0)'); return
    }
    setSavingCosto(true); setCostoError(null); setCostoSaved(false)
    const res = await fetchJson('/api/tracking/portfolios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currency, capital_inicial: capital,
        costo_ida_vuelta_pct: normal, costo_ida_vuelta_intradia_pct: intradia,
      }),
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

  // Backlog post-21 (a pedido explícito del usuario): fondear/retirar, separado de editar
  // capital_inicial — ver comentario de computeCapitalCurve() en lib/tracking.ts para el porqué.
  const [movType, setMovType] = useState<'deposito' | 'retiro'>('deposito')
  const [movAmount, setMovAmount] = useState('')
  const [savingMov, setSavingMov] = useState(false)
  const [movError, setMovError] = useState<string | null>(null)

  async function handleAddMovement() {
    const amount = Number(movAmount)
    if (!Number.isFinite(amount) || amount <= 0) { setMovError('Ingresá un monto válido (> 0)'); return }
    if (!portfolio) return
    setSavingMov(true); setMovError(null)
    const res = await fetchJson('/api/tracking/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolio_id: portfolio.id, type: movType, amount }),
    })
    setSavingMov(false)
    if (res.ok) {
      onMovementAdded(res.movement)
      setMovAmount('')
    } else {
      setMovError(res.error ?? 'No se pudo registrar el movimiento')
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
  const portfolioMovements = movements.filter(m => m.portfolio_id === portfolio.id)
  const { curve, capitalActual, retornoPct, totalAportado } = computeCapitalCurve(portfolio, portfolioTrades, portfolioMovements)
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
        {portfolioMovements.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Total aportado</div>
            <div style={{ fontFamily: MONO, fontSize: 15 }}>{formatMoney(totalAportado, currency)}</div>
          </div>
        )}
      </div>
      <CapitalCurveChart curve={curve} currency={currency} />
      <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 8 }}>
        Capital actual = capital inicial + fondeos/retiros + P&amp;L realizado de operaciones ya
        cerradas. Las operaciones abiertas no mueven este número hasta que cierren. Retorno % es
        sobre el total aportado (capital inicial + fondeos − retiros), no sólo el capital inicial.
      </div>

      {/* Backlog post-21: fondear/retirar, separado de "editar capital inicial" de abajo — un
          fondeo se suma en la fecha real en que se carga, no reescribe el punto de partida de la
          curva (ver computeCapitalCurve() en lib/tracking.ts). */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
          Fondear / retirar
          <InfoTip text="Registra un depósito o retiro de capital en la fecha de hoy — a diferencia de editar 'Capital inicial' de abajo, esto no reescribe el punto de partida de la curva: el monto se suma/resta a partir de ahora, así el retorno % de lo que ya operaste no se distorsiona." />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setMovType('deposito')}
              style={{ ...btn, padding: '6px 12px', background: movType === 'deposito' ? 'var(--up)' : 'var(--bg-muted)', color: movType === 'deposito' ? '#fff' : 'var(--text-muted)' }}>
              + Fondear
            </button>
            <button onClick={() => setMovType('retiro')}
              style={{ ...btn, padding: '6px 12px', background: movType === 'retiro' ? 'var(--down)' : 'var(--bg-muted)', color: movType === 'retiro' ? '#fff' : 'var(--text-muted)' }}>
              − Retirar
            </button>
          </div>
          <input type="number" placeholder="Monto" value={movAmount} onChange={e => setMovAmount(e.target.value)} style={{ ...inp, width: 110 }} />
          <button style={{ ...btn, opacity: savingMov ? 0.6 : 1 }} disabled={savingMov} onClick={handleAddMovement}>
            {savingMov ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
        {movError && <p style={{ fontSize: 11, color: 'var(--down)', marginTop: 6 }}>{movError}</p>}
        {portfolioMovements.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 100, overflowY: 'auto' }}>
            {portfolioMovements.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: MONO, color: 'var(--text-hint)' }}>
                <span>{new Date(m.created_at).toLocaleDateString('es-AR')}</span>
                <span style={{ color: m.amount >= 0 ? 'var(--up)' : 'var(--down)' }}>
                  {m.amount >= 0 ? '+' : ''}{formatMoney(m.amount, currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Etapa 21 (+ backlog): capital inicial y costo de ida y vuelta, editables cuando quiera —
          el costo alimenta los badges ✓/✗ de "Predicciones activas"/"Intradiario" y el filtro de
          "Operaciones" más abajo. */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
          Editar portfolio
          <InfoTip text="Capital inicial: base de la curva de capital y el retorno % — corregilo cuando quieras, recalcula todo con el valor nuevo. Costo de ida y vuelta: comisión + IVA de comprar y vender, usado por el filtro de costo (badges ✓/✗ en Predicciones activas e Intradiario, y el filtro de Operaciones). Default calculado del tarifario oficial de IOL invertironline (perfil Gold, + derecho de mercado en ARS): 'Normal' aplica a predicciones diarias, 'Intradía' (con la bonificación de operatoria intradiaria de IOL, sólo mercado argentino) a predicciones intradiarias." />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Capital inicial</div>
            <input type="number" value={capitalEdit} onChange={e => setCapitalEdit(e.target.value)} style={{ ...inp, width: 110 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Costo normal %</div>
            <input type="number" step="0.01" value={costoNormal} onChange={e => setCostoNormal(e.target.value)} style={{ ...inp, width: 90 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Costo intradía %</div>
            <input type="number" step="0.01" value={costoIntradia} onChange={e => setCostoIntradia(e.target.value)} style={{ ...inp, width: 90 }} />
          </div>
          <button style={{ ...btn, opacity: savingCosto ? 0.6 : 1 }} disabled={savingCosto} onClick={handleSavePortfolio}>
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
  const [horizonFilter, setHorizonFilter] = useState<number | null>(null)
  const [onlyCedears, setOnlyCedears] = useState(false)
  const [selected, setSelected] = useState<OpenPrediction | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [takeProfitPrice, setTakeProfitPrice] = useState('')
  const [entryPriceInput, setEntryPriceInput] = useState('')
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPredictions = useCallback(async (src: PredictionSource) => {
    setLoadingPreds(true)
    if (src === 'daily') {
      const { data } = await supabase
        .from('consensus_predictions')
        .select('id, asset_id, direction, horizon_days, stop_loss_pct, final_pct_predicted, assets(ticker, name, currency, core_bucket)')
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
        .select('id, asset_id, direction, horizon_minutes, stop_loss_pct, final_pct_predicted, assets(ticker, name, currency, core_bucket)')
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
  useEffect(() => { setHorizonFilter(null) }, [source])

  function costoFor(p: OpenPrediction) {
    const portfolio = p.assets ? portfolios.find(pf => pf.currency === p.assets!.currency) : undefined
    return classifyCosto({
      finalPctPredicted: p.final_pct_predicted,
      source,
      horizonValue: p.horizon_value,
      costoConfig: portfolio
        ? { normal: portfolio.costo_ida_vuelta_pct, intradia: portfolio.costo_ida_vuelta_intradia_pct }
        : undefined,
    })
  }

  // Backlog post-21, a pedido explícito del usuario: acá (a diferencia de "Predicciones activas"/
  // "Intradiario", que siguen mostrando todo) el buscador de operaciones filtra de verdad — sólo
  // alcistas (el usuario no opera en corto) y que superen el costo configurado. No se muestra un
  // "no cubre el costo" silencioso: directamente no aparece en la lista. `onlyCedears` (toggle,
  // pedido después) usa `core_bucket==='cedear_arg'`, no `currency==='ars'` — hoy coinciden 1 a 1
  // (10/10 activos core, confirmado por SQL) pero `core_bucket` es la fuente correcta si algún día
  // se agrega otro tipo de activo en pesos que no sea CEDEAR.
  const qualifying = useMemo(() => {
    return predictions
      .filter(p => p.direction === 'up')
      .filter(p => !onlyCedears || p.assets?.core_bucket === 'cedear_arg')
      .map(p => ({ pred: p, costo: costoFor(p) }))
      .filter(x => x.costo.superaCosto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictions, portfolios, source, onlyCedears])

  const horizons = useMemo(
    () => [...new Set(qualifying.map(x => x.pred.horizon_value))].sort((a, b) => a - b),
    [qualifying]
  )

  // Top 5 por horizonte, rankeadas por movimiento esperado (magnitud calibrada) descendente — el
  // filtro de horizonte no cambia el criterio, sólo achica qué horizontes se muestran.
  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase()
    let list = qualifying
    if (q) list = list.filter(x => x.pred.assets?.ticker.toUpperCase().includes(q))
    if (horizonFilter !== null) list = list.filter(x => x.pred.horizon_value === horizonFilter)

    const byHorizon = new Map<number, typeof list>()
    for (const item of list) {
      const arr = byHorizon.get(item.pred.horizon_value) ?? []
      arr.push(item)
      byHorizon.set(item.pred.horizon_value, arr)
    }
    const top: typeof list = []
    for (const h of [...byHorizon.keys()].sort((a, b) => a - b)) {
      top.push(...byHorizon.get(h)!.sort((a, b) => b.costo.movimientoEsperadoPct - a.costo.movimientoEsperadoPct).slice(0, 5))
    }
    return top
  }, [qualifying, search, horizonFilter])

  // Mismo cálculo de costo que arriba, acá contra la predicción ya elegida — si llegó a la lista de
  // arriba ya sabemos que supera el costo, pero se reusa para mostrar los números en el resumen.
  const selectedCosto = useMemo(() => {
    if (!selected?.assets) return null
    return costoFor(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, source, portfolios])

  async function pick(p: OpenPrediction) {
    setSelected(p)
    setCantidad('')
    setStopLoss(p.stop_loss_pct != null ? String(p.stop_loss_pct) : '')
    setTakeProfit('')
    setTakeProfitPrice('')
    setEntryPriceInput('')
    setError(null)
    if (!p.assets) return
    setFetchingPrice(true)
    const quote = await fetchJson(`/api/finnhub/quote?symbol=${encodeURIComponent(p.assets.ticker)}`)
    setFetchingPrice(false)
    const live = quote?.c as number | undefined
    if (live && live > 0) setEntryPriceInput(String(live))
  }

  // Take-profit % ↔ precio objetivo, enlazados en las dos direcciones (a pedido explícito del
  // usuario: "tener ambas cosas y que se autocomplete"). take_profit_pct sigue siendo lo único que
  // se manda al servidor (columna existente, positivo = magnitud a favor sin importar dirección) —
  // el precio es sólo una forma más cómoda de escribirlo, no se guarda aparte.
  function onTakeProfitPctChange(v: string) {
    setTakeProfit(v)
    const pct = Number(v)
    const entry = Number(entryPriceInput)
    if (v.trim() === '' ) { setTakeProfitPrice(''); return }
    if (!Number.isFinite(pct) || !Number.isFinite(entry) || entry <= 0 || !selected) return
    const price = selected.direction === 'up' ? entry * (1 + pct / 100) : entry * (1 - pct / 100)
    setTakeProfitPrice(price > 0 ? price.toFixed(2) : '')
  }

  function onTakeProfitPriceChange(v: string) {
    setTakeProfitPrice(v)
    const price = Number(v)
    const entry = Number(entryPriceInput)
    if (v.trim() === '') { setTakeProfit(''); return }
    if (!Number.isFinite(price) || !Number.isFinite(entry) || entry <= 0 || !selected) return
    const pct = selected.direction === 'up' ? (price - entry) / entry * 100 : (entry - price) / entry * 100
    setTakeProfit(pct > 0 ? pct.toFixed(2) : '')
  }

  async function confirm() {
    if (!selected?.assets) return
    const currency = selected.assets.currency
    const portfolio = portfolios.find(p => p.currency === currency)
    if (!portfolio) { setError(`Creá primero el portfolio ${CURRENCY_LABEL[currency]}`); return }

    const cantidadNum = Number(cantidad)
    const stopLossNum = Number(stopLoss)
    const takeProfitNum = takeProfit.trim() === '' ? null : Number(takeProfit)
    const entryPrice = Number(entryPriceInput)
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) { setError('Ingresá una cantidad válida'); return }
    if (!Number.isFinite(stopLossNum)) { setError('Ingresá un stop-loss válido'); return }
    if (takeProfitNum != null && (!Number.isFinite(takeProfitNum) || takeProfitNum <= 0)) {
      setError('El take-profit tiene que ser un número positivo (o dejarlo vacío)'); return
    }
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) { setError('Ingresá un precio de entrada válido'); return }

    setSubmitting(true); setError(null)
    try {
      const res = await fetchJson('/api/tracking/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: selected.asset_id,
          prediction_type: source,
          daily_prediction_id: source === 'daily' ? selected.id : null,
          intraday_prediction_id: source === 'intraday' ? selected.id : null,
          direction: selected.direction,
          monto_invertido: cantidadNum * entryPrice,
          cantidad: cantidadNum,
          stop_loss_sugerido_pct: selected.stop_loss_pct,
          stop_loss_usado_pct: stopLossNum,
          take_profit_pct: takeProfitNum,
          entry_price: entryPrice,
        }),
      })
      if (res.ok) {
        onCreated(res.trade)
        setSelected(null); setCantidad(''); setStopLoss(''); setTakeProfit(''); setTakeProfitPrice('')
      } else {
        setError(res.error ?? 'No se pudo cargar la operación')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Cargar operación</div>
      <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 10 }}>
        Sólo alcistas que superan tu costo configurado — hasta 5 por horizonte, las de mayor movimiento
        esperado primero.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <button onClick={() => { setSource('daily'); setSelected(null) }}
          style={{ ...btn, background: source === 'daily' ? 'var(--text)' : 'var(--bg-muted)', color: source === 'daily' ? 'var(--bg)' : 'var(--text-muted)' }}>
          Diario
        </button>
        <button onClick={() => { setSource('intraday'); setSelected(null) }}
          style={{ ...btn, background: source === 'intraday' ? 'var(--text)' : 'var(--bg-muted)', color: source === 'intraday' ? 'var(--bg)' : 'var(--text-muted)' }}>
          Intradiario
        </button>
        <button onClick={() => { setOnlyCedears(v => !v); setSelected(null) }}
          aria-pressed={onlyCedears}
          style={{ ...btn, background: onlyCedears ? 'var(--text)' : 'var(--bg-muted)', color: onlyCedears ? 'var(--bg)' : 'var(--text-muted)' }}>
          Sólo CEDEARs
        </button>
        <input type="text" placeholder="Buscar ticker..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inp, flex: 1, minWidth: 120 }} />
      </div>

      {horizons.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setHorizonFilter(null)}
            style={{ ...btn, padding: '4px 10px', fontSize: 11, background: horizonFilter === null ? 'var(--text)' : 'var(--bg-muted)', color: horizonFilter === null ? 'var(--bg)' : 'var(--text-muted)' }}>
            Todos
          </button>
          {horizons.map(h => (
            <button key={h} onClick={() => setHorizonFilter(h)}
              style={{ ...btn, padding: '4px 10px', fontSize: 11, background: horizonFilter === h ? 'var(--text)' : 'var(--bg-muted)', color: horizonFilter === h ? 'var(--bg)' : 'var(--text-muted)' }}>
              {source === 'daily' ? `${h}d` : `${h}min`}
            </button>
          ))}
        </div>
      )}

      {loadingPreds ? (
        <p style={{ fontSize: 12, color: 'var(--text-hint)' }}>Cargando predicciones abiertas...</p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-hint)' }}>
          {qualifying.length === 0
            ? 'Ninguna predicción alcista supera tu costo configurado ahora mismo.'
            : 'Ninguna coincide con los filtros elegidos.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', marginBottom: selected ? 14 : 0 }}>
          {filtered.map(({ pred: p, costo }) => (
            <button key={p.id} onClick={() => pick(p)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 6, textAlign: 'left', cursor: 'pointer',
                background: selected?.id === p.id ? 'var(--bg-muted)' : 'transparent',
                border: `1px solid ${selected?.id === p.id ? 'var(--text-muted)' : 'var(--border)'}`,
                fontFamily: MONO, fontSize: 12, color: 'var(--text)',
              }}>
              <span>{p.assets?.ticker ?? '?'}</span>
              <span style={{ color: 'var(--up)' }}>↑ {p.horizon_label}</span>
              <span style={{ color: 'var(--text-hint)', fontSize: 11 }}>
                {costo.movimientoEsperadoPct.toFixed(2)}% esp.{!costo.calibrado ? ' (sin calibrar)' : ''}
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
            Cargando <strong>{selected.assets?.ticker}</strong> (sube, {selected.horizon_label})
          </div>
          {/* La lista de arriba ya sólo muestra predicciones que superan el costo — este resumen
              confirma los números, no advierte (para eso ya no llegaría a estar seleccionada). El
              caveat de calibración sí se mantiene: que supere el costo no dice cuánto confiar en
              el número si la magnitud de este horizonte todavía no está calibrada. */}
          {selectedCosto && (
            <div style={{
              background: 'var(--up-soft)', borderRadius: 8,
              padding: '8px 12px', marginBottom: 10, fontSize: 11, color: 'var(--up)',
            }}>
              ✓ Movimiento esperado {selectedCosto.movimientoEsperadoPct.toFixed(2)}% vs costo
              {' '}{selectedCosto.costoPct.toFixed(2)}%{!selectedCosto.calibrado
                ? ' — ojo: la magnitud de este horizonte todavía no está calibrada, puede estar mal escalada'
                : ''}.
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                Precio de entrada
                {fetchingPrice && <span style={{ color: 'var(--text-hint)', fontWeight: 400 }}>(cargando...)</span>}
              </div>
              <input type="number" value={entryPriceInput} onChange={e => setEntryPriceInput(e.target.value)} style={{ ...inp, width: 110 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Cantidad</div>
              <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)} style={{ ...inp, width: 90 }} />
            </div>
            {Number(cantidad) > 0 && Number(entryPriceInput) > 0 && selected.assets && (
              <div style={{ fontSize: 11, color: 'var(--text-hint)', fontFamily: MONO }}>
                = {formatMoney(Number(cantidad) * Number(entryPriceInput), selected.assets.currency)}
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                Stop-loss %
                <InfoTip text="Prellenado con el stop-loss sugerido (Etapa 18, percentil 10 empírico). Es negativo: magnitud del movimiento adverso máximo antes de cerrar la operación. Editable." />
              </div>
              <input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)} style={{ ...inp, width: 100 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                Take-profit %
                <InfoTip text="Si el activo llega a esta magnitud de movimiento a favor, se cierra ahí, sin importar el target de la predicción ni el horizonte. Es positivo (magnitud, no importa la dirección). Opcional — si lo dejás vacío, la operación sólo cierra por stop-loss o cuando venza la predicción subyacente. Enlazado con 'Vender a' — completá cualquiera de los dos y el otro se calcula solo." />
              </div>
              <input type="number" placeholder="opcional" value={takeProfit} onChange={e => onTakeProfitPctChange(e.target.value)} style={{ ...inp, width: 90 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Vender a</div>
              <input type="number" placeholder="opcional" value={takeProfitPrice} onChange={e => onTakeProfitPriceChange(e.target.value)} style={{ ...inp, width: 100 }} />
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

// ── Estadísticas históricas + gráfico de P&L por operación ──────────────
// Backlog post-21, a pedido explícito del usuario ("quiero ver históricamente cómo me ha ido").
// Usa `pnl_pct` (no `pnl_monto`) para poder mezclar operaciones ARS/USD en el mismo gráfico sin
// sumar monedas distintas.
function TradeStats({ trades }: { trades: TrackingTrade[] }) {
  const closed = useMemo(
    () => trades
      .filter(t => t.status !== 'abierta' && t.pnl_pct != null && t.closed_at != null)
      .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime()),
    [trades]
  )

  if (closed.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--text-hint)' }}>Las estadísticas aparecen cuando se cierre la primera operación.</p>
  }

  const ganadoras = closed.filter(t => t.pnl_pct! > 0).length
  const perdedoras = closed.filter(t => t.pnl_pct! < 0).length
  const winRate = (ganadoras / closed.length) * 100
  const mejor = closed.reduce((a, b) => (b.pnl_pct! > a.pnl_pct! ? b : a))
  const peor = closed.reduce((a, b) => (b.pnl_pct! < a.pnl_pct! ? b : a))
  const porStop = closed.filter(t => t.status === 'cerrada_por_stop').length
  const porTakeProfit = closed.filter(t => t.status === 'cerrada_por_take_profit').length
  const porNormal = closed.filter(t => t.status === 'cerrada_normal').length

  const chartData = closed.map((t, i) => ({
    idx: i + 1, ticker: t.assets?.ticker ?? '?', pnl: t.pnl_pct!,
    date: new Date(t.closed_at!).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
  }))

  return (
    <div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Cerradas</div>
          <div style={{ fontFamily: MONO, fontSize: 15 }}>{closed.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Win rate</div>
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: winRate >= 50 ? 'var(--up)' : 'var(--down)' }}>
            {winRate.toFixed(0)}% <span style={{ fontSize: 11, color: 'var(--text-hint)', fontWeight: 400 }}>({ganadoras}/{perdedoras})</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Mejor</div>
          <div style={{ fontFamily: MONO, fontSize: 15, color: 'var(--up)' }}>+{mejor.pnl_pct!.toFixed(2)}%
            <span style={{ fontSize: 11, color: 'var(--text-hint)' }}> {mejor.assets?.ticker}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Peor</div>
          <div style={{ fontFamily: MONO, fontSize: 15, color: 'var(--down)' }}>{peor.pnl_pct!.toFixed(2)}%
            <span style={{ fontSize: 11, color: 'var(--text-hint)' }}> {peor.assets?.ticker}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Cómo cerraron</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)' }}>
            {porNormal} normal · {porStop} stop · {porTakeProfit} take-profit
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="idx" tick={{ fontFamily: MONO, fontSize: 9, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontFamily: MONO, fontSize: 9, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: MONO, fontSize: 11 }}
            formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`, 'P&L']}
            labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.ticker} · ${payload[0].payload.date}` : ''}
          />
          <Bar dataKey="pnl">
            {chartData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? 'var(--up)' : 'var(--down)'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 6 }}>
        P&amp;L % por operación cerrada, en orden cronológico (todas las monedas juntas — por eso % y no
        monto, para no mezclar ARS/USD).
      </div>
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
                <td style={{ padding: '6px 8px' }}>
                  {formatMoney(t.monto_invertido, currency)}
                  {t.cantidad != null && (
                    <span style={{ color: 'var(--text-hint)', fontSize: 11 }}> ({t.cantidad} @ {formatMoney(t.entry_price, currency)})</span>
                  )}
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                  {t.status === 'abierta' ? 'Abierta'
                    : t.status === 'cerrada_por_stop' ? 'Cerrada · stop'
                    : t.status === 'cerrada_por_take_profit' ? 'Cerrada · take-profit'
                    : 'Cerrada · normal'}
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
  const [movements, setMovements] = useState<TrackingCapitalMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [pRes, tRes, mRes] = await Promise.all([
      fetchJson('/api/tracking/portfolios'),
      fetchJson('/api/tracking/trades'),
      fetchJson('/api/tracking/movements'),
    ])
    if (pRes.ok) setPortfolios(pRes.portfolios)
    if (tRes.ok) setTrades(tRes.trades)
    if (mRes.ok) setMovements(mRes.movements)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Backlog post-21, a pedido explícito del usuario: "borrar todo" = el historial de operaciones
  // ejecutadas (tracking_trades), para empezar de cero. No toca portfolios (capital/costo
  // configurado) ni fondeos/retiros — ver DELETE /api/tracking/trades.
  async function handleResetAll() {
    if (!confirmingReset) { setConfirmingReset(true); return }
    setResetting(true)
    const res = await fetchJson('/api/tracking/trades', { method: 'DELETE' })
    setResetting(false)
    setConfirmingReset(false)
    if (res.ok) setTrades([])
  }

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
            movements={movements}
            onCreated={p => setPortfolios(prev => [...prev.filter(x => x.currency !== p.currency), p])}
            onUpdated={p => setPortfolios(prev => prev.map(x => x.currency === p.currency ? p : x))}
            onMovementAdded={m => setMovements(prev => [m, ...prev])}
          />
        ))}
      </div>

      <LoadTradeForm portfolios={portfolios} onCreated={t => setTrades(prev => [t, ...prev])} />

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Rendimiento histórico</div>
        <TradeStats trades={trades} />
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Operaciones</div>
          {trades.length > 0 && (
            confirmingReset ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--down)' }}>¿Borrar las {trades.length} operaciones? No se puede deshacer.</span>
                <button onClick={handleResetAll} disabled={resetting}
                  style={{ ...btn, background: 'var(--down)', color: '#fff', padding: '5px 10px', fontSize: 11 }}>
                  {resetting ? 'Borrando...' : 'Confirmar'}
                </button>
                <button onClick={() => setConfirmingReset(false)}
                  style={{ ...btn, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '5px 10px', fontSize: 11 }}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button onClick={handleResetAll}
                style={{ ...btn, background: 'transparent', color: 'var(--text-hint)', border: '1px solid var(--border)', padding: '5px 10px', fontSize: 11 }}>
                Borrar todo el historial
              </button>
            )
          )}
        </div>
        <TradesList trades={trades} portfolios={portfolios} />
      </div>
    </div>
  )
}
