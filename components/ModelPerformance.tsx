'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

const MONO     = "var(--font-mono, 'IBM Plex Mono', monospace)"
const HORIZONS = [1, 7, 14, 30, 60, 90]
const MIN_SAMPLES = 5

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
  regresion:       'Regresión',
  reversion:       'Reversión',
  divergencias:    'Divergencias',
  estacionalidad:  'Estacionalidad',
  beta_mercado:    'Beta mercado',
  fuerza_relativa: 'Fuerza relativa',
}
const MODEL_ORDER = Object.keys(MODEL_LABELS)

type Cell = { correct: number; total: number; maeSum: number; maeN: number }
type Matrix = Record<string, Record<number, Cell>>

function accColor(acc: number): string {
  if (acc >= 0.65) return 'var(--up)'
  if (acc >= 0.55) return '#8bc34a'
  if (acc >= 0.45) return 'var(--text-muted)'
  return 'var(--down)'
}

function accBg(acc: number): string {
  if (acc >= 0.65) return 'rgba(34,197,94,0.08)'
  if (acc >= 0.55) return 'rgba(139,195,74,0.07)'
  if (acc >= 0.45) return 'transparent'
  return 'rgba(239,68,68,0.07)'
}

export function ModelPerformance() {
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [matrix,  setMatrix]  = useState<Matrix | null>(null)
  const [total,   setTotal]   = useState(0)

  async function load() {
    if (matrix !== null) return
    setLoading(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('model_predictions')
        .select('model_name, horizon_days, direction_correct, final_pct_predicted, actual_final_pct')
        .eq('status', 'closed')
        .not('direction_correct', 'is', null)

      if (!data?.length) { setMatrix({}); setTotal(0); return }
      setTotal(data.length)

      const m: Matrix = {}
      for (const row of data) {
        const name = row.model_name
        const h    = row.horizon_days
        if (!m[name])    m[name] = {}
        if (!m[name][h]) m[name][h] = { correct: 0, total: 0, maeSum: 0, maeN: 0 }
        const c = m[name][h]
        c.total++
        if (row.direction_correct) c.correct++
        const pred = row.final_pct_predicted != null ? Number(row.final_pct_predicted) : null
        const act  = row.actual_final_pct    != null ? Number(row.actual_final_pct)    : null
        if (pred != null && act != null) { c.maeSum += Math.abs(pred - act); c.maeN++ }
      }
      setMatrix(m)
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) load()
  }

  const hasData = matrix && Object.keys(matrix).length > 0

  // Summary row: best model per horizon
  const bestPerHorizon: Record<number, { name: string; acc: number }> = {}
  if (hasData) {
    for (const h of HORIZONS) {
      let best: { name: string; acc: number } | null = null
      for (const name of MODEL_ORDER) {
        const cell = matrix[name]?.[h]
        if (!cell || cell.total < MIN_SAMPLES) continue
        const acc = cell.correct / cell.total
        if (!best || acc > best.acc) best = { name, acc }
      }
      if (best) bestPerHorizon[h] = best
    }
  }

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden', marginBottom: 20,
    }}>
      {/* Header / toggle */}
      <button
        onClick={toggle}
        style={{
          width: '100%', padding: '16px 24px',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          Rendimiento de modelos
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-hint)', flex: 1 }}>
          precisión de dirección por horizonte · se actualiza a diario
        </span>
        {total > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', flexShrink: 0 }}>
            {total} cerradas
          </span>
        )}
        <span style={{
          fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)',
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
          flexShrink: 0,
        }}>▼</span>
      </button>

      {open && (
        <div style={{ padding: '0 24px 28px', borderTop: '1px solid var(--border)' }}>
          <div style={{ height: 16 }} />

          {/* Loading */}
          {loading && (
            <div style={{
              padding: '40px 0', textAlign: 'center',
              fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)',
            }}>
              Cargando datos…
            </div>
          )}

          {/* Empty */}
          {!loading && !hasData && (
            <div style={{
              padding: '28px 20px', background: 'var(--bg-muted)',
              borderRadius: 10, textAlign: 'center',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                Sin datos todavía
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-hint)', lineHeight: 1.7 }}>
                La matriz se puebla automáticamente cuando las predicciones empiezan a cerrarse.
                <br />
                Las primeras entradas aparecen mañana con las predicciones H=1 de hoy.
                <br />
                Para H=7 aparecen en una semana, H=30 en un mes, etc.
              </div>
            </div>
          )}

          {/* Matrix */}
          {!loading && hasData && (
            <>
              {/* Legend */}
              <div style={{
                display: 'flex', gap: 16, flexWrap: 'wrap',
                marginBottom: 16, fontSize: 11, fontFamily: MONO,
              }}>
                {[
                  { color: 'var(--up)',          label: '≥65%  muy bueno' },
                  { color: '#8bc34a',             label: '≥55%  bueno'    },
                  { color: 'var(--text-muted)',   label: '≥45%  neutro'   },
                  { color: 'var(--down)',          label: '<45%  peor que azar' },
                ].map(({ color, label }) => (
                  <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-hint)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ color }}>{label}</span>
                  </span>
                ))}
                <span style={{ color: 'var(--text-hint)' }}>
                  — = menos de {MIN_SAMPLES} muestras
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{
                        textAlign: 'left', padding: '6px 16px 6px 0',
                        color: 'var(--text-hint)', fontWeight: 400,
                        borderBottom: '1px solid var(--border)',
                      }}>
                        Modelo
                      </th>
                      {HORIZONS.map(h => (
                        <th key={h} style={{
                          textAlign: 'center', padding: '6px 8px',
                          color: 'var(--text-hint)', fontWeight: 400, minWidth: 72,
                          borderBottom: '1px solid var(--border)',
                        }}>
                          H={h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODEL_ORDER.map(name => {
                      const row = matrix[name] ?? {}
                      const hasAny = HORIZONS.some(h => (row[h]?.total ?? 0) >= MIN_SAMPLES)
                      return (
                        <tr
                          key={name}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            opacity: !hasAny ? 0.4 : 1,
                          }}
                        >
                          <td style={{
                            padding: '9px 16px 9px 0',
                            color: 'var(--text)',
                            whiteSpace: 'nowrap',
                          }}>
                            {MODEL_LABELS[name] ?? name}
                          </td>
                          {HORIZONS.map(h => {
                            const cell = row[h]
                            if (!cell || cell.total < MIN_SAMPLES) {
                              return (
                                <td key={h} style={{ textAlign: 'center', padding: '9px 8px', color: 'var(--text-hint)' }}>
                                  {cell && cell.total > 0
                                    ? <span style={{ fontSize: 10 }}>({cell.total})</span>
                                    : '—'
                                  }
                                </td>
                              )
                            }
                            const acc = cell.correct / cell.total
                            const mae = cell.maeN > 0 ? (cell.maeSum / cell.maeN).toFixed(1) : null
                            const isBest = bestPerHorizon[h]?.name === name
                            return (
                              <td key={h} style={{
                                textAlign: 'center', padding: '9px 8px',
                                background: accBg(acc),
                                position: 'relative',
                              }}>
                                <div style={{
                                  color: accColor(acc),
                                  fontWeight: 700,
                                  fontSize: 12,
                                }}>
                                  {Math.round(acc * 100)}%
                                  {isBest && (
                                    <span style={{ fontSize: 8, marginLeft: 2, color: 'var(--up)', verticalAlign: 'super' }}>★</span>
                                  )}
                                </div>
                                <div style={{ fontSize: 9, color: 'var(--text-hint)', marginTop: 1 }}>
                                  n={cell.total}{mae != null ? ` ±${mae}` : ''}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>

                  {/* Best row */}
                  {Object.keys(bestPerHorizon).length > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)' }}>
                        <td style={{ padding: '8px 16px 4px 0', fontSize: 10, color: 'var(--text-hint)', fontWeight: 600 }}>
                          ★ MEJOR
                        </td>
                        {HORIZONS.map(h => {
                          const b = bestPerHorizon[h]
                          return (
                            <td key={h} style={{ textAlign: 'center', padding: '8px', fontSize: 10, color: 'var(--text-hint)' }}>
                              {b ? MODEL_LABELS[b.name]?.split(' ')[0] ?? b.name : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-hint)', fontFamily: MONO }}>
                ±MAE = error de magnitud promedio en puntos porcentuales.
                El calibrador ajusta automáticamente los modelos con MAE alto cuando hay ≥200 predicciones cerradas.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
