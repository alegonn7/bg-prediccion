'use client'
import { useState, useEffect } from 'react'
import type { BacktestModelStat } from './ModelsSection'
import type { ChangelogEntry, XgbHistoryEntry, DailyModelParam } from '@/app/page'

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
  xgbHistory: XgbHistoryEntry[]
  dailyModelParams: DailyModelParam[]
}

const XGB_MODELS = ['tendencia','momentum','volatilidad','volumen','estructura','elliott','velas','macro','fundamental','sentimiento','regresion','reversion','divergencias','estacionalidad','beta_mercado','fuerza_relativa']
const DAILY_BUCKETS = [7, 14, 30, 60, 90]

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

type JobState = 'idle' | 'running' | 'done' | 'error'

export function EntrenamientoSection({
  runs, horizonWeights, globalWeights, backtestModelStats, changelog, xgbHistory, dailyModelParams,
}: Props) {
  // Daily D2 state
  const [dailyState, setDailyState] = useState<JobState>('idle')
  const [dailyMsg,   setDailyMsg]   = useState('')
  const [dailyJobId, setDailyJobId] = useState<string | null>(null)

  // Intraday state
  const [intraState, setIntraState] = useState<JobState>('idle')
  const [intraMsg,   setIntraMsg]   = useState('')
  const [intraJobId, setIntraJobId] = useState<string | null>(null)

  // XGBoost state
  const [xgbState,      setXgbState]      = useState<JobState>('idle')
  const [xgbMsg,        setXgbMsg]        = useState('')
  const [xgbJobId,      setXgbJobId]      = useState<string | null>(null)
  const [predictState,  setPredictState]  = useState<JobState>('idle')
  const [predictMsg,    setPredictMsg]    = useState('')
  const [predictJobId,  setPredictJobId]  = useState<string | null>(null)

  // Advanced state
  const [lrState,      setLrState]      = useState<JobState>('idle')
  const [lrMsg,        setLrMsg]        = useState('')
  const [federState,   setFederState]   = useState<JobState>('idle')
  const [federMsg,     setFederMsg]     = useState('')

  // UI toggles
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showXgbSingle, setShowXgbSingle] = useState(false)
  const [showActivos,  setShowActivos]  = useState(false)
  const [showHistory,  setShowHistory]  = useState(false)
  const [xgbSingleRunning, setXgbSingleRunning] = useState<string | null>(null)
  const [xgbSingleResult,  setXgbSingleResult]  = useState<string | null>(null)

  const anyRunning = dailyState === 'running' || intraState === 'running' || xgbState === 'running' || predictState === 'running'

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

  // Poll XGBoost train
  useEffect(() => {
    if (!xgbJobId) return
    const iv = setInterval(async () => {
      try {
        const j = await fetch(`/api/xgb-train-status?jobId=${xgbJobId}`).then(r => r.json())
        if (!j.ok) return
        if (j.status === 'done') {
          setXgbState('done')
          setXgbMsg(`${j.models_done ?? 0} modelos entrenados`)
          setXgbJobId(null)
        } else if (j.status === 'error') {
          setXgbState('error')
          setXgbMsg(j.error ?? 'Error')
          setXgbJobId(null)
        } else {
          const cur = j.current_model ? ` — ${j.current_model}` : ''
          setXgbMsg(`${j.models_done ?? 0}/${j.models_total ?? 16}${cur}`)
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(iv)
  }, [xgbJobId])

  // Poll XGBoost predict
  useEffect(() => {
    if (!predictJobId) return
    const iv = setInterval(async () => {
      try {
        const j = await fetch(`/api/xgb-predict-status?jobId=${predictJobId}`).then(r => r.json())
        if (!j.ok) return
        if (j.status === 'done') {
          const r = j.result ?? {}
          setPredictState('done')
          setPredictMsg(`${r.predictions ?? 0} predicciones · ${r.assets ?? 0} activos · ${r.date ?? ''}`)
          setPredictJobId(null)
        } else if (j.status === 'error') {
          setPredictState('error')
          setPredictMsg(j.error ?? 'Error')
          setPredictJobId(null)
        } else {
          setPredictMsg(`${j.models_done ?? 0}/${j.models_total ?? '?'} modelos…`)
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(iv)
  }, [predictJobId])

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

  async function trainXgb() {
    setXgbState('running'); setXgbMsg('')
    try {
      const j = await fetch('/api/xgb-train-all', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).then(r => r.json())
      if (j.ok && j.job_id) { setXgbJobId(j.job_id) }
      else { setXgbState('error'); setXgbMsg(j.error ?? 'Error') }
    } catch { setXgbState('error'); setXgbMsg('Error de conexión') }
  }

  async function generatePredictions() {
    setPredictState('running'); setPredictMsg('')
    try {
      const j = await fetch('/api/xgb-predict', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).then(r => r.json())
      if (j.ok && j.job_id) { setPredictJobId(j.job_id) }
      else { setPredictState('error'); setPredictMsg(j.error ?? 'Error') }
    } catch { setPredictState('error'); setPredictMsg('Error de conexión') }
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

  async function handleXGBSingle(mn: string) {
    setXgbSingleRunning(mn); setXgbSingleResult(null)
    try {
      const j = await fetch('/api/xgb-train', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model_name: mn }) }).then(r => r.json())
      if (j.ok) {
        const accs = Object.entries(j.buckets ?? {}).filter(([, v]: any) => !v.skipped).map(([b, v]: any) => `${b}d:${(v.accuracy * 100).toFixed(0)}%`).join(' · ')
        setXgbSingleResult(`${mn}: ${accs || 'entrenado'}`)
      } else { setXgbSingleResult(`Error: ${j.error}`) }
    } catch { setXgbSingleResult('Error de conexión') }
    finally { setXgbSingleRunning(null) }
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

  // Last XGB trained
  const lastXgb = xgbHistory.length > 0
    ? [...xgbHistory].sort((a, b) => b.trained_at.localeCompare(a.trained_at))[0]
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Entrenamiento</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Modelo diario D2 · 40 features · cluster models · intradiario · XGBoost
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
                        <div style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 16, fontWeight: 700, color: maeColor(p.lgbm_val_mae * 100) }}>
                          ±{(p.lgbm_val_mae * 100).toFixed(1)}%
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-hint)', marginTop: 2 }}>lgbm mae</div>
                        {p.train_samples != null && (
                          <div style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 10, color: 'var(--text-hint)', marginTop: 4 }}>
                            n={p.train_samples.toLocaleString()}
                          </div>
                        )}
                        {p.updated_at && (
                          <div style={{ fontSize: 9, color: 'var(--text-hint)', marginTop: 2 }}>
                            {relTime(p.updated_at)}
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

      {/* ── 3. XGBoost + Scores ── */}
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: xgbMsg || predictMsg ? 10 : 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>XGBoost — Scores fundamentales</div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-hint)', margin: 0, lineHeight: 1.5 }}>
              16 modelos (tendencia, momentum, macro…) → generan features score_* usados por el modelo D2.
              {lastXgb && <> Último entrenamiento: <span style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>{relTime(lastXgb.trained_at)}</span>.</>}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <button onClick={trainXgb} disabled={anyRunning} style={{ ...btnStyle(xgbState, anyRunning), whiteSpace: 'nowrap' }}>
              {btnLabel(xgbState, 'Entrenar modelos')}
            </button>
            <button onClick={generatePredictions} disabled={anyRunning} style={{ ...btnStyle(predictState, anyRunning), whiteSpace: 'nowrap' }}>
              {btnLabel(predictState, 'Predicciones hoy')}
            </button>
          </div>
        </div>
        {(xgbMsg || predictMsg) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {xgbMsg && (
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", color: xgbState === 'error' ? '#ef4444' : xgbState === 'done' ? '#22c55e' : '#f59e0b', background: 'var(--bg)', borderRadius: 5, padding: '5px 10px', display: 'inline-block' }}>
                XGBoost: {xgbMsg}
              </div>
            )}
            {predictMsg && (
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", color: predictState === 'error' ? '#ef4444' : predictState === 'done' ? '#22c55e' : '#f59e0b', background: 'var(--bg)', borderRadius: 5, padding: '5px 10px', display: 'inline-block' }}>
                Predicciones: {predictMsg}
              </div>
            )}
          </div>
        )}

        {/* XGBoost per-model training */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setShowXgbSingle(s => !s)} style={{ fontSize: 11, color: 'var(--text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {showXgbSingle ? '▲ Ocultar' : '▼ Reentrenar modelo individual'}
          </button>
          {showXgbSingle && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: xgbSingleResult ? 8 : 0 }}>
                {XGB_MODELS.map(mn => (
                  <button key={mn} onClick={() => handleXGBSingle(mn)} disabled={xgbSingleRunning !== null || anyRunning} style={{
                    padding: '3px 9px', fontSize: 10,
                    background: xgbSingleRunning === mn ? '#7c3aed' : 'var(--bg)',
                    color: xgbSingleRunning === mn ? '#fff' : 'var(--text-hint)',
                    border: `1px solid ${xgbSingleRunning === mn ? '#7c3aed' : 'var(--border)'}`,
                    borderRadius: 5, cursor: xgbSingleRunning !== null ? 'default' : 'pointer',
                    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                  }}>
                    {mn}
                  </button>
                ))}
              </div>
              {xgbSingleResult && (
                <div style={{ fontSize: 11, marginTop: 6, color: 'var(--text-muted)', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", background: 'var(--bg)', borderRadius: 5, padding: '6px 10px' }}>
                  {xgbSingleResult}
                </div>
              )}
            </div>
          )}
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
