'use client'
import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function createSupabase() {
  return createBrowserClient(SUPABASE_URL, ANON_KEY)
}
const supabase = createSupabase()

async function callFn(slug: string, body: object): Promise<any> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await r.text()
    try { return JSON.parse(text) } catch { return { ok: false, error: `HTTP ${r.status}` } }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

interface Asset {
  id: string; ticker: string; name: string
  asset_class: string; is_active: boolean; intraday_active: boolean
}

interface IntraConsensus {
  id: string; asset_id: string; direction: string; confidence: number
  agreement_pct: number; horizon_minutes: number; target_time: string
  price_at_creation: number; final_pct_predicted: number
  models_bullish: number; models_bearish: number; models_neutral: number; models_total: number
  status: string; actual_pct: number | null; direction_correct: boolean | null
  closed_at: string | null; created_at: string
  assets: { ticker: string; name: string } | null
}

function isMarketOpen(): boolean {
  const now = new Date()
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
  const day = now.getUTCDay()
  if (day === 0 || day === 6) return false
  return mins >= 810 && mins < 1200
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
  const base = direction === 'up' ? '#22c55e' : direction === 'down' ? '#ef4444' : '#a3a3a3'
  const color = correct == null ? base : correct ? base : '#f97316'
  const label = direction === 'up' ? '↑ Sube' : direction === 'down' ? '↓ Baja' : '— Neutral'
  return (
    <span style={{ display: 'inline-block', color, fontWeight: 700, fontSize: 13, background: `${color}18`, borderRadius: 4, padding: '2px 8px' }}>
      {label}{correct === true && ' ✓'}{correct === false && ' ✗'}
    </span>
  )
}

function PredCard({ pred }: { pred: IntraConsensus }) {
  const ticker = pred.assets?.ticker ?? '?'
  const closed = pred.status === 'closed'
  const countdown = useCountdown(pred.target_time)
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr auto',
      gap: 8, opacity: closed ? 0.82 : 1,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{ticker}</span>
          <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{pred.assets?.name}</span>
          <span style={{ fontSize: 11, background: 'var(--border)', borderRadius: 4, padding: '1px 6px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {pred.horizon_minutes}min
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <DirBadge direction={pred.direction} correct={pred.direction_correct} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Conf. <strong>{Math.round(pred.confidence * 100)}%</strong></span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Acuerdo <strong>{Math.round(pred.agreement_pct * 100)}%</strong></span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Pred. <strong>{pred.direction === 'up' ? '+' : ''}{pred.final_pct_predicted?.toFixed(2)}%</strong>
          </span>
          {pred.actual_pct != null && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Real <strong style={{ color: pred.actual_pct > 0 ? '#22c55e' : '#ef4444' }}>
                {pred.actual_pct > 0 ? '+' : ''}{pred.actual_pct.toFixed(2)}%
              </strong>
            </span>
          )}
        </div>
        <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-hint)' }}>
          ↑{pred.models_bullish} ↓{pred.models_bearish} —{pred.models_neutral} de {pred.models_total} modelos
        </div>
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>{closed ? 'cerrado' : `⏱ ${countdown}`}</span>
        <span style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 4 }}>${pred.price_at_creation?.toFixed(2)}</span>
      </div>
    </div>
  )
}

// ── Asset selector panel ──────────────────────────────────────
function AssetSelector({ onSave }: { onSave: () => void }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`${SUPABASE_URL}/functions/v1/asset-config`, {
      headers: { 'Authorization': `Bearer ${ANON_KEY}` }
    }).then(r => r.json()).then(data => {
      setAssets((data.assets ?? []).filter((a: Asset) => a.is_active))
      setLoading(false)
    })
  }, [])

  async function toggle(asset: Asset) {
    const next = !asset.intraday_active
    setSaving(asset.id)
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, intraday_active: next } : a))
    const res = await callFn('asset-config', { action: 'toggle_intraday', asset_id: asset.id, intraday_active: next })
    if (!res?.ok) {
      setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, intraday_active: !next } : a))
    }
    setSaving(null)
    onSave()
  }

  const filtered = assets.filter(a =>
    a.ticker.toLowerCase().includes(search.toLowerCase()) ||
    a.name.toLowerCase().includes(search.toLowerCase())
  )
  const enabled = assets.filter(a => a.intraday_active)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          Assets con intradiario: <strong style={{ color: enabled.length > 0 ? '#22c55e' : 'var(--text-muted)' }}>
            {enabled.length} / {assets.length}
          </strong>
        </h3>
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '5px 10px', fontSize: 12, color: 'var(--text)', outline: 'none', width: 140,
          }}
        />
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-hint)' }}>Cargando assets...</p>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6,
          maxHeight: 320, overflowY: 'auto',
        }}>
          {filtered.map(asset => {
            const on = asset.intraday_active
            const busy = saving === asset.id
            return (
              <button
                key={asset.id}
                onClick={() => toggle(asset)}
                disabled={busy}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 8, padding: '8px 10px',
                  background: on ? '#22c55e12' : 'var(--card)',
                  border: `1px solid ${on ? '#22c55e40' : 'var(--border)'}`,
                  borderRadius: 7, cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.6 : 1, textAlign: 'left', width: '100%',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{asset.ticker}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 1, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {asset.name}
                  </div>
                </div>
                <div style={{
                  width: 28, height: 16, borderRadius: 8, flexShrink: 0,
                  background: on ? '#22c55e' : 'var(--border)',
                  position: 'relative', transition: 'background 0.2s',
                }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 2,
                    left: on ? 14 : 2, transition: 'left 0.2s',
                    boxShadow: '0 1px 3px #0004',
                  }} />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main section ──────────────────────────────────────────────
export function IntradaySectionClient() {
  const [open, setOpen] = useState<IntraConsensus[]>([])
  const [closed, setClosed] = useState<IntraConsensus[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const marketOpen = isMarketOpen()

  const load = useCallback(async () => {
    const [{ data: openData }, { data: closedData }] = await Promise.all([
      supabase
        .from('consensus_predictions_intraday')
        .select('*, assets(ticker, name)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(120),
      supabase
        .from('consensus_predictions_intraday')
        .select('*, assets(ticker, name)')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(60),
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
    await callFn('crear-prediccion-intraday', {})
    await load()
    setTriggering(false)
  }

  const today = new Date().toISOString().slice(0, 10)
  const closedToday = closed.filter(p => (p.closed_at ?? '').startsWith(today))
  const hitsToday = closedToday.filter(p => p.direction_correct === true).length
  const accToday = closedToday.length > 0 ? Math.round(hitsToday / closedToday.length * 100) : null

  const openByTicker: Record<string, IntraConsensus[]> = {}
  for (const p of open) {
    const key = p.assets?.ticker ?? p.asset_id
    if (!openByTicker[key]) openByTicker[key] = []
    openByTicker[key].push(p)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: marketOpen ? '#22c55e18' : '#a3a3a318',
            border: `1px solid ${marketOpen ? '#22c55e40' : '#a3a3a340'}`,
            borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: marketOpen ? '#22c55e' : '#a3a3a3', display: 'inline-block', boxShadow: marketOpen ? '0 0 6px #22c55e' : 'none' }} />
            {marketOpen ? 'Mercado abierto' : 'Mercado cerrado'}
          </div>
          {lastRefresh && <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{lastRefresh.toLocaleTimeString('es-AR')}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {accToday != null && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', fontSize: 13 }}>
              Hoy: <strong style={{ color: accToday >= 60 ? '#22c55e' : accToday < 40 ? '#ef4444' : 'var(--text)' }}>
                {hitsToday}/{closedToday.length} ({accToday}%)
              </strong>
            </div>
          )}
          <button onClick={() => setShowConfig(v => !v)} style={{
            background: showConfig ? 'var(--text)' : 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
            color: showConfig ? 'var(--bg)' : 'var(--text)', fontSize: 13,
          }}>
            ⚙ Assets
          </button>
          <button onClick={triggerNow} disabled={triggering} style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
            color: 'var(--text)', fontSize: 13, opacity: triggering ? 0.6 : 1,
          }}>
            {triggering ? 'Ejecutando...' : '⚡ Forzar ciclo'}
          </button>
        </div>
      </div>

      {/* Asset config panel */}
      {showConfig && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '18px 20px', marginBottom: 28,
        }}>
          <AssetSelector onSave={load} />
        </div>
      )}

      {loading && <p style={{ color: 'var(--text-hint)', fontSize: 14 }}>Cargando...</p>}

      {/* Open predictions */}
      {!loading && open.length === 0 && !showConfig && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 32, textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 10px' }}>
            {marketOpen
              ? 'No hay predicciones activas.'
              : 'El mercado está cerrado. Las predicciones se activan a las 9:30 ET (13:30 UTC).'}
          </p>
          <p style={{ color: 'var(--text-hint)', fontSize: 13, margin: 0 }}>
            Usá el botón <strong>⚙ Assets</strong> para elegir qué acciones seguir en intradiario.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Predicciones activas ({open.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {Object.values(openByTicker).flatMap(preds =>
              preds.sort((a, b) => a.horizon_minutes - b.horizon_minutes).map(p => <PredCard key={p.id} pred={p} />)
            )}
          </div>
        </section>
      )}

      {closedToday.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Cerradas hoy ({closedToday.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {closedToday.slice(0, 30).map(p => <PredCard key={p.id} pred={p} />)}
          </div>
        </section>
      )}

      {closed.some(p => !(p.closed_at ?? '').startsWith(today)) && (
        <section>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)' }}>Historial reciente</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {closed.filter(p => !(p.closed_at ?? '').startsWith(today)).slice(0, 20).map(p => <PredCard key={p.id} pred={p} />)}
          </div>
        </section>
      )}

      <p style={{ marginTop: 36, fontSize: 11, color: 'var(--text-hint)', lineHeight: 1.5 }}>
        13 modelos: tendencia, momentum, volatilidad, volumen, estructura, velas, regresión, reversión,
        divergencias, beta mercado, VWAP, apertura/ORB, horario — horizontes 60, 120 y 240 min.
        Auditoría automática al vencimiento contra precio real (Finnhub).
      </p>
    </div>
  )
}
