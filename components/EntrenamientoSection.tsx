'use client'
import { useState, useEffect } from 'react'
import type { BacktestModelStat } from './ModelsSection'
import type { ChangelogEntry, DailyModelParam } from '@/app/page'

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
  changelog: ChangelogEntry[]
  dailyModelParams: DailyModelParam[]
}

const DAILY_BUCKETS = [1, 7, 14, 30, 60, 90]

function maeColor(v: number) {
  if (v <= 1.2) return '#22c55e'
  if (v <= 2.0) return '#84cc16'
  if (v <= 3.0) return '#ca8a04'
  return '#ef4444'
}

function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 2) return 'hace un momento'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  return `hace ${Math.floor(hrs / 24)}d`
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', ...style }}>
      {children}
    </div>
  )
}

// Bloque que muestra la distribución del error en una línea
function ErrorBandMini({ p75, p90 }: { p75: number; p90: number }) {
  return (
    <div style={{ fontSize: 9, color: 'var(--text-hint)', lineHeight: 1.6 }}>
      <span>75% prob. desvío ≤ </span>
      <span style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", color: '#84cc16', fontWeight: 600 }}>±{p75.toFixed(2)}%</span>
      <span>  ·  90% ≤ </span>
      <span style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", color: '#f59e0b', fontWeight: 600 }}>±{p90.toFixed(2)}%</span>
    </div>
  )
}

// Badge de confianza para usar en predicciones (exportado para otras secciones)
export function ErrorBadge({
  predicted, p75, p90, label = '',
}: { predicted: number; p75: number; p90: number; label?: string }) {
  const absPred = Math.abs(predicted)
  // Confianza: cuántas veces entra el error típico en la predicción
  const ratio = p75 > 0 ? absPred / p75 : 0

  let color: string
  let text: string
  if (ratio >= 1.5) {
    color = '#22c55e'
    text = 'Señal clara'
  } else if (ratio >= 0.8) {
    color = '#f59e0b'
    text = 'Señal moderada'
  } else {
    color = '#ef4444'
    text = 'Señal débil'
  }

  return (
    <div style={{ fontSize: 10, lineHeight: 1.5 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: color + '18', border: `1px solid ${color}44`,
        borderRadius: 5, padding: '2px 7px', marginBottom: 4,
      }}>
        <span style={{ fontSize: 8, color }}>●</span>
        <span style={{ color, fontWeight: 600 }}>{text}</span>
        {label && <span style={{ color: 'var(--text-hint)' }}>· {label}</span>}
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-hint)' }}>
        <span>75% prob. desvío ≤ </span>
        <span style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", color: '#84cc16' }}>±{p75.toFixed(2)}%</span>
        <span>  ·  90% ≤ </span>
        <span style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", color: '#f59e0b' }}>±{p90.toFixed(2)}%</span>
      </div>
    </div>
  )
}

type JobState = 'idle' | 'running' | 'done' | 'error'

export function EntrenamientoSection({
  runs, horizonWeights, globalWeights, backtestModelStats, changelog, dailyModelParams,
}: Props) {
  // Daily D2 state
  const [dailyState, setDailyState] = useState<JobState>('idle')
  const [dailyMsg,   setDailyMsg]   = useState('')
  const [dailyJobId, setDailyJobId] = useState<string | null>(null)

  // Intraday state
  const [intraState, setIntraState] = useState<JobState>('idle')
  const [intraMsg,   setIntraMsg]   = useState('')
  const [intraJobId, setIntraJobId] = useState<string | null>(null)

  // Advanced state
  const [lrState,      setLrState]      = useState<JobState>('idle')
  const [lrMsg,        setLrMsg]        = useState('')
  const [federState,   setFederState]   = useState<JobState>('idle')
  const [federMsg,     setFederMsg]     = useState('')

  // UI toggles
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showActivos,  setShowActivos]  = useState(false)
  const [showHistory,  setShowHistory]  = useState(false)

  const anyRunning = dailyState === 'running' || intraState === 'running'

  // Poll daily D2
  useEffect(() => {
    if (!dailyJobId) return
    const iv = setInterval(async () => {
      try {
        const j = await fetch(`/api/lr-train-daily-status?jobId=${dailyJobId}`).then(r => r.json())
        if (!j.ok) return
        if (j.status === 'done') {
          setDailyState('done')
          setDailyMsg(`${j.models_trained ?? 0} buckets · ${(j.total_samples ?? 0).toLocaleString()} muestras · recargar para ver MAE`)
          setDailyJobId(null)
        } else if (j.status === 'error') {
          setDailyState('error')
          setDailyMsg(j.error ?? 'Error')
          setDailyJobId(null)
        } else {
          setDailyMsg(`${j.models_done ?? 0}/5 buckets en progreso…`)
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(iv)
  }, [dailyJobId])

  // Poll intraday
  useEffect(() => {
    if (!intraJobId) return
    const iv = setInterval(async () => {
      try {
        const j = await fetch(`/api/lr-train-status?jobId=${intraJobId}`).then(r => r.json())
        if (!j.ok) return
        if (j.status === 'done') {
          setIntraState('done')
          setIntraMsg(`${j.models_trained ?? 0} buckets · ${(j.total_samples ?? 0).toLocaleString()} muestras`)
          setIntraJobId(null)
        } else if (j.status === 'error') {
          setIntraState('error')
          setIntraMsg(j.error ?? 'Error')
          setIntraJobId(null)
        } else {
          setIntraMsg(`${j.models_done ?? 0}/${j.models_total ?? '?'} buckets…`)
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(iv)
  }, [intraJobId])

  async function trainDaily() {
    setDailyState('running'); setDailyMsg('')
    try {
      const j = await fetch('/api/lr-train-daily', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).then(r => r.json())
      if (j.ok && j.job_id) { setDailyJobId(j.job_id) }
      else { setDailyState('error'); setDailyMsg(j.error ?? 'Error') }
    } catch { setDailyState('error'); setDailyMsg('Error de conexión') }
  }

  async function trainIntra() {
    setIntraState('running'); setIntraMsg('')
    try {
      const j = await fetch('/api/lr-train-intraday', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).then(r => r.json())
      if (j.ok && j.job_id) { setIntraJobId(j.job_id) }
      else { setIntraState('error'); setIntraMsg(j.error ?? 'Error') }
    } catch { setIntraState('error'); setIntraMsg('Error de conexión') }
  }

  async function runLR() {
    setLrState('running'); setLrMsg('')
    try {
      const j = await fetch('/api/backtest/trigger?all=true&force=true', { method: 'POST' }).then(r => r.json())
      setLrMsg(`${j.triggered ?? 0} activos en cola · corre en segundo plano`)
    } catch { setLrState('error'); setLrMsg('Error de conexión') }
  }

  async function federate() {
    setFederState('running'); setFederMsg('')
    try {
      const j = await fetch('/api/backtest/federate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trigger: 'manual' }) }).then(r => r.json())
      if (j.ok) { setFederState('done'); setFederMsg(`${j.model_lr_upserted ?? 0} modelos LR · ${j.weights_upserted ?? 0} pesos`) }
      else { setFederState('error'); setFederMsg(j.error ?? 'Error') }
    } catch { setFederState('error'); setFederMsg('Error de conexión') }
  }

  function btnStyle(state: JobState, disabled: boolean): React.CSSProperties {
    return {
      padding: '7px 18px', fontSize: 11, fontWeight: 600, flexShrink: 0,
      background: state === 'running' ? '#f59e0b22' : state === 'error' ? '#ef444422' : 'var(--bg)',
      color: state === 'running' ? '#f59e0b' : state === 'error' ? '#ef4444' : 'var(--text-muted)',
      border: `1px solid ${state === 'running' ? '#f59e0b44' : state === 'error' ? '#ef444444' : 'var(--border)'}`,
      borderRadius: 7, cursor: disabled ? 'default' : 'pointer', opacity: disabled && state === 'idle' ? 0.6 : 1,
      fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    }
  }
  function btnLabel(state: JobState, defaultLabel: string) {
    if (state === 'running') return 'ejecutando…'
    if (state === 'error')   return 'reintentar'
    if (state === 'done')    return 'completado ✓'
    return defaultLabel
  }

  const done  = runs.filter(r => r.status === 'done').length
  const total = runs.length
  const recentChanges = changelog.filter(c => c.trigger !== 'initial').slice(0, 40)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Entrenamiento</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Modelo diario D2 · 40 features · cluster models · intradiario
        </p>
      </div>

      {/* ── 1. Modelo Diario D2 ── */}
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Modelo Diario D2</div>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                background: '#7c3aed22', color: '#a78bfa', border: '1px solid #7c3aed44',
                fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              }}>LGBM + Ridge · 40 features</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-hint)', margin: '0 0 10px', lineHeight: 1.5 }}>
              Entrena con predicciones cerradas reales. 5 horizontes (7–90d), cluster models por sector, winsorización y features de VIX.
            </p>
            {dailyMsg && (
              <div style={{
                fontSize: 11, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                color: dailyState === 'error' ? '#ef4444' : dailyState === 'done' ? '#22c55e' : '#f59e0b',
                background: 'var(--bg)', borderRadius: 5, padding: '5px 10px', display: 'inline-block',
              }}>
                {dailyMsg}
              </div>
            )}
          </div>
          <button onClick={trainDaily} disabled={anyRunning} style={btnStyle(dailyState, anyRunning)}>
            {btnLabel(dailyState, 'Entrenar')}
          </button>
        </div>

        {/* D2 metrics per bucket */}
        {dailyModelParams.length > 0 ? (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
              Último entrenamiento
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${DAILY_BUCKETS.length}, 1fr)`, gap: 8 }}>
              {DAILY_BUCKETS.map(h => {
                const p = dailyModelParams.find(d => d.horizon_bucket === h)
                return (
                  <div key={h} style={{ background: 'var(--bg)', borderRadius: 7, padding: '10px 8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 6 }}>{h}d</div>
                    {p?.lgbm_val_mae != null ? (
                      <>
                        <div style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 16, fontWeight: 700, color: maeColor(p.lgbm_val_mae) }}>
                          ±{p.lgbm_val_mae.toFixed(2)}%
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-hint)', marginTop: 2 }}>error promedio</div>
                        {p.error_p75 != null && p.error_p90 != null && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', textAlign: 'left' }}>
                            <ErrorBandMini p75={p.error_p75} p90={p.error_p90} />
                          </div>
                        )}
                        {p.train_samples != null && (
                          <div style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 10, color: 'var(--text-hint)', marginTop: 6 }}>
                            n={p.train_samples.toLocaleString()}
                          </div>
                        )}
                        {p.last_updated && (
                          <div style={{ fontSize: 9, color: 'var(--text-hint)', marginTop: 2 }}>
                            {relTime(p.last_updated)}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>—</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-hint)' }}>
            Sin modelo entrenado aún. Ejecutar entrenamiento para generar el primer modelo.
          </div>
        )}
      </Card>

      {/* ── 2. Modelo Intradiario ── */}
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Modelo Intradiario</div>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                background: '#0369a122', color: '#38bdf8', border: '1px solid #0369a144',
                fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              }}>LGBM · H=60/120/240min</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-hint)', margin: '0 0 10px', lineHeight: 1.5 }}>
              Entrena con predicciones intradiarias cerradas. Beta-adjusted target, peer momentum, cluster models por sector.
            </p>
            {intraMsg && (
              <div style={{
                fontSize: 11, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                color: intraState === 'error' ? '#ef4444' : intraState === 'done' ? '#22c55e' : '#f59e0b',
                background: 'var(--bg)', borderRadius: 5, padding: '5px 10px', display: 'inline-block',
              }}>
                {intraMsg}
              </div>
            )}
          </div>
          <button onClick={trainIntra} disabled={anyRunning} style={btnStyle(intraState, anyRunning)}>
            {btnLabel(intraState, 'Entrenar')}
          </button>
        </div>
      </Card>

      {/* ── Avanzado ── */}
      <button
        onClick={() => setShowAdvanced(s => !s)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, cursor: 'pointer', width: '100%', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Avanzado — backtest LR por activo + federación de pesos</span>
        <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{showAdvanced ? '▲' : '▼'}</span>
      </button>

      {showAdvanced && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* LR por activo */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>LR por activo</div>
                <div style={{ fontSize: 11, color: 'var(--text-hint)', lineHeight: 1.4 }}>
                  Walk-forward backtest · 16 modelos × 5 horizontes por activo · {done}/{total} completados
                </div>
                {lrMsg && <div style={{ fontSize: 11, color: '#f59e0b', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", marginTop: 5 }}>{lrMsg}</div>}
                {total > 0 && (
                  <div style={{ marginTop: 7, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round(done / total * 100)}%`, background: '#22c55e' }} />
                  </div>
                )}
              </div>
              <button onClick={runLR} disabled={anyRunning} style={btnStyle(lrState, anyRunning)}>
                {btnLabel(lrState, 'Ejecutar')}
              </button>
            </div>

            {/* Federar */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>Federar pesos</div>
                <div style={{ fontSize: 11, color: 'var(--text-hint)', lineHeight: 1.4 }}>
                  Promedia parámetros de todos los activos → modelo global · recalcula pesos de los 16 modelos
                </div>
                {federMsg && <div style={{ fontSize: 11, color: federState === 'done' ? '#22c55e' : '#f59e0b', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", marginTop: 5 }}>{federMsg}</div>}
              </div>
              <button onClick={federate} disabled={anyRunning} style={btnStyle(federState, anyRunning)}>
                {btnLabel(federState, 'Federar')}
              </button>
            </div>
          </div>

          {/* Activos table */}
          {total > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowActivos(s => !s)} style={{ fontSize: 11, color: 'var(--text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {showActivos ? '▲ Ocultar activos' : `▼ Ver activos (${done}/${total} completados)`}
              </button>
              {showActivos && (
                <div style={{ marginTop: 10, overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--card)' }}>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Ticker', 'Estado', 'Fechas', 'Evaluaciones'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '5px 10px', color: 'var(--text-hint)', fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...runs].sort((a, b) => {
                        const o: Record<string, number> = { error: 0, running: 1, pending: 2, done: 3 }
                        return (o[a.status] ?? 9) - (o[b.status] ?? 9)
                      }).map(r => (
                        <tr key={r.ticker} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '4px 10px', fontWeight: 700, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 11 }}>{r.ticker}</td>
                          <td style={{ padding: '4px 10px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: { done: '#22c55e', running: '#f59e0b', pending: '#6b7280', error: '#ef4444' }[r.status] }}>
                              {r.status}
                            </span>
                          </td>
                          <td style={{ padding: '4px 10px', color: 'var(--text-muted)', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 11 }}>{r.dates_processed?.toLocaleString() ?? '—'}</td>
                          <td style={{ padding: '4px 10px', color: 'var(--text-muted)', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 11 }}>{r.predictions_evaluated?.toLocaleString() ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ── Historial de cambios ── */}
      {recentChanges.length > 0 && (
        <>
          <button
            onClick={() => setShowHistory(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px',
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
              cursor: 'pointer', width: '100%', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Historial de cambios ({recentChanges.length})</span>
            <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{showHistory ? '▲' : '▼'}</span>
          </button>

          {showHistory && (
            <Card style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 400, overflowY: 'auto' }}>
                {recentChanges.map(entry => {
                  const isLR = entry.change_type === 'lr_params'
                  const accDelta = (entry.new_accuracy ?? 0) - (entry.old_accuracy ?? 0)
                  return (
                    <div key={entry.id} style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 12px',
                      background: 'var(--bg)', borderRadius: 7,
                      borderLeft: `3px solid ${isLR ? '#3b82f6' : '#f59e0b'}`,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 }}>
                          <span style={{ fontWeight: 700, fontSize: 11, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>{entry.model_name}</span>
                          {entry.horizon_bucket && (
                            <span style={{ fontSize: 10, color: 'var(--text-hint)', background: 'var(--card)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>
                              {entry.horizon_bucket}d
                            </span>
                          )}
                          <span style={{ fontSize: 10, color: 'var(--text-hint)' }}>{relTime(entry.snapshot_at)}</span>
                          <span style={{ fontSize: 10, color: isLR ? '#3b82f6' : '#f59e0b' }}>{isLR ? 'LR' : 'peso'}</span>
                        </div>
                        {isLR && entry.new_accuracy != null && entry.old_accuracy != null && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {((entry.old_accuracy ?? 0) * 100).toFixed(1)}% →{' '}
                            <span style={{ fontWeight: 700, color: accDelta > 0 ? '#22c55e' : accDelta < -0.001 ? '#f87171' : 'var(--text)' }}>
                              {(entry.new_accuracy * 100).toFixed(1)}%
                            </span>
                            {Math.abs(accDelta) > 0.001 && (
                              <span style={{ color: accDelta > 0 ? '#22c55e' : '#f87171', marginLeft: 5, fontWeight: 700, fontSize: 10 }}>
                                {accDelta > 0 ? '▲' : '▼'}{(Math.abs(accDelta) * 100).toFixed(1)}pp
                              </span>
                            )}
                            {entry.new_samples != null && (
                              <span style={{ color: 'var(--text-hint)', marginLeft: 6, fontSize: 10 }}>n={entry.new_samples.toLocaleString()}</span>
                            )}
                          </div>
                        )}
                        {!isLR && entry.new_weight != null && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            peso: {(entry.old_weight ?? 0).toFixed(3)} → <span style={{ fontWeight: 700 }}>{entry.new_weight.toFixed(3)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
