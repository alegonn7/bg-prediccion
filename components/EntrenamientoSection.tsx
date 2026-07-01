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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'hace un momento'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const TRIGGER_LABEL: Record<string, string> = {
  initial: 'Estado inicial',
  cron:    'Cron automático (02:00 UTC)',
  manual:  'Reentrenamiento manual',
}
const TRIGGER_COLOR: Record<string, string> = {
  initial: '#6b7280',
  cron:    '#3b82f6',
  manual:  '#8b5cf6',
}

function ChangelogCard({ entry }: { entry: ChangelogEntry }) {
  const isLR     = entry.change_type === 'lr_params'
  const isInit   = entry.trigger === 'initial'
  const accDelta = (entry.new_accuracy ?? 0) - (entry.old_accuracy ?? 0)
  const wDelta   = (entry.new_weight ?? 0) - (entry.old_weight ?? 0)
  const samplesDelta = (entry.new_samples ?? 0) - (entry.old_samples ?? 0)
  const hasImpact = Math.abs(accDelta) > 0.001 || Math.abs(wDelta) > 0.01

  return (
    <div style={{
      border: `1px solid ${isInit ? 'var(--border)' : (isLR ? '#3b82f630' : '#f59e0b30')}`,
      borderLeft: `3px solid ${isInit ? 'var(--border)' : (isLR ? '#3b82f6' : '#f59e0b')}`,
      borderRadius: 8,
      padding: '14px 16px',
      background: isInit ? 'var(--bg)' : 'var(--card)',
      opacity: isInit ? 0.75 : 1,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: isLR ? '#3b82f622' : '#f59e0b22',
            color: isLR ? '#3b82f6' : '#f59e0b',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            {isLR ? 'Params LR' : 'Peso Brier'}
          </span>
          <span style={{ fontWeight: 700, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 13 }}>
            {entry.model_name}
          </span>
          {entry.horizon_bucket && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', padding: '1px 7px', borderRadius: 5, border: '1px solid var(--border)' }}>
              {entry.horizon_bucket}d
            </span>
          )}
          <span style={{
            fontSize: 10, padding: '1px 7px', borderRadius: 5,
            color: TRIGGER_COLOR[entry.trigger] ?? 'var(--text-hint)',
            background: (TRIGGER_COLOR[entry.trigger] ?? '#6b7280') + '18',
          }}>
            {TRIGGER_LABEL[entry.trigger] ?? entry.trigger}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-hint)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {relativeTime(entry.snapshot_at)}
        </span>
      </div>

      {/* Métricas clave */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
        {/* Muestras */}
        {entry.new_samples != null && (
          <div style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--text-hint)', marginRight: 4 }}>Muestras:</span>
            {isInit || entry.old_samples === 0 ? (
              <span style={{ fontWeight: 600, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>{entry.new_samples.toLocaleString()}</span>
            ) : (
              <>
                <span style={{ color: 'var(--text-muted)' }}>{(entry.old_samples ?? 0).toLocaleString()}</span>
                <span style={{ color: 'var(--text-hint)', margin: '0 4px' }}>→</span>
                <span style={{ fontWeight: 600 }}>{entry.new_samples.toLocaleString()}</span>
                {samplesDelta !== 0 && (
                  <span style={{ fontSize: 11, color: samplesDelta > 0 ? '#22c55e' : '#f87171', marginLeft: 4 }}>
                    {samplesDelta > 0 ? '+' : ''}{samplesDelta.toLocaleString()}
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* Precisión LR o Peso */}
        {isLR && entry.new_accuracy != null && (
          <div style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--text-hint)', marginRight: 4 }}>Precisión LR:</span>
            {isInit || entry.old_accuracy === 0 ? (
              <span style={{ fontWeight: 600, color: accColor(entry.new_accuracy) }}>{(entry.new_accuracy * 100).toFixed(1)}%</span>
            ) : (
              <>
                <span style={{ color: 'var(--text-muted)' }}>{((entry.old_accuracy ?? 0) * 100).toFixed(1)}%</span>
                <span style={{ color: 'var(--text-hint)', margin: '0 4px' }}>→</span>
                <span style={{ fontWeight: 600, color: accColor(entry.new_accuracy) }}>{(entry.new_accuracy * 100).toFixed(1)}%</span>
                {hasImpact && Math.abs(accDelta) > 0.001 && (
                  <span style={{ fontSize: 11, color: accDelta > 0 ? '#22c55e' : '#f87171', marginLeft: 4, fontWeight: 700 }}>
                    {accDelta > 0 ? '▲' : '▼'}{(Math.abs(accDelta) * 100).toFixed(1)} pp
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {!isLR && entry.new_weight != null && (
          <div style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--text-hint)', marginRight: 4 }}>Peso Brier:</span>
            <span style={{ color: 'var(--text-muted)' }}>{(entry.old_weight ?? 0).toFixed(3)}</span>
            <span style={{ color: 'var(--text-hint)', margin: '0 4px' }}>→</span>
            <span style={{ fontWeight: 600, color: entry.new_weight > 1.1 ? '#22c55e' : entry.new_weight < 0.9 ? '#f87171' : 'var(--text)' }}>
              {entry.new_weight.toFixed(3)}
            </span>
            {Math.abs(wDelta) > 0.001 && (
              <span style={{ fontSize: 11, color: wDelta > 0 ? '#22c55e' : '#f87171', marginLeft: 4, fontWeight: 700 }}>
                {wDelta > 0 ? '▲' : '▼'}{Math.abs(wDelta).toFixed(3)}
              </span>
            )}
          </div>
        )}

        {/* Precisión direccional (weight entries) */}
        {!isLR && entry.new_dir_accuracy != null && (
          <div style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--text-hint)', marginRight: 4 }}>Acc. backtest:</span>
            <span style={{ color: 'var(--text-muted)' }}>{((entry.old_dir_accuracy ?? 0) * 100).toFixed(1)}%</span>
            <span style={{ color: 'var(--text-hint)', margin: '0 4px' }}>→</span>
            <span style={{ fontWeight: 600 }}>{(entry.new_dir_accuracy * 100).toFixed(1)}%</span>
          </div>
        )}

        {/* Feature más cambiada */}
        {isLR && entry.max_coeff_delta != null && entry.max_coeff_delta > 0.005 && entry.top_changed_feature && !isInit && (
          <div style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--text-hint)', marginRight: 4 }}>Mayor Δ coeff:</span>
            <span style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", color: 'var(--text-muted)' }}>
              {entry.top_changed_feature}
            </span>
            <span style={{ color: 'var(--text-hint)', marginLeft: 4 }}>
              (Δ{entry.max_coeff_delta.toFixed(3)})
            </span>
          </div>
        )}
      </div>

      {/* Justificación / Resumen */}
      {entry.summary && (
        <div style={{
          fontSize: 11, color: isInit ? 'var(--text-hint)' : 'var(--text-muted)',
          background: 'var(--bg)', borderRadius: 6, padding: '8px 10px',
          lineHeight: 1.6, borderLeft: '2px solid var(--border)',
        }}>
          <span style={{ color: 'var(--text-hint)', fontWeight: 600, marginRight: 6 }}>Razón:</span>
          {entry.summary}
        </div>
      )}
    </div>
  )
}

export function EntrenamientoSection({ runs, horizonWeights, globalWeights, backtestModelStats, changelog, xgbHistory }: Props) {
  const [triggering, setTriggering] = useState(false)
  const [trainingAll, setTrainingAll] = useState(false)
  const [retraining, setRetraining] = useState(false)
  const [federating, setFederating] = useState(false)
  const [triggerResult, setTriggerResult] = useState<string | null>(null)
  const [xgbTrainingModel, setXgbTrainingModel] = useState<string | null>(null)
  const [xgbTrainingAll, setXgbTrainingAll] = useState(false)
  const [xgbPredicting, setXgbPredicting] = useState(false)
  const [xgbResult, setXgbResult] = useState<string | null>(null)
  const [xgbJobId, setXgbJobId] = useState<string | null>(null)
  const [xgbProgress, setXgbProgress] = useState<{
    status: string
    current_model: string | null
    models_done: number
    models_total: number
    elapsed: number
    estimated_remaining: number | null
  } | null>(null)
  const [showXgbHistory, setShowXgbHistory] = useState(false)
  const [activeSection, setActiveSection] = useState<'resumen' | 'rendimiento' | 'activos' | 'historial'>('resumen')
  const [changelogFilter, setChangelogFilter] = useState<'all' | 'lr_params' | 'weight' | 'changes'>('changes')
  const [activosPage, setActivosPage] = useState(0)
  const [activosFilter, setActivosFilter] = useState<'all' | 'done' | 'running' | 'pending' | 'error'>('all')
  const [historialPage, setHistorialPage] = useState(0)
  const [historialModelSearch, setHistorialModelSearch] = useState('')
  const [historialDateFilter, setHistorialDateFilter] = useState<string>('all')
  const [historialHorizonFilter, setHistorialHorizonFilter] = useState<number | 'all'>('all')
  const [showXgbChart, setShowXgbChart] = useState(true)
  const [xgbChartModel, setXgbChartModel] = useState<string>('all')
  const [showExplanation, setShowExplanation] = useState(false)

  useEffect(() => {
    if (!xgbJobId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/xgb-train-status?jobId=${xgbJobId}`)
        const json = await res.json()
        if (!json.ok) return
        setXgbProgress({
          status: json.status,
          current_model: json.current_model,
          models_done: json.models_done,
          models_total: json.models_total,
          elapsed: json.elapsed,
          estimated_remaining: json.estimated_remaining,
        })
        if (json.status === 'done') {
          const lines = Object.entries(json.results ?? {}).map(([mn, buckets]: [string, any]) => {
            if (buckets?.error) return `${mn}: error — ${buckets.error}`
            const accs = Object.entries(buckets ?? {})
              .filter(([, v]: any) => !v?.skipped)
              .map(([b, v]: any) => `${b}d:${((v?.accuracy ?? 0) * 100).toFixed(0)}%`)
              .join(' ')
            return `${mn}: ${accs || 'entrenado'}`
          })
          setXgbResult(lines.join('\n'))
          setXgbJobId(null)
          setXgbProgress(null)
          setXgbTrainingAll(false)
        } else if (json.status === 'error') {
          const where = json.failed_model ? ` (falló en: ${json.failed_model})` : ''
          setXgbResult(`ERROR${where}\n\n${json.error ?? 'Error desconocido'}`)
          setXgbJobId(null)
          setXgbProgress(null)
          setXgbTrainingAll(false)
        }
      } catch { /* ignore transient poll errors */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [xgbJobId])

  function fmtSeconds(s: number): string {
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60), r = s % 60
    return r > 0 ? `${m}m ${r}s` : `${m}m`
  }

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

  const XGB_MODELS = ['tendencia','momentum','volatilidad','volumen','estructura','elliott','velas','macro','fundamental','sentimiento','regresion','reversion','divergencias','estacionalidad','beta_mercado','fuerza_relativa']

  async function handleXGBTrain(modelName: string | 'all') {
    if (modelName === 'all') {
      setXgbTrainingAll(true)
      setXgbResult(null)
      setXgbProgress(null)
      try {
        const res = await fetch('/api/xgb-train-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        const json = await res.json()
        if (json.ok && json.job_id) {
          setXgbJobId(json.job_id)
          // polling useEffect takes over from here
        } else {
          setXgbResult(`Error: ${json.error ?? 'sin respuesta'}`)
          setXgbTrainingAll(false)
        }
      } catch {
        setXgbResult('Error de conexión.')
        setXgbTrainingAll(false)
      }
      return
    }

    setXgbTrainingModel(modelName)
    setXgbResult(null)
    try {
      const res = await fetch('/api/xgb-train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: modelName }),
      })
      const json = await res.json()
      if (json.ok) {
        const accs = Object.entries(json.buckets ?? {})
          .filter(([, v]: any) => !v.skipped)
          .map(([b, v]: any) => `${b}d: ${(v.accuracy * 100).toFixed(1)}% (n=${v.samples})`)
          .join(' · ')
        setXgbResult(`${modelName} entrenado: ${accs}`)
      } else {
        setXgbResult(`Error: ${json.error}`)
      }
    } catch {
      setXgbResult('Error de conexión.')
    } finally {
      setXgbTrainingModel(null)
    }
  }

  async function handleXGBPredict() {
    setXgbPredicting(true)
    setXgbResult(null)
    try {
      const res = await fetch('/api/xgb-predict', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      const json = await res.json()
      if (json.ok) {
        setXgbResult(`Predicciones generadas: ${json.predictions} para ${json.assets} activos · ${json.models} modelos XGBoost · fecha ${json.date}`)
      } else {
        setXgbResult(`Error: ${json.error}`)
      }
    } catch {
      setXgbResult('Error de conexión.')
    } finally {
      setXgbPredicting(false)
    }
  }

  async function handleFederate() {
    setFederating(true)
    setTriggerResult(null)
    try {
      const res = await fetch('/api/backtest/federate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'manual' }),
      })
      const json = await res.json()
      if (json.ok) {
        setTriggerResult(
          `Federación completada · ${json.model_lr_upserted ?? 0} modelos LR actualizados · ${json.weights_upserted ?? 0} pesos recalculados · ${json.changelog_entries ?? 0} cambios registrados en el historial`
        )
        setActiveSection('historial')
      } else {
        setTriggerResult('Error al federar: ' + (json.error ?? 'desconocido'))
      }
    } catch {
      setTriggerResult('Error de conexión al federar.')
    } finally {
      setFederating(false)
    }
  }

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

  function sectionBtn(id: 'resumen' | 'rendimiento' | 'activos' | 'historial', label: string) {
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
          <div style={{ width: '100%', height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleFederate}
              disabled={federating || triggering || trainingAll || retraining}
              style={{
                background: federating ? 'var(--border)' : '#0ea5e9',
                color: '#fff', border: 'none', borderRadius: 7,
                padding: '9px 20px', fontSize: 12, fontWeight: 700,
                cursor: (federating || triggering || trainingAll || retraining) ? 'default' : 'pointer',
                fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              }}
            >
              {federating ? 'Federando...' : 'Federar modelos y calcular cambios'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>
              Promedia parámetros LR de todos los activos, recalcula pesos Brier y registra cambios en el historial
            </span>
          </div>
          {triggerResult && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, background: 'var(--bg)', borderRadius: 6, padding: '8px 12px' }}>{triggerResult}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', flex: 1 }}>
              Cron automático: 10 activos/día a las 02:00 UTC · "Reentrenar todo" incluye datos reales acumulados (predicciones cerradas verificadas)
            </div>
            <button
              onClick={() => setShowExplanation(s => !s)}
              style={{ fontSize: 11, color: '#0ea5e9', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', whiteSpace: 'nowrap' }}
            >
              {showExplanation ? '▲ Ocultar' : '▼ ¿Qué diferencia hay entre Federar y XGBoost?'}
            </button>
          </div>
          {showExplanation && (
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '14px 16px', border: '1px solid var(--border)', fontSize: 12, lineHeight: 1.7, color: 'var(--text-muted)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#3b82f6', marginBottom: 6, fontSize: 13 }}>Federar modelos LR</div>
                  <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <li>Corre un backtest por activo (16 modelos × 5 horizontes = 80 clasificadores)</li>
                    <li>Cada clasificador es una <b>Regresión Logística (LR)</b> que aprende de los datos históricos de ese activo específico</li>
                    <li>Luego se "federan": los parámetros de los 50+ activos se <b>promedian</b> para crear un modelo global robusto</li>
                    <li>Guardado en <code>model_learned_params</code> — usado como <b>55%</b> del consenso final</li>
                    <li>Fortaleza: adapta pesos por modelo y horizonte según rendimiento en backtest de cada activo</li>
                  </ul>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#7c3aed', marginBottom: 6, fontSize: 13 }}>XGBoost global</div>
                  <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <li>Entrena un único modelo de <b>Gradient Boosting</b> usando TODOS los activos juntos (cross-sectional)</li>
                    <li>Aprende patrones de features técnicos (RSI, ATR, etc.) que se repiten entre activos diferentes</li>
                    <li>Un modelo por cada combinación <b>nombre × horizonte</b> (ej: "tendencia 30d")</li>
                    <li>Guardado en <code>xgb_models</code> — usado como <b>45%</b> del consenso final</li>
                    <li>Fortaleza: detecta patrones universales que el LR por activo puede no ver por falta de datos</li>
                  </ul>
                </div>
              </div>
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--card)', borderRadius: 6, fontSize: 11, color: 'var(--text-hint)', borderLeft: '3px solid #22c55e' }}>
                <b>Resultado combinado:</b> La predicción final = 55% LR federado + 45% XGBoost. Si ambos coinciden en dirección, la confianza sube. Si discrepan, el LR tiene más peso. El historial de entrenamientos de cada uno se ve por separado abajo.
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* XGBoost */}
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>XGBoost global</div>
              <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>
                Modelos globales (pooled de todos los activos) · blending 55% LR / 45% XGBoost en predicciones diarias
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleXGBTrain('all')}
                disabled={xgbTrainingAll || xgbTrainingModel !== null || xgbPredicting}
                style={{
                  background: xgbTrainingAll ? 'var(--border)' : '#7c3aed',
                  color: '#fff', border: 'none', borderRadius: 7,
                  padding: '8px 18px', fontSize: 12, fontWeight: 700,
                  cursor: (xgbTrainingAll || xgbTrainingModel !== null || xgbPredicting) ? 'default' : 'pointer',
                  fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                }}
              >
                {xgbTrainingAll ? 'Entrenando…' : 'Entrenar todos (16)'}
              </button>
              <button
                onClick={handleXGBPredict}
                disabled={xgbPredicting || xgbTrainingAll || xgbTrainingModel !== null}
                style={{
                  background: xgbPredicting ? 'var(--border)' : '#0ea5e9',
                  color: '#fff', border: 'none', borderRadius: 7,
                  padding: '8px 16px', fontSize: 12, fontWeight: 700,
                  cursor: (xgbPredicting || xgbTrainingAll || xgbTrainingModel !== null) ? 'default' : 'pointer',
                  fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                }}
              >
                {xgbPredicting ? 'Generando…' : 'Generar predicciones'}
              </button>
            </div>
          </div>

          {/* Progress bar cuando está entrenando todos */}
          {xgbProgress && xgbTrainingAll && (
            <div style={{
              background: 'var(--bg)', border: '1px solid #7c3aed44',
              borderRadius: 8, padding: '14px 16px',
              fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
            }}>
              {/* Phase label */}
              <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {xgbProgress.status === 'fetching' ? 'Descargando datos del mercado...' : 'Entrenando modelos XGBoost'}
              </div>

              {/* Progress bar */}
              {xgbProgress.status === 'training' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>{xgbProgress.current_model ?? '…'}</span>
                    <span>{xgbProgress.models_done}/{xgbProgress.models_total} modelos</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.round(xgbProgress.models_done / xgbProgress.models_total * 100)}%`,
                      background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                      borderRadius: 3,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </>
              )}

              {/* Time row */}
              <div style={{ display: 'flex', gap: 20, fontSize: 11, color: 'var(--text-hint)' }}>
                <span>Transcurrido: <strong style={{ color: 'var(--text-muted)' }}>{fmtSeconds(xgbProgress.elapsed)}</strong></span>
                {xgbProgress.estimated_remaining != null && xgbProgress.estimated_remaining > 0 && (
                  <span>Estimado restante: <strong style={{ color: 'var(--text-muted)' }}>~{fmtSeconds(xgbProgress.estimated_remaining)}</strong></span>
                )}
              </div>
            </div>
          )}

          {/* Grid de modelos individuales */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {XGB_MODELS.map(mn => (
              <button
                key={mn}
                onClick={() => handleXGBTrain(mn)}
                disabled={xgbTrainingModel !== null || xgbTrainingAll || xgbPredicting}
                style={{
                  padding: '4px 10px', fontSize: 11,
                  background: xgbTrainingModel === mn ? '#7c3aed' : 'var(--bg)',
                  color: xgbTrainingModel === mn ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${xgbTrainingModel === mn ? '#7c3aed' : 'var(--border)'}`,
                  borderRadius: 6, cursor: (xgbTrainingModel !== null || xgbTrainingAll || xgbPredicting) ? 'default' : 'pointer',
                  fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {xgbTrainingModel === mn ? '⏳ ' : ''}{mn}
              </button>
            ))}
          </div>

          {xgbResult && (() => {
            const isError = xgbResult.startsWith('ERROR')
            return (
              <div style={{
                fontSize: 11, lineHeight: 1.8,
                background: isError ? '#dc262610' : 'var(--bg)',
                border: `1px solid ${isError ? '#dc262640' : 'var(--border)'}`,
                borderLeft: `3px solid ${isError ? '#dc2626' : 'var(--border)'}`,
                borderRadius: 6, padding: '10px 12px',
                fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                whiteSpace: 'pre-wrap', maxHeight: isError ? 320 : undefined,
                overflowY: isError ? 'auto' : undefined,
                color: isError ? '#f87171' : 'var(--text-muted)',
              }}>
                {xgbResult}
              </div>
            )
          })()}

          {/* Gráfico de precisión XGBoost */}
          {xgbHistory.length >= 2 && (() => {
            const XGB_MODELS_LIST = ['tendencia','momentum','volatilidad','volumen','estructura','elliott','velas','macro','fundamental','sentimiento','regresion','reversion','divergencias','estacionalidad','beta_mercado','fuerza_relativa']
            const sessionMap = new Map<string, XgbHistoryEntry[]>()
            for (const e of xgbHistory) {
              const key = e.trained_at.slice(0, 16)
              if (!sessionMap.has(key)) sessionMap.set(key, [])
              sessionMap.get(key)!.push(e)
            }
            const sessions = [...sessionMap.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-20)
            if (sessions.length < 2) return null

            const points = sessions.map(([key, entries]) => {
              const relevant = xgbChartModel === 'all' ? entries : entries.filter(e => e.model_name === xgbChartModel)
              if (!relevant.length) return null
              const avg = relevant.reduce((s, e) => s + e.new_accuracy, 0) / relevant.length
              const dt = new Date(key + ':00')
              const label = dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
              return { key, avg, label }
            }).filter((p): p is { key: string; avg: number; label: string } => p !== null)

            if (points.length < 2) return null

            const W = 500, H = 90, PL = 28, PR = 8, PT = 8, PB = 20
            const innerW = W - PL - PR
            const innerH = H - PT - PB
            const vals = points.map(p => p.avg)
            const minV = Math.max(0.40, Math.min(...vals) - 0.03)
            const maxV = Math.min(0.85, Math.max(...vals) + 0.03)
            const xS = (i: number) => PL + (i / (points.length - 1)) * innerW
            const yS = (v: number) => PT + (1 - (v - minV) / (maxV - minV)) * innerH
            const gridLines = [0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75].filter(v => v >= minV && v <= maxV)
            const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(i)},${yS(p.avg)}`).join(' ')
            const areaD = `${pathD} L${xS(points.length - 1)},${H - PB} L${xS(0)},${H - PB} Z`
            const last = points[points.length - 1]
            const first = points[0]
            const delta = last.avg - first.avg
            const lineColor = delta >= 0.005 ? '#22c55e' : delta <= -0.005 ? '#f87171' : '#7c3aed'

            return (
              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => setShowXgbChart(s => !s)}
                      style={{ fontSize: 11, color: 'var(--text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      {showXgbChart ? '▲' : '▼'} Gráfico de precisión
                    </button>
                    {delta !== 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: lineColor }}>
                        {delta > 0 ? '▲' : '▼'}{(Math.abs(delta) * 100).toFixed(1)} pp ({points.length} sesiones)
                      </span>
                    )}
                  </div>
                  {showXgbChart && (
                    <select
                      value={xgbChartModel}
                      onChange={e => setXgbChartModel(e.target.value)}
                      style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-muted)', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}
                    >
                      <option value="all">Promedio todos</option>
                      {XGB_MODELS_LIST.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                </div>
                {showXgbChart && (
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 4px 2px', border: '1px solid var(--border)' }}>
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 90, display: 'block' }}>
                      {gridLines.map(v => (
                        <g key={v}>
                          <line x1={PL} y1={yS(v)} x2={W - PR} y2={yS(v)} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,3" />
                          <text x={PL - 3} y={yS(v) + 3} fontSize={7} fill="var(--text-hint)" textAnchor="end">{(v * 100).toFixed(0)}%</text>
                        </g>
                      ))}
                      <path d={areaD} fill={lineColor} fillOpacity={0.08} />
                      <path d={pathD} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" />
                      {points.map((p, i) => (
                        <g key={i}>
                          <circle cx={xS(i)} cy={yS(p.avg)} r={2.5} fill={lineColor} />
                          {(i === 0 || i === points.length - 1 || points.length <= 8) && (
                            <text x={xS(i)} y={H - 4} fontSize={7} fill="var(--text-hint)" textAnchor="middle">{p.label}</text>
                          )}
                        </g>
                      ))}
                    </svg>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Historial de entrenamientos XGBoost */}
          {xgbHistory.length > 0 && (() => {
            const runMap = new Map<string, XgbHistoryEntry[]>()
            for (const e of xgbHistory) {
              const key = e.trained_at.slice(0, 16)
              if (!runMap.has(key)) runMap.set(key, [])
              runMap.get(key)!.push(e)
            }
            const runList = [...runMap.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 12)
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button
                    onClick={() => setShowXgbHistory(s => !s)}
                    style={{
                      fontSize: 11, color: 'var(--text-hint)', background: 'none', border: 'none',
                      cursor: 'pointer', padding: 0, textDecoration: 'underline',
                    }}
                  >
                    {showXgbHistory ? '▲ Ocultar' : '▼ Ver'} historial XGBoost ({runList.length} sesiones · {xgbHistory.length} registros)
                  </button>
                </div>
                {showXgbHistory && runList.map(([key, entries]) => {
                  const byModel: Record<string, XgbHistoryEntry[]> = {}
                  for (const e of entries) {
                    if (!byModel[e.model_name]) byModel[e.model_name] = []
                    byModel[e.model_name].push(e)
                  }
                  const withDelta = entries.filter(e => e.old_accuracy != null)
                  const avgOld = withDelta.length ? withDelta.reduce((s, e) => s + e.old_accuracy!, 0) / withDelta.length : null
                  const avgNew = entries.reduce((s, e) => s + e.new_accuracy, 0) / entries.length
                  const delta = avgOld != null ? avgNew - avgOld : null
                  const dt = new Date(key + ':00')
                  const dateStr = dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                  const timeStr = dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={key} style={{
                      background: 'var(--bg)', borderRadius: 8, padding: '10px 14px',
                      border: '1px solid var(--border)', borderLeft: '3px solid #7c3aed',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>
                            {dateStr} · {timeStr}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-hint)' }}>
                            {Object.keys(byModel).length} modelos · {entries.length} buckets
                          </span>
                          {delta != null && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: delta > 0 ? '#22c55e' : delta < -0.001 ? '#f87171' : 'var(--text-hint)' }}>
                              {delta > 0 ? '▲' : '▼'}{(Math.abs(delta) * 100).toFixed(2)} pp promedio acc
                            </span>
                          )}
                          {avgOld == null && (
                            <span style={{ fontSize: 10, color: 'var(--text-hint)' }}>Primer entrenamiento</span>
                          )}
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-hint)' }}>
                          acc prom: {(avgNew * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {Object.entries(byModel).map(([mn, mes]) => {
                          const validOld = mes.filter(e => e.old_accuracy != null)
                          const avgOldM = validOld.length ? validOld.reduce((s, e) => s + e.old_accuracy!, 0) / validOld.length : null
                          const avgNewM = mes.reduce((s, e) => s + e.new_accuracy, 0) / mes.length
                          const d = avgOldM != null ? avgNewM - avgOldM : null
                          const positive = d != null && d > 0.005
                          const negative = d != null && d < -0.005
                          return (
                            <span key={mn} style={{
                              fontSize: 10, padding: '2px 7px', borderRadius: 4,
                              background: positive ? '#22c55e18' : negative ? '#f8717118' : 'var(--bg)',
                              color: positive ? '#22c55e' : negative ? '#f87171' : 'var(--text-hint)',
                              border: `1px solid ${positive ? '#22c55e40' : negative ? '#f8717140' : 'var(--border)'}`,
                              fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                            }}>
                              {mn}
                              {d != null
                                ? ` ${d > 0 ? '+' : ''}${(d * 100).toFixed(1)}pp`
                                : ` ${(avgNewM * 100).toFixed(0)}%`}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
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
        {sectionBtn('rendimiento', 'Rendimiento y Pesos')}
        {sectionBtn('activos', 'Estado por Activo')}
        {sectionBtn('historial', `Historial de Cambios (${changelog.filter(c => c.trigger !== 'initial').length})`)}
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

          {/* ── Pesos federados (merged) ── */}
          <Card style={{ padding: '14px 20px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 12 }}>
              <b>Pesos federados:</b> ajustan el voto de cada modelo en el consenso final via Brier Skill Score por horizonte.
              Peso &gt; 1.0 = modelo por encima del promedio · Peso &lt; 1.0 = modelo penalizado.
            </div>
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
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-hint)', fontSize: 13 }}>
                Sin pesos calculados aún.
              </div>
            )}
          </Card>
        </div>
      )}

      {activeSection === 'rendimiento' && backtestModelStats.length === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-hint)', fontSize: 13 }}>
            Sin datos de backtest aún. Ejecutá el entrenamiento primero.
          </div>
        </Card>
      )}

      {/* ── ESTADO POR ACTIVO ───────────────────────────────── */}
      {activeSection === 'activos' && (() => {
        const ACTIVOS_PAGE_SIZE = 15
        const sortedRuns = [...runs].sort((a, b) => {
          const order: Record<string, number> = { error: 0, running: 1, pending: 2, done: 3 }
          return (order[a.status] ?? 9) - (order[b.status] ?? 9)
        })
        const filteredRuns = activosFilter === 'all' ? sortedRuns : sortedRuns.filter(r => r.status === activosFilter)
        const totalPages = Math.ceil(filteredRuns.length / ACTIVOS_PAGE_SIZE)
        const pageRuns = filteredRuns.slice(activosPage * ACTIVOS_PAGE_SIZE, (activosPage + 1) * ACTIVOS_PAGE_SIZE)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {(['all', 'done', 'running', 'pending', 'error'] as const).map(f => (
                <button key={f} onClick={() => { setActivosFilter(f); setActivosPage(0) }} style={{
                  padding: '5px 12px', fontSize: 11, fontWeight: activosFilter === f ? 700 : 400,
                  background: activosFilter === f ? 'var(--text)' : 'var(--card)',
                  color: activosFilter === f ? 'var(--bg)' : 'var(--text-muted)',
                  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                }}>
                  {f === 'all' ? `Todos (${runs.length})` : `${f} (${runs.filter(r => r.status === f).length})`}
                </button>
              ))}
            </div>
            {runs.length > 0 ? (
              <>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ background: 'var(--card)' }}>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Ticker', 'Estado', 'Fechas', 'Evaluaciones', 'Error', 'Completado'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-hint)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRuns.map(r => (
                        <tr key={r.ticker} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 700, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>{r.ticker}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ color: STATUS_COLOR[r.status] ?? 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: 11 }}>
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
                {totalPages > 1 && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                    <button onClick={() => setActivosPage(p => Math.max(0, p - 1))} disabled={activosPage === 0} style={{ padding: '4px 12px', fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, cursor: activosPage === 0 ? 'default' : 'pointer', color: activosPage === 0 ? 'var(--text-hint)' : 'var(--text)' }}>←</button>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{activosPage + 1} / {totalPages} · {filteredRuns.length} activos</span>
                    <button onClick={() => setActivosPage(p => Math.min(totalPages - 1, p + 1))} disabled={activosPage >= totalPages - 1} style={{ padding: '4px 12px', fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, cursor: activosPage >= totalPages - 1 ? 'default' : 'pointer', color: activosPage >= totalPages - 1 ? 'var(--text-hint)' : 'var(--text)' }}>→</button>
                  </div>
                )}
              </>
            ) : (
              <Card>
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-hint)', fontSize: 14 }}>
                  Ningún activo entrenado aún. Disparar el primer lote para comenzar.
                </div>
              </Card>
            )}
          </div>
        )
      })()}

      {/* ── HISTORIAL DE CAMBIOS ────────────────────────────── */}
      {activeSection === 'historial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Sesiones de federación — resumen por run */}
          {(() => {
            const runMap = new Map<string, ChangelogEntry[]>()
            for (const c of changelog) {
              if (c.trigger === 'initial') continue
              const key = c.snapshot_at.slice(0, 16)
              if (!runMap.has(key)) runMap.set(key, [])
              runMap.get(key)!.push(c)
            }
            const runList = [...runMap.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 15)
            if (runList.length === 0) return null

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-hint)', fontWeight: 600 }}>
                  Sesiones de federación ({runList.length} últimas)
                </div>
                {runList.map(([key, entries]) => {
                  const trigger = entries[0]?.trigger
                  const lrEntries = entries.filter(e => e.change_type === 'lr_params' && e.new_accuracy != null && e.old_accuracy != null && e.trigger !== 'initial')
                  const wEntries  = entries.filter(e => e.change_type === 'weight')

                  // Agrupa por modelo: promedio de old/new accuracy a través de horizontes
                  const byModel: Record<string, { old: number[]; new: number[] }> = {}
                  for (const e of lrEntries) {
                    if (!byModel[e.model_name]) byModel[e.model_name] = { old: [], new: [] }
                    byModel[e.model_name].old.push(e.old_accuracy!)
                    byModel[e.model_name].new.push(e.new_accuracy!)
                  }
                  const modelDeltas = Object.entries(byModel).map(([mn, v]) => {
                    const oldAvg = v.old.reduce((a, b) => a + b, 0) / v.old.length
                    const newAvg = v.new.reduce((a, b) => a + b, 0) / v.new.length
                    return { model: mn, oldAvg, newAvg, delta: newAvg - oldAvg }
                  })

                  const hasLR = modelDeltas.length > 0
                  const overallOld = hasLR ? modelDeltas.reduce((s, m) => s + m.oldAvg, 0) / modelDeltas.length : 0
                  const overallNew = hasLR ? modelDeltas.reduce((s, m) => s + m.newAvg, 0) / modelDeltas.length : 0
                  const overallDelta = overallNew - overallOld
                  const improved  = modelDeltas.filter(m => m.delta >  0.001).length
                  const degraded  = modelDeltas.filter(m => m.delta < -0.001).length
                  const topGainers = [...modelDeltas].sort((a, b) => b.delta - a.delta).slice(0, 4).filter(m => m.delta >  0.001)
                  const topLosers  = [...modelDeltas].sort((a, b) => a.delta - b.delta).slice(0, 2).filter(m => m.delta < -0.001)

                  const dt = new Date(key + ':00')
                  const dateStr = dt.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })
                  const timeStr = dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

                  return (
                    <div key={key} style={{
                      background: 'var(--card)', border: '1px solid var(--border)',
                      borderLeft: `3px solid ${TRIGGER_COLOR[trigger] ?? '#6b7280'}`,
                      borderRadius: 8, padding: '12px 16px',
                    }}>
                      {/* Header de sesión */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: hasLR ? 10 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                            background: (TRIGGER_COLOR[trigger] ?? '#6b7280') + '20',
                            color: TRIGGER_COLOR[trigger] ?? 'var(--text-hint)',
                          }}>
                            {TRIGGER_LABEL[trigger] ?? trigger}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>
                            {dateStr} · {timeStr}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-hint)', flexShrink: 0 }}>
                          {hasLR && <span>{modelDeltas.length} modelos LR</span>}
                          {wEntries.length > 0 && <span>{[...new Set(wEntries.map(e => e.model_name))].length} pesos</span>}
                        </div>
                      </div>

                      {/* Precisión global antes → después */}
                      {hasLR && (
                        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', marginBottom: topGainers.length > 0 ? 10 : 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>Precisión LR prom:</span>
                            <span style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 13, color: 'var(--text-muted)' }}>
                              {(overallOld * 100).toFixed(1)}%
                            </span>
                            <span style={{ color: 'var(--text-hint)', fontSize: 12 }}>→</span>
                            <span style={{
                              fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 15, fontWeight: 700,
                              color: overallDelta > 0.005 ? '#22c55e' : overallDelta < -0.005 ? '#f87171' : 'var(--text)',
                            }}>
                              {(overallNew * 100).toFixed(1)}%
                            </span>
                            {Math.abs(overallDelta) > 0.001 && (
                              <span style={{ fontSize: 12, fontWeight: 700, color: overallDelta > 0 ? '#22c55e' : '#f87171' }}>
                                {overallDelta > 0 ? '▲' : '▼'}{(Math.abs(overallDelta) * 100).toFixed(1)} pp
                              </span>
                            )}
                          </div>
                          {(improved > 0 || degraded > 0) && (
                            <div style={{ fontSize: 11 }}>
                              {improved > 0 && <span style={{ color: '#22c55e' }}>↑ {improved} mejoraron</span>}
                              {improved > 0 && degraded > 0 && <span style={{ color: 'var(--text-hint)', margin: '0 5px' }}>·</span>}
                              {degraded > 0 && <span style={{ color: '#f87171' }}>↓ {degraded} bajaron</span>}
                              {modelDeltas.length - improved - degraded > 0 && (
                                <span style={{ color: 'var(--text-hint)', marginLeft: 5 }}>· {modelDeltas.length - improved - degraded} sin cambio</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Chips de mejoras / caídas por modelo */}
                      {(topGainers.length > 0 || topLosers.length > 0) && (
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {topGainers.map(m => (
                            <span key={m.model} style={{
                              fontSize: 10, padding: '2px 8px', borderRadius: 5,
                              background: '#22c55e14', color: '#22c55e', border: '1px solid #22c55e30',
                              fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                            }}>
                              {m.model} {(m.oldAvg * 100).toFixed(0)}%→{(m.newAvg * 100).toFixed(0)}% ▲{(m.delta * 100).toFixed(1)}pp
                            </span>
                          ))}
                          {topLosers.map(m => (
                            <span key={m.model} style={{
                              fontSize: 10, padding: '2px 8px', borderRadius: 5,
                              background: '#f8717114', color: '#f87171', border: '1px solid #f8717130',
                              fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                            }}>
                              {m.model} {(m.oldAvg * 100).toFixed(0)}%→{(m.newAvg * 100).toFixed(0)}% ▼{(Math.abs(m.delta) * 100).toFixed(1)}pp
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}

          <Card style={{ padding: '14px 20px' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Cada vez que se corre <b>"Federar modelos"</b> (o el cron nocturno), el sistema compara los parámetros nuevos
                con los anteriores y registra aquí <b>qué cambió, cuánto y por qué</b>.
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {([
                  { id: 'changes', label: 'Solo cambios' },
                  { id: 'lr_params', label: 'LR Params' },
                  { id: 'weight', label: 'Pesos' },
                  { id: 'all', label: 'Todo (incl. baseline)' },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => { setChangelogFilter(id); setHistorialPage(0) }}
                    style={{
                      padding: '5px 12px', fontSize: 11, fontWeight: changelogFilter === id ? 700 : 400,
                      background: changelogFilter === id ? 'var(--text)' : 'var(--card)',
                      color: changelogFilter === id ? 'var(--bg)' : 'var(--text-muted)',
                      border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-hint)' }}>
            {(Object.entries(TRIGGER_LABEL) as [string, string][]).map(([k, v]) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: TRIGGER_COLOR[k] ?? '#6b7280', display: 'inline-block' }} />
                <b style={{ color: TRIGGER_COLOR[k] ?? 'var(--text-hint)' }}>{k}</b> — {v}
              </span>
            ))}
            <span>· Borde azul = params LR · Borde ámbar = peso Brier</span>
          </div>

          {/* Filtro por horizonte */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-hint)', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>Horizonte:</span>
            {(['all', 7, 14, 30, 60, 90] as const).map(h => (
              <button
                key={h}
                onClick={() => { setHistorialHorizonFilter(h); setHistorialPage(0) }}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: historialHorizonFilter === h ? 700 : 400,
                  background: historialHorizonFilter === h ? 'var(--text)' : 'var(--card)',
                  color: historialHorizonFilter === h ? 'var(--bg)' : 'var(--text-muted)',
                  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                  fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                }}
              >
                {h === 'all' ? 'Todos' : `${h}d`}
              </button>
            ))}
          </div>

          {/* Filtros de fecha + modelo */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Date selector */}
            {(() => {
              const dates = [...new Set(
                changelog
                  .filter(c => c.trigger !== 'initial')
                  .map(c => c.snapshot_at.slice(0, 10))
              )].sort().reverse()
              if (dates.length === 0) return null
              return (
                <select
                  value={historialDateFilter}
                  onChange={e => { setHistorialDateFilter(e.target.value); setHistorialPage(0) }}
                  style={{
                    padding: '7px 12px', fontSize: 12,
                    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7,
                    color: 'var(--text)', outline: 'none',
                    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">Todos los días ({dates.length})</option>
                  {dates.map(d => {
                    const label = new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })
                    return <option key={d} value={d}>{label}</option>
                  })}
                </select>
              )
            })()}
            {historialDateFilter !== 'all' && (
              <button
                onClick={() => { setHistorialDateFilter('all'); setHistorialPage(0) }}
                style={{ fontSize: 11, color: 'var(--text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                × Limpiar fecha
              </button>
            )}
            <input
              type="text"
              placeholder="Filtrar por modelo..."
              value={historialModelSearch}
              onChange={e => { setHistorialModelSearch(e.target.value); setHistorialPage(0) }}
              style={{
                flex: 1, minWidth: 160,
                padding: '7px 12px', fontSize: 12,
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7,
                color: 'var(--text)', outline: 'none',
                fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              }}
            />
          </div>

          {(() => {
            const HIST_PAGE_SIZE = 20
            const filtered = changelog.filter(c => {
              if (changelogFilter === 'changes' && c.trigger === 'initial') return false
              if (changelogFilter === 'lr_params' && c.change_type !== 'lr_params') return false
              if (changelogFilter === 'weight' && c.change_type !== 'weight') return false
              if (historialDateFilter !== 'all' && !c.snapshot_at.startsWith(historialDateFilter)) return false
              if (historialHorizonFilter !== 'all' && c.horizon_bucket !== historialHorizonFilter) return false
              if (historialModelSearch && !c.model_name.includes(historialModelSearch.toLowerCase())) return false
              return true
            })
            if (filtered.length === 0) {
              return (
                <Card>
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-hint)', fontSize: 13 }}>
                    {changelogFilter === 'changes' && !historialModelSearch
                      ? 'Sin cambios registrados aún. Hacé clic en "Federar modelos y calcular cambios" después de un reentrenamiento.'
                      : 'Sin entradas para este filtro.'}
                  </div>
                </Card>
              )
            }
            const totalPages = Math.ceil(filtered.length / HIST_PAGE_SIZE)
            const safePage = Math.min(historialPage, totalPages - 1)
            const pageEntries = filtered.slice(safePage * HIST_PAGE_SIZE, (safePage + 1) * HIST_PAGE_SIZE)
            let lastDate = ''
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pageEntries.map(entry => {
                  const d = new Date(entry.snapshot_at).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
                  const showDate = d !== lastDate
                  lastDate = d
                  return (
                    <div key={entry.id}>
                      {showDate && (
                        <div style={{
                          fontSize: 11, color: 'var(--text-hint)', fontWeight: 600,
                          letterSpacing: '0.08em', textTransform: 'uppercase',
                          padding: '6px 0 4px', marginTop: 8,
                          borderBottom: '1px solid var(--border)', marginBottom: 6,
                        }}>
                          {d}
                        </div>
                      )}
                      <ChangelogCard entry={entry} />
                    </div>
                  )
                })}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', paddingTop: 8 }}>
                  {totalPages > 1 && (
                    <>
                      <button onClick={() => setHistorialPage(p => Math.max(0, p - 1))} disabled={safePage === 0} style={{ padding: '4px 12px', fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, cursor: safePage === 0 ? 'default' : 'pointer', color: safePage === 0 ? 'var(--text-hint)' : 'var(--text)' }}>←</button>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{safePage + 1} / {totalPages}</span>
                      <button onClick={() => setHistorialPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} style={{ padding: '4px 12px', fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, cursor: safePage >= totalPages - 1 ? 'default' : 'pointer', color: safePage >= totalPages - 1 ? 'var(--text-hint)' : 'var(--text)' }}>→</button>
                    </>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{filtered.length} entradas</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
