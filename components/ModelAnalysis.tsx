'use client'
import { useState, useMemo } from 'react'
import type { ModelDetailStat, RawModelPred } from '@/app/page'
import { ModelPerformance } from './ModelPerformance'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"

const MODEL_LABELS: Record<string, string> = {
  tendencia:       'Tendencia',
  momentum:        'Momentum',
  volatilidad:     'Volatilidad',
  volumen:         'Volumen',
  estructura:      'Estructura',
  elliott:         'Elliott',
  velas:           'Velas',
  macro:           'Macro',
  fundamental:     'Fundamental',
  sentimiento:     'Sentimiento',
  regresion:       'Regresión lineal',
  reversion:       'Reversión media',
  divergencias:    'Divergencias',
  estacionalidad:  'Estacionalidad',
  beta_mercado:    'Beta-mercado',
  fuerza_relativa: 'Fuerza relativa',
}

const ALL_MODELS = [
  'tendencia','momentum','volatilidad','volumen','estructura','elliott',
  'velas','macro','fundamental','sentimiento',
  'regresion','reversion','divergencias','estacionalidad','beta_mercado','fuerza_relativa',
]

type DateRange = '7d' | '30d' | '90d' | 'all'
const DATE_OPTS: { id: DateRange; label: string }[] = [
  { id: '7d',  label: 'Últ. 7d' },
  { id: '30d', label: 'Últ. 30d' },
  { id: '90d', label: 'Últ. 90d' },
  { id: 'all', label: 'Todo' },
]

type SortKey = 'mae' | 'dir' | 'n'

function maeBg(v: number) {
  if (v <= 1.5) return 'rgba(34,197,94,0.15)'
  if (v <= 4)   return 'rgba(234,179,8,0.15)'
  return 'rgba(239,68,68,0.12)'
}
function maeColor(v: number) {
  if (v <= 1.5) return 'var(--up)'
  if (v <= 4)   return '#d97706'
  return 'var(--down)'
}
function dirColor(v: number) {
  if (v >= 65) return 'var(--up)'
  if (v >= 53) return '#d97706'
  return 'var(--down)'
}

function filterByDate(preds: RawModelPred[], range: DateRange): RawModelPred[] {
  if (range === 'all') return preds
  const now = new Date()
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  return preds.filter(p => {
    const d = p.target_date ? new Date(p.target_date + 'T12:00:00') : null
    return d && now.getTime() - d.getTime() <= days * 86400000
  })
}

function buildStats(preds: RawModelPred[]): ModelDetailStat[] {
  const byModel: Record<string, RawModelPred[]> = {}
  for (const mn of ALL_MODELS) byModel[mn] = []
  for (const p of preds) {
    if (byModel[p.model_name]) byModel[p.model_name].push(p)
  }

  const HORIZON_BUCKETS = [1, 2, 7, 14, 30, 60, 90]

  return ALL_MODELS.map(mn => {
    const ps = byModel[mn] ?? []
    const total   = ps.length
    const correct = ps.filter(p => p.direction_correct).length
    const up      = ps.filter(p => p.direction === 'up')
    const down    = ps.filter(p => p.direction === 'down')
    const maes    = ps.filter(p => p.mae != null).map(p => Number(p.mae))
    const confs   = ps.map(p => Number(p.confidence))

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

    return {
      model_name:   mn,
      total,
      correct,
      dir_accuracy: total >= 3 ? correct / total : null,
      called_up:    up.length,
      correct_up:   up.filter(p => p.direction_correct).length,
      called_down:  down.length,
      correct_down: down.filter(p => p.direction_correct).length,
      mae_avg:      maes.length ? maes.reduce((a, b) => a + b, 0) / maes.length : null,
      rmse_avg:     null,
      mae_when_correct: null,
      mae_when_wrong:   null,
      avg_confidence:   confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0,
      conf_low:  { total: 0, correct: 0 },
      conf_mid:  { total: 0, correct: 0 },
      conf_high: { total: 0, correct: 0 },
      by_ticker: Object.entries(byTicker)
        .map(([ticker, v]) => ({
          ticker, total: v.total, correct: v.correct,
          accuracy: v.total > 0 ? v.correct / v.total : 0,
          mae_avg:  v.maes.length ? v.maes.reduce((a, b) => a + b, 0) / v.maes.length : null,
        }))
        .sort((a, b) => (a.mae_avg ?? 999) - (b.mae_avg ?? 999)),
      mae_by_horizon: HORIZON_BUCKETS
        .filter(h => byHorizon[h].length > 0)
        .map(h => ({ horizon: h, mae: byHorizon[h].reduce((a, b) => a + b, 0) / byHorizon[h].length, n: byHorizon[h].length })),
      recent: ps.slice(0, 15).map(p => ({
        correct:    p.direction_correct as boolean,
        confidence: Number(p.confidence),
        ticker:     p.assets?.ticker ?? '?',
      })),
    }
  })
}

function ModelRow({ stat, rank, expanded, onToggle }: {
  stat: ModelDetailStat; rank: number; expanded: boolean; onToggle: () => void
}) {
  const maeVal = stat.mae_avg !== null ? stat.mae_avg * 100 : null
  const dirVal = stat.dir_accuracy !== null ? stat.dir_accuracy * 100 : null

  return (
    <>
      <div
        onClick={onToggle}
        style={{
          display: 'grid',
          gridTemplateColumns: '28px 1.6fr 110px 90px 60px 1fr',
          gap: 12, padding: '12px 20px',
          alignItems: 'center', cursor: 'pointer',
          borderBottom: expanded ? 'none' : '1px solid var(--border)',
          background: expanded ? 'var(--bg-muted)' : 'transparent',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'var(--bg-muted)' }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        {/* Rank */}
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>#{rank}</span>

        {/* Model name */}
        <span style={{ fontSize: 13, fontWeight: 600 }}>{MODEL_LABELS[stat.model_name] ?? stat.model_name}</span>

        {/* MAE badge — primary metric */}
        {maeVal !== null ? (
          <div style={{
            background: maeBg(maeVal),
            borderRadius: 8, padding: '5px 10px',
            display: 'inline-flex', alignItems: 'baseline', gap: 2,
          }}>
            <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: maeColor(maeVal) }}>
              ±{maeVal.toFixed(1)}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: maeColor(maeVal), opacity: 0.8 }}>%</span>
          </div>
        ) : (
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>—</span>
        )}

        {/* Direction accuracy */}
        {dirVal !== null ? (
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: dirColor(dirVal) }}>
            {Math.round(dirVal)}%
          </span>
        ) : (
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>—</span>
        )}

        {/* n */}
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)' }}>
          {stat.total > 0 ? stat.total : '—'}
        </span>

        {/* Recent dots */}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {stat.recent.slice(0, 12).map((r, i) => (
            <div key={i} title={`${r.ticker} · ${r.correct ? 'acertó' : 'falló'}`} style={{
              width: 9, height: 9, borderRadius: '50%',
              background: r.correct ? 'var(--up)' : 'var(--down)',
              opacity: 0.3 + r.confidence * 0.7,
            }} />
          ))}
          {stat.total === 0 && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)' }}>sin datos</span>
          )}
        </div>
      </div>

      {/* Expanded: MAE por horizonte + por activo */}
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
              fontSize: 16, color: 'var(--text-hint)', lineHeight: 1, padding: '2px 6px',
            }}
          >×</button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, paddingTop: 16 }}>

            {/* MAE por horizonte */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
                MAE por horizonte
              </div>
              {stat.mae_by_horizon.length === 0 ? (
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>sin datos</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stat.mae_by_horizon.map(h => {
                    const mpp = h.mae * 100
                    return (
                      <div key={h.horizon} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', minWidth: 42 }}>
                          {h.horizon}d
                        </span>
                        <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 999,
                            width: `${Math.min(mpp / 8 * 100, 100)}%`,
                            background: maeColor(mpp),
                          }} />
                        </div>
                        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: maeColor(mpp), minWidth: 52, textAlign: 'right' }}>
                          ±{mpp.toFixed(1)}%
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', minWidth: 32 }}>
                          n={h.n}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              {stat.recent.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 8 }}>
                    Últimas {stat.recent.length} predicciones
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {stat.recent.map((r, i) => (
                      <div key={i} title={`${r.ticker} · ${r.correct ? 'acertó' : 'falló'}`} style={{
                        width: 12, height: 12, borderRadius: '50%',
                        background: r.correct ? 'var(--up)' : 'var(--down)',
                        opacity: 0.3 + r.confidence * 0.7,
                      }} />
                    ))}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', marginTop: 4 }}>
                    verde=acertó dirección · rojo=falló · opacidad=confianza
                  </div>
                </div>
              )}
            </div>

            {/* MAE por activo */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
                MAE por activo (mejor → peor)
              </div>
              {stat.by_ticker.length === 0 ? (
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>sin datos</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {stat.by_ticker.slice(0, 10).map(t => {
                    const mpp = t.mae_avg !== null ? t.mae_avg * 100 : null
                    return (
                      <div key={t.ticker} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, minWidth: 48 }}>{t.ticker}</span>
                        <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
                          {mpp !== null && (
                            <div style={{
                              height: '100%', borderRadius: 999,
                              width: `${Math.min(mpp / 8 * 100, 100)}%`,
                              background: maeColor(mpp),
                            }} />
                          )}
                        </div>
                        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: mpp !== null ? maeColor(mpp) : 'var(--text-hint)', minWidth: 52, textAlign: 'right' }}>
                          {mpp !== null ? `±${mpp.toFixed(1)}%` : '—'}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', minWidth: 38, textAlign: 'right' }}>
                          {Math.round(t.accuracy * 100)}% dir
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function ModelAnalysisSection({ stats, rawPreds }: { stats: ModelDetailStat[]; rawPreds: RawModelPred[] }) {
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [sortKey,   setSortKey]   = useState<SortKey>('mae')
  const [sortAsc,   setSortAsc]   = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>('all')

  const activeStats = useMemo(() => {
    if (dateRange === 'all') return stats
    const filtered = filterByDate(rawPreds, dateRange)
    return buildStats(filtered)
  }, [dateRange, stats, rawPreds])

  const totalClosed  = activeStats.reduce((s, m) => s + m.total, 0)
  const totalCorrect = activeStats.reduce((s, m) => s + m.correct, 0)
  const globalMae    = (() => {
    const ms = activeStats.filter(m => m.mae_avg !== null).map(m => m.mae_avg! * 100)
    return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null
  })()

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(key === 'mae') }
  }

  const sorted = [...activeStats].sort((a, b) => {
    let va: number, vb: number
    if (sortKey === 'mae') {
      va = a.mae_avg ?? (sortAsc ? 999 : -1)
      vb = b.mae_avg ?? (sortAsc ? 999 : -1)
    } else if (sortKey === 'dir') {
      va = a.dir_accuracy ?? (sortAsc ? -1 : 999)
      vb = b.dir_accuracy ?? (sortAsc ? -1 : 999)
    } else {
      va = a.total; vb = b.total
    }
    return sortAsc ? va - vb : vb - va
  })

  function SortBtn({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k
    return (
      <button onClick={() => toggleSort(k)} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: active ? 'var(--text)' : 'var(--text-hint)',
        fontWeight: active ? 700 : 400,
      }}>
        {label} {active ? (sortAsc ? '↑' : '↓') : ''}
      </button>
    )
  }

  return (
    <section style={{ marginBottom: 64 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>06</span>
          <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
            Análisis de modelos
          </h2>
          {totalClosed > 0 && (
            <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>
              {totalClosed} eval · {Math.round(totalCorrect / totalClosed * 100)}% dir
              {globalMae !== null && ` · MAE ±${globalMae.toFixed(1)}%`}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {DATE_OPTS.map(o => (
            <button key={o.id} onClick={() => { setDateRange(o.id); setExpanded(null) }} style={{
              padding: '4px 11px', fontSize: 11, fontFamily: MONO,
              fontWeight: dateRange === o.id ? 700 : 400,
              background: dateRange === o.id ? 'var(--text)' : 'var(--bg-card)',
              color: dateRange === o.id ? 'var(--bg)' : 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
            }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {totalClosed === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '20px 24px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6,
        }}>
          Los modelos se auditan cuando vencen las predicciones. La tabla aparecerá con datos reales a medida que cierren.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '28px 1.6fr 110px 90px 60px 1fr',
            gap: 12, padding: '10px 20px',
            background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)',
          }}>
            <div />
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-hint)' }}>Modelo</div>
            <SortBtn label="MAE ↕" k="mae" />
            <SortBtn label="% Dir ↕" k="dir" />
            <SortBtn label="n ↕" k="n" />
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-hint)' }}>Recientes →</div>
          </div>

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
      )}

      <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', margin: '12px 4px 0', lineHeight: 1.6 }}>
        MAE = cuántos %pp promedio le erramos a la magnitud. Verde ≤1.5% · amarillo ≤4% · rojo {'>'}4%.
        Clic en cualquier fila para ver el desglose por horizonte y activo.
      </p>

      <div style={{ marginTop: 32 }}>
        <ModelPerformance />
      </div>
    </section>
  )
}
