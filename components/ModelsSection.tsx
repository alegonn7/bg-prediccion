'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { DailyModelParam } from '@/app/page'

export type ModelLRParam = {
  model_name: string
  horizon_bucket: number
  train_samples: number
  train_accuracy: number
  bias: number
  feature_names: string[]
  coefficients: number[]
  last_updated: string
}

export type BacktestModelStat = {
  model_name: string
  horizon_bucket: number
  correct: number
  total: number
  pct: number
  brier_avg: number
  mae_avg: number
}

type IntradayLRParam = {
  model_name: string
  horizon_minutes: number
  train_samples: number
  avg_actual_mag: number | null
  lgbm_val_mae: number | null
  signed_r2: number | null
  last_updated: string
}

type VoteMeta = {
  name: string
  label: string
  color: string
  subtitle: string
  description: string
  source: string
  learned: boolean // true = modelo entrenado con coeficientes; false = fórmula fija sin entrenamiento
}

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"

// D4: los 4 votos reales que reemplazan la fachada de 16 (diario) / 13 (intradiario) nombres.
// Cada uno sale de una fuente de señal genuinamente distinta y puede votar una dirección
// distinta a los demás — a diferencia del sistema anterior, donde un bloque final pisaba
// las 16/13 estrategias con el mismo valor firmado y todas terminaban de acuerdo siempre.
const VOTES: VoteMeta[] = [
  {
    name: 'lgbm', label: 'LightGBM', color: '#3b82f6', learned: true,
    subtitle: 'No-linealidades — técnico + ATR + beta',
    description: 'Gradient boosting entrenado con Optuna sobre ~40 variables técnicas y de mercado (medias móviles, RSI, MACD, ATR, VIX, beta vs. SP500, interacciones). Es el voto que mejor generaliza cuando hay historial suficiente por horizonte.',
    source: 'Entrenado en python-api cada 3 días (auto_train). Servido en vivo por /api/predict_lgbm_daily (diario) y /api/predict_lgbm_all (intradiario).',
  },
  {
    name: 'ridge', label: 'Ridge lineal', color: '#8b5cf6', learned: true,
    subtitle: 'Mismo target, modelo lineal regularizado',
    description: 'Regresión Ridge sobre las mismas variables que LightGBM. Generaliza mejor con pocos datos y sirve de comparación: si le gana a LightGBM en error de validación, es señal de que el gradient boosting está sobreajustando.',
    source: 'Mismo ciclo de entrenamiento que LightGBM — model_signed_params_daily (diario) / model_learned_params_intraday (intradiario).',
  },
  {
    name: 'sentimiento', label: 'Sentimiento LLM', color: '#ec4899', learned: false,
    subtitle: 'Señal de noticias, ortogonal a lo técnico',
    description: 'Score de un LLM sobre noticias recientes del activo (función analista). Sin noticias en los últimos 3 días este voto se omite directamente — no fuerza una opinión sin información real detrás.',
    source: 'indicators.score_sentimiento, actualizado ~1x/día. El voto intradiario reusa el score del día como proxy — no hay pipeline de sentimiento minuto a minuto (eso es Etapa 5).',
  },
  {
    name: 'reversion', label: 'Reversión a la media', color: '#f43f5e', learned: false,
    subtitle: 'Z-score vs. SMA/Bollinger — el caso contrario a "tendencia"',
    description: 'Fórmula fija (no aprendida) que combina la distancia del precio a sus medias de 20/50/200 días y su posición en las Bandas de Bollinger. Cuanto más lejos y más rápido se alejó el precio, mayor la presión de reversión que asigna.',
    source: 'Calculada al momento desde indicators / indicators_intraday — siempre disponible, sin cold-start de entrenamiento.',
  },
]

const DAILY_BUCKETS = [1, 7, 14, 30, 60, 90]
const INTRADAY_HORIZONS = [60, 120, 240]

function maeColor(v: number | null): string {
  if (v == null) return 'var(--text-hint)'
  if (v <= 1.5) return '#22c55e'
  if (v <= 3.0) return '#d97706'
  return '#ef4444'
}

function StatTable({
  rows, cols,
}: {
  rows: { key: string | number; cells: (string | number | null)[] }[]
  cols: string[]
}) {
  if (!rows.length) return null
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {cols.map(c => (
              <th key={c} style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-hint)', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} style={{ borderBottom: '1px solid var(--border)' }}>
              {r.cells.map((c, i) => (
                <td key={i} style={{ padding: '7px 10px', textAlign: 'center', fontFamily: MONO, fontSize: 12, color: i === 0 ? 'var(--text)' : 'var(--text-muted)', fontWeight: i === 0 ? 700 : 400 }}>
                  {c ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VoteCard({
  meta, dailyParams, intradayParams, legacyLR, legacyBT, tab,
}: {
  meta: VoteMeta
  dailyParams: DailyModelParam[]
  intradayParams: IntradayLRParam[]
  legacyLR: ModelLRParam[]
  legacyBT: BacktestModelStat[]
  tab: 'diarios' | 'intradiarios'
}) {
  const [expanded, setExpanded] = useState(false)

  const dailyRows = tab === 'diarios' ? DAILY_BUCKETS.map(b => {
    const p = dailyParams.find(d => d.horizon_bucket === b)
    if (!p) return null
    const err = meta.name === 'ridge' ? p.val_mae_ridge : p.lgbm_val_mae
    return {
      key: b,
      cells: [
        `${b}d`,
        err != null ? `±${err.toFixed(2)}%` : null,
        meta.name === 'ridge' ? (p.signed_r2 != null ? p.signed_r2.toFixed(3) : null) : null,
        p.train_samples?.toLocaleString() ?? null,
        p.avg_actual_mag != null ? `±${p.avg_actual_mag.toFixed(2)}%` : null,
      ],
    }
  }).filter(Boolean) as { key: string | number; cells: (string | number | null)[] }[] : []

  const intraRows = tab === 'intradiarios' ? INTRADAY_HORIZONS.map(h => {
    const p = intradayParams.find(d => d.horizon_minutes === h && d.model_name === meta.name)
    if (!p) return null
    return {
      key: h,
      cells: [
        `${h}min`,
        p.lgbm_val_mae != null ? `±${p.lgbm_val_mae.toFixed(2)}%` : null,
        p.signed_r2 != null ? p.signed_r2.toFixed(3) : null,
        p.train_samples?.toLocaleString() ?? null,
        p.avg_actual_mag != null ? `±${p.avg_actual_mag.toFixed(2)}%` : null,
      ],
    }
  }).filter(Boolean) as { key: string | number; cells: (string | number | null)[] }[] : []

  const hasRealStats = dailyRows.length > 0 || intraRows.length > 0

  // Compatibilidad hacia atrás: si en el futuro se reentrena un modelo lineal por-voto bajo
  // este nombre (hoy backtest-asset/backtest-compute-weights sólo conocen los 16 nombres
  // viejos, no se tocaron en esta etapa), mostrar sus coeficientes emparejados por el
  // feature_names REAL de cada fila — nunca por posición contra una lista hardcodeada
  // (ese era el bug de índice de la versión anterior de esta vista).
  const legacyByBucket: Record<number, ModelLRParam> = {}
  for (const lr of legacyLR) if (lr.model_name === meta.name) legacyByBucket[lr.horizon_bucket] = lr
  const legacyBuckets = Object.keys(legacyByBucket).map(Number).sort((a, b) => a - b)
  const legacyBTByBucket: Record<number, BacktestModelStat> = {}
  for (const bt of legacyBT) if (bt.model_name === meta.name) legacyBTByBucket[bt.horizon_bucket] = bt

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, fontFamily: MONO }}>{meta.label}</h3>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
            background: meta.color + '22', color: meta.color, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            {meta.learned ? 'entrenado' : 'fórmula fija'}
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-hint)', margin: '0 0 8px', fontStyle: 'italic' }}>{meta.subtitle}</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px', lineHeight: 1.6 }}>{meta.description}</p>
        <p style={{ fontSize: 11, color: 'var(--text-hint)', margin: 0 }}>{meta.source}</p>
      </div>

      {hasRealStats && (
        <div style={{ padding: '14px 20px', borderBottom: legacyBuckets.length ? '1px solid var(--border)' : 'none' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 8 }}>
            Rendimiento real por horizonte
          </div>
          <StatTable
            rows={tab === 'diarios' ? dailyRows : intraRows}
            cols={['Horizonte', 'MAE (val)', 'R² firmado', 'Muestras', 'Mag. media real']}
          />
        </div>
      )}
      {!hasRealStats && (
        <div style={{ padding: '14px 20px', fontSize: 12, color: 'var(--text-hint)', fontStyle: 'italic' }}>
          {meta.learned
            ? `Sin entrenamiento todavía bajo el nombre "${meta.name}" para ${tab === 'diarios' ? 'diario' : 'intradiario'} — se completa solo tras el próximo ciclo de auto_train.`
            : 'Sin métricas de error — este voto no tiene coeficientes entrenados, es una fórmula fija.'}
        </div>
      )}

      {legacyBuckets.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              width: '100%', padding: '10px 20px', background: 'none', border: 'none',
              borderBottom: expanded ? '1px solid var(--border)' : 'none',
              color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
            {expanded ? 'Ocultar coeficientes de backtest' : 'Ver coeficientes de backtest histórico (nombre legado)'}
          </button>
          {expanded && (
            <div style={{ padding: '16px 20px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-hint)', fontWeight: 500, minWidth: 110 }}>Variable</th>
                      {legacyBuckets.map(b => (
                        <th key={b} style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-hint)', fontWeight: 500, minWidth: 90 }}>{b}d</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <td style={{ padding: '5px 8px', color: 'var(--text-hint)', fontStyle: 'italic' }}>bias (intercept)</td>
                      {legacyBuckets.map(b => (
                        <td key={b} style={{ padding: '5px 8px', textAlign: 'center', fontFamily: MONO, color: legacyByBucket[b].bias >= 0 ? '#22c55e' : '#ef4444' }}>
                          {legacyByBucket[b].bias > 0 ? '+' : ''}{legacyByBucket[b].bias.toFixed(3)}
                        </td>
                      ))}
                    </tr>
                    {/* Emparejado SIEMPRE por feature_names de la fila real, nunca por índice fijo */}
                    {(legacyByBucket[legacyBuckets[0]]?.feature_names ?? []).map((fname, fi) => (
                      <tr key={fname} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 8px', color: 'var(--text-muted)', fontFamily: MONO }}>{fname}</td>
                        {legacyBuckets.map(b => {
                          const lr = legacyByBucket[b]
                          const idx = lr.feature_names.indexOf(fname)
                          const c = idx >= 0 ? lr.coefficients[idx] : null
                          return (
                            <td key={b} style={{ padding: '5px 8px', textAlign: 'center', fontFamily: MONO, fontSize: 10, fontWeight: 600, color: c == null ? 'var(--text-hint)' : c >= 0 ? '#22c55e' : '#f87171' }}>
                              {c != null ? `${c > 0 ? '+' : ''}${c.toFixed(3)}` : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: '5px 8px', color: 'var(--text-hint)', fontSize: 10 }}>Muestras / Acc. (train)</td>
                      {legacyBuckets.map(b => {
                        const lr = legacyByBucket[b]
                        const bt = legacyBTByBucket[b]
                        return (
                          <td key={b} style={{ padding: '5px 8px', textAlign: 'center', fontSize: 10 }}>
                            <div style={{ color: 'var(--text-muted)' }}>{lr.train_samples.toLocaleString()}</div>
                            <div style={{ color: 'var(--text-hint)' }}>
                              {(lr.train_accuracy * 100).toFixed(1)}%{bt ? ` · BT ${(bt.pct * 100).toFixed(1)}%` : ''}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

type Props = {
  modelLRParams: ModelLRParam[]
  backtestModelStats: BacktestModelStat[]
  dailyModelParams?: DailyModelParam[]
}

export function ModelosSection({ modelLRParams, backtestModelStats, dailyModelParams = [] }: Props) {
  const [subTab, setSubTab] = useState<'diarios' | 'intradiarios'>('diarios')
  const [intradayParams, setIntradayParams] = useState<IntradayLRParam[] | null>(null)
  const [loadingIntraday, setLoadingIntraday] = useState(false)

  useEffect(() => {
    if (subTab !== 'intradiarios' || intradayParams !== null) return
    setLoadingIntraday(true)
    const supabase = createClient()
    supabase
      .from('model_learned_params_intraday')
      .select('model_name, horizon_minutes, train_samples, avg_actual_mag, lgbm_val_mae, signed_r2, last_updated')
      .in('model_name', VOTES.map(v => v.name))
      .then(({ data }) => {
        setIntradayParams((data ?? []) as IntradayLRParam[])
        setLoadingIntraday(false)
      })
  }, [subTab, intradayParams])

  function subTabStyle(on: boolean): React.CSSProperties {
    return {
      padding: '8px 20px', fontSize: 13, fontWeight: on ? 700 : 400,
      background: on ? 'var(--text)' : 'var(--card)',
      color: on ? 'var(--bg)' : 'var(--text-muted)',
      border: '1px solid var(--border)', borderRadius: 8,
      cursor: 'pointer', transition: 'all 0.15s',
      fontFamily: MONO,
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Modelos del Sistema</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          4 votos genuinamente distintos (LightGBM, Ridge lineal, Sentimiento LLM, Reversión a la media),
          combinados por un meta-modelo. Cada uno puede votar una dirección distinta de los demás.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setSubTab('diarios')} style={subTabStyle(subTab === 'diarios')}>
          Diarios (1–90d)
        </button>
        <button onClick={() => setSubTab('intradiarios')} style={subTabStyle(subTab === 'intradiarios')}>
          Intradiarios (60–240min)
        </button>
      </div>

      {subTab === 'intradiarios' && loadingIntraday && (
        <div style={{ fontSize: 12, color: 'var(--text-hint)', fontFamily: MONO }}>Cargando parámetros intradiarios…</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 16 }}>
        {VOTES.map(meta => (
          <VoteCard
            key={meta.name}
            meta={meta}
            dailyParams={dailyModelParams}
            intradayParams={intradayParams ?? []}
            legacyLR={modelLRParams}
            legacyBT={backtestModelStats}
            tab={subTab}
          />
        ))}
      </div>
    </div>
  )
}
