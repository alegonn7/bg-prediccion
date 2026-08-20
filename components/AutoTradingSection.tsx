'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'
import { InfoTip } from './InfoTip'
import { Pagination } from './Pagination'
import {
  computeCapitalCurve, formatMoney,
  type Currency, type AutoTradingConfig, type AutoPortfolio, type AutoTrade,
} from '@/lib/tracking'
import type { ScorecardBolsa } from '@/lib/scorecard'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"
const CURRENCIES: Currency[] = ['ars', 'usd']
const CURRENCY_LABEL: Record<Currency, string> = { ars: 'ARS / CEDEARs', usd: 'USD' }
const PAGE_SIZE = 15

const inp: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '6px 10px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: MONO,
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

// ── Panel de riesgo / kill switch ────────────────────────────────────────
function RiskPanel({ config, onUpdated }: { config: AutoTradingConfig | null; onUpdated: (c: AutoTradingConfig) => void }) {
  const [maxPos, setMaxPos] = useState('')
  const [maxLoss, setMaxLoss] = useState('')
  const [maxConcurrent, setMaxConcurrent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!config) return
    setMaxPos(String(config.max_position_pct_capital))
    setMaxLoss(String(config.max_daily_loss_pct))
    setMaxConcurrent(String(config.max_concurrent_positions))
  }, [config?.max_position_pct_capital, config?.max_daily_loss_pct, config?.max_concurrent_positions])

  async function toggleKillSwitch() {
    if (!config) return
    const res = await fetchJson('/api/auto-trading/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kill_switch: !config.kill_switch }),
    })
    if (res.ok) onUpdated(res.config)
  }

  async function saveLimits() {
    const pos = Number(maxPos), loss = Number(maxLoss), conc = Number(maxConcurrent)
    if (!Number.isFinite(pos) || pos <= 0 || pos > 100) { setError('Tamaño de posición inválido (0-100%)'); return }
    if (!Number.isFinite(loss) || loss <= 0 || loss > 100) { setError('Límite de pérdida diaria inválido (0-100%)'); return }
    if (!Number.isInteger(conc) || conc <= 0) { setError('Posiciones concurrentes debe ser un entero positivo'); return }
    setSaving(true); setError(null); setSaved(false)
    const res = await fetchJson('/api/auto-trading/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_position_pct_capital: pos, max_daily_loss_pct: loss, max_concurrent_positions: conc }),
    })
    setSaving(false)
    if (res.ok) { onUpdated(res.config); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    else setError(res.error ?? 'No se pudo guardar')
  }

  if (!config) return <p style={{ fontSize: 12, color: 'var(--text-hint)' }}>Cargando configuración...</p>

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Motor automático</div>
        <button onClick={toggleKillSwitch}
          style={{
            ...btn, padding: '6px 14px',
            background: config.kill_switch ? 'var(--down)' : 'var(--up)', color: '#fff',
          }}>
          {config.kill_switch ? 'Frenado — activar' : 'Corriendo — frenar'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 14 }}>
        Con el motor frenado no se abre ninguna posición nueva. Las que ya estén abiertas se siguen
        gestionando (stop-loss/take-profit/vencimiento) igual.
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
            Tamaño por posición (% del capital)
            <InfoTip text="Cuánto del capital_inicial de cada portfolio se juega en una sola operación. Conservador por default — el motor arranca en papel sin plata real de por medio, pero este número es el mismo que se usaría el día que pase a vivo." />
          </div>
          <input type="number" step="0.1" value={maxPos} onChange={e => setMaxPos(e.target.value)} style={{ ...inp, width: 90 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Pérdida diaria máxima (%)</div>
          <input type="number" step="0.1" value={maxLoss} onChange={e => setMaxLoss(e.target.value)} style={{ ...inp, width: 90 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Posiciones concurrentes máx.</div>
          <input type="number" step="1" value={maxConcurrent} onChange={e => setMaxConcurrent(e.target.value)} style={{ ...inp, width: 90 }} />
        </div>
        <button style={{ ...btn, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={saveLimits}>
          {saving ? 'Guardando...' : saved ? 'Guardado ✓' : 'Guardar'}
        </button>
      </div>
      {error && <p style={{ fontSize: 11, color: 'var(--down)', marginTop: 8 }}>{error}</p>}
    </div>
  )
}

// ── Controles de plata real (Etapa 30 continuación, 19/08/2026) ─────────
// Bordeado en rojo a propósito — a diferencia de RiskPanel de arriba (que rige tanto papel como
// vivo), estos 3 toggles y 4 montos determinan si el motor manda órdenes REALES contra tu cuenta
// de IOL. Antes sólo editables por SQL directo; el usuario pidió explícitamente sumarlos acá.
function LiveTradingPanel({ config, onUpdated }: { config: AutoTradingConfig | null; onUpdated: (c: AutoTradingConfig) => void }) {
  const [livePct, setLivePct] = useState('')
  const [capIntradia, setCapIntradia] = useState('')
  const [capDiario, setCapDiario] = useState('')
  const [capUsd, setCapUsd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!config) return
    setLivePct(String(config.live_position_pct))
    setCapIntradia(String(config.live_capital_intraday_ars))
    setCapDiario(String(config.live_capital_daily_ars))
    setCapUsd(String(config.live_capital_usd))
  }, [config?.live_position_pct, config?.live_capital_intraday_ars, config?.live_capital_daily_ars, config?.live_capital_usd])

  async function toggle(field: 'override_statistical_gate' | 'live_enabled_byma' | 'live_enabled_us') {
    if (!config) return
    const res = await fetchJson('/api/auto-trading/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !config[field] }),
    })
    if (res.ok) onUpdated(res.config)
  }

  async function saveAmounts() {
    const pct = Number(livePct), ars1 = Number(capIntradia), ars2 = Number(capDiario), usd = Number(capUsd)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) { setError('% por operación inválido (0-100%)'); return }
    if (!Number.isFinite(ars1) || ars1 < 0) { setError('Tope ARS intradiario inválido'); return }
    if (!Number.isFinite(ars2) || ars2 < 0) { setError('Tope ARS diario inválido'); return }
    if (!Number.isFinite(usd) || usd < 0) { setError('Tope USD inválido'); return }
    setSaving(true); setError(null); setSaved(false)
    const res = await fetchJson('/api/auto-trading/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        live_position_pct: pct, live_capital_intraday_ars: ars1,
        live_capital_daily_ars: ars2, live_capital_usd: usd,
      }),
    })
    setSaving(false)
    if (res.ok) { onUpdated(res.config); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    else setError(res.error ?? 'No se pudo guardar')
  }

  if (!config) return null

  const toggleBtn = (on: boolean, label: string) => ({
    ...btn, padding: '6px 12px', fontSize: 12,
    background: on ? 'var(--up)' : 'var(--bg-muted)', color: on ? '#fff' : 'var(--text-muted)',
  })

  return (
    <div style={{ ...card, border: '1px solid var(--down)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--down)' }}>
        ⚠ Plata real — controles de vivo
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 14 }}>
        Estos interruptores deciden si el motor manda órdenes reales contra tu cuenta de IOL, no
        simuladas. Cambiarlos tiene efecto en la próxima corrida del cron (hasta ~15 min intradía).
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14, padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Efectivo real ARS</div>
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>
            {config.last_known_ars_cash != null ? formatMoney(config.last_known_ars_cash, 'ars') : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Efectivo real USD (Cuenta EEUU)</div>
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>
            {config.last_known_usd_cash != null ? formatMoney(config.last_known_usd_cash, 'usd') : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Actualizado</div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-hint)' }}>
            {config.last_known_cash_at ? new Date(config.last_known_cash_at).toLocaleString('es-AR') : 'todavía no'}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 14 }}>
        Lo guarda el motor en cada corrida (hasta ~15 min de atraso) — no es en tiempo real. Los
        topes de abajo no te dejan guardar más de lo que hay acá.
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => toggle('live_enabled_byma')} style={toggleBtn(config.live_enabled_byma, '')}>
          Argentina en vivo: {config.live_enabled_byma ? 'ON' : 'OFF'}
        </button>
        <button onClick={() => toggle('live_enabled_us')} style={toggleBtn(config.live_enabled_us, '')}>
          EEUU en vivo: {config.live_enabled_us ? 'ON' : 'OFF'}
        </button>
        <button onClick={() => toggle('override_statistical_gate')}
          style={{ ...toggleBtn(config.override_statistical_gate, ''), background: config.override_statistical_gate ? 'var(--down)' : 'var(--bg-muted)' }}>
          Saltear gate estadístico: {config.override_statistical_gate ? 'ON' : 'OFF'}
        </button>
        <InfoTip text="Con esto prendido, el motor opera aunque scorecard_bolsas no muestre ninguna bolsa 'validado' — decisión explícita de operar sin edge estadístico confirmado todavía. El resto de los filtros (costo, riesgo) siguen aplicando igual." />
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
            % del efectivo real por operación
            <InfoTip text="En vivo, el tamaño de cada posición no sale del capital de papel — sale de tu efectivo REAL disponible en IOL en ese momento, multiplicado por este %." />
          </div>
          <input type="number" step="1" value={livePct} onChange={e => setLivePct(e.target.value)} style={{ ...inp, width: 90 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Tope ARS intradiario</div>
          <input type="number" step="100" value={capIntradia} onChange={e => setCapIntradia(e.target.value)} style={{ ...inp, width: 110 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Tope ARS diario</div>
          <input type="number" step="100" value={capDiario} onChange={e => setCapDiario(e.target.value)} style={{ ...inp, width: 110 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Tope USD (EEUU, sin sub-repartir)</div>
          <input type="number" step="1" value={capUsd} onChange={e => setCapUsd(e.target.value)} style={{ ...inp, width: 100 }} />
        </div>
        <button style={{ ...btn, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={saveAmounts}>
          {saving ? 'Guardando...' : saved ? 'Guardado ✓' : 'Guardar'}
        </button>
      </div>
      {error && <p style={{ fontSize: 11, color: 'var(--down)', marginTop: 8 }}>{error}</p>}
    </div>
  )
}

// ── Estado del gate estadístico (por qué algo opera o no en vivo) ───────
function GateSummary({ scorecardBolsas }: { scorecardBolsas: Record<string, ScorecardBolsa> }) {
  const rows = useMemo(
    () => Object.values(scorecardBolsas).filter(
      b => b.horizon_unit === 'minutes' || (b.horizon_unit === 'days' && b.horizon_bucket === 1)
    ),
    [scorecardBolsas]
  )
  const counts: Record<string, number> = {}
  for (const b of rows) counts[b.estado] = (counts[b.estado] ?? 0) + 1
  const validado = rows.filter(b => b.estado === 'validado' && (b.expectancy_net_pct ?? 0) > 0)

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
        Gate estadístico (intradiario todos los horizontes + diario h=1)
        <InfoTip text="Sólo se abre una posición en vivo (Fase D) en una bolsa (activo×horizonte×moneda) con estado 'validado' y esperanza neta positiva. Mientras tanto el motor sigue en papel para esa bolsa aunque el resto de los filtros (costo, riesgo) pasen — es el comportamiento correcto, no una falla." />
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: validado.length ? 10 : 0 }}>
        {(['validado', 'acumulando', 'insuficiente', 'sin_edge', 'contraproducente'] as const).map(estado => (
          <div key={estado}>
            <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>{estado}</div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: estado === 'validado' ? 700 : 400, color: estado === 'validado' ? 'var(--up)' : estado === 'contraproducente' ? 'var(--down)' : 'var(--text)' }}>
              {counts[estado] ?? 0}
            </div>
          </div>
        ))}
      </div>
      {validado.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>
          Ninguna bolsa en alcance está validada con esperanza neta positiva todavía — el motor
          opera 100% en papel.
        </div>
      )}
    </div>
  )
}

// ── Portfolio (capital) por moneda ────────────────────────────────────────
function PortfolioCard({ currency, portfolio, trades, onCreated }: {
  currency: Currency
  portfolio: AutoPortfolio | null
  trades: AutoTrade[]
  onCreated: (p: AutoPortfolio) => void
}) {
  const [capitalInput, setCapitalInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    const capital = Number(capitalInput)
    if (!Number.isFinite(capital) || capital <= 0) { setError('Ingresá un capital inicial válido'); return }
    setCreating(true); setError(null)
    const res = await fetchJson('/api/auto-trading/portfolios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
          Sin capital de papel asignado — el motor no evalúa entradas en esta moneda hasta que exista.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" placeholder="Capital inicial (papel)" value={capitalInput}
            onChange={e => setCapitalInput(e.target.value)} style={{ ...inp, width: 180 }} />
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
  const chartData = curve.map(p => ({ date: new Date(p.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }), capital: p.capital }))

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{CURRENCY_LABEL[currency]} · papel</div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Capital inicial</div>
          <div style={{ fontFamily: MONO, fontSize: 15 }}>{formatMoney(portfolio.capital_inicial, currency)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Capital actual (papel)</div>
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
      {curve.length >= 2 ? (
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-hint)' }}>La curva aparece cuando el motor cierre la primera operación.</p>
      )}
    </div>
  )
}

// ── Cartera vivo (plata real) — curva de capital ─────────────────────────
// A diferencia de PortfolioCard (papel, con capital_inicial propio en `auto_portfolios`), acá no
// existe una tabla equivalente para vivo: el capital real vive en IOL, y `auto_trading_config`
// sólo guarda una FOTO del efectivo actual (`last_known_*_cash`), no una serie histórica. La base
// más honesta disponible es el tope configurado por el usuario (`live_capital_*`) + el P&L real ya
// realizado de las operaciones vivo — no pretende ser el saldo exacto de IOL en cada punto del
// tiempo, sólo la evolución de lo que el motor comprometió y ganó/perdió.
function LiveCapitalCard({ currency, config, trades }: {
  currency: Currency
  config: AutoTradingConfig | null
  trades: AutoTrade[] // ya filtrado a modo==='vivo' y a esta moneda
}) {
  const capitalBase = currency === 'ars'
    ? (config?.live_capital_intraday_ars ?? 0) + (config?.live_capital_daily_ars ?? 0)
    : (config?.live_capital_usd ?? 0)
  const enabled = currency === 'ars' ? !!config?.live_enabled_byma : !!config?.live_enabled_us

  if (!enabled && trades.length === 0) {
    return (
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{CURRENCY_LABEL[currency]} · vivo</div>
        <p style={{ fontSize: 12, color: 'var(--text-hint)' }}>
          Vivo deshabilitado en esta moneda — sin operaciones reales todavía.
        </p>
      </div>
    )
  }

  const firstOpened = trades.reduce<string | null>(
    (min, t) => (!min || t.opened_at < min) ? t.opened_at : min, null
  )
  const { curve, capitalActual, retornoPct } = computeCapitalCurve(
    { capital_inicial: capitalBase, created_at: firstOpened ?? new Date().toISOString() },
    trades,
  )
  const abiertas = trades.filter(t => t.status === 'abierta').length
  const chartData = curve.map(p => ({ date: new Date(p.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }), capital: p.capital }))

  return (
    <div style={{ ...card, border: '1px solid var(--down)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 5 }}>
        {CURRENCY_LABEL[currency]} · vivo (plata real)
        <InfoTip text="Base = tope configurado en 'Plata real' arriba (live_capital_intraday_ars + live_capital_daily_ars en ARS, live_capital_usd en USD), no el saldo exacto de IOL en cada momento — eso está arriba en 'Efectivo real'. Esta curva es la base más P&L real acumulado de las operaciones vivo cerradas." />
      </div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Capital asignado (config)</div>
          <div style={{ fontFamily: MONO, fontSize: 15 }}>{formatMoney(capitalBase, currency)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Capital actual (asignado + P&amp;L real)</div>
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
      {curve.length >= 2 ? (
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontFamily: MONO, fontSize: 9, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: MONO, fontSize: 11 }}
              formatter={(v) => [formatMoney(Number(v), currency), 'Capital']}
            />
            <Line type="monotone" dataKey="capital" stroke="var(--down)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-hint)' }}>La curva aparece cuando el motor cierre la primera operación real.</p>
      )}
    </div>
  )
}

// ── Listado de operaciones del motor ─────────────────────────────────────
function AutoTradesList({ trades }: { trades: AutoTrade[] }) {
  if (trades.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--text-hint)' }}>El motor todavía no abrió ninguna operación.</p>
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-hint)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>Ticker</th>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>Venue</th>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>Modo</th>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>Horizonte</th>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>Monto</th>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>Estado</th>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>P&amp;L</th>
            <th style={{ padding: '6px 8px', fontWeight: 500 }}>Abierta</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(t => (
            <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', fontFamily: MONO }}>
              <td style={{ padding: '6px 8px' }}>{t.assets?.ticker ?? '?'}</td>
              <td style={{ padding: '6px 8px', color: 'var(--text-hint)' }}>{t.venue}</td>
              <td style={{ padding: '6px 8px', color: t.modo === 'vivo' ? 'var(--up)' : 'var(--text-hint)' }}>{t.modo}</td>
              <td style={{ padding: '6px 8px', color: 'var(--text-hint)' }}>
                {t.horizon_unit === 'minutes' ? `${t.horizon_value}min` : `${t.horizon_value}d`}
              </td>
              <td style={{ padding: '6px 8px' }}>{formatMoney(t.monto_invertido, t.venue === 'US' ? 'usd' : 'ars')}</td>
              <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                {t.status === 'abierta' ? 'Abierta'
                  : t.status === 'cerrada_por_stop' ? 'Cerrada · stop'
                  : t.status === 'cerrada_por_take_profit' ? 'Cerrada · take-profit'
                  : 'Cerrada · normal'}
              </td>
              <td style={{ padding: '6px 8px', color: t.pnl_pct == null ? 'var(--text-hint)' : t.pnl_pct >= 0 ? 'var(--up)' : 'var(--down)' }}>
                {t.pnl_pct == null ? '—' : `${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct.toFixed(2)}%`}
              </td>
              <td style={{ padding: '6px 8px', color: 'var(--text-hint)' }}>{new Date(t.opened_at).toLocaleString('es-AR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Sección principal ─────────────────────────────────────────────────────
export function AutoTradingSection({ scorecardBolsas }: { scorecardBolsas: Record<string, ScorecardBolsa> }) {
  const [config, setConfig] = useState<AutoTradingConfig | null>(null)
  const [portfolios, setPortfolios] = useState<AutoPortfolio[]>([])
  const [trades, setTrades] = useState<AutoTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [vivoPage, setVivoPage] = useState(1)
  const [papelPage, setPapelPage] = useState(1)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [cRes, pRes, tRes] = await Promise.all([
      fetchJson('/api/auto-trading/config'),
      fetchJson('/api/auto-trading/portfolios'),
      fetchJson('/api/auto-trading/trades'),
    ])
    if (cRes.ok) setConfig(cRes.config)
    if (pRes.ok) setPortfolios(pRes.portfolios)
    if (tRes.ok) setTrades(tRes.trades)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const vivoTrades = useMemo(() => trades.filter(t => t.modo === 'vivo'), [trades])
  const papelTrades = useMemo(() => trades.filter(t => t.modo !== 'vivo'), [trades])
  const vivoPageItems = vivoTrades.slice((vivoPage - 1) * PAGE_SIZE, vivoPage * PAGE_SIZE)
  const papelPageItems = papelTrades.slice((papelPage - 1) * PAGE_SIZE, papelPage * PAGE_SIZE)

  if (loading) return <p style={{ fontSize: 13, color: 'var(--text-hint)' }}>Cargando...</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <RiskPanel config={config} onUpdated={setConfig} />
      <LiveTradingPanel config={config} onUpdated={setConfig} />
      <GateSummary scorecardBolsas={scorecardBolsas} />

      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Cartera · vivo (plata real)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {CURRENCIES.map(currency => (
          <LiveCapitalCard
            key={currency}
            currency={currency}
            config={config}
            trades={vivoTrades.filter(t => currency === 'ars' ? t.venue === 'BYMA' : t.venue === 'US')}
          />
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Cartera · papel (simulada)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {CURRENCIES.map(currency => (
          <PortfolioCard
            key={currency}
            currency={currency}
            portfolio={portfolios.find(p => p.currency === currency) ?? null}
            trades={papelTrades}
            onCreated={p => setPortfolios(prev => [...prev.filter(x => x.currency !== p.currency), p])}
          />
        ))}
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Operaciones reales (vivo)</div>
        <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 14 }}>Plata real ejecutada contra tu cuenta de IOL.</div>
        <AutoTradesList trades={vivoPageItems} />
        <Pagination page={vivoPage} totalItems={vivoTrades.length} pageSize={PAGE_SIZE} onChange={setVivoPage} />
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Operaciones simuladas (papel)</div>
        <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 14 }}>Simulación, sin plata real de por medio.</div>
        <AutoTradesList trades={papelPageItems} />
        <Pagination page={papelPage} totalItems={papelTrades.length} pageSize={PAGE_SIZE} onChange={setPapelPage} />
      </div>
    </div>
  )
}
