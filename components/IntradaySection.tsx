'use client'
import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

function createSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

const supabase = createSupabase()

interface IntraConsensus {
  id: string
  asset_id: string
  direction: string
  confidence: number
  agreement_pct: number
  horizon_minutes: number
  target_time: string
  price_at_creation: number
  final_pct_predicted: number
  models_bullish: number
  models_bearish: number
  models_neutral: number
  models_total: number
  status: string
  actual_pct: number | null
  direction_correct: boolean | null
  closed_at: string | null
  created_at: string
  assets: { ticker: string; name: string; asset_class: string; currency: string } | null
}

function isMarketOpen(): boolean {
  const now = new Date()
  const utcH = now.getUTCHours(), utcM = now.getUTCMinutes()
  const mins = utcH * 60 + utcM
  const day = now.getUTCDay()
  if (day === 0 || day === 6) return false
  return mins >= 810 && mins < 1200 // 13:30–20:00 UTC
}

function useCountdown(targetIso: string): string {
  const [label, setLabel] = useState('')
  useEffect(() => {
    const tick = () => {
      const diff = new Date(targetIso).getTime() - Date.now()
      if (diff <= 0) { setLabel('cerrando...'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setLabel(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetIso])
  return label
}

function DirBadge({ direction, correct }: { direction: string; correct?: boolean | null }) {
  const color = direction === 'up'
    ? (correct == null ? '#22c55e' : correct ? '#22c55e' : '#ef4444')
    : direction === 'down'
    ? (correct == null ? '#ef4444' : correct ? '#ef4444' : '#f97316')
    : '#a3a3a3'
  const label = direction === 'up' ? '↑ Sube' : direction === 'down' ? '↓ Baja' : '— Neutral'
  return (
    <span style={{
      display: 'inline-block', color, fontWeight: 700, fontSize: 13,
      background: `${color}18`, borderRadius: 4, padding: '2px 8px',
    }}>
      {label}
      {correct === true && ' ✓'}
      {correct === false && ' ✗'}
    </span>
  )
}

function CountdownBadge({ targetIso }: { targetIso: string }) {
  const label = useCountdown(targetIso)
  return (
    <span style={{ fontSize: 12, color: 'var(--text-hint)', fontFamily: 'var(--font-mono)' }}>
      ⏱ {label}
    </span>
  )
}

function PredCard({ pred }: { pred: IntraConsensus }) {
  const ticker = pred.assets?.ticker ?? '?'
  const name = pred.assets?.name ?? ticker
  const conf = Math.round(pred.confidence * 100)
  const agr = Math.round(pred.agreement_pct * 100)
  const pct = pred.final_pct_predicted?.toFixed(2) ?? '—'
  const closed = pred.status === 'closed'

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '14px 16px',
      display: 'grid', gridTemplateColumns: '1fr auto',
      gap: 8, opacity: closed ? 0.85 : 1,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{ticker}</span>
          <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{name}</span>
          <span style={{
            fontSize: 11, background: 'var(--border)', borderRadius: 4, padding: '1px 6px',
            color: 'var(--text-muted)', fontFamily: 'var(--font-mono)'
          }}>
            {pred.horizon_minutes}min
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <DirBadge direction={pred.direction} correct={pred.direction_correct} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Conf. <strong>{conf}%</strong>
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Acuerdo <strong>{agr}%</strong>
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Pred. <strong>{pred.direction === 'up' ? '+' : ''}{pct}%</strong>
          </span>
          {pred.direction_correct != null && pred.actual_pct != null && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Real <strong style={{ color: pred.actual_pct > 0 ? '#22c55e' : '#ef4444' }}>
                {pred.actual_pct > 0 ? '+' : ''}{pred.actual_pct.toFixed(2)}%
              </strong>
            </span>
          )}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-hint)' }}>
          <span>↑{pred.models_bullish} ↓{pred.models_bearish} —{pred.models_neutral}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {!closed ? (
          <CountdownBadge targetIso={pred.target_time} />
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>cerrado</span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 4 }}>
          ${pred.price_at_creation?.toFixed(2)}
        </span>
      </div>
    </div>
  )
}

export function IntradaySectionClient() {
  const [open, setOpen] = useState<IntraConsensus[]>([])
  const [closed, setClosed] = useState<IntraConsensus[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const marketOpen = isMarketOpen()

  const load = useCallback(async () => {
    const [{ data: openData }, { data: closedData }] = await Promise.all([
      supabase
        .from('consensus_predictions_intraday')
        .select('*, assets(ticker, name, asset_class, currency)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('consensus_predictions_intraday')
        .select('*, assets(ticker, name, asset_class, currency)')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(50),
    ])
    setOpen((openData ?? []) as IntraConsensus[])
    setClosed((closedData ?? []) as IntraConsensus[])
    setLastRefresh(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  async function triggerNow() {
    setTriggering(true)
    try {
      await supabase.functions.invoke('crear-prediccion-intraday')
      await load()
    } catch { }
    setTriggering(false)
  }

  // Group open predictions by asset
  const openByAsset: Record<string, IntraConsensus[]> = {}
  for (const p of open) {
    const key = p.assets?.ticker ?? p.asset_id
    if (!openByAsset[key]) openByAsset[key] = []
    openByAsset[key].push(p)
  }

  // Closed stats today
  const today = new Date().toISOString().slice(0, 10)
  const closedToday = closed.filter(p => (p.closed_at ?? '').startsWith(today))
  const hitsToday = closedToday.filter(p => p.direction_correct === true).length
  const accToday = closedToday.length > 0 ? Math.round(hitsToday / closedToday.length * 100) : null

  return (
    <div>
      {/* Header strip */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, marginBottom: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: marketOpen ? '#22c55e20' : '#a3a3a320',
            border: `1px solid ${marketOpen ? '#22c55e40' : '#a3a3a340'}`,
            borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: marketOpen ? '#22c55e' : '#a3a3a3',
              display: 'inline-block',
              boxShadow: marketOpen ? '0 0 6px #22c55e' : 'none',
            }} />
            {marketOpen ? 'Mercado abierto' : 'Mercado cerrado'}
          </div>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>
              {lastRefresh.toLocaleTimeString('es-AR')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {accToday != null && (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '6px 14px', fontSize: 13,
            }}>
              Hoy: <strong style={{ color: accToday >= 60 ? '#22c55e' : accToday < 40 ? '#ef4444' : 'var(--text)' }}>
                {hitsToday}/{closedToday.length} ({accToday}%)
              </strong>
            </div>
          )}
          <button
            onClick={triggerNow}
            disabled={triggering}
            style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
              color: 'var(--text)', fontSize: 13,
              opacity: triggering ? 0.6 : 1,
            }}
          >
            {triggering ? 'Ejecutando...' : '⚡ Forzar ciclo'}
          </button>
        </div>
      </div>

      {loading && (
        <p style={{ color: 'var(--text-hint)', fontSize: 14 }}>Cargando predicciones intradiarias...</p>
      )}

      {/* Open predictions */}
      {!loading && open.length === 0 && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 32, textAlign: 'center',
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            {marketOpen
              ? 'No hay predicciones activas. El sistema genera predicciones cada 15 minutos durante el horario de mercado.'
              : 'El mercado está cerrado. Las predicciones se activan automáticamente a las 9:30 ET (13:30 UTC).'}
          </p>
        </div>
      )}

      {open.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            Predicciones activas ({open.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(openByAsset).map(([ticker, preds]) => (
              <div key={ticker} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {preds.sort((a, b) => a.horizon_minutes - b.horizon_minutes).map(p => (
                  <PredCard key={p.id} pred={p} />
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Closed predictions today */}
      {closedToday.length > 0 && (
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            Cerradas hoy ({closedToday.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {closedToday.slice(0, 30).map(p => (
              <PredCard key={p.id} pred={p} />
            ))}
          </div>
        </section>
      )}

      {/* Recent history (not today) */}
      {closed.length > 0 && closed.some(p => !(p.closed_at ?? '').startsWith(today)) && (
        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)' }}>
            Historial reciente
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {closed.filter(p => !(p.closed_at ?? '').startsWith(today)).slice(0, 20).map(p => (
              <PredCard key={p.id} pred={p} />
            ))}
          </div>
        </section>
      )}

      <p style={{ marginTop: 36, fontSize: 11, color: 'var(--text-hint)', lineHeight: 1.5 }}>
        13 modelos independientes (tendencia, momentum, volatilidad, volumen, estructura, velas,
        regresión, reversión, divergencias, beta mercado, VWAP, apertura/ORB, horario) votan para horizontes de 60, 120 y 240 minutos.
        Cada predicción se audita automáticamente al vencimiento comparando contra precio real de Finnhub.
      </p>
    </div>
  )
}
