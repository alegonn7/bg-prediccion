'use client'
import { useState } from 'react'
import type { BacktestModelStat } from './ModelsSection'

export type BacktestRun = {
  ticker: string
  status: 'pending' | 'running' | 'done' | 'error'
  dates_processed: number | null
  predictions_evaluated: number | null
  error_msg: string | null
  started_at: string | null
  completed_at: string | null
}

export type HorizonWeight = {
  model_name: string
  horizon_bucket: number
  weight: number
  direction_accuracy: number | null
  sample_size: number
  mae_avg: number | null
}

type Props = {
  runs: BacktestRun[]
  horizonWeights: HorizonWeight[]
  globalWeights: { model_name: string; weight: number; direction_accuracy: number | null; sample_size: number }[]
  backtestModelStats: BacktestModelStat[]
}

const BUCKETS = [7, 14, 30, 60, 90]
const STATUS_COLOR: Record<string, string> = {
  done: '#22c55e', running: '#f59e0b', pending: '#6b7280', error: '#ef4444',
}

function accColor(pct: number): string {
  if (pct >= 0.65) return '#16a34a'
  if (pct >= 0.58) return '#22c55e'
  if (pct >= 0.53) return '#84cc16'
  if (pct >= 0.50) return '#ca8a04'
  if (pct >= 0.46) return '#f97316'
  return '#dc2626'
}
function accBg(pct: number): string {
  if (pct >= 0.65) return '#14532d22'
  if (pct >= 0.58) return '#16a34a18'
  if (pct >= 0.53) return '#84cc1614'
  if (pct >= 0.50) return '#ca8a0414'
  if (pct >= 0.46) return '#f9731614'
  return '#dc262614'
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '20px 24px', ...style,
    }}>
      {children}
    </div>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 6 }}>
      {text}
    </div>
  )
}

function BigNum({ v, color }: { v: number | string; color?: string }) {
  return <div style={{ fontSize: 28, fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1 }}>{v}</div>
}

function WeightCell({ w, n, acc }: { w: number; n?: number; acc?: number | null }) {
  const color = w > 1.3 ? '#22c55e' : w < 0.7 ? '#ef4444' : 'var(--text)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <span style={{ fontWeight: 700, color, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 12 }}>{w.toFixed(2)}</span>
      {acc != null && <span style={{ fontSize: 10, color: accColor(acc) }}>{(acc * 100).toFixed(0)}%</span>}
      {n != null && <span style={{ fontSize: 9, color: 'var(--text-hint)' }}>n={n.toLocaleString()}</span>}
    </div>
  )
}

export function EntrenamientoSection({ runs, horizonWeights, globalWeights, backtestModelStats }: Props) {
  const [triggering, setTriggering] = useState(false)
  const [trainingAll, setTrainingAll] = useState(false)
  const [retraining, setRetraining] = useState(false)
  const [triggerResult, setTriggerResult] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'resumen' | 'rendimiento' | 'pesos' | 'activos'>('resumen')

  const done    = runs.filter(r => r.status === 'done').length
  const running = runs.filter(r => r.status === 'running').length
  const pending = runs.filter(r => r.status === 'pending').length
  const errors  = runs.filter(r => r.status === 'error').length
  const total   = runs.length
  const totalDates = runs.reduce((s, r) => s + (r.dates_processed ?? 0), 0)
  const totalPreds = runs.reduce((s, r) => s + (r.predictions_evaluated ?? 0), 0)
  const pct = total > 0 ? Math.round(done / total * 100) : 0

  // Build maps
  const hwMap: Record<string, Record<number, HorizonWeight>> = {}
  for (const hw of horizonWeights) {
    if (!hwMap[hw.model_name]) hwMap[hw.model_name] = {}
    hwMap[hw.model_name][hw.horizon_bucket] = hw
  }
  const gwMap: Record<string, number> = {}
  for (const gw of globalWeights) gwMap[gw.model_name] = gw.weight

  const bsMap: Record<string, Record<number, BacktestModelStat>> = {}
  for (const s of backtestModelStats) {
    if (!bsMap[s.model_name]) bsMap[s.model_name] = {}
    bsMap[s.model_name][s.horizon_bucket] = s
  }

  const modelNames = [...new Set([
    ...horizonWeights.map(h => h.model_name),
    ...globalWeights.map(g => g.model_name),
    ...backtestModelStats.map(s => s.model_name),
  ])].sort()

  async function handleTrigger(all = false, force = false) {
    if (force) setRetraining(true)
    else if (all) setTrainingAll(true)
    else setTriggering(true)
    setTriggerResult(null)
    try {
      let url = '/api/backtest/trigger'
      if (all || force) url += '?all=true'
      if (force) url += '&force=true'
      const res = await fetch(url, { method: 'POST' })
      const json = await res.json()
      if (json.triggered > 0) {
        setTriggerResult(
          `Entrenando ${json.triggered} activos en ${json.waves} oleadas de 25 — tarda ~${Math.ceil(json.waves * 12)} segundos. Recargá la página en 2 minutos.`
        )
      } else {
        setTriggerResult(all && !force
          ? 'Nada pendiente — todos los activos ya están entrenados. Usá "Reentrenar todo" para forzar.'
          : `Disparado: ${(json.tickers as string[])?.join(', ') ?? '0'}`
        )
      }
    } catch {
      setTriggerResult('Error al disparar.')
    } finally {
      setTriggering(false)
      setTrainingAll(false)
      setRetraining(false)
    }
  }

  function sectionBtn(id: typeof activeSection, label: string) {
    const on = activeSection === id
    return (
      <button
        onClick={() => setActiveSection(id)}
        style={{
          padding: '6px 14px', fontSize: 12, fontWeight: on ? 700 : 400,
          background: on ? 'var(--text)' : 'var(--card)',
          color: on ? 'var(--bg)' : 'var(--text-muted)',
          border: '1px solid var(--border)', borderRadius: 6,
          cursor: 'pointer', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Entrenamiento de Modelos</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Backtest walk-forward sobre {total} activos · 520 días OHLCV · 60d warmup · 80 clasificadores LR (16 modelos × 5 horizontes)
        </p>
      </div>

      {/* Trigger buttons */}
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => handleTrigger(true)}
              disabled={trainingAll || triggering || retraining}
              style={{
                background: trainingAll ? 'var(--border)' : '#16a34a',
                color: '#fff', border: 'none', borderRadius: 7,
                padding: '10px 22px', fontSize: 13, fontWeight: 700,
                cursor: (trainingAll || triggering || retraining) ? 'default' : 'pointer',
                fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              }}
            >
              {trainingAll ? 'Entrenando...' : `Entrenar pendientes (${Math.max(0, total - done)})`}
            </button>
            <button
              onClick={() => handleTrigger(false, true)}
              disabled={triggering || trainingAll || retraining}
              style={{
                background: retraining ? 'var(--border)' : '#b45309',
                color: '#fff', border: 'none', borderRadius: 7,
                padding: '10px 22px', fontSize: 13, fontWeight: 700,
                cursor: (triggering || trainingAll || retraining) ? 'default' : 'pointer',
                fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              }}
            >
              {retraining ? 'Reentrenando...' : `Reentrenar todo (${total})`}
            </button>
            <button
              onClick={() => handleTrigger(false)}
              disabled={triggering || trainingAll || retraining}
              style={{
                background: (triggering || trainingAll || retraining) ? 'var(--border)' : 'var(--card)',
                color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 7,
                padding: '9px 18px', fontSize: 12, fontWeight: 500,
                cursor: (triggering || trainingAll || retraining) ? 'default' : 'pointer',
                fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              }}
            >
              {triggering ? 'Disparando...' : 'Lote de 10'}
            </button>
          </div>
          {triggerResult && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{triggerResult}</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>
            Cron automático: 10 activos/día a las 02:00 UTC · "Reentrenar todo" incluye datos reales acumulados (predicciones cerradas verificadas)
          </div>
        </div>
      </Card>

      {/* Progress bar */}
      <Card style={{ padding: '16px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13 }}>
          <span style={{ fontWeight: 600 }}>Progreso global</span>
          <span style={{ color: 'var(--text-muted)' }}>{done}/{total} activos · {pct}%</span>
        </div>
        <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22c55e', borderRadius: 4, transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
          {[
            { label: 'Completados', v: done, color: '#22c55e' },
            { label: 'En curso', v: running, color: '#f59e0b' },
            { label: 'Pendientes', v: pending, color: 'var(--text-muted)' },
            { label: 'Errores', v: errors, color: errors > 0 ? '#ef4444' : 'var(--text-hint)' },
            { label: 'Fechas proc.', v: totalDates.toLocaleString(), color: 'var(--text)' },
            { label: 'Evaluaciones', v: totalPreds.toLocaleString(), color: 'var(--text)' },
          ].map(({ label, v, color }) => (
            <div key={label}>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>{v}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Section nav */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {sectionBtn('resumen', 'Arquitectura')}
        {sectionBtn('rendimiento', 'Rendimiento Backtest')}
        {sectionBtn('pesos', 'Pesos Federados')}
        {sectionBtn('activos', 'Estado por Activo')}
      </div>

      {/* ── ARQUITECTURA ───────────────────────────────────── */}
      {activeSection === 'resumen' && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <SectionLabel text="Pipeline de entrenamiento" />
              <div style={{
                background: 'var(--bg)', borderRadius: 8, padding: '14px 16px',
                fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 11,
                color: 'var(--text-muted)', lineHeight: 2,
              }}>
                <div><span style={{ color: '#3b82f6' }}>1. Datos</span>   Yahoo Finance → 520 días OHLCV por activo</div>
                <div><span style={{ color: '#3b82f6' }}>2. Warmup</span>  Primeros 60 días para calcular indicadores técnicos (SMAs, ATR, etc.)</div>
                <div><span style={{ color: '#3b82f6' }}>3. Walk-forward</span>  460 días restantes: en cada día t se "predice" el retorno a t+7/14/30/60/90</div>
                <div><span style={{ color: '#3b82f6' }}>4. Features</span> Indicadores técnicos del día t → features específicos por modelo (4–6 variables)</div>
                <div><span style={{ color: '#3b82f6' }}>5. Etiqueta</span> actual_pct ≥ 0 → 1 (alza), &lt; 0 → 0 (baja)</div>
                <div><span style={{ color: '#3b82f6' }}>6. LR</span>       Logistic Regression por (modelo, horizonte) → 80 clasificadores por activo</div>
                <div><span style={{ color: '#3b82f6' }}>7. Federar</span>  Parámetros de 50+ activos se promedian → model_learned_params global</div>
                <div><span style={{ color: '#3b82f6' }}>8. Live</span>     Predicciones reales cerradas se agregan como datos extra de entrenamiento</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {[
                { label: 'Modelos diarios', v: '16', desc: 'Un clasificador LR por modelo × horizonte' },
                { label: 'Horizontes', v: '5', desc: '7, 14, 30, 60, 90 días' },
                { label: 'Clasificadores LR', v: '80', desc: '16 modelos × 5 horizontes por activo' },
                { label: 'Activos federados', v: done.toString(), desc: 'Activos que contribuyen al modelo global' },
                { label: 'Muestras globales', v: '~11k', desc: 'Por clasificador (promedio)' },
                { label: 'Reentrenamiento', v: 'Diario', desc: 'Cron 02:00 UTC + manual' },
              ].map(({ label, v, desc }) => (
                <div key={label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", marginBottom: 2 }}>{v}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ── RENDIMIENTO BACKTEST ────────────────────────────── */}
      {activeSection === 'rendimiento' && backtestModelStats.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: '14px 20px' }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-hint)', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Precisión direccional (% correcto en backtest out-of-sample):</span>
              {[
                { label: '≥ 65%', color: '#16a34a' },
                { label: '58–65%', color: '#22c55e' },
                { label: '53–58%', color: '#84cc16' },
                { label: '50–53%', color: '#ca8a04' },
                { label: '46–50%', color: '#f97316' },
                { label: '< 46%', color: '#dc2626' },
              ].map(({ label, color }) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
                  {label}
                </span>
              ))}
            </div>
          </Card>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-hint)', fontWeight: 500, whiteSpace: 'nowrap' }}>Modelo</th>
                  {BUCKETS.map(b => (
                    <th key={b} colSpan={2} style={{ textAlign: 'center', padding: '8px 8px', color: 'var(--text-hint)', fontWeight: 500, borderLeft: '1px solid var(--border)' }}>
                      {b} días
                    </th>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '4px 12px' }} />
                  {BUCKETS.map(b => (
                    <>
                      <th key={`${b}-acc`} style={{ textAlign: 'center', padding: '4px 6px', color: 'var(--text-hint)', fontWeight: 400, fontSize: 10, borderLeft: '1px solid var(--border)' }}>% dir.</th>
                      <th key={`${b}-mae`} style={{ textAlign: 'center', padding: '4px 6px', color: 'var(--text-hint)', fontWeight: 400, fontSize: 10 }}>MAE%</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modelNames.map(mn => (
                  <tr key={mn} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 12px', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", color: 'var(--text-muted)', fontWeight: 600 }}>
                      {mn}
                    </td>
                    {BUCKETS.map(b => {
                      const bs = bsMap[mn]?.[b]
                      return (
                        <>
                          <td key={`${b}-acc`} style={{ textAlign: 'center', padding: '7px 6px', borderLeft: '1px solid var(--border)' }}>
                            {bs ? (
                              <span style={{
                                display: 'inline-block', padding: '2px 7px', borderRadius: 5,
                                background: accBg(bs.pct), color: accColor(bs.pct),
                                fontWeight: 700, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 11,
                              }}>
                                {(bs.pct * 100).toFixed(1)}%
                              </span>
                            ) : <span style={{ color: 'var(--text-hint)' }}>—</span>}
                          </td>
                          <td key={`${b}-mae`} style={{ textAlign: 'center', padding: '7px 6px', color: 'var(--text-hint)', fontSize: 10 }}>
                            {bs ? `${(bs.mae_avg * 100).toFixed(1)}%` : '—'}
                          </td>
                        </>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-hint)', paddingLeft: 4 }}>
            % dir. = precisión direccional out-of-sample en backtest (cuántas veces el modelo predijo la dirección correcta) ·
            MAE% = error absoluto medio del retorno predicho vs real ·
            Datos: {backtestModelStats.reduce((s, r) => s + r.total, 0).toLocaleString()} evaluaciones totales en {done} activos
          </div>
        </div>
      )}

      {activeSection === 'rendimiento' && backtestModelStats.length === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-hint)', fontSize: 13 }}>
            Sin datos de backtest aún. Ejecutá el entrenamiento primero.
          </div>
        </Card>
      )}

      {/* ── PESOS FEDERADOS ─────────────────────────────────── */}
      {activeSection === 'pesos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: '14px 20px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              Los <b>pesos federados</b> ajustan el voto de cada modelo en el consenso final. Se calculan via Brier Skill Score
              (cuánto mejor que predicción aleatoria) por horizonte. Peso &gt; 1.0 = modelo por encima del promedio.
              Peso &lt; 1.0 = modelo penalizado. Se actualizan automáticamente tras cada backtest.
            </div>
          </Card>

          {horizonWeights.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-hint)', fontWeight: 500 }}>Modelo</th>
                    <th style={{ textAlign: 'center', padding: '8px 8px', color: 'var(--text-hint)', fontWeight: 500 }}>Global</th>
                    {BUCKETS.map(b => (
                      <th key={b} style={{ textAlign: 'center', padding: '8px 8px', color: 'var(--text-hint)', fontWeight: 500 }}>{b}d</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modelNames.map(mn => {
                    const gw = gwMap[mn] ?? 1.0
                    return (
                      <tr key={mn} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '7px 12px', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", color: 'var(--text-muted)' }}>
                          {mn}
                        </td>
                        <td style={{ textAlign: 'center', padding: '7px 8px' }}>
                          <WeightCell w={gw} />
                        </td>
                        {BUCKETS.map(b => {
                          const hw = hwMap[mn]?.[b]
                          return (
                            <td key={b} style={{ textAlign: 'center', padding: '7px 8px' }}>
                              {hw
                                ? <WeightCell w={hw.weight} n={hw.sample_size} acc={hw.direction_accuracy} />
                                : <span style={{ color: 'var(--text-hint)' }}>—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Card>
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-hint)', fontSize: 13 }}>
                Sin pesos calculados aún.
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── ESTADO POR ACTIVO ───────────────────────────────── */}
      {activeSection === 'activos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {runs.length > 0 ? (
            <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Ticker', 'Estado', 'Fechas', 'Evaluaciones', 'Error', 'Completado'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-hint)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...runs].sort((a, b) => {
                    const order: Record<string, number> = { error: 0, running: 1, pending: 2, done: 3 }
                    return (order[a.status] ?? 9) - (order[b.status] ?? 9)
                  }).map(r => (
                    <tr key={r.ticker} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 700, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>{r.ticker}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <span style={{
                          color: STATUS_COLOR[r.status] ?? 'var(--text-muted)',
                          fontWeight: 600, textTransform: 'uppercase', fontSize: 11,
                        }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>
                        {r.dates_processed?.toLocaleString() ?? '—'}
                      </td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>
                        {r.predictions_evaluated?.toLocaleString() ?? '—'}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#ef4444', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.error_msg ?? ''}
                      </td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-hint)', fontSize: 11 }}>
                        {r.completed_at
                          ? new Date(r.completed_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Card>
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-hint)', fontSize: 14 }}>
                Ningún activo entrenado aún. Disparar el primer lote para comenzar.
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
