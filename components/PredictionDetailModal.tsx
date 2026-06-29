'use client'
import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, LineChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { InfoTip } from './InfoTip'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"

type PriceBand = {
  day: number
  p10: number; p25: number; p50: number; p75: number; p90: number
  pct_p50: number
}

type ModelPred = {
  id: string
  model_name: string
  direction: string
  confidence: number
  final_pct_predicted: number
  reasoning: string
  key_signals: Record<string, unknown>
  price_path: { day: number; price: number; pct: number }[]
}

type ConsensusPrediction = {
  id: string
  direction: string
  confidence: number
  horizon_days: number
  target_date: string
  price_at_creation: number
  created_at: string
  agreement_pct: number
  models_bullish: number
  models_bearish: number
  models_neutral: number
  models_total: number
  final_pct_predicted: number
  price_path: PriceBand[] | null
  model_prediction_ids: string[] | null
  assets: { ticker: string; name: string; asset_class: string; currency: string } | null
}

const MODEL_LABELS: Record<string, string> = {
  tendencia: 'Tendencia',
  momentum: 'Momentum',
  volatilidad: 'Volatilidad',
  volumen: 'Volumen',
  estructura: 'Estructura',
  elliott: 'Elliott',
  velas: 'Velas',
  macro: 'Macro',
  fundamental: 'Fundamental',
  sentimiento: 'Sentimiento',
}

function fmt(n: number, d = 2) { return (n >= 0 ? '+' : '') + n.toFixed(d) + '%' }

// ── Chart ──────────────────────────────────────────────────────────────────
function BandChart({ bands }: { bands: PriceBand[] }) {
  if (!bands.length) return null

  const base = bands[0].p50

  const chartData = bands.map(b => ({
    label: `d${b.day}`,
    dayNum: b.day,
    p10: Math.round((b.p10 / base - 1) * 10000) / 100,
    p25: Math.round((b.p25 / base - 1) * 10000) / 100,
    p50: b.pct_p50,
    p75: Math.round((b.p75 / base - 1) * 10000) / 100,
    p90: Math.round((b.p90 / base - 1) * 10000) / 100,
    // For band fill: outer = p10 to p90, inner = p25 to p75
    // recharts trick: area from p10 to p90 as [low, high]
    outer_low: Math.round((b.p10 / base - 1) * 10000) / 100,
    outer_high: Math.round((b.p90 / base - 1) * 10000) / 100,
    inner_low: Math.round((b.p25 / base - 1) * 10000) / 100,
    inner_high: Math.round((b.p75 / base - 1) * 10000) / 100,
  }))

  const allVals = chartData.flatMap(d => [d.p10, d.p90])
  const yMin = Math.floor(Math.min(...allVals, 0) - 0.5)
  const yMax = Math.ceil(Math.max(...allVals, 0) + 0.5)

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    if (!d) return null
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '10px 14px', fontFamily: MONO, fontSize: 11,
      }}>
        <div style={{ marginBottom: 6, color: 'var(--text-muted)' }}>Día {d.dayNum}</div>
        <div style={{ color: 'var(--text-hint)' }}>p90 {fmt(d.p90)}</div>
        <div style={{ color: 'var(--text-hint)' }}>p75 {fmt(d.p75)}</div>
        <div style={{ fontWeight: 700 }}>p50 {fmt(d.p50)}</div>
        <div style={{ color: 'var(--text-hint)' }}>p25 {fmt(d.p25)}</div>
        <div style={{ color: 'var(--text-hint)' }}>p10 {fmt(d.p10)}</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 12 }}>
        Trayectoria de precios · bandas de incertidumbre
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontFamily: MONO, fontSize: 10, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`}
            tick={{ fontFamily: MONO, fontSize: 10, fill: 'var(--text-hint)' }}
            axisLine={false} tickLine={false}
            domain={[yMin, yMax]}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" strokeWidth={1.5} />
          {/* Outer envelope p10 & p90 — dashed thin */}
          <Line type="monotone" dataKey="p90" stroke="var(--text-hint)" strokeWidth={1} strokeDasharray="3 3" dot={false} />
          <Line type="monotone" dataKey="p10" stroke="var(--text-hint)" strokeWidth={1} strokeDasharray="3 3" dot={false} />
          {/* Inner band p25 & p75 — solid thin */}
          <Line type="monotone" dataKey="p75" stroke="var(--text-muted)" strokeWidth={1} dot={false} />
          <Line type="monotone" dataKey="p25" stroke="var(--text-muted)" strokeWidth={1} dot={false} />
          {/* Median — bold */}
          <Line type="monotone" dataKey="p50" stroke="var(--text)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--text)' }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 20, marginTop: 8, fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', flexWrap: 'wrap' }}>
        <span>━━ mediana p50</span>
        <span style={{ opacity: 0.6 }}>── p25 / p75</span>
        <span style={{ opacity: 0.4 }}>╌╌ p10 / p90</span>
      </div>
    </div>
  )
}

// ── Model breakdown ────────────────────────────────────────────────────────
function ModelTable({ models }: { models: ModelPred[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const sorted = [...models].sort((a, b) => b.confidence - a.confidence)

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 12 }}>
        Detalle por modelo
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map(m => {
          const up = m.final_pct_predicted >= 0
          const isOpen = expanded === m.model_name
          // First line of reasoning = summary shown in collapsed row
          const lines = (m.reasoning ?? '').split('\n').filter(Boolean)
          const summary = lines[0] ?? ''
          const detail  = lines.slice(1).join('\n')

          return (
            <div key={m.model_name}
              style={{ borderRadius: 10, border: `1px solid ${isOpen ? 'var(--text-muted)' : 'var(--border)'}`, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s' }}
              onClick={() => setExpanded(isOpen ? null : m.model_name)}
            >
              {/* Collapsed row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: 'var(--bg-muted)' }}>
                <div style={{ minWidth: 100, flexShrink: 0 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>
                    {MODEL_LABELS[m.model_name] ?? m.model_name}
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    marginTop: 4, padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                    background: up ? 'var(--up-soft)' : 'var(--down-soft)',
                    color: up ? 'var(--up)' : 'var(--down)',
                  }}>
                    {up ? '↑' : '↓'} {fmt(m.final_pct_predicted)}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Summary hint */}
                  <div style={{ fontSize: 11, color: 'var(--text-hint)', lineHeight: 1.5, marginBottom: 8, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                    {summary}
                  </div>
                  {/* Confidence bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round(m.confidence * 100)}%`, background: up ? 'var(--up)' : 'var(--down)', borderRadius: 999 }} />
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', flexShrink: 0 }}>
                      {Math.round(m.confidence * 100)}% conf.
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-hint)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>▼</span>
                  </div>
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ padding: '16px 16px 20px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>

                  {/* Full reasoning */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 8 }}>
                      Análisis
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.65 }}>
                      {summary}
                    </p>
                    {detail && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                        {detail}
                      </p>
                    )}
                  </div>

                  {/* Key signals as stat grid */}
                  {m.key_signals && Object.keys(m.key_signals).length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 8 }}>
                        Señales clave
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                        {Object.entries(m.key_signals).filter(([, v]) => v != null && v !== '' && v !== 'n/d').map(([k, v]) => (
                          <div key={k} style={{
                            background: 'var(--bg-muted)', borderRadius: 8, padding: '8px 10px',
                          }}>
                            <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3, fontFamily: MONO }}>{k}</div>
                            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4, wordBreak: 'break-word' }}>{String(v)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mini path chart */}
                  {m.price_path?.length > 0 && (
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 8 }}>
                        Trayectoria individual
                      </div>
                      <ResponsiveContainer width="100%" height={90}>
                        <LineChart data={m.price_path} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <XAxis dataKey="day" tick={{ fontFamily: MONO, fontSize: 9, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} />
                          <YAxis hide domain={['auto', 'auto']} />
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
                          <Tooltip
                            formatter={(v: any) => [`${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`, 'Cambio']}
                            contentStyle={{ fontFamily: MONO, fontSize: 11, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
                          />
                          <Line
                            type="monotone" dataKey="pct" stroke={m.final_pct_predicted >= 0 ? 'var(--up)' : 'var(--down)'}
                            strokeWidth={2} dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Vote explanation ───────────────────────────────────────────────────────
function VoteVsPctExplanation({ bull, bear, predPct }: { bull: number; bear: number; predPct: number }) {
  const contradiction = (bull > bear && predPct < 0) || (bear > bull && predPct > 0)
  if (!contradiction) return null
  return (
    <div style={{
      background: 'var(--bg-muted)', borderRadius: 10, padding: '14px 16px', marginBottom: 20,
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        ¿Por qué {bull} alcistas → predicción negativa?
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
        Los {bull} modelos alcistas predicen subas pequeñas con baja confianza.
        Los {bear} modelos bajistas predicen caídas fuertes con alta confianza.
        La predicción final es la <strong>mediana ponderada por confianza</strong> de todos los precios predichos —
        no un simple voto mayoritario. Con suficiente peso en el lado bajista, la mediana cae
        en terreno negativo aunque haya más modelos alcistas.
      </p>
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────────
export function PredictionDetailModal({
  prediction,
  onClose,
}: {
  prediction: ConsensusPrediction
  onClose: () => void
}) {
  const [models, setModels] = useState<ModelPred[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const p = prediction
  const predPct = p.final_pct_predicted
  const up = predPct >= 0
  const dirColor = up ? 'var(--up)' : 'var(--down)'
  const dirSoft  = up ? 'var(--up-soft)' : 'var(--down-soft)'
  const asset = p.assets

  // Fetch model predictions
  useEffect(() => {
    if (!p.model_prediction_ids?.length) return
    setLoading(true)
    supabase
      .from('model_predictions')
      .select('id, model_name, direction, confidence, final_pct_predicted, reasoning, key_signals, price_path')
      .in('id', p.model_prediction_ids)
      .then(({ data, error }) => {
        setLoading(false)
        if (error) { setErr(error.message); return }
        setModels(data as ModelPred[])
      })
  }, [p.id])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const bands = (p.price_path as PriceBand[] | null) ?? []

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
        padding: 0,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 680, height: '100vh', overflowY: 'auto',
        background: 'var(--bg)', borderLeft: '1px solid var(--border)',
        padding: '32px 28px 64px',
        display: 'flex', flexDirection: 'column', gap: 28,
      }}>

        {/* Close + header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', marginBottom: 6 }}>
              {asset?.asset_class} · {asset?.currency} · horizonte {p.horizon_days}d
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: MONO, letterSpacing: '-0.01em' }}>
              {asset?.ticker ?? '—'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{asset?.name}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: dirSoft }}>
              <span style={{ fontSize: 15, color: dirColor }}>{up ? '↑' : '↓'}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: dirColor }}>{up ? 'SUBE' : 'BAJA'}</span>
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: dirColor, marginLeft: 4 }}>
                {fmt(predPct)}
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg-muted)', color: 'var(--text-muted)',
                fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >×</button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'Al predecir', value: `$${p.price_at_creation?.toFixed(2)}`, tip: null },
            {
              label: 'Confianza', value: `${Math.round(p.confidence * 100)}%`,
              tip: 'Promedio ponderado de la certeza de cada modelo sobre su propia predicción. Se basa en la fuerza de señales técnicas internas. No indica si la predicción es correcta, sino cuán convencido está el modelo.',
            },
            {
              label: 'Acuerdo', value: `${p.agreement_pct}%`,
              tip: 'Porcentaje de modelos que votan la misma dirección que la predicción final. Puede haber mayoría alcista y predicción negativa si los modelos bajistas tienen mayor confianza — el resultado final es la mediana ponderada, no un voto.',
            },
            { label: 'Vence', value: p.target_date, tip: null },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-muted)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                {s.label} {s.tip && <InfoTip text={s.tip} />}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Vote bar */}
        <div style={{ background: 'var(--bg-muted)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, color: 'var(--text-hint)' }}>
            <span>Votos del ensamble ({p.models_total} modelos)</span>
          </div>
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
            {p.models_bullish > 0 && <div style={{ flex: p.models_bullish, background: 'var(--up)', borderRadius: 999 }} />}
            {p.models_neutral > 0 && <div style={{ flex: p.models_neutral, background: 'var(--text-hint)', borderRadius: 999 }} />}
            {p.models_bearish > 0 && <div style={{ flex: p.models_bearish, background: 'var(--down)', borderRadius: 999 }} />}
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 8, fontFamily: MONO, fontSize: 11 }}>
            <span style={{ color: 'var(--up)' }}>▲ {p.models_bullish} alcistas</span>
            {p.models_neutral > 0 && <span style={{ color: 'var(--text-hint)' }}>— {p.models_neutral} neutros</span>}
            <span style={{ color: 'var(--down)' }}>▼ {p.models_bearish} bajistas</span>
          </div>
        </div>

        {/* Contradiction explanation */}
        <VoteVsPctExplanation bull={p.models_bullish} bear={p.models_bearish} predPct={predPct} />

        {/* Band chart */}
        {bands.length > 0 && <BandChart bands={bands} />}

        {/* Model breakdown */}
        {loading && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)', textAlign: 'center', padding: 24 }}>
            Cargando modelos…
          </div>
        )}
        {err && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--down)', padding: 12 }}>
            Error al cargar modelos: {err}
          </div>
        )}
        {models && <ModelTable models={models} />}
        {!loading && !models && !p.model_prediction_ids?.length && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>
            Sin datos de modelos individuales para esta predicción.
          </div>
        )}
      </div>
    </div>
  )
}
