'use client'
import { useState } from 'react'

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
}

const BUCKETS = [7, 14, 30, 60, 90]
const STATUS_COLOR: Record<string, string> = {
  done: '#22c55e', running: '#f59e0b', pending: '#6b7280', error: '#ef4444',
}

function card(children: React.ReactNode, extra: React.CSSProperties = {}) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '20px 24px', ...extra
    }}>
      {children}
    </div>
  )
}

function label(text: string) {
  return <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 6 }}>{text}</div>
}

function bigNum(v: number | string, color?: string) {
  return <div style={{ fontSize: 28, fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1 }}>{v}</div>
}

export function EntrenamientoSection({ runs, horizonWeights, globalWeights }: Props) {
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState<string | null>(null)
  const [trainingAll, setTrainingAll] = useState(false)

  const done    = runs.filter(r => r.status === 'done').length
  const running = runs.filter(r => r.status === 'running').length
  const pending = runs.filter(r => r.status === 'pending').length
  const errors  = runs.filter(r => r.status === 'error').length
  const total   = runs.length

  const totalDates = runs.reduce((s, r) => s + (r.dates_processed ?? 0), 0)
  const totalPreds = runs.reduce((s, r) => s + (r.predictions_evaluated ?? 0), 0)
  const pct = total > 0 ? Math.round(done / total * 100) : 0

  // Build weight table: model → bucket → weight
  const hwMap: Record<string, Record<number, HorizonWeight>> = {}
  for (const hw of horizonWeights) {
    if (!hwMap[hw.model_name]) hwMap[hw.model_name] = {}
    hwMap[hw.model_name][hw.horizon_bucket] = hw
  }
  const gwMap: Record<string, number> = {}
  for (const gw of globalWeights) gwMap[gw.model_name] = gw.weight

  const modelNames = [...new Set([...horizonWeights.map(h => h.model_name), ...globalWeights.map(g => g.model_name)])]
    .sort()

  async function handleTrigger(all = false) {
    if (all) setTrainingAll(true); else setTriggering(true)
    setTriggerResult(null)
    try {
      const url = all ? '/api/backtest/trigger?all=true' : '/api/backtest/trigger'
      const res = await fetch(url, { method: 'POST' })
      const json = await res.json()
      if (json.triggered > 0) {
        setTriggerResult(all
          ? `Entrenando ${json.triggered} activos en ${json.waves} oleadas de 25 — tarda ~${Math.ceil(json.waves * 12)} segundos. Recargá la página en 2 minutos.`
          : `Disparado: ${(json.tickers as string[]).join(', ')}`
        )
      } else {
        setTriggerResult('Nada pendiente — todos los activos ya están entrenados.')
      }
    } catch {
      setTriggerResult('Error al disparar.')
    } finally {
      setTriggering(false)
      setTrainingAll(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Entrenamiento de Modelos</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Backtest histórico sobre {total} activos · Brier Skill Score → pesos por horizonte
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14 }}>
        {card(<>{label('Completados')}{bigNum(done, '#22c55e')}</>)}
        {card(<>{label('En curso')}{bigNum(running, '#f59e0b')}</>)}
        {card(<>{label('Pendientes')}{bigNum(pending + (total === 0 ? 0 : 0))}</>)}
        {card(<>{label('Errores')}{bigNum(errors, errors > 0 ? '#ef4444' : undefined)}</>)}
        {card(<>{label('Fechas procesadas')}{bigNum(totalDates.toLocaleString())}</>)}
        {card(<>{label('Evaluaciones')}{bigNum(totalPreds.toLocaleString())}</>)}
      </div>

      {/* Progress bar */}
      {card(
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Progreso global</span>
            <span style={{ color: 'var(--text-muted)' }}>{done}/{total} activos · {pct}%</span>
          </div>
          <div style={{ height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#22c55e', borderRadius: 5, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {/* Trigger buttons */}
      {card(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => handleTrigger(true)}
              disabled={trainingAll || triggering}
              style={{
                background: trainingAll ? 'var(--border)' : '#16a34a',
                color: '#fff', border: 'none', borderRadius: 7,
                padding: '10px 22px', fontSize: 13, fontWeight: 700,
                cursor: (trainingAll || triggering) ? 'default' : 'pointer',
                fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              }}
            >
              {trainingAll ? 'Entrenando todo...' : `Entrenar todo ahora (${Math.max(0, total - done)} pendientes)`}
            </button>
            <button
              onClick={() => handleTrigger(false)}
              disabled={triggering || trainingAll}
              style={{
                background: (triggering || trainingAll) ? 'var(--border)' : 'var(--card)',
                color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 7,
                padding: '9px 18px', fontSize: 12, fontWeight: 500,
                cursor: (triggering || trainingAll) ? 'default' : 'pointer',
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
            El cron automático procesa 10 activos/día a las 02:00 UTC · "Entrenar todo" dispara en oleadas de 25 con 3s de espera entre oleadas
          </div>
        </div>
      )}

      {/* Horizon weights table */}
      {horizonWeights.length > 0 && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>Pesos por modelo y horizonte</h3>
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
                            {hw ? <WeightCell w={hw.weight} n={hw.sample_size} acc={hw.direction_accuracy} /> : <span style={{ color: 'var(--text-hint)' }}>—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-ticker run status */}
      {runs.length > 0 && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>Estado por activo</h3>
          <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Ticker', 'Estado', 'Fechas', 'Evaluaciones', 'Completado'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--text-hint)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...runs].sort((a, b) => {
                  const order = { error: 0, running: 1, done: 2, pending: 3 }
                  return (order[a.status] ?? 9) - (order[b.status] ?? 9)
                }).map(r => (
                  <tr key={r.ticker} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>{r.ticker}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{ color: STATUS_COLOR[r.status] ?? 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: 11 }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{r.dates_processed ?? '—'}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{r.predictions_evaluated?.toLocaleString() ?? '—'}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-hint)', fontSize: 11 }}>
                      {r.completed_at ? new Date(r.completed_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {runs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-hint)', fontSize: 14 }}>
          Ningún activo entrenado aún. Disparar el primer lote para comenzar.
        </div>
      )}
    </div>
  )
}

function WeightCell({ w, n, acc }: { w: number; n?: number; acc?: number | null }) {
  const color = w > 1.3 ? '#22c55e' : w < 0.7 ? '#ef4444' : 'var(--text)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <span style={{ fontWeight: 700, color, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>{w.toFixed(2)}</span>
      {n != null && <span style={{ fontSize: 10, color: 'var(--text-hint)' }}>n={n}</span>}
      {acc != null && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(acc * 100).toFixed(0)}%</span>}
    </div>
  )
}
