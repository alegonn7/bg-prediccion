'use client'
import { useState, useEffect } from 'react'
import type { BacktestModelStat } from './ModelsSection'
import type { ChangelogEntry, XgbHistoryEntry } from '@/app/page'

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
}

const BUCKETS = [7, 14, 30, 60, 90]
const XGB_MODELS = ['tendencia','momentum','volatilidad','volumen','estructura','elliott','velas','macro','fundamental','sentimiento','regresion','reversion','divergencias','estacionalidad','beta_mercado','fuerza_relativa']

type StepId = 'lr' | 'federate' | 'xgb' | 'predict' | 'ridge'

const STEPS: { id: StepId; label: string; desc: string }[] = [
  { id: 'lr',       label: 'LR por activo',   desc: 'Backtest walk-forward en cada activo · 16 modelos × 5 horizontes' },
  { id: 'federate', label: 'Federar',          desc: 'Promedia los parámetros de todos los activos en un modelo global' },
  { id: 'xgb',      label: 'XGBoost global',   desc: 'Entrena 80 modelos usando datos de todos los activos juntos (45% del consenso)' },
  { id: 'predict',  label: 'Predicciones hoy', desc: 'Genera las señales XGBoost del día para todos los activos' },
  { id: 'ridge',    label: 'Ridge MAE',         desc: 'Aprende de predicciones cerradas reales → predice magnitud + dirección juntos' },
]

function maeBg(v: number) {
  if (v <= 1.5) return '#14532d22'
  if (v <= 2.5) return '#16a34a18'
  if (v <= 4.0) return '#84cc1614'
  if (v <= 6.0) return '#ca8a0414'
  return '#dc262614'
}
function maeColor(v: number) {
  if (v <= 1.5) return '#16a34a'
  if (v <= 2.5) return '#22c55e'
  if (v <= 4.0) return '#84cc16'
  if (v <= 6.0) return '#ca8a04'
  return '#dc2626'
}
function dirColor(v: number) {
  if (v >= 65) return '#22c55e'
  if (v >= 58) return '#84cc16'
  if (v >= 53) return '#ca8a04'
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

export function EntrenamientoSection({ runs, horizonWeights, globalWeights, backtestModelStats, changelog, xgbHistory }: Props) {
  const [stepState, setStepState] = useState<Record<StepId, 'idle'|'running'|'done'|'error'>>({
    lr: 'idle', federate: 'idle', xgb: 'idle', predict: 'idle', ridge: 'idle',
  })
  const [stepMsg, setStepMsg] = useState<Partial<Record<StepId, string>>>({})
  const [xgbJobId, setXgbJobId]     = useState<string | null>(null)
  const [predictJobId, setPredictJobId] = useState<string | null>(null)
  const [ridgeJobId, setRidgeJobId]   = useState<string | null>(null)
  const [showActivos, setShowActivos] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [metricTab, setMetricTab]     = useState<'horizon'|'model'>('horizon')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [xgbSingleRunning, setXgbSingleRunning] = useState<string | null>(null)
  const [xgbSingleResult, setXgbSingleResult] = useState<string | null>(null)

  const done  = runs.filter(r => r.status === 'done').length
  const total = runs.length
  const isAnyRunning = Object.values(stepState).some(s => s === 'running')

  // XGBoost train polling
  useEffect(() => {
    if (!xgbJobId) return
    const iv = setInterval(async () => {
      try {
        const json = await fetch(`/api/xgb-train-status?jobId=${xgbJobId}`).then(r => r.json())
        if (!json.ok) return
        if (json.status === 'done') {
          setStepState(s => ({ ...s, xgb: 'done' }))
          setStepMsg(s => ({ ...s, xgb: `${json.models_done ?? 0} modelos entrenados` }))
          setXgbJobId(null)
        } else if (json.status === 'error') {
          setStepState(s => ({ ...s, xgb: 'error' }))
          setStepMsg(s => ({ ...s, xgb: json.error ?? 'Error' }))
          setXgbJobId(null)
        } else {
          const cur = json.current_model ? ` — ${json.current_model}` : ''
          setStepMsg(s => ({ ...s, xgb: `${json.models_done ?? 0}/${json.models_total ?? 16}${cur}` }))
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(iv)
  }, [xgbJobId])

  // XGBoost predict polling
  useEffect(() => {
    if (!predictJobId) return
    const iv = setInterval(async () => {
      try {
        const json = await fetch(`/api/xgb-predict-status?jobId=${predictJobId}`).then(r => r.json())
        if (!json.ok) return
        if (json.status === 'done') {
          const r = json.result ?? {}
          setStepState(s => ({ ...s, predict: 'done' }))
          setStepMsg(s => ({ ...s, predict: `${r.predictions ?? 0} predicciones · ${r.assets ?? 0} activos · ${r.date ?? ''}` }))
          setPredictJobId(null)
        } else if (json.status === 'error') {
          setStepState(s => ({ ...s, predict: 'error' }))
          setStepMsg(s => ({ ...s, predict: json.error ?? 'Error' }))
          setPredictJobId(null)
        } else {
          setStepMsg(s => ({ ...s, predict: `${json.models_done ?? 0}/${json.models_total ?? '?'} modelos` }))
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(iv)
  }, [predictJobId])

  // Ridge polling
  useEffect(() => {
    if (!ridgeJobId) return
    const iv = setInterval(async () => {
      try {
        const json = await fetch(`/api/lr-train-daily-status?jobId=${ridgeJobId}`).then(r => r.json())
        if (!json.ok) return
        if (json.status === 'done') {
          setStepState(s => ({ ...s, ridge: 'done' }))
          setStepMsg(s => ({ ...s, ridge: `${json.models_trained ?? 0} buckets · ${(json.total_samples ?? 0).toLocaleString()} muestras reales` }))
          setRidgeJobId(null)
        } else if (json.status === 'error') {
          setStepState(s => ({ ...s, ridge: 'error' }))
          setStepMsg(s => ({ ...s, ridge: json.error ?? 'Error' }))
          setRidgeJobId(null)
        } else {
          setStepMsg(s => ({ ...s, ridge: `${json.models_done ?? 0}/5 buckets` }))
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(iv)
  }, [ridgeJobId])

  async function runStep(id: StepId) {
    setStepState(s => ({ ...s, [id]: 'running' }))
    setStepMsg(s => ({ ...s, [id]: '' }))
    try {
      if (id === 'lr') {
        const json = await fetch('/api/backtest/trigger?all=true&force=true', { method: 'POST' }).then(r => r.json())
        // LR runs in background server-side, no polling API
        setStepMsg(s => ({ ...s, lr: `${json.triggered ?? 0} activos en cola · corre en segundo plano` }))
        // Leave as 'running' — user reloads to see updated done count
      } else if (id === 'federate') {
        const json = await fetch('/api/backtest/federate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger: 'manual' }),
        }).then(r => r.json())
        if (json.ok) {
          setStepState(s => ({ ...s, federate: 'done' }))
          setStepMsg(s => ({ ...s, federate: `${json.model_lr_upserted ?? 0} modelos LR · ${json.weights_upserted ?? 0} pesos recalculados` }))
        } else {
          setStepState(s => ({ ...s, federate: 'error' }))
          setStepMsg(s => ({ ...s, federate: json.error ?? 'Error' }))
        }
      } else if (id === 'xgb') {
        const json = await fetch('/api/xgb-train-all', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).then(r => r.json())
        if (json.ok && json.job_id) { setXgbJobId(json.job_id) }
        else { setStepState(s => ({ ...s, xgb: 'error' })); setStepMsg(s => ({ ...s, xgb: json.error ?? 'Error' })) }
      } else if (id === 'predict') {
        const json = await fetch('/api/xgb-predict', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).then(r => r.json())
        if (json.ok && json.job_id) { setPredictJobId(json.job_id) }
        else { setStepState(s => ({ ...s, predict: 'error' })); setStepMsg(s => ({ ...s, predict: json.error ?? 'Error' })) }
      } else if (id === 'ridge') {
        const json = await fetch('/api/lr-train-daily', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).then(r => r.json())
        if (json.ok && json.job_id) { setRidgeJobId(json.job_id) }
        else { setStepState(s => ({ ...s, ridge: 'error' })); setStepMsg(s => ({ ...s, ridge: json.error ?? 'Error' })) }
      }
    } catch {
      setStepState(s => ({ ...s, [id]: 'error' }))
      setStepMsg(s => ({ ...s, [id]: 'Error de conexión' }))
    }
  }

  async function handleXGBSingle(mn: string) {
    setXgbSingleRunning(mn)
    setXgbSingleResult(null)
    try {
      const json = await fetch('/api/xgb-train', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: mn }),
      }).then(r => r.json())
      if (json.ok) {
        const accs = Object.entries(json.buckets ?? {})
          .filter(([, v]: any) => !v.skipped)
          .map(([b, v]: any) => `${b}d:${(v.accuracy * 100).toFixed(0)}%`)
          .join(' · ')
        setXgbSingleResult(`${mn}: ${accs || 'entrenado'}`)
      } else {
        setXgbSingleResult(`Error: ${json.error}`)
      }
    } catch { setXgbSingleResult('Error de conexión.') }
    finally { setXgbSingleRunning(null) }
  }

  // Derived: step visual state
  function stepVisual(id: StepId): { icon: string; color: string; bg: string } {
    const s = stepState[id]
    if (s === 'done')    return { icon: '✓', color: '#22c55e', bg: '#22c55e18' }
    if (s === 'error')   return { icon: '✗', color: '#ef4444', bg: '#ef444418' }
    if (s === 'running') return { icon: '…', color: '#f59e0b', bg: '#f59e0b18' }
    // idle — infer from props
    if (id === 'lr'       && done > 0)               return { icon: '✓', color: '#22c55e', bg: '#22c55e18' }
    if (id === 'federate' && globalWeights.length > 0) return { icon: '✓', color: '#22c55e', bg: '#22c55e18' }
    if (id === 'xgb'      && xgbHistory.length > 0)   return { icon: '✓', color: '#22c55e', bg: '#22c55e18' }
    return { icon: '○', color: 'var(--border)', bg: 'var(--bg)' }
  }

  function stepInfo(id: StepId): string | null {
    if (stepMsg[id]) return stepMsg[id] ?? null
    if (id === 'lr'       && done > 0)               return `${done}/${total} activos`
    if (id === 'federate' && globalWeights.length > 0) return `${globalWeights.length} modelos`
    if (id === 'xgb'      && xgbHistory.length > 0) {
      const last = [...xgbHistory].sort((a, b) => b.trained_at.localeCompare(a.trained_at))[0]
      return `${[...new Set(xgbHistory.map(h => h.model_name))].length} modelos · ${relTime(last.trained_at)}`
    }
    return null
  }

  // Derived: MAE stats
  const maeByHorizon = BUCKETS.map(b => {
    const stats = backtestModelStats.filter(s => s.horizon_bucket === b)
    if (!stats.length) return { b, mae: null, dir: null }
    return {
      b,
      mae: stats.reduce((s, r) => s + r.mae_avg, 0) / stats.length * 100,
      dir: stats.reduce((s, r) => s + r.pct, 0) / stats.length * 100,
    }
  })

  const maeByModel = [...new Set(backtestModelStats.map(s => s.model_name))].map(mn => {
    const stats = backtestModelStats.filter(s => s.model_name === mn)
    return {
      mn,
      mae: stats.reduce((s, r) => s + r.mae_avg, 0) / stats.length * 100,
      dir: stats.reduce((s, r) => s + r.pct, 0) / stats.length * 100,
    }
  }).sort((a, b) => a.mae - b.mae)

  const recentChanges = changelog.filter(c => c.trigger !== 'initial').slice(0, 40)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Entrenamiento Diario</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          5 pasos en orden · {total} activos · horizontes 7 / 14 / 30 / 60 / 90 días
        </p>
      </div>

      {/* ── Pipeline ── */}
      <Card>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 16 }}>
          Pipeline de entrenamiento
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {STEPS.map((step, i) => {
            const { icon, color, bg } = stepVisual(step.id)
            const info = stepInfo(step.id)
            const running = stepState[step.id] === 'running'
            const isError = stepState[step.id] === 'error'

            return (
              <div key={step.id} style={{
                display: 'flex', gap: 16, alignItems: 'center',
                padding: '14px 0',
                borderBottom: i < STEPS.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                {/* Circle */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: bg, border: `2px solid ${color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: icon === '○' ? 11 : 15, fontWeight: 700, color,
                }}>
                  {icon === '○' ? i + 1 : icon}
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{step.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 2 }}>{step.desc}</div>
                  {info && (
                    <div style={{
                      fontSize: 11, marginTop: 4,
                      fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                      color: running ? '#f59e0b' : isError ? '#ef4444' : 'var(--text-muted)',
                    }}>
                      {info}
                    </div>
                  )}
                </div>

                {/* Action */}
                <button
                  onClick={() => runStep(step.id)}
                  disabled={isAnyRunning}
                  style={{
                    padding: '6px 16px', fontSize: 11, fontWeight: 600, flexShrink: 0,
                    background: running ? '#f59e0b22' : isError ? '#ef444422' : 'var(--bg)',
                    color: running ? '#f59e0b' : isError ? '#ef4444' : 'var(--text-muted)',
                    border: `1px solid ${running ? '#f59e0b44' : isError ? '#ef444444' : 'var(--border)'}`,
                    borderRadius: 7, cursor: isAnyRunning ? 'default' : 'pointer',
                    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                  }}
                >
                  {running ? 'ejecutando…' : isError ? 'reintentar' : 'Ejecutar'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Advanced XGBoost per model */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowAdvanced(s => !s)}
            style={{ fontSize: 11, color: 'var(--text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {showAdvanced ? '▲ Ocultar' : '▼ Avanzado — reentrenar modelo XGBoost individual'}
          </button>
          {showAdvanced && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: xgbSingleResult ? 10 : 0 }}>
                {XGB_MODELS.map(mn => (
                  <button
                    key={mn}
                    onClick={() => handleXGBSingle(mn)}
                    disabled={xgbSingleRunning !== null || isAnyRunning}
                    style={{
                      padding: '3px 9px', fontSize: 10,
                      background: xgbSingleRunning === mn ? '#7c3aed' : 'var(--bg)',
                      color: xgbSingleRunning === mn ? '#fff' : 'var(--text-hint)',
                      border: `1px solid ${xgbSingleRunning === mn ? '#7c3aed' : 'var(--border)'}`,
                      borderRadius: 5, cursor: xgbSingleRunning !== null ? 'default' : 'pointer',
                      fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                    }}
                  >
                    {mn}
                  </button>
                ))}
              </div>
              {xgbSingleResult && (
                <div style={{ fontSize: 11, marginTop: 8, color: 'var(--text-muted)', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", background: 'var(--bg)', borderRadius: 6, padding: '7px 10px' }}>
                  {xgbSingleResult}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* ── Métricas MAE ── */}
      {backtestModelStats.length > 0 && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Resultados</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['horizon', 'model'] as const).map(t => (
                <button key={t} onClick={() => setMetricTab(t)} style={{
                  padding: '4px 12px', fontSize: 11, fontWeight: metricTab === t ? 700 : 400,
                  background: metricTab === t ? 'var(--text)' : 'var(--card)',
                  color: metricTab === t ? 'var(--bg)' : 'var(--text-muted)',
                  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                }}>
                  {t === 'horizon' ? 'Por horizonte' : 'Por modelo'}
                </button>
              ))}
            </div>
          </div>

          {metricTab === 'horizon' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BUCKETS.length}, 1fr)`, gap: 10 }}>
                {maeByHorizon.map(({ b, mae, dir }) => (
                  <div key={b} style={{
                    background: 'var(--bg)', borderRadius: 8, padding: '14px 12px', textAlign: 'center',
                    border: mae != null ? `1px solid ${maeColor(mae)}44` : '1px solid var(--border)',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 10 }}>{b} días</div>
                    {mae != null ? (
                      <>
                        <div style={{
                          fontSize: 20, fontWeight: 700, color: maeColor(mae),
                          background: maeBg(mae), borderRadius: 6, padding: '4px 0', marginBottom: 6,
                          fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                        }}>
                          ±{mae.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 8 }}>error promedio</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: dirColor(dir ?? 0) }}>
                          {dir?.toFixed(0)}% dir
                        </div>
                      </>
                    ) : <span style={{ color: 'var(--text-hint)' }}>—</span>}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-hint)' }}>
                <b>Error promedio:</b> si predecimos +3% y el activo se mueve +1.8%, el error es ±1.2pp ·
                <b> Dirección:</b> % de veces que acertamos si sube o baja (50% = azar)
              </div>
            </>
          )}

          {metricTab === 'model' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-hint)', fontWeight: 500 }}>Modelo</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', color: 'var(--text-hint)', fontWeight: 500 }}>Error prom ↑mejor</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', color: 'var(--text-hint)', fontWeight: 500 }}>% dirección</th>
                    {BUCKETS.map(b => (
                      <th key={b} style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-hint)', fontWeight: 500, borderLeft: '1px solid var(--border)', fontSize: 10 }}>
                        {b}d
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {maeByModel.map(({ mn, mae, dir }, idx) => (
                    <tr key={mn} style={{ borderBottom: '1px solid var(--border)', background: idx === 0 ? maeBg(mae) : 'transparent' }}>
                      <td style={{ padding: '7px 10px', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontWeight: 600, color: 'var(--text-muted)' }}>
                        {mn}
                      </td>
                      <td style={{ textAlign: 'center', padding: '7px 10px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 5,
                          background: maeBg(mae), color: maeColor(mae),
                          fontWeight: 700, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                        }}>
                          ±{mae.toFixed(2)}%
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '7px 10px', fontWeight: 600, color: dirColor(dir) }}>
                        {dir.toFixed(0)}%
                      </td>
                      {BUCKETS.map(b => {
                        const st = backtestModelStats.find(s => s.model_name === mn && s.horizon_bucket === b)
                        const m = st ? st.mae_avg * 100 : null
                        return (
                          <td key={b} style={{ textAlign: 'center', padding: '7px 6px', borderLeft: '1px solid var(--border)', fontSize: 11, color: m != null ? maeColor(m) : 'var(--text-hint)' }}>
                            {m != null ? `±${m.toFixed(1)}%` : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-hint)' }}>
                Ordenado de mejor a peor error de magnitud · resaltado = modelo más preciso
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Activos (collapsible) ── */}
      {total > 0 && (
        <>
          <button
            onClick={() => setShowActivos(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
              cursor: 'pointer', textAlign: 'left', width: '100%',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, fontSize: 13, fontWeight: 600 }}>
                <span>Activos entrenados (backtest LR)</span>
                <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{done}/{total} · {Math.round(done / total * 100)}%</span>
              </div>
              <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(done / total * 100)}%`, background: '#22c55e', borderRadius: 3 }} />
              </div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-hint)', flexShrink: 0 }}>{showActivos ? '▲' : '▼'}</span>
          </button>

          {showActivos && (
            <Card style={{ padding: '14px 20px' }}>
              <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--card)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Ticker', 'Estado', 'Fechas', 'Evaluaciones', 'Error'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-hint)', fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...runs].sort((a, b) => {
                      const o: Record<string, number> = { error: 0, running: 1, pending: 2, done: 3 }
                      return (o[a.status] ?? 9) - (o[b.status] ?? 9)
                    }).map(r => (
                      <tr key={r.ticker} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 10px', fontWeight: 700, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>{r.ticker}</td>
                        <td style={{ padding: '5px 10px' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                            color: { done: '#22c55e', running: '#f59e0b', pending: '#6b7280', error: '#ef4444' }[r.status],
                          }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ padding: '5px 10px', color: 'var(--text-muted)', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>
                          {r.dates_processed?.toLocaleString() ?? '—'}
                        </td>
                        <td style={{ padding: '5px 10px', color: 'var(--text-muted)', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>
                          {r.predictions_evaluated?.toLocaleString() ?? '—'}
                        </td>
                        <td style={{ padding: '5px 10px', color: '#ef4444', fontSize: 10, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.error_msg ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── Historial (collapsible) ── */}
      {recentChanges.length > 0 && (
        <>
          <button
            onClick={() => setShowHistory(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px',
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
              cursor: 'pointer', width: '100%', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>Historial de cambios ({recentChanges.length})</span>
            <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{showHistory ? '▲' : '▼'}</span>
          </button>

          {showHistory && (
            <Card style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                {recentChanges.map(entry => {
                  const isLR = entry.change_type === 'lr_params'
                  const accDelta = (entry.new_accuracy ?? 0) - (entry.old_accuracy ?? 0)
                  return (
                    <div key={entry.id} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      padding: '10px 12px', background: 'var(--bg)', borderRadius: 7,
                      borderLeft: `3px solid ${isLR ? '#3b82f6' : '#f59e0b'}`,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, fontSize: 12, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>
                            {entry.model_name}
                          </span>
                          {entry.horizon_bucket && (
                            <span style={{ fontSize: 10, color: 'var(--text-hint)', background: 'var(--card)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                              {entry.horizon_bucket}d
                            </span>
                          )}
                          <span style={{ fontSize: 10, color: 'var(--text-hint)' }}>{relTime(entry.snapshot_at)}</span>
                          <span style={{ fontSize: 10, color: isLR ? '#3b82f6' : '#f59e0b' }}>{isLR ? 'LR' : 'peso'}</span>
                        </div>
                        {isLR && entry.new_accuracy != null && entry.old_accuracy != null && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            dir: {((entry.old_accuracy ?? 0) * 100).toFixed(1)}% →{' '}
                            <span style={{ fontWeight: 700, color: accDelta > 0 ? '#22c55e' : accDelta < -0.001 ? '#f87171' : 'var(--text)' }}>
                              {(entry.new_accuracy * 100).toFixed(1)}%
                            </span>
                            {Math.abs(accDelta) > 0.001 && (
                              <span style={{ color: accDelta > 0 ? '#22c55e' : '#f87171', marginLeft: 6, fontWeight: 700 }}>
                                {accDelta > 0 ? '▲' : '▼'}{(Math.abs(accDelta) * 100).toFixed(1)}pp
                              </span>
                            )}
                            {entry.new_samples != null && (
                              <span style={{ color: 'var(--text-hint)', marginLeft: 8 }}>n={entry.new_samples.toLocaleString()}</span>
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
