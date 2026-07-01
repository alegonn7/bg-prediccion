'use client'
import { useState, useMemo } from 'react'
import type { ModelDetailStat, RawModelPred } from '@/app/page'
import { ModelPerformance } from './ModelPerformance'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"

const MODEL_LABELS: Record<string, string> = {
  tendencia:      'Tendencia',
  momentum:       'Momentum',
  volatilidad:    'Volatilidad',
  volumen:        'Volumen',
  estructura:     'Estructura',
  elliott:        'Elliott',
  velas:          'Velas',
  macro:          'Macro',
  fundamental:    'Fundamental',
  sentimiento:    'Sentimiento',
  regresion:      'Regresión lineal',
  reversion:      'Reversión a media',
  divergencias:   'Divergencias',
  estacionalidad: 'Estacionalidad',
  beta_mercado:   'Beta-mercado',
  fuerza_relativa:'Fuerza relativa',
}

type SortKey = 'accuracy' | 'total' | 'mae' | 'confidence' | 'bias_up'

function accColor(acc: number | null) {
  if (acc === null) return 'var(--text-hint)'
  if (acc >= 0.60) return 'var(--up)'
  if (acc >= 0.50) return '#d97706'
  return 'var(--down)'
}

function pct(n: number | null, decimals = 1) {
  if (n === null) return '—'
  return (n * 100).toFixed(decimals) + '%'
}

function CalibrationBar({ bucket, label }: { bucket: { total: number; correct: number }; label: string }) {
  const acc = bucket.total > 0 ? bucket.correct / bucket.total : null
  const color = accColor(acc)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', minWidth: 90 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 999 }}>
        {acc !== null && (
          <div style={{ height: '100%', width: `${acc * 100}%`, background: color, borderRadius: 999, transition: 'width 0.3s' }} />
        )}
      </div>
      <span style={{ fontFamily: MONO, fontSize: 11, color, minWidth: 38, textAlign: 'right' }}>
        {acc !== null ? `${Math.round(acc * 100)}%` : '—'}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', minWidth: 42 }}>
        n={bucket.total}
      </span>
    </div>
  )
}

function RecentDots({ recent }: { recent: { correct: boolean; confidence: number; ticker: string }[] }) {
  if (!recent.length) return <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>sin datos</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {recent.map((r, i) => (
        <div
          key={i}
          title={`${r.ticker} · conf ${Math.round(r.confidence * 100)}% · ${r.correct ? 'acertó' : 'falló'}`}
          style={{
            width: 14, height: 14, borderRadius: '50%',
            background: r.correct ? 'var(--up)' : 'var(--down)',
            opacity: 0.4 + r.confidence * 0.6,
            cursor: 'default',
          }}
        />
      ))}
    </div>
  )
}

function ModelRow({ stat, rank, expanded, onToggle }: {
  stat: ModelDetailStat
  rank: number
  expanded: boolean
  onToggle: () => void
}) {
  const acc = stat.dir_accuracy
  const color = accColor(acc)
  const totalCalls = stat.called_up + stat.called_down
  const upBias = totalCalls > 0 ? stat.called_up / totalCalls : null
  const accUp   = stat.called_up   > 0 ? stat.correct_up   / stat.called_up   : null
  const accDown = stat.called_down > 0 ? stat.correct_down / stat.called_down : null

  return (
    <>
      {/* Summary row */}
      <div
        onClick={onToggle}
        style={{
          display: 'grid',
          gridTemplateColumns: '24px 1.8fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr',
          gap: 12, padding: '13px 20px',
          alignItems: 'center', cursor: 'pointer',
          borderBottom: expanded ? 'none' : '1px solid var(--border)',
          background: expanded ? 'var(--bg-muted)' : 'transparent',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'var(--bg-muted)' }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>#{rank}</span>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{MODEL_LABELS[stat.model_name] ?? stat.model_name}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', marginTop: 1 }}>{stat.model_name}</div>
        </div>

        {/* Accuracy + bar */}
        <div>
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color }}>{pct(acc)}</div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}>
            {acc !== null && <div style={{ height: '100%', width: `${acc * 100}%`, background: color, borderRadius: 999 }} />}
          </div>
        </div>

        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)' }}>
          {stat.total > 0 ? stat.total : '—'}
          {stat.total > 0 && <div style={{ fontSize: 10, color: 'var(--text-hint)' }}>{stat.correct} ok</div>}
        </div>

        {/* UP accuracy */}
        <div>
          <span style={{ fontFamily: MONO, fontSize: 12, color: accColor(accUp) }}>{pct(accUp)}</span>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', fontFamily: MONO }}>↑ {stat.called_up}</div>
        </div>

        {/* DOWN accuracy */}
        <div>
          <span style={{ fontFamily: MONO, fontSize: 12, color: accColor(accDown) }}>{pct(accDown)}</span>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', fontFamily: MONO }}>↓ {stat.called_down}</div>
        </div>

        {/* MAE */}
        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)' }}>
          {stat.mae_avg !== null ? (stat.mae_avg * 100).toFixed(2) + '%' : '—'}
        </div>

        {/* Recent dots */}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {stat.recent.slice(0, 10).map((r, i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: '50%',
              background: r.correct ? 'var(--up)' : 'var(--down)',
              opacity: 0.35 + r.confidence * 0.65,
            }} />
          ))}
          {stat.total === 0 && <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)' }}>sin datos</span>}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-muted)',
          padding: '0 20px 20px',
          position: 'relative',
        }}>
          <button
            onClick={onToggle}
            style={{
              position: 'absolute', top: 10, right: 14,
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: MONO, fontSize: 16, color: 'var(--text-hint)',
              lineHeight: 1, padding: '2px 6px', borderRadius: 4,
            }}
            title="Cerrar"
          >×</button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, paddingTop: 16 }}>

            {/* Calibración de confianza */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
                Calibración de confianza
              </div>
              <CalibrationBar bucket={stat.conf_high} label="Alta  (≥65%)" />
              <CalibrationBar bucket={stat.conf_mid}  label="Media (40–65%)" />
              <CalibrationBar bucket={stat.conf_low}  label="Baja  (<40%)" />
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-hint)', lineHeight: 1.5 }}>
                Un modelo bien calibrado tiene mayor accuracy cuando su confianza es alta.
                {stat.conf_high.total > 0 && stat.conf_low.total > 0 && (() => {
                  const hi = stat.conf_high.correct / stat.conf_high.total
                  const lo = stat.conf_low.correct  / stat.conf_low.total
                  const diff = hi - lo
                  if (Math.abs(diff) < 0.05) return ' La calibración es plana (confianza no predice acierto).'
                  if (diff > 0) return ` Bien calibrado: +${(diff * 100).toFixed(0)}pp más preciso cuando está seguro.`
                  return ` Mal calibrado: −${(Math.abs(diff) * 100).toFixed(0)}pp peor cuando está seguro.`
                })()}
              </div>
            </div>

            {/* Sesgo direccional */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
                Sesgo direccional
              </div>
              {totalCalls > 0 ? (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: 'var(--up)' }}>↑ Llama sube</span>
                      <span style={{ fontFamily: MONO, fontSize: 12 }}>{stat.called_up} ({upBias !== null ? Math.round(upBias * 100) : '—'}%)</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(upBias ?? 0) * 100}%`, background: 'var(--up)', opacity: 0.6, borderRadius: 999 }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                    {[
                      { label: 'Accuracy ↑', val: accUp,   n: stat.called_up,   c: stat.correct_up },
                      { label: 'Accuracy ↓', val: accDown, n: stat.called_down, c: stat.correct_down },
                    ].map(({ label, val, n, c }) => (
                      <div key={label} style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 4 }}>{label}</div>
                        <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: accColor(val) }}>{pct(val)}</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', marginTop: 2 }}>{c}/{n} pred.</div>
                      </div>
                    ))}
                  </div>
                  {upBias !== null && (upBias > 0.75 || upBias < 0.25) && (
                    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 7, background: 'var(--bg-card)', fontSize: 11, color: '#d97706', lineHeight: 1.5 }}>
                      ⚠ Sesgo fuerte: llama {upBias > 0.75 ? '↑ muy seguido' : '↓ muy seguido'}. Revisar lógica del modelo.
                    </div>
                  )}
                </>
              ) : (
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>sin datos</span>
              )}
            </div>

            {/* Por activo */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
                Rendimiento por activo
              </div>
              {stat.by_ticker.length === 0 ? (
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>sin datos</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stat.by_ticker.slice(0, 8).map(t => (
                    <div key={t.ticker} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, minWidth: 48 }}>{t.ticker}</span>
                      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 999,
                          width: `${t.accuracy * 100}%`,
                          background: accColor(t.accuracy),
                        }} />
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: accColor(t.accuracy), minWidth: 34, textAlign: 'right' }}>
                        {Math.round(t.accuracy * 100)}%
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', minWidth: 42, textAlign: 'right' }}>
                        {t.mae_avg !== null ? (t.mae_avg * 100).toFixed(2) + '%' : '—'}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', minWidth: 28 }}>
                        n={t.total}
                      </span>
                    </div>
                  ))}
                  <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-hint)', marginTop: 2 }}>
                    acc% · MAE · n
                  </div>
                </div>
              )}

              {stat.rmse_avg !== null && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', marginBottom: 4 }}>Error de magnitud (RMSE)</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, color: 'var(--text-muted)' }}>
                    {(stat.rmse_avg * 100).toFixed(2)}%
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* MAE por horizonte + MAE correcto vs incorrecto */}
          {(stat.mae_by_horizon.length > 0 || stat.mae_when_correct !== null || stat.mae_when_wrong !== null) && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* MAE por horizonte */}
              {stat.mae_by_horizon.length > 0 && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
                    MAE por horizonte
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {stat.mae_by_horizon.map(h => (
                      <div key={h.horizon} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', minWidth: 50 }}>
                          ≤{h.horizon}d
                        </span>
                        <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 999,
                            width: `${Math.min(h.mae * 1000, 100)}%`,
                            background: '#6366f1',
                          }} />
                        </div>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)', minWidth: 44, textAlign: 'right' }}>
                          {(h.mae * 100).toFixed(2)}%
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', minWidth: 28 }}>
                          n={h.n}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 6 }}>
                    Error promedio agrupado por horizonte de predicción.
                  </div>
                </div>
              )}

              {/* MAE cuando acertó vs cuando falló */}
              {(stat.mae_when_correct !== null || stat.mae_when_wrong !== null) && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
                    MAE: dirección acertada vs fallada
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--up)', marginBottom: 4 }}>Cuando acertó dirección</div>
                      <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                        {stat.mae_when_correct !== null ? (stat.mae_when_correct * 100).toFixed(2) + '%' : '—'}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', marginTop: 2 }}>error en magnitud</div>
                    </div>
                    <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--down)', marginBottom: 4 }}>Cuando falló dirección</div>
                      <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                        {stat.mae_when_wrong !== null ? (stat.mae_when_wrong * 100).toFixed(2) + '%' : '—'}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', marginTop: 2 }}>error en magnitud</div>
                    </div>
                  </div>
                  {stat.mae_when_correct !== null && stat.mae_when_wrong !== null && (() => {
                    const diff = stat.mae_when_correct - stat.mae_when_wrong
                    const msg = Math.abs(diff) < 0.001
                      ? 'El error en magnitud es similar sin importar la dirección.'
                      : diff < 0
                        ? `Cuando acierta dirección también predice mejor la magnitud (${(Math.abs(diff) * 100).toFixed(2)}pp menos error).`
                        : `Curioso: más error cuando acierta dirección (+${(diff * 100).toFixed(2)}pp).`
                    return <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 8, lineHeight: 1.5 }}>{msg}</div>
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Historial reciente */}
          {stat.recent.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
                Últimas {stat.recent.length} predicciones (más reciente → izq.)
              </div>
              <RecentDots recent={stat.recent} />
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-hint)' }}>
                Opacidad proporcional a la confianza del modelo. Verde = acertó dirección, rojo = falló.
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

type SortDir = 'desc' | 'asc'
type DateRange = '7d' | '30d' | '90d' | 'month' | 'all'

const DATE_RANGE_OPTS: { id: DateRange; label: string }[] = [
  { id: '7d',    label: 'Últ. 7d' },
  { id: '30d',   label: 'Últ. 30d' },
  { id: '90d',   label: 'Últ. 90d' },
  { id: 'month', label: 'Este mes' },
  { id: 'all',   label: 'Todo' },
]

const ALL_MODELS = [
  'tendencia','momentum','volatilidad','volumen','estructura','elliott',
  'velas','macro','fundamental','sentimiento',
  'regresion','reversion','divergencias',
  'estacionalidad','beta_mercado','fuerza_relativa',
]

function buildStats(preds: RawModelPred[]): ModelDetailStat[] {
  const byModel: Record<string, RawModelPred[]> = {}
  for (const mn of ALL_MODELS) byModel[mn] = []
  for (const p of preds) {
    if (!byModel[p.model_name]) byModel[p.model_name] = []
    byModel[p.model_name].push(p)
  }
  const HORIZON_BUCKETS = [1, 2, 7, 14, 30, 60, 90]
  const LOW = 0.40, HIGH = 0.65

  return ALL_MODELS.map(mn => {
    const ps = byModel[mn] ?? []
    const total   = ps.length
    const correct = ps.filter(p => p.direction_correct).length
    const up   = ps.filter(p => p.direction === 'up')
    const down = ps.filter(p => p.direction === 'down')
    const maes = ps.filter(p => p.mae != null).map(p => Number(p.mae))
    const sqs  = ps.filter(p => p.rmse != null).map(p => Number(p.rmse))
    const confs = ps.map(p => Number(p.confidence))
    const lowConf  = ps.filter(p => Number(p.confidence) <  LOW)
    const midConf  = ps.filter(p => Number(p.confidence) >= LOW && Number(p.confidence) < HIGH)
    const highConf = ps.filter(p => Number(p.confidence) >= HIGH)

    const byHorizon: Record<number, number[]> = {}
    for (const h of HORIZON_BUCKETS) byHorizon[h] = []
    for (const p of ps) {
      if (p.mae == null) continue
      const h = Number(p.horizon_days)
      const bucket = HORIZON_BUCKETS.find(b => h <= b) ?? 90
      byHorizon[bucket].push(Number(p.mae))
    }

    const byTicker: Record<string, { total: number; correct: number; maes: number[] }> = {}
    for (const p of ps) {
      const t = p.assets?.ticker ?? '?'
      if (!byTicker[t]) byTicker[t] = { total: 0, correct: 0, maes: [] }
      byTicker[t].total++
      if (p.direction_correct) byTicker[t].correct++
      if (p.mae != null) byTicker[t].maes.push(Number(p.mae))
    }

    const correctPreds = ps.filter(p => p.direction_correct && p.mae != null)
    const wrongPreds   = ps.filter(p => !p.direction_correct && p.mae != null)
    const avgMae = (arr: RawModelPred[]) => arr.length ? arr.reduce((s, p) => s + Number(p.mae), 0) / arr.length : null

    return {
      model_name: mn, total, correct,
      dir_accuracy: total >= 3 ? correct / total : null,
      called_up: up.length, correct_up: up.filter(p => p.direction_correct).length,
      called_down: down.length, correct_down: down.filter(p => p.direction_correct).length,
      mae_avg: maes.length ? maes.reduce((a, b) => a + b, 0) / maes.length : null,
      rmse_avg: sqs.length ? Math.sqrt(sqs.reduce((a, b) => a + b, 0) / sqs.length) : null,
      mae_when_correct: avgMae(correctPreds),
      mae_when_wrong:   avgMae(wrongPreds),
      avg_confidence: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0,
      conf_low:  { total: lowConf.length,  correct: lowConf.filter(p => p.direction_correct).length },
      conf_mid:  { total: midConf.length,  correct: midConf.filter(p => p.direction_correct).length },
      conf_high: { total: highConf.length, correct: highConf.filter(p => p.direction_correct).length },
      by_ticker: Object.entries(byTicker)
        .map(([ticker, v]) => ({
          ticker, total: v.total, correct: v.correct,
          accuracy: v.total > 0 ? v.correct / v.total : 0,
          mae_avg: v.maes.length ? v.maes.reduce((a, b) => a + b, 0) / v.maes.length : null,
        }))
        .sort((a, b) => b.total - a.total),
      mae_by_horizon: HORIZON_BUCKETS
        .filter(h => byHorizon[h].length > 0)
        .map(h => ({ horizon: h, mae: byHorizon[h].reduce((a, b) => a + b, 0) / byHorizon[h].length, n: byHorizon[h].length })),
      recent: ps.slice(0, 20).map(p => ({
        correct: p.direction_correct as boolean,
        confidence: Number(p.confidence),
        ticker: p.assets?.ticker ?? '?',
      })),
    }
  })
}

function filterPredsByDate(preds: RawModelPred[], range: DateRange): RawModelPred[] {
  if (range === 'all') return preds
  const now = new Date()
  return preds.filter(p => {
    const d = p.target_date ? new Date(p.target_date + 'T12:00:00') : null
    if (!d) return false
    if (range === '7d')    return now.getTime() - d.getTime() <= 7  * 86400000
    if (range === '30d')   return now.getTime() - d.getTime() <= 30 * 86400000
    if (range === '90d')   return now.getTime() - d.getTime() <= 90 * 86400000
    if (range === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    return true
  })
}

export function ModelAnalysisSection({ stats, rawPreds }: { stats: ModelDetailStat[]; rawPreds: RawModelPred[] }) {
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [sortKey,    setSortKey]    = useState<SortKey>('total')
  const [sortDir,    setSortDir]    = useState<SortDir>('desc')
  const [dateRange,  setDateRange]  = useState<DateRange>('all')

  const activeStats = useMemo(() => {
    if (dateRange === 'all') return stats
    const filtered = filterPredsByDate(rawPreds, dateRange)
    return buildStats(filtered)
  }, [dateRange, stats, rawPreds])

  const totalClosed = activeStats.reduce((s, m) => s + m.total, 0)
  const totalCorrect = activeStats.reduce((s, m) => s + m.correct, 0)

  function sort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...activeStats].sort((a, b) => {
    let va: number, vb: number
    switch (sortKey) {
      case 'accuracy':   va = a.dir_accuracy ?? -1; vb = b.dir_accuracy ?? -1; break
      case 'total':      va = a.total; vb = b.total; break
      case 'mae':        va = -(a.mae_avg ?? Infinity); vb = -(b.mae_avg ?? Infinity); break
      case 'confidence': va = a.avg_confidence; vb = b.avg_confidence; break
      case 'bias_up':
        va = a.called_up + a.called_down > 0 ? a.called_up / (a.called_up + a.called_down) : -1
        vb = b.called_up + b.called_down > 0 ? b.called_up / (b.called_up + b.called_down) : -1
        break
      default: va = 0; vb = 0
    }
    return sortDir === 'desc' ? vb - va : va - vb
  })

  function ColHeader({ label, k, tip }: { label: string; k: SortKey; tip?: string }) {
    const active = sortKey === k
    return (
      <button
        onClick={() => sort(k)}
        title={tip}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: active ? 'var(--text)' : 'var(--text-hint)',
          fontWeight: active ? 700 : 400,
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        {label} {active ? (sortDir === 'desc' ? '↓' : '↑') : ''}
      </button>
    )
  }

  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)', flexShrink: 0 }}>05</span>
          <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
            Análisis de modelos
          </h2>
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>
            {totalClosed > 0 ? `${totalClosed} eval. · ${Math.round(totalCorrect / totalClosed * 100)}% acierto` : 'sin datos'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {DATE_RANGE_OPTS.map(o => (
            <button
              key={o.id}
              onClick={() => { setDateRange(o.id); setExpanded(null) }}
              style={{
                padding: '4px 11px', fontSize: 11, fontWeight: dateRange === o.id ? 700 : 400,
                background: dateRange === o.id ? 'var(--text)' : 'var(--bg-card)',
                color: dateRange === o.id ? 'var(--bg)' : 'var(--text-muted)',
                border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                fontFamily: MONO,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {dateRange !== 'all' && totalClosed === 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 12, color: 'var(--text-hint)' }}>
          Sin predicciones cerradas en el período seleccionado. Probá con un período más amplio.
        </div>
      )}

      {totalClosed === 0 && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '20px 24px', marginBottom: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6,
        }}>
          Los modelos se auditan automáticamente al vencer cada predicción. La tabla se poblará con datos reales a medida que cierren las predicciones activas. Podés hacer clic en cualquier fila para ver el desglose completo.
        </div>
      )}

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {/* Column headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '24px 1.8fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr',
          gap: 12, padding: '12px 20px',
          background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)',
        }}>
          <div />
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-hint)' }}>Modelo</div>
          <ColHeader label="Acierto dir." k="accuracy" tip="% de veces que el modelo predijo la dirección correcta" />
          <ColHeader label="n" k="total" tip="Predicciones cerradas evaluadas" />
          <ColHeader label="↑ acc." k="bias_up" tip="Accuracy cuando llama sube" />
          <ColHeader label="↓ acc." k="bias_up" tip="Accuracy cuando llama baja" />
          <ColHeader label="MAE" k="mae" tip="Error absoluto medio en magnitud (% final predicho vs real)" />
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-hint)' }}>Recientes →</div>
        </div>

        {/* Model rows */}
        {sorted.map((stat, i) => (
          <ModelRow
            key={stat.model_name}
            stat={stat}
            rank={i + 1}
            expanded={expanded === stat.model_name}
            onToggle={() => setExpanded(p => p === stat.model_name ? null : stat.model_name)}
          />
        ))}
      </div>

      <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-hint)', margin: '16px 4px 0', fontFamily: MONO }}>
        Clic en cualquier fila para ver calibración de confianza, sesgo direccional y rendimiento por activo.
        Los puntos recientes son verde=acertó, rojo=falló, opacidad=confianza del modelo.
      </p>

      <div style={{ marginTop: 32 }}>
        <ModelPerformance />
      </div>
    </section>
  )
}
