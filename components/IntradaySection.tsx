'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { SemaforoBadge } from './Semaforo'
import { bolsaKey, type ScorecardBolsa } from '@/lib/scorecard'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase     = createBrowserClient(SUPABASE_URL, ANON_KEY)
const PAGE_SIZE    = 25

async function callFn(slug: string, body: object): Promise<any> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await r.text()
    try { return JSON.parse(text) } catch { return { ok: false } }
  } catch { return { ok: false } }
}

interface Asset { id: string; ticker: string; name: string; is_active: boolean; intraday_active: boolean }

interface IntraConsensus {
  id: string; asset_id: string; direction: string; confidence: number
  agreement_pct: number; horizon_minutes: number; target_time: string
  price_at_creation: number; final_pct_predicted: number
  models_bullish: number; models_bearish: number; models_neutral: number; models_total: number
  status: string; actual_pct: number | null; direction_correct: boolean | null
  closed_at: string | null; created_at: string
  assets: { ticker: string; name: string; currency: string } | null
}

interface ModelPred {
  model_name: string; direction: string; direction_correct: boolean | null
  confidence: number; horizon_minutes: number; mae: number | null; created_at: string
  final_pct_predicted: number | null; price_at_creation: number | null; actual_price: number | null
  assets: { ticker: string } | null
}

interface LRParam {
  model_name: string
  horizon_minutes: number
  train_samples: number
  train_accuracy: number
  coefficients: number[]
  feature_names: string[]
  last_updated: string
  signed_r2?: number | null
  avg_actual_mag?: number | null
}

interface SessionModelStat {
  model_name: string
  horizon_minutes: number
  market_session: string
  lgbm_val_mae: number | null
  error_p75: number | null
  error_p90: number | null
  train_samples: number
}

const US_MARKET_HOLIDAYS = new Set([
  // 2026
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
  '2026-07-03','2026-09-07','2026-11-26','2026-12-25',
  // 2027
  '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31',
  '2027-07-05','2027-09-06','2027-11-25','2027-12-24',
])

function isMarketOpen(): boolean {
  const now  = new Date()
  const day  = now.getUTCDay()
  if (day === 0 || day === 6) return false
  if (US_MARKET_HOLIDAYS.has(now.toISOString().slice(0, 10))) return false
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
  return mins >= 810 && mins < 1200
}

function useCountdown(targetIso: string): string {
  const [label, setLabel] = useState('')
  useEffect(() => {
    const tick = () => {
      const diff = new Date(targetIso).getTime() - Date.now()
      if (diff <= 0) { setLabel('vencido'); return }
      const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000)
      setLabel(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`)
    }
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [targetIso])
  return label
}

function DirChip({ d, correct }: { d: string; correct?: boolean | null }) {
  const base  = d === 'up' ? '#22c55e' : d === 'down' ? '#ef4444' : '#a3a3a3'
  const color = correct === false ? '#f97316' : base
  const icon  = d === 'up' ? '↑' : d === 'down' ? '↓' : '—'
  const mark  = correct === true ? ' ✓' : correct === false ? ' ✗' : ''
  return (
    <span style={{ display:'inline-block', color, background:`${color}18`, borderRadius:4, padding:'1px 7px', fontWeight:700, fontSize:12 }}>
      {icon}{mark}
    </span>
  )
}

function CountdownCell({ iso }: { iso: string }) {
  return <span style={{ fontSize:11, color:'var(--text-hint)' }}>{useCountdown(iso)}</span>
}

// ── Shared style helpers ───────────────────────────────────────────────────────
const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background:'var(--card)', border:'1px solid var(--border)', borderRadius:10,
  padding:'18px 20px', ...extra,
})
const th: React.CSSProperties = {
  textAlign:'left', padding:'7px 10px', color:'var(--text-hint)', fontWeight:500,
  fontSize:11, letterSpacing:'0.05em', textTransform:'uppercase', whiteSpace:'nowrap',
  borderBottom:'1px solid var(--border)', position:'sticky', top:0, background:'var(--card)', zIndex:1,
}
const td = (extra: React.CSSProperties = {}): React.CSSProperties => ({ padding:'7px 10px', fontSize:12, whiteSpace:'nowrap', ...extra })
const mono: React.CSSProperties = { fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" }

// D4: roster consolidado a 4 votos reales (ver ModelsSection.tsx) — reemplaza los 13 nombres
// anteriores. Nombres viejos que sigan cerrando desde antes del cambio se muestran igual
// gracias al fallback `MODEL_LABELS[name] ?? name` en cada uso.
const MODEL_LABELS: Record<string, string> = {
  lgbm:        'LightGBM',
  ridge:       'Ridge lineal',
  sentimiento: 'Sentimiento LLM',
  reversion:   'Reversión a la media',
}
function modelLabel(name: string) { return MODEL_LABELS[name] ?? name }

function StatCard({ label, value, sub, color }: { label: string; value: string|number; sub?: string; color?: string }) {
  return (
    <div style={card()}>
      <div style={{ fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-hint)', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:700, lineHeight:1, color: color ?? 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--text-hint)', marginTop:4 }}>{sub}</div>}
    </div>
  )
}

function MiniBar({ pct, color = '#3b82f6', height = 6 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ height, background:'var(--border)', borderRadius:3, overflow:'hidden', flex:1 }}>
      <div style={{ height:'100%', width:`${Math.max(0, Math.min(100, pct * 100))}%`, background:color, borderRadius:3, transition:'width 0.3s' }} />
    </div>
  )
}

function accColor(acc: number | null) {
  if (acc == null) return 'var(--text-muted)'
  return acc >= 0.6 ? '#22c55e' : acc < 0.4 ? '#ef4444' : 'var(--text)'
}

// ── Asset selector ─────────────────────────────────────────────────────────────
function AssetSelector({ onSave }: { onSave: () => void }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`${SUPABASE_URL}/functions/v1/asset-config`, { headers: { 'Authorization': `Bearer ${ANON_KEY}` } })
      .then(r => r.json()).then(data => { setAssets((data.assets ?? []).filter((a: Asset) => a.is_active)); setLoading(false) })
  }, [])

  async function toggle(asset: Asset) {
    const next = !asset.intraday_active
    setSaving(asset.id)
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, intraday_active: next } : a))
    const res = await callFn('asset-config', { action: 'toggle_intraday', asset_id: asset.id, intraday_active: next })
    if (!res?.ok) setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, intraday_active: !next } : a))
    setSaving(null); onSave()
  }

  const filtered = assets.filter(a =>
    a.ticker.toLowerCase().includes(search.toLowerCase()) || a.name.toLowerCase().includes(search.toLowerCase())
  )
  const enabled = assets.filter(a => a.intraday_active)
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontSize:13, fontWeight:600 }}>Activos: <span style={{ color: enabled.length > 0 ? '#22c55e' : 'var(--text-muted)' }}>{enabled.length}/{assets.length}</span></span>
        <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 10px', fontSize:12, color:'var(--text)', outline:'none', width:130 }} />
      </div>
      {loading ? <p style={{ fontSize:13, color:'var(--text-hint)' }}>Cargando...</p> : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:5, maxHeight:280, overflowY:'auto' }}>
          {filtered.map(asset => {
            const on = asset.intraday_active; const busy = saving === asset.id
            return (
              <button key={asset.id} onClick={() => toggle(asset)} disabled={busy} style={{
                display:'flex', alignItems:'center', justifyContent:'space-between', gap:6, padding:'7px 10px',
                background: on ? '#22c55e12' : 'var(--card)', border:`1px solid ${on ? '#22c55e40' : 'var(--border)'}`,
                borderRadius:7, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, textAlign:'left', width:'100%',
              }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:12 }}>{asset.ticker}</div>
                  <div style={{ fontSize:10, color:'var(--text-hint)', maxWidth:90, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{asset.name}</div>
                </div>
                <div style={{ width:26, height:14, borderRadius:7, flexShrink:0, background: on ? '#22c55e' : 'var(--border)', position:'relative', transition:'background 0.2s' }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:'#fff', position:'absolute', top:2, left: on ? 14 : 2, transition:'left 0.2s', boxShadow:'0 1px 3px #0004' }} />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Filters ────────────────────────────────────────────────────────────────────
type TabView = 'open' | 'closed' | 'analysis' | 'modelos'
interface Filters { ticker: string; direction: '' | 'up' | 'down' | 'neutral'; horizon: '' | '60' | '120' | '240' }

interface ModelWeightIntraday {
  model_name: string
  weight: number
  direction_accuracy: number | null
  sample_size: number
  mae_avg: number | null
  last_updated: string
}

function FiltersBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const inp: React.CSSProperties = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:6, padding:'5px 10px', fontSize:12, color:'var(--text)', outline:'none' }
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
      <input type="text" placeholder="Ticker..." value={filters.ticker} onChange={e => onChange({ ...filters, ticker: e.target.value.toUpperCase() })} style={{ ...inp, width:90 }} />
      <select value={filters.direction} onChange={e => onChange({ ...filters, direction: e.target.value as Filters['direction'] })} style={{ ...inp, cursor:'pointer' }}>
        <option value="">Toda dirección</option>
        <option value="up">↑ Sube</option>
        <option value="down">↓ Baja</option>
        <option value="neutral">— Neutral</option>
      </select>
      <select value={filters.horizon} onChange={e => onChange({ ...filters, horizon: e.target.value as Filters['horizon'] })} style={{ ...inp, cursor:'pointer' }}>
        <option value="">Todo horizonte</option>
        <option value="60">60 min</option>
        <option value="120">120 min</option>
        <option value="240">240 min</option>
      </select>
      {(filters.ticker || filters.direction || filters.horizon) && (
        <button onClick={() => onChange({ ticker:'', direction:'', horizon:'' })} style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'5px 10px', fontSize:11, color:'var(--text-muted)', cursor:'pointer' }}>Limpiar</button>
      )}
    </div>
  )
}

// ── Predictions table ──────────────────────────────────────────────────────────
function PredTable({ preds, showStatus, scorecardBolsas = {} }: { preds: IntraConsensus[]; showStatus?: boolean; scorecardBolsas?: Record<string, ScorecardBolsa> }) {
  const hasClosed = preds.some(p => p.actual_pct != null)
  const showPrices = !showStatus
  const headers = [
    'Ticker', 'Semáforo', 'Dirección', 'Horizonte',
    showPrices ? 'Precio actual' : null,
    showPrices ? 'Target' : null,
    'Pred %', 'Real %',
    hasClosed ? 'Δ Magnitud' : null,
    'Acuerdo',
    showStatus ? 'Dir.' : 'Cierra en',
  ].filter(Boolean) as string[]
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} style={{ ...th, textAlign: (h === 'Ticker' || h === 'Semáforo' || h === 'Dirección') ? 'left' : 'center', ...(h === 'Δ Magnitud' ? { color:'#f59e0b' } : {}) }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preds.map(p => {
            const magErr = p.actual_pct != null && p.final_pct_predicted != null
              ? Math.abs(Math.abs(p.actual_pct) - Math.abs(p.final_pct_predicted))
              : null
            const magErrColor = magErr == null ? 'var(--text-hint)' : magErr <= 0.25 ? '#22c55e' : magErr <= 0.5 ? '#f59e0b' : '#ef4444'
            const targetPrice = p.price_at_creation != null && p.final_pct_predicted != null
              ? p.price_at_creation * (1 + p.final_pct_predicted / 100)
              : null
            const targetColor = p.final_pct_predicted >= 0 ? '#22c55e' : '#ef4444'
            const bolsa = p.assets
              ? scorecardBolsas[bolsaKey(p.asset_id, p.assets.currency, p.horizon_minutes, 'minutes')] ?? null
              : null
            return (
              <tr key={p.id} style={{ borderBottom:'1px solid var(--border)' }}>
                <td style={td({ fontWeight:700, ...mono })}>{p.assets?.ticker ?? '?'}</td>
                <td style={td()}><SemaforoBadge bolsa={bolsa} compact /></td>
                <td style={td()}><DirChip d={p.direction} correct={p.direction_correct} /></td>
                <td style={td({ textAlign:'center' })}><span style={{ background:'var(--border)', borderRadius:4, padding:'1px 6px', fontSize:11, ...mono }}>{p.horizon_minutes}m</span></td>
                {showPrices && (
                  <td style={td({ textAlign:'center', ...mono, color:'var(--text-muted)' })}>
                    {p.price_at_creation != null ? `$${p.price_at_creation.toFixed(2)}` : '—'}
                  </td>
                )}
                {showPrices && (
                  <td style={td({ textAlign:'center', ...mono, fontWeight:700, color: targetColor })}>
                    {targetPrice != null ? `$${targetPrice.toFixed(2)}` : '—'}
                  </td>
                )}
                <td style={td({ textAlign:'center', ...mono })}>{p.final_pct_predicted >= 0 ? '+' : ''}{p.final_pct_predicted?.toFixed(2)}%</td>
                <td style={td({ textAlign:'center', ...mono })}>
                  {p.actual_pct != null
                    ? <span style={{ color: p.actual_pct >= 0 ? '#22c55e' : '#ef4444' }}>{p.actual_pct >= 0 ? '+' : ''}{p.actual_pct.toFixed(2)}%</span>
                    : <span style={{ color:'var(--text-hint)' }}>—</span>}
                </td>
                {hasClosed && (
                  <td style={td({ textAlign:'center', fontWeight:700, color: magErrColor, ...mono })}>
                    {magErr != null ? `${magErr.toFixed(2)}%` : '—'}
                  </td>
                )}
                <td style={td({ textAlign:'center', fontSize:11, color:'var(--text-muted)' })}>↑{p.models_bullish} ↓{p.models_bearish}</td>
                {showStatus
                  ? <td style={td({ textAlign:'center' })}>
                      <span style={{ fontSize:11, color: p.direction_correct === true ? '#22c55e' : p.direction_correct === false ? '#ef4444' : 'var(--text-hint)' }}>
                        {p.direction_correct === true ? '✓' : p.direction_correct === false ? '✗' : '—'}
                      </span>
                    </td>
                  : <td style={td({ textAlign:'center' })}><CountdownCell iso={p.target_time} /></td>
                }
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize)
  if (pages <= 1) return null
  const btn = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--text)' : 'var(--card)', color: active ? 'var(--bg)' : 'var(--text-muted)',
    border:'1px solid var(--border)', borderRadius:5, padding:'4px 10px', fontSize:12, cursor: active ? 'default' : 'pointer',
  })
  const nums: number[] = []
  for (let i = Math.max(0, page - 2); i <= Math.min(pages - 1, page + 2); i++) nums.push(i)
  return (
    <div style={{ display:'flex', gap:4, alignItems:'center', justifyContent:'center', padding:'12px 0 4px' }}>
      <button disabled={page === 0} onClick={() => onChange(page - 1)} style={{ ...btn(false), opacity: page === 0 ? 0.4 : 1 }}>‹</button>
      {nums[0] > 0 && <><button onClick={() => onChange(0)} style={btn(false)}>1</button><span style={{ fontSize:11, color:'var(--text-hint)' }}>…</span></>}
      {nums.map(n => <button key={n} onClick={() => onChange(n)} style={btn(n === page)}>{n + 1}</button>)}
      {nums[nums.length-1] < pages-1 && <><span style={{ fontSize:11, color:'var(--text-hint)' }}>…</span><button onClick={() => onChange(pages-1)} style={btn(false)}>{pages}</button></>}
      <button disabled={page === pages-1} onClick={() => onChange(page+1)} style={{ ...btn(false), opacity: page===pages-1 ? 0.4 : 1 }}>›</button>
      <span style={{ fontSize:11, color:'var(--text-hint)', marginLeft:4 }}>{total} resultados</span>
    </div>
  )
}

// ── Analysis section ───────────────────────────────────────────────────────────
function pct(n: number, d: number) { return d > 0 ? n / d : null }
function fmt(v: number | null, decimals = 1) { return v == null ? '—' : `${(v * 100).toFixed(decimals)}%` }
function fmtN(v: number | null, decimals = 2) { return v == null ? '—' : v.toFixed(decimals) }
function avg(arr: number[]) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null }

function sessionLabel(createdAt: string): string {
  const d = new Date(createdAt)
  const minsFromOpen = (d.getUTCHours() * 60 + d.getUTCMinutes()) - 810
  if (minsFromOpen < 0)   return 'pre-market'
  if (minsFromOpen < 30)  return 'Apertura (0-30m)'
  if (minsFromOpen < 120) return 'Mañana (30-120m)'
  if (minsFromOpen < 240) return 'Mediodía (2-4h)'
  return 'Tarde (4h+)'
}

interface AnalysisProps { closedPreds: IntraConsensus[]; modelPreds: ModelPred[] }

function IntradayAnalysis({ closedPreds, modelPreds }: AnalysisProps) {
  const stats = useMemo(() => {
    const cp = closedPreds.filter(p => p.direction_correct != null)
    if (!cp.length) return null

    const total   = cp.length
    const correct = cp.filter(p => p.direction_correct).length
    const accuracy = correct / total

    const maes = cp.filter(p => p.actual_pct != null && p.final_pct_predicted != null)
      .map(p => Math.abs(p.actual_pct! - p.final_pct_predicted))
    const mae = avg(maes)

    // By horizon
    const byHorizon: Record<number, { n: number; c: number; confs: number[]; maes: number[]; predMags: number[]; actualMags: number[]; magMaes: number[] }> = {}
    for (const p of cp) {
      const h = p.horizon_minutes
      if (!byHorizon[h]) byHorizon[h] = { n: 0, c: 0, confs: [], maes: [], predMags: [], actualMags: [], magMaes: [] }
      byHorizon[h].n++
      if (p.direction_correct) byHorizon[h].c++
      byHorizon[h].confs.push(p.confidence)
      if (p.actual_pct != null && p.final_pct_predicted != null) {
        byHorizon[h].maes.push(Math.abs(p.actual_pct - p.final_pct_predicted))
        const predMag = Math.abs(p.final_pct_predicted)
        const actMag  = Math.abs(p.actual_pct)
        byHorizon[h].predMags.push(predMag)
        byHorizon[h].actualMags.push(actMag)
        byHorizon[h].magMaes.push(Math.abs(predMag - actMag))
      }
    }

    // Global magnitude stats
    const allPredMags   = cp.filter(p => p.final_pct_predicted != null).map(p => Math.abs(p.final_pct_predicted))
    const allActualMags = cp.filter(p => p.actual_pct != null).map(p => Math.abs(p.actual_pct!))
    const allMagMaes    = cp.filter(p => p.actual_pct != null && p.final_pct_predicted != null)
      .map(p => Math.abs(Math.abs(p.final_pct_predicted) - Math.abs(p.actual_pct!)))
    const avgPredMag   = avg(allPredMags)
    const avgActualMag = avg(allActualMags)
    const magBias      = avgPredMag != null && avgActualMag != null ? avgPredMag - avgActualMag : null
    const magMae       = avg(allMagMaes)
    const magWithin03  = allMagMaes.length > 0 ? allMagMaes.filter(e => e <= 0.3).length / allMagMaes.length : null
    const magWithin05  = allMagMaes.length > 0 ? allMagMaes.filter(e => e <= 0.5).length / allMagMaes.length : null

    // By direction
    const byDir: Record<string, { n: number; c: number }> = {}
    for (const p of cp) {
      if (!byDir[p.direction]) byDir[p.direction] = { n: 0, c: 0 }
      byDir[p.direction].n++
      if (p.direction_correct) byDir[p.direction].c++
    }

    // By agreement bucket
    const byAgree: { label: string; min: number; max: number; n: number; c: number }[] = [
      { label: '<50%', min: 0, max: 0.5, n: 0, c: 0 },
      { label: '50-65%', min: 0.5, max: 0.65, n: 0, c: 0 },
      { label: '65-80%', min: 0.65, max: 0.8, n: 0, c: 0 },
      { label: '>80%', min: 0.8, max: 1, n: 0, c: 0 },
    ]
    for (const p of cp) {
      const b = byAgree.find(b => p.agreement_pct >= b.min && p.agreement_pct < b.max) ?? byAgree[3]
      b.n++; if (p.direction_correct) b.c++
    }

    // Confidence calibration
    const confBuckets: { label: string; min: number; max: number; n: number; c: number; avgConf: number[] }[] = [
      { label: '<40%', min: 0, max: 0.4, n: 0, c: 0, avgConf: [] },
      { label: '40-50%', min: 0.4, max: 0.5, n: 0, c: 0, avgConf: [] },
      { label: '50-60%', min: 0.5, max: 0.6, n: 0, c: 0, avgConf: [] },
      { label: '60-70%', min: 0.6, max: 0.7, n: 0, c: 0, avgConf: [] },
      { label: '>70%', min: 0.7, max: 1, n: 0, c: 0, avgConf: [] },
    ]
    for (const p of cp) {
      const b = confBuckets.find(b => p.confidence >= b.min && p.confidence < b.max) ?? confBuckets[4]
      b.n++; if (p.direction_correct) b.c++; b.avgConf.push(p.confidence)
    }

    // By session
    const bySession: Record<string, { n: number; c: number }> = {}
    for (const p of cp) {
      const s = sessionLabel(p.created_at)
      if (!bySession[s]) bySession[s] = { n: 0, c: 0 }
      bySession[s].n++; if (p.direction_correct) bySession[s].c++
    }

    // By ticker
    const byTicker: Record<string, { n: number; c: number; name: string }> = {}
    for (const p of cp) {
      const t = p.assets?.ticker ?? '?'
      if (!byTicker[t]) byTicker[t] = { n: 0, c: 0, name: p.assets?.name ?? '' }
      byTicker[t].n++; if (p.direction_correct) byTicker[t].c++
    }

    // Daily trend (last 14 days)
    const byDay: Record<string, { n: number; c: number }> = {}
    for (const p of cp) {
      if (!p.closed_at) continue
      const day = p.closed_at.slice(0, 10)
      if (!byDay[day]) byDay[day] = { n: 0, c: 0 }
      byDay[day].n++; if (p.direction_correct) byDay[day].c++
    }
    const dailyTrend = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)

    // Model ranking
    const byModel: Record<string, { n: number; c: number; up_n: number; up_c: number; down_n: number; down_c: number; maes: number[]; predMags: number[]; actualMags: number[] }> = {}
    for (const p of modelPreds) {
      if (p.direction_correct == null) continue
      if (!byModel[p.model_name]) byModel[p.model_name] = { n: 0, c: 0, up_n: 0, up_c: 0, down_n: 0, down_c: 0, maes: [], predMags: [], actualMags: [] }
      const m = byModel[p.model_name]
      m.n++; if (p.direction_correct) m.c++
      if (p.direction === 'up') { m.up_n++; if (p.direction_correct) m.up_c++ }
      else if (p.direction === 'down') { m.down_n++; if (p.direction_correct) m.down_c++ }
      if (p.mae != null) m.maes.push(Number(p.mae))
      if (p.final_pct_predicted != null) m.predMags.push(Math.abs(Number(p.final_pct_predicted)))
      if (p.actual_price != null && p.price_at_creation != null && p.price_at_creation !== 0) {
        const actualPct = (Number(p.actual_price) / Number(p.price_at_creation) - 1) * 100
        m.actualMags.push(Math.abs(actualPct))
      }
    }

    return { total, correct, accuracy, mae, byHorizon, byDir, byAgree, confBuckets, bySession, byTicker, dailyTrend, byModel, avgPredMag, avgActualMag, magBias, magMae, magWithin03, magWithin05 }
  }, [closedPreds, modelPreds])

  if (!stats || closedPreds.length === 0) {
    return (
      <div style={card({ textAlign:'center', padding:'60px 24px' })}>
        <p style={{ color:'var(--text-muted)', margin:0 }}>No hay predicciones cerradas aún para analizar.</p>
        <p style={{ color:'var(--text-hint)', fontSize:12, marginTop:8 }}>Los datos aparecerán automáticamente a medida que las predicciones venzan durante el horario de mercado.</p>
      </div>
    )
  }

  const { total, correct, accuracy, mae, byHorizon, byDir, byAgree, confBuckets, bySession, byTicker, dailyTrend, byModel, avgPredMag, avgActualMag, magBias, magMae, magWithin03, magWithin05 } = stats

  const horizons = [60, 120, 240]
  const sessionOrder = ['Apertura (0-30m)', 'Mañana (30-120m)', 'Mediodía (2-4h)', 'Tarde (4h+)']
  const sortedTickers = Object.entries(byTicker).sort((a, b) => b[1].n - a[1].n)
  // Sort by MAE ascending (menor error = mejor), fallback a dirección si no hay MAE
  const sortedModels = Object.entries(byModel).sort((a, b) => {
    const maeA = avg(a[1].maes); const maeB = avg(b[1].maes)
    if (maeA != null && maeB != null) return maeA - maeB
    if (maeA != null) return -1; if (maeB != null) return 1
    return 0
  })

  function magMaeColor(v: number | null) {
    if (v == null) return 'var(--text-muted)'
    if (v <= 0.25) return '#22c55e'
    if (v <= 0.50) return '#f59e0b'
    return '#ef4444'
  }

  const magBiasLabel = magBias == null ? '—'
    : magBias > 0.05 ? `+${magBias.toFixed(2)}% sobreestimamos`
    : magBias < -0.05 ? `${magBias.toFixed(2)}% subestimamos`
    : 'Sin sesgo'
  const magBiasColor = magBias == null ? 'var(--text-muted)'
    : Math.abs(magBias) <= 0.05 ? '#22c55e'
    : Math.abs(magBias) <= 0.20 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

      {/* ── ERROR DE MAGNITUD — métrica principal ── */}
      <div>
        <h3 style={{ fontSize:14, fontWeight:700, margin:'0 0 14px', color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
          Error de magnitud
          <span style={{ marginLeft:10, fontSize:11, fontWeight:400, color:'var(--text-hint)', textTransform:'none', letterSpacing:0 }}>
            cuánto erramos en el % predicho, independiente de dirección
          </span>
        </h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px,1fr))', gap:12, marginBottom:12 }}>
          <StatCard label="Error magnitud (MAE)" value={magMae != null ? `${magMae.toFixed(2)}%` : '—'} sub="||pred| − |real||" color={magMaeColor(magMae)} />
          <StatCard label="Pred. media" value={avgPredMag != null ? `${avgPredMag.toFixed(2)}%` : '—'} sub="lo que predijimos" />
          <StatCard label="Real media" value={avgActualMag != null ? `${avgActualMag.toFixed(2)}%` : '—'} sub="lo que ocurrió" />
          <StatCard label="Sesgo sistemático" value={magBiasLabel} color={magBiasColor} />
          <StatCard label="Dentro de ±0.3%" value={magWithin03 != null ? `${(magWithin03 * 100).toFixed(0)}%` : '—'} sub="predicciones precisas" color={magWithin03 != null && magWithin03 >= 0.5 ? '#22c55e' : 'var(--text)'} />
          <StatCard label="Dentro de ±0.5%" value={magWithin05 != null ? `${(magWithin05 * 100).toFixed(0)}%` : '—'} sub="predicciones aceptables" />
        </div>
      </div>

      {/* ── Dirección — métrica secundaria ── */}
      <div>
        <h3 style={{ fontSize:13, fontWeight:600, margin:'0 0 12px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
          Dirección
          <span style={{ marginLeft:10, fontSize:11, fontWeight:400, color:'var(--text-hint)', textTransform:'none', letterSpacing:0 }}>métrica básica</span>
        </h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px,1fr))', gap:10 }}>
          <StatCard label="Cerradas" value={total} />
          <StatCard label="Precisión" value={fmt(accuracy)} color={accColor(accuracy)} />
          <StatCard label="Correctas" value={correct} color="#22c55e" />
        </div>
      </div>

      {/* ── Por horizonte ── */}
      <div>
        <h3 style={{ fontSize:14, fontWeight:600, margin:'0 0 14px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Por horizonte</h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          {horizons.map(h => {
            const d = byHorizon[h]
            const acc = pct(d?.c ?? 0, d?.n ?? 0)
            const hMagMae   = avg(d?.magMaes ?? [])
            const hPredMag  = avg(d?.predMags ?? [])
            const hActMag   = avg(d?.actualMags ?? [])
            const hBias     = hPredMag != null && hActMag != null ? hPredMag - hActMag : null
            return (
              <div key={h} style={card()}>
                <div style={{ fontSize:11, color:'var(--text-hint)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.08em' }}>{h} minutos · {d?.n ?? 0} pred.</div>

                {/* Error de magnitud — principal */}
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:11, color:'var(--text-hint)', marginBottom:3 }}>Error de magnitud</div>
                  <div style={{ fontSize:22, fontWeight:700, color: magMaeColor(hMagMae), lineHeight:1 }}>
                    {hMagMae != null ? `${hMagMae.toFixed(2)}%` : '—'}
                  </div>
                  {hPredMag != null && hActMag != null && (
                    <div style={{ display:'flex', gap:10, marginTop:5, fontSize:11, color:'var(--text-hint)' }}>
                      <span>pred <b style={{ color:'var(--text)' }}>{hPredMag.toFixed(2)}%</b></span>
                      <span>real <b style={{ color: hActMag >= hPredMag * 0.85 ? '#22c55e' : '#f59e0b' }}>{hActMag.toFixed(2)}%</b></span>
                      {hBias != null && <span style={{ color: Math.abs(hBias) <= 0.1 ? '#22c55e' : '#f59e0b' }}>
                        sesgo {hBias > 0 ? '+' : ''}{hBias.toFixed(2)}%
                      </span>}
                    </div>
                  )}
                </div>

                {/* Dirección — secundario */}
                <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, marginTop:4 }}>
                  <div style={{ fontSize:11, color:'var(--text-hint)', marginBottom:3 }}>Dirección</div>
                  <MiniBar pct={acc ?? 0} color={acc != null && acc >= 0.6 ? '#22c55e' : acc != null && acc < 0.4 ? '#ef4444' : '#f59e0b'} />
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, fontSize:11, color:'var(--text-hint)' }}>
                    <span style={{ fontWeight:600, color: accColor(acc) }}>{fmt(acc)}</span>
                    <span>{d?.c ?? 0}/{d?.n ?? 0} correctas</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Dirección + Acuerdo ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div style={card()}>
          <h3 style={{ fontSize:13, fontWeight:600, margin:'0 0 14px' }}>Precisión por dirección</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {Object.entries(byDir).sort((a, b) => b[1].n - a[1].n).map(([dir, d]) => {
              const a = pct(d.c, d.n)
              return (
                <div key={dir}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12 }}>
                    <span>{dir === 'up' ? '↑ Sube' : dir === 'down' ? '↓ Baja' : '— Neutral'} <span style={{ color:'var(--text-hint)', fontSize:11 }}>({d.n})</span></span>
                    <span style={{ fontWeight:700, color: accColor(a) }}>{fmt(a)}</span>
                  </div>
                  <MiniBar pct={a ?? 0} color={a != null && a >= 0.6 ? '#22c55e' : a != null && a < 0.4 ? '#ef4444' : '#f59e0b'} />
                </div>
              )
            })}
          </div>
        </div>

        <div style={card()}>
          <h3 style={{ fontSize:13, fontWeight:600, margin:'0 0 14px' }}>Precisión por acuerdo de modelos</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {byAgree.filter(b => b.n > 0).map(b => {
              const a = pct(b.c, b.n)
              return (
                <div key={b.label}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12 }}>
                    <span>Acuerdo {b.label} <span style={{ color:'var(--text-hint)', fontSize:11 }}>({b.n})</span></span>
                    <span style={{ fontWeight:700, color: accColor(a) }}>{fmt(a)}</span>
                  </div>
                  <MiniBar pct={a ?? 0} color={a != null && a >= 0.6 ? '#22c55e' : a != null && a < 0.4 ? '#ef4444' : '#f59e0b'} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Calibración de confianza ── */}
      <div style={card()}>
        <h3 style={{ fontSize:13, fontWeight:600, margin:'0 0 4px' }}>Calibración de confianza</h3>
        <p style={{ fontSize:12, color:'var(--text-hint)', margin:'0 0 16px' }}>¿La confianza declarada predice la precisión real?</p>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr>
                {['Bucket','Predicciones','Conf. media','Precisión real','Calibración'].map(h => (
                  <th key={h} style={{ ...th, textAlign: h === 'Bucket' ? 'left' : 'center' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {confBuckets.filter(b => b.n > 0).map(b => {
                const realAcc  = pct(b.c, b.n)
                const avgConf  = avg(b.avgConf)
                const diff     = realAcc != null && avgConf != null ? realAcc - avgConf : null
                const calibTag = diff == null ? '—' : Math.abs(diff) < 0.05 ? '✓ Bien calibrado' : diff > 0 ? '↑ Sub-confiado' : '↓ Over-confiado'
                const calibCol = diff == null ? 'var(--text-hint)' : Math.abs(diff) < 0.05 ? '#22c55e' : '#f59e0b'
                return (
                  <tr key={b.label} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={td()}>{b.label}</td>
                    <td style={td({ textAlign:'center' })}>{b.n}</td>
                    <td style={td({ textAlign:'center' })}>{fmt(avgConf)}</td>
                    <td style={td({ textAlign:'center', fontWeight:600, color: accColor(realAcc) })}>{fmt(realAcc)}</td>
                    <td style={td({ textAlign:'center', color: calibCol, fontSize:11 })}>{calibTag}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Por sesión ── */}
      <div style={card()}>
        <h3 style={{ fontSize:13, fontWeight:600, margin:'0 0 14px' }}>Precisión por sesión de mercado</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {sessionOrder.filter(s => bySession[s]).map(s => {
            const d = bySession[s]; const a = pct(d.c, d.n)
            return (
              <div key={s}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12 }}>
                  <span>{s} <span style={{ fontSize:11, color:'var(--text-hint)' }}>({d.n} pred.)</span></span>
                  <span style={{ fontWeight:700, color: accColor(a) }}>{fmt(a)}</span>
                </div>
                <MiniBar pct={a ?? 0} color={a != null && a >= 0.6 ? '#22c55e' : a != null && a < 0.4 ? '#ef4444' : '#f59e0b'} />
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Tendencia diaria ── */}
      {dailyTrend.length >= 2 && (
        <div style={card()}>
          <h3 style={{ fontSize:13, fontWeight:600, margin:'0 0 14px' }}>Tendencia por día (últimos {dailyTrend.length} días)</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
            {dailyTrend.map(([day, d]) => {
              const a = pct(d.c, d.n)
              return (
                <div key={day} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:11, color:'var(--text-hint)', ...mono, minWidth:80 }}>{day}</span>
                  <MiniBar pct={a ?? 0} color={a != null && a >= 0.6 ? '#22c55e' : a != null && a < 0.4 ? '#ef4444' : '#f59e0b'} height={8} />
                  <span style={{ fontSize:12, fontWeight:600, color: accColor(a), minWidth:40, textAlign:'right' }}>{fmt(a, 0)}</span>
                  <span style={{ fontSize:11, color:'var(--text-hint)' }}>{d.c}/{d.n}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Por ticker ── */}
      <div style={card({ padding:0, overflow:'hidden' })}>
        <div style={{ padding:'16px 20px 14px' }}>
          <h3 style={{ fontSize:13, fontWeight:600, margin:0 }}>Precisión por activo</h3>
        </div>
        <div style={{ overflowX:'auto', maxHeight:380, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr>
                {['Ticker','Nombre','Predicciones','Correctas','Precisión','Barra'].map(h => (
                  <th key={h} style={{ ...th, textAlign: ['Predicciones','Correctas','Precisión'].includes(h) ? 'center' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTickers.map(([ticker, d]) => {
                const a = pct(d.c, d.n)
                return (
                  <tr key={ticker} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={td({ fontWeight:700, ...mono })}>{ticker}</td>
                    <td style={td({ color:'var(--text-muted)', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis' })}>{d.name}</td>
                    <td style={td({ textAlign:'center' })}>{d.n}</td>
                    <td style={td({ textAlign:'center' })}>{d.c}</td>
                    <td style={td({ textAlign:'center', fontWeight:700, color: accColor(a) })}>{fmt(a)}</td>
                    <td style={td({ minWidth:100 })}><MiniBar pct={a ?? 0} color={a != null && a >= 0.6 ? '#22c55e' : a != null && a < 0.4 ? '#ef4444' : '#f59e0b'} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Ranking de modelos individuales ── ordenado por MAE */}
      {sortedModels.length > 0 && (
        <div style={card({ padding:0, overflow:'hidden' })}>
          <div style={{ padding:'16px 20px 14px' }}>
            <h3 style={{ fontSize:13, fontWeight:600, margin:0 }}>Ranking de modelos — por error de magnitud</h3>
            <p style={{ fontSize:11, color:'var(--text-hint)', margin:'4px 0 0' }}>Ordenado por MAE ascendente (menor error de magnitud = mejor). Dirección es info secundaria.</p>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr>
                  {['#','Modelo','Preds','MAE magnitud','Pred media','Real media','Sesgo','Precisión dir.'].map(h => (
                    <th key={h} style={{ ...th, textAlign: h === 'Modelo' || h === '#' ? 'left' : 'center' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedModels.map(([model, d], i) => {
                  const a        = pct(d.c, d.n)
                  const maeA     = avg(d.maes)
                  const predMag  = avg(d.predMags)
                  const actMag   = avg(d.actualMags)
                  const sesgo    = predMag != null && actMag != null ? predMag - actMag : null
                  const sesgoCol = sesgo == null ? 'var(--text-hint)' : Math.abs(sesgo) <= 0.1 ? '#22c55e' : Math.abs(sesgo) <= 0.3 ? '#f59e0b' : '#ef4444'
                  return (
                    <tr key={model} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={td({ color:'var(--text-hint)', fontWeight:600 })}>{i + 1}</td>
                      <td style={td({ fontWeight:600, ...mono })}>{modelLabel(model)}</td>
                      <td style={td({ textAlign:'center', color:'var(--text-muted)' })}>{d.n}</td>
                      <td style={td({ textAlign:'center', fontWeight:700, color: magMaeColor(maeA) })}>{maeA != null ? `${maeA.toFixed(2)}%` : '—'}</td>
                      <td style={td({ textAlign:'center', ...mono, color:'var(--text-muted)' })}>{predMag != null ? `${predMag.toFixed(2)}%` : '—'}</td>
                      <td style={td({ textAlign:'center', ...mono, color:'var(--text-muted)' })}>{actMag != null ? `${actMag.toFixed(2)}%` : '—'}</td>
                      <td style={td({ textAlign:'center', ...mono, fontWeight:600, color: sesgoCol })}>{sesgo != null ? `${sesgo > 0 ? '+' : ''}${sesgo.toFixed(2)}%` : '—'}</td>
                      <td style={td({ textAlign:'center', color: accColor(a) })}>{fmt(a)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'8px 20px 12px', borderTop:'1px solid var(--border)', fontSize:11, color:'var(--text-hint)' }}>
            MAE magnitud = error promedio en <b>cuánto</b> nos equivocamos (independiente de si acertamos la dirección).
            Verde ≤0.25% · Amarillo ≤0.50% · Rojo &gt;0.50%
          </div>
        </div>
      )}
    </div>
  )
}

// ── Session Error Percentiles Panel ────────────────────────────────────────────
function SessionErrorPanel({ stats }: { stats: SessionModelStat[] }) {
  const horizons = [...new Set(stats.map(s => s.horizon_minutes))].sort((a, b) => a - b)

  // Para cada horizonte, promedio de p75/p90 entre sesiones (pre/post/intra)
  const byHorizon = horizons.map(h => {
    const rows = stats.filter(s => s.horizon_minutes === h && s.error_p75 != null && s.error_p90 != null)
    if (!rows.length) return null
    const p75 = rows.reduce((s, r) => s + r.error_p75!, 0) / rows.length
    const p90 = rows.reduce((s, r) => s + r.error_p90!, 0) / rows.length
    const mae = rows.reduce((s, r) => s + (r.lgbm_val_mae ?? 0), 0) / rows.length
    return { h, p75, p90, mae }
  }).filter(Boolean) as { h: number; p75: number; p90: number; mae: number }[]

  if (!byHorizon.length) return null

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Margen de error real del modelo</div>
      <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 14, lineHeight: 1.5 }}>
        El error promedio (MAE) es un promedio — no garantiza que cada predicción esté dentro de ese margen.
        Estos son los rangos reales medidos en datos de validación:
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${byHorizon.length}, 1fr)`, gap: 12 }}>
        {byHorizon.map(({ h, p75, p90, mae }) => (
          <div key={h} style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 10px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 8, textAlign: 'center' }}>{h} min</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 700, color: '#22c55e', textAlign: 'center', marginBottom: 2 }}>
              ±{mae.toFixed(2)}%
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-hint)', textAlign: 'center', marginBottom: 10 }}>error promedio</div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 9, color: 'var(--text-hint)', lineHeight: 1.8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>3 de 4 veces</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#84cc16', fontWeight: 600 }}>≤ ±{p75.toFixed(2)}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>9 de 10 veces</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#f59e0b', fontWeight: 600 }}>≤ ±{p90.toFixed(2)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 12, lineHeight: 1.6 }}>
        ⚠️ <strong>Lo que esto significa:</strong> Si el modelo predice +0.5% en 60 minutos, hay 1 de cada 4 chances de que el error real sea mayor a ±{byHorizon.find(b => b.h === 60)?.p75?.toFixed(2) ?? '?'}%. La predicción es una estimación, no una garantía.
      </div>
    </div>
  )
}

// ── LR Results Panel ───────────────────────────────────────────────────────────
function LRResultsPanel({ params }: { params: LRParam[] }) {
  const models   = [...new Set(params.map(p => p.model_name))].sort()
  const horizons = [60, 120, 240]

  const grid = new Map<string, Map<number, LRParam>>()
  for (const p of params) {
    if (!grid.has(p.model_name)) grid.set(p.model_name, new Map())
    grid.get(p.model_name)!.set(p.horizon_minutes, p)
  }

  function r2Bg(r2: number | null) {
    if (r2 == null) return 'transparent'
    if (r2 >= 0.40) return '#15803d28'
    if (r2 >= 0.20) return '#f59e0b14'
    return '#ef444414'
  }
  function r2Col(r2: number | null) {
    if (r2 == null) return 'var(--text-hint)'
    if (r2 >= 0.40) return '#22c55e'
    if (r2 >= 0.20) return '#f59e0b'
    return '#ef4444'
  }
  function cellBg(acc: number | null) {
    if (acc == null) return 'transparent'
    if (acc >= 0.65) return '#15803d28'
    if (acc >= 0.55) return '#22c55e14'
    if (acc >= 0.50) return '#f59e0b14'
    return '#ef444414'
  }
  function cellCol(acc: number | null) {
    if (acc == null) return 'var(--text-hint)'
    if (acc >= 0.60) return '#22c55e'
    if (acc >= 0.50) return '#f59e0b'
    return '#ef4444'
  }

  // Feature importance: average |coeff| across all model×horizon combos
  const featureWeights = new Map<string, number[]>()
  for (const p of params) {
    if (!p.feature_names || !p.coefficients) continue
    p.feature_names.forEach((fn, i) => {
      if (!featureWeights.has(fn)) featureWeights.set(fn, [])
      featureWeights.get(fn)!.push(Math.abs(p.coefficients[i] ?? 0))
    })
  }
  const avgFeatures = [...featureWeights.entries()]
    .map(([name, vals]) => ({ name, avg: vals.reduce((s, v) => s + v, 0) / vals.length }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 12)
  const maxAvg = avgFeatures[0]?.avg ?? 1

  const lastTrained = params.length > 0
    ? new Date(Math.max(...params.map(p => new Date(p.last_updated).getTime()))).toLocaleString('es-AR')
    : null

  if (params.length === 0) return null

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Accuracy heatmap grid */}
      <div style={card({ padding:0, overflow:'hidden' })}>
        <div style={{ padding:'14px 20px 12px', display:'flex', justifyContent:'space-between', alignItems:'baseline', flexWrap:'wrap', gap:8 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600 }}>Calidad del modelo firmado (signed R²) · {params.length} combinaciones</div>
            <div style={{ fontSize:11, color:'var(--text-hint)', marginTop:2 }}>R² = cuánta varianza del movimiento real explica el modelo · mayor = mejor predicción de magnitud</div>
            {lastTrained && <div style={{ fontSize:11, color:'var(--text-hint)', marginTop:3 }}>Último entrenamiento: {lastTrained}</div>}
          </div>
          <div style={{ display:'flex', gap:10, fontSize:11, color:'var(--text-hint)' }}>
            <span style={{ color:'#22c55e' }}>■ R²≥0.40</span>
            <span style={{ color:'#f59e0b' }}>■ R²≥0.20</span>
            <span style={{ color:'#ef4444' }}>■ R²&lt;0.20</span>
            <span>□ sin datos</span>
          </div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign:'left', minWidth:160 }}>Modelo</th>
                {horizons.map(h => (
                  <th key={h} style={{ ...th, textAlign:'center', minWidth:140 }}>{h} min</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map(model => (
                <tr key={model} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={td({ fontWeight:600, fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)", fontSize:11 })}>{modelLabel(model)}</td>
                  {horizons.map(h => {
                    const p = grid.get(model)?.get(h)
                    const r2  = p?.signed_r2 ?? null
                    const acc = p?.train_accuracy ?? null
                    const mag = p?.avg_actual_mag ?? null
                    return (
                      <td key={h} style={{ ...td({ textAlign:'center' }), background: r2 != null ? r2Bg(r2) : cellBg(acc) }}>
                        {p ? (
                          <div style={{ display:'flex', flexDirection:'column', gap:2, alignItems:'center' }}>
                            {r2 != null ? (
                              <span style={{ fontWeight:700, color: r2Col(r2), fontSize:13 }}>
                                R²={r2.toFixed(2)}
                              </span>
                            ) : (
                              <span style={{ fontWeight:700, color: cellCol(acc) }}>
                                {(acc! * 100).toFixed(1)}%
                              </span>
                            )}
                            {mag != null && (
                              <span style={{ fontSize:10, color:'var(--text-muted)' }}>
                                mov real {mag.toFixed(2)}%
                              </span>
                            )}
                            <span style={{ fontSize:10, color:'var(--text-hint)' }}>
                              dir {acc != null ? `${(acc * 100).toFixed(0)}%` : '—'} · {p.train_samples}n
                            </span>
                          </div>
                        ) : <span style={{ color:'var(--text-hint)' }}>—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'10px 20px 12px', borderTop:'1px solid var(--border)', fontSize:11, color:'var(--text-hint)' }}>
          <b>R²</b> = el modelo firmado explica R²×100% de la varianza del movimiento real.
          Verde ≥0.40 · Amarillo ≥0.20 · Rojo &lt;0.20.
          <b style={{ marginLeft:8 }}>mov real</b> = movimiento medio histórico para ese horizonte (referencia de magnitud).
          <b style={{ marginLeft:8 }}>dir %</b> = precisión de dirección (métrica secundaria).
        </div>
      </div>

      {/* Feature importance chart */}
      {avgFeatures.length > 0 && (
        <div style={card()}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Importancia de indicadores</div>
          <div style={{ fontSize:11, color:'var(--text-hint)', marginBottom:14 }}>
            Coeficiente absoluto promedio de cada feature a través de todos los modelos×horizontes entrenados.
            Un valor alto significa que ese indicador tiene mayor peso en la predicción de confiabilidad.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
            {avgFeatures.map(({ name, avg }) => {
              const pctW = avg / maxAvg
              const isScore = name.startsWith('score_')
              const label = name.replace('score_', '').replace(/_/g, ' ')
              return (
                <div key={name} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:11, width:200, flexShrink:0, color:'var(--text-muted)', textAlign:'right', fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" }}>
                    {label}
                    {isScore && <span style={{ color:'var(--text-hint)', marginLeft:4 }}>(score)</span>}
                  </span>
                  <div style={{ flex:1, background:'var(--border)', borderRadius:4, height:14, overflow:'hidden', position:'relative' }}>
                    <div style={{
                      position:'absolute', left:0, top:0, bottom:0,
                      width:`${pctW * 100}%`,
                      background: isScore ? '#6366f1' : '#0ea5e9',
                      borderRadius:4,
                    }} />
                  </div>
                  <span style={{ fontSize:11, width:50, flexShrink:0, color:'var(--text-hint)', fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" }}>
                    {avg.toFixed(3)}
                  </span>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop:12, fontSize:11, color:'var(--text-hint)', display:'flex', gap:16 }}>
            <span><span style={{ color:'#6366f1' }}>■</span> Scores técnicos</span>
            <span><span style={{ color:'#0ea5e9' }}>■</span> Indicadores directos</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main section ───────────────────────────────────────────────────────────────
export function IntradaySectionClient({ scorecardBolsas = {} }: { scorecardBolsas?: Record<string, ScorecardBolsa> }) {
  const [open, setOpen]           = useState<IntraConsensus[]>([])
  const [closed, setClosed]       = useState<IntraConsensus[]>([])
  const [modelPreds, setModelPreds] = useState<ModelPred[]>([])
  const [modelWeights, setModelWeights] = useState<ModelWeightIntraday[]>([])
  const [loading, setLoading]     = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [showConfig, setShowConfig]   = useState(false)
  const [tab, setTab]             = useState<TabView>('open')
  const [filters, setFilters]     = useState<Filters>({ ticker:'', direction:'', horizon:'' })
  const [page, setPage]           = useState(0)
  const [analysisPeriod, setAnalysisPeriod] = useState<'today' | '3d' | '7d' | '14d' | 'all'>('7d')
  const [trainLRStatus, setTrainLRStatus]   = useState<'idle' | 'training' | 'done' | 'error'>('idle')
  const [trainLRMsg, setTrainLRMsg]         = useState('')
  const [lrProgress, setLRProgress]         = useState<{ done: number; total: number; phase: string; eta: number | null }>({ done: 0, total: 0, phase: '', eta: null })
  const [lrParams, setLRParams]             = useState<LRParam[]>([])
  const [sessionStats, setSessionStats]     = useState<SessionModelStat[]>([])
  const marketOpen = isMarketOpen()

  // Light poll: open predictions + recent closed + weights — runs every 2 minutes
  const loadLight = useCallback(async () => {
    const [{ data: openData }, { data: closedData }, { data: weightsData }] = await Promise.all([
      supabase.from('consensus_predictions_intraday')
        .select('*, assets(ticker, name, currency)').eq('status','open')
        .order('created_at', { ascending: false }).limit(300),
      supabase.from('consensus_predictions_intraday')
        .select('*, assets(ticker, name, currency)').eq('status','closed')
        .order('closed_at', { ascending: false }).limit(500),
      supabase.from('model_weights_intraday')
        .select('model_name, weight, direction_accuracy, sample_size, mae_avg, last_updated')
        .order('direction_accuracy', { ascending: false, nullsFirst: false }),
    ])
    setOpen((openData ?? []) as IntraConsensus[])
    setClosed((closedData ?? []) as IntraConsensus[])
    setModelWeights((weightsData ?? []) as ModelWeightIntraday[])
    setLastRefresh(new Date()); setLoading(false)
  }, [])

  // Heavy load: individual model preds + LR params — only fetched when analysis/modelos tab is open
  const loadHeavy = useCallback(async () => {
    const [{ data: mpData }, { data: lrData }, { data: sessData }] = await Promise.all([
      supabase.from('model_predictions_intraday')
        .select('model_name, direction, direction_correct, confidence, horizon_minutes, mae, created_at, final_pct_predicted, price_at_creation, actual_price, assets!asset_id(ticker)')
        .eq('status','closed').not('direction_correct','is',null).limit(1000),
      supabase.from('model_learned_params_intraday')
        .select('model_name, horizon_minutes, train_samples, train_accuracy, coefficients, feature_names, last_updated, signed_r2, avg_actual_mag')
        .order('model_name'),
      supabase.from('lgbm_session_models_intraday')
        .select('model_name, horizon_minutes, market_session, lgbm_val_mae, error_p75, error_p90, train_samples')
        .order('horizon_minutes'),
    ])
    setModelPreds((mpData ?? []) as unknown as ModelPred[])
    setLRParams((lrData ?? []) as LRParam[])
    setSessionStats((sessData ?? []) as SessionModelStat[])
  }, [])

  // Poll light data every 2 minutes; lazy-load heavy data only when needed tabs are activated
  useEffect(() => { loadLight(); const id = setInterval(loadLight, 120000); return () => clearInterval(id) }, [loadLight])
  useEffect(() => { if (tab === 'analysis' || tab === 'modelos') loadHeavy() }, [tab, loadHeavy])
  useEffect(() => setPage(0), [filters, tab])

  // Filtered data for analysis tab based on selected period
  const analysisClosedPreds = useMemo(() => {
    if (analysisPeriod === 'all') return closed
    const now = new Date()
    let since: string
    if (analysisPeriod === 'today') {
      since = now.toISOString().slice(0, 10) + 'T00:00:00.000Z'
    } else {
      const days = analysisPeriod === '3d' ? 3 : analysisPeriod === '7d' ? 7 : 14
      since = new Date(now.getTime() - days * 86400000).toISOString()
    }
    return closed.filter(p => (p.closed_at ?? p.created_at) >= since)
  }, [closed, analysisPeriod])

  const analysisModelPreds = useMemo(() => {
    if (analysisPeriod === 'all') return modelPreds
    const now = new Date()
    let since: string
    if (analysisPeriod === 'today') {
      since = now.toISOString().slice(0, 10) + 'T00:00:00.000Z'
    } else {
      const days = analysisPeriod === '3d' ? 3 : analysisPeriod === '7d' ? 7 : 14
      since = new Date(now.getTime() - days * 86400000).toISOString()
    }
    return modelPreds.filter(p => p.created_at >= since)
  }, [modelPreds, analysisPeriod])

  async function recalcWeights() {
    setRecalculating(true)
    await callFn('juez-intraday', {})
    await loadLight()
    setRecalculating(false)
  }

  async function triggerNow() {
    setTriggering(true); await callFn('crear-prediccion-intraday', {}); await loadLight(); setTriggering(false)
  }

  async function trainLRModels() {
    setTrainLRStatus('training')
    setTrainLRMsg('Iniciando entrenamiento...')
    setLRProgress({ done: 0, total: 0, phase: 'starting', eta: null })
    const wallStart = Date.now()

    // Start background job on Python backend
    let jobId: string
    try {
      const startResp = await fetch('/api/lr-train-intraday', { method: 'POST' })
      const startData = await startResp.json()
      if (!startData.ok) {
        setTrainLRStatus('error')
        setTrainLRMsg(startData.error ?? 'Error al iniciar entrenamiento')
        return
      }
      jobId = startData.job_id
    } catch (e: unknown) {
      setTrainLRStatus('error')
      setTrainLRMsg(e instanceof Error ? e.message : 'Error de red')
      return
    }

    // Poll for completion — 400 × 3s = 20 min max
    for (let i = 0; i < 400; i++) {
      await new Promise(r => setTimeout(r, 3000))
      try {
        const pollResp = await fetch(`/api/lr-train-status?jobId=${jobId}`)
        const pollData = await pollResp.json()
        if (!pollData.ok) continue

        const { status, models_done, models_total, total_samples, elapsed } = pollData

        // Compute ETA based on elapsed seconds from backend
        let eta: number | null = null
        if (status === 'training' && models_done > 0 && models_total > 0 && elapsed > 0) {
          const rate = models_done / elapsed        // models per second
          const remaining = models_total - models_done
          eta = remaining > 0 ? Math.round(remaining / rate) : 0
        }

        if (status === 'fetching') {
          setTrainLRMsg(`Descargando datos... (${total_samples ?? 0} rows)`)
          setLRProgress({ done: 0, total: 0, phase: 'fetching', eta: null })
        } else if (status === 'training') {
          setTrainLRMsg(`Entrenando ${models_done}/${models_total} modelos`)
          setLRProgress({ done: models_done ?? 0, total: models_total ?? 39, phase: 'training', eta })
        } else if (status === 'done') {
          setTrainLRStatus('done')
          const skipped = (models_total ?? 0) - (pollData.models_trained ?? 0)
          const totalSec = Math.round((Date.now() - wallStart) / 1000)
          setTrainLRMsg(`${pollData.models_trained} modelos · ${pollData.total_samples} muestras · ${skipped} sin datos · ${totalSec}s`)
          setLRProgress({ done: pollData.models_trained, total: pollData.models_trained, phase: 'done', eta: 0 })
          const { data: lrData } = await supabase.from('model_learned_params_intraday')
            .select('model_name, horizon_minutes, train_samples, train_accuracy, coefficients, feature_names, last_updated')
            .order('model_name')
          setLRParams((lrData ?? []) as LRParam[])
          return
        } else if (status === 'error') {
          setTrainLRStatus('error')
          setTrainLRMsg(pollData.error ?? 'Error en entrenamiento')
          return
        }
      } catch { /* ignore poll errors, retry */ }
    }

    setTrainLRStatus('error')
    setTrainLRMsg('Timeout: el entrenamiento tardó demasiado')
  }

  function applyFilters(preds: IntraConsensus[]) {
    return preds.filter(p => {
      if (filters.ticker && !(p.assets?.ticker ?? '').includes(filters.ticker)) return false
      if (filters.direction && p.direction !== filters.direction) return false
      if (filters.horizon && p.horizon_minutes !== Number(filters.horizon)) return false
      return true
    })
  }

  const source   = tab === 'open' ? open : closed
  const filtered = tab === 'analysis' ? [] : applyFilters(source)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const today = new Date().toISOString().slice(0, 10)
  const closedToday = closed.filter(p => (p.closed_at ?? '').startsWith(today))
  const hitsToday   = closedToday.filter(p => p.direction_correct === true).length
  const accToday    = closedToday.length > 0 ? Math.round(hitsToday / closedToday.length * 100) : null
  const magMaesToday = closedToday
    .filter(p => p.actual_pct != null && p.final_pct_predicted != null)
    .map(p => Math.abs(Math.abs(p.actual_pct!) - Math.abs(p.final_pct_predicted)))
  const magMaeToday = magMaesToday.length > 0
    ? magMaesToday.reduce((s, v) => s + v, 0) / magMaesToday.length
    : null

  const tabBtn = (t: TabView): React.CSSProperties => ({
    background: tab === t ? 'var(--text)' : 'var(--card)', color: tab === t ? 'var(--bg)' : 'var(--text-muted)',
    border:'1px solid var(--border)', borderRadius:7, padding:'6px 14px', cursor:'pointer', fontSize:13,
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <div style={{
            display:'inline-flex', alignItems:'center', gap:6,
            background: marketOpen ? '#22c55e18' : '#a3a3a318', border:`1px solid ${marketOpen ? '#22c55e40' : '#a3a3a340'}`,
            borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:600,
          }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background: marketOpen ? '#22c55e' : '#a3a3a3', display:'inline-block', boxShadow: marketOpen ? '0 0 6px #22c55e' : 'none' }} />
            {marketOpen ? 'Mercado abierto' : 'Mercado cerrado'}
          </div>
          {lastRefresh && <span style={{ fontSize:11, color:'var(--text-hint)' }}>{lastRefresh.toLocaleTimeString('es-AR')}</span>}
          {closedToday.length > 0 && (
            <span style={{ fontSize:12, background:'var(--card)', border:'1px solid var(--border)', borderRadius:7, padding:'4px 12px', display:'flex', gap:10, alignItems:'center' }}>
              {magMaeToday != null && (
                <span>
                  MAE hoy:{' '}
                  <strong style={{ color: magMaeToday <= 0.25 ? '#22c55e' : magMaeToday <= 0.5 ? '#f59e0b' : '#ef4444' }}>
                    {magMaeToday.toFixed(2)}%
                  </strong>
                </span>
              )}
              {accToday != null && (
                <span style={{ color:'var(--text-hint)', fontSize:11 }}>
                  dir {hitsToday}/{closedToday.length} ({accToday}%)
                </span>
              )}
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:7 }}>
          <button onClick={() => setShowConfig(v => !v)} style={{ background: showConfig ? 'var(--text)' : 'var(--card)', border:'1px solid var(--border)', borderRadius:7, padding:'6px 12px', cursor:'pointer', color: showConfig ? 'var(--bg)' : 'var(--text)', fontSize:12 }}>⚙ Assets</button>
          <button onClick={triggerNow} disabled={triggering} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:7, padding:'6px 12px', cursor:'pointer', color:'var(--text)', fontSize:12, opacity: triggering ? 0.6 : 1 }}>{triggering ? 'Ejecutando...' : '⚡ Forzar ciclo'}</button>
        </div>
      </div>

      {showConfig && (
        <div style={card()}>
          <AssetSelector onSave={loadLight} />
        </div>
      )}

      {loading && <p style={{ color:'var(--text-hint)', fontSize:14 }}>Cargando...</p>}

      {!loading && (
        <>
          {/* Tabs + filters */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={() => setTab('open')} style={tabBtn('open')}>Activas ({open.length})</button>
              <button onClick={() => setTab('closed')} style={tabBtn('closed')}>Cerradas ({closed.length})</button>
              <button onClick={() => setTab('analysis')} style={tabBtn('analysis')}>Análisis</button>
              <button onClick={() => setTab('modelos')} style={tabBtn('modelos')}>Modelos ({modelWeights.length})</button>
            </div>
            {tab !== 'analysis' && tab !== 'modelos' && <FiltersBar filters={filters} onChange={setFilters} />}
          </div>

          {tab === 'analysis' && (
            <>
              {/* Period filter */}
              <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:12, color:'var(--text-hint)' }}>Período:</span>
                {(['today', '3d', '7d', '14d', 'all'] as const).map(p => (
                  <button key={p} onClick={() => setAnalysisPeriod(p)} style={{
                    background: analysisPeriod === p ? 'var(--text)' : 'var(--card)',
                    color: analysisPeriod === p ? 'var(--bg)' : 'var(--text-muted)',
                    border:'1px solid var(--border)', borderRadius:6, padding:'4px 10px',
                    fontSize:11, cursor:'pointer', fontWeight: analysisPeriod === p ? 700 : 400,
                  }}>
                    {p === 'today' ? 'Hoy' : p === '3d' ? '3 días' : p === '7d' ? '7 días' : p === '14d' ? '14 días' : 'Todo'}
                  </button>
                ))}
                <span style={{ fontSize:11, color:'var(--text-hint)', marginLeft:4 }}>
                  {analysisClosedPreds.filter(p => p.direction_correct != null).length} cerradas
                </span>
              </div>
              <IntradayAnalysis closedPreds={analysisClosedPreds} modelPreds={analysisModelPreds} />

              {/* LR vs observed accuracy comparison */}
              {lrParams.length > 0 && (() => {
                // Compute observed MAE per model from modelPreds
                const obsMap = new Map<string, { maes: number[]; total: number }>()
                for (const p of analysisModelPreds) {
                  const key = p.model_name
                  if (!obsMap.has(key)) obsMap.set(key, { maes: [], total: 0 })
                  const e = obsMap.get(key)!
                  e.total++
                  if (p.mae != null) e.maes.push(Number(p.mae))
                }
                // Average signed_r2 per model (across horizons)
                const r2Map = new Map<string, number[]>()
                for (const p of lrParams) {
                  if (p.signed_r2 == null) continue
                  if (!r2Map.has(p.model_name)) r2Map.set(p.model_name, [])
                  r2Map.get(p.model_name)!.push(p.signed_r2)
                }
                const models = [...new Set([...obsMap.keys(), ...r2Map.keys()])].sort()
                // For bar normalization, find max MAE
                const maxMae = Math.max(...[...obsMap.values()].map(e => e.maes.length > 0 ? e.maes.reduce((s, v) => s + v, 0) / e.maes.length : 0), 1)
                return (
                  <div style={card()}>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>MAE observado vs calidad del modelo (R²)</div>
                    <div style={{ fontSize:11, color:'var(--text-hint)', marginBottom:14 }}>
                      MAE observado = error medio de magnitud en el período seleccionado (menor = mejor).
                      R² entrenado = qué tan bien el modelo firmado explica los movimientos históricos.
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {models.map(model => {
                        const obs    = obsMap.get(model)
                        const obsMae = obs && obs.maes.length > 0 ? obs.maes.reduce((s, v) => s + v, 0) / obs.maes.length : null
                        const r2Arr  = r2Map.get(model)
                        const r2     = r2Arr ? r2Arr.reduce((s, v) => s + v, 0) / r2Arr.length : null
                        const maeColor = obsMae == null ? 'var(--text-hint)' : obsMae <= 0.25 ? '#22c55e' : obsMae <= 0.5 ? '#f59e0b' : '#ef4444'
                        return (
                          <div key={model} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                              <span style={{ fontSize:11, fontWeight:600, fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" }}>{modelLabel(model)}</span>
                              <span style={{ fontSize:10, color:'var(--text-hint)' }}>{obs?.total ?? 0} predicciones</span>
                            </div>
                            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                              <span style={{ fontSize:10, color:'var(--text-muted)', width:90, flexShrink:0 }}>MAE observado</span>
                              <div style={{ flex:1, background:'var(--border)', borderRadius:3, height:10, overflow:'hidden' }}>
                                {obsMae != null && <div style={{ width:`${Math.min(obsMae / maxMae, 1) * 100}%`, height:'100%', background: maeColor, borderRadius:3 }} />}
                              </div>
                              <span style={{ fontSize:11, fontWeight:700, width:50, textAlign:'right', color: maeColor }}>
                                {obsMae != null ? `${obsMae.toFixed(2)}%` : '—'}
                              </span>
                            </div>
                            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                              <span style={{ fontSize:10, color:'var(--text-muted)', width:90, flexShrink:0 }}>R² entrenado</span>
                              <div style={{ flex:1, background:'var(--border)', borderRadius:3, height:10, overflow:'hidden' }}>
                                {r2 != null && <div style={{ width:`${Math.max(0, r2) * 100}%`, height:'100%', background:'#6366f1', borderRadius:3, opacity:0.8 }} />}
                              </div>
                              <span style={{ fontSize:11, fontWeight:700, width:50, textAlign:'right', color:'#6366f1' }}>
                                {r2 != null ? r2.toFixed(2) : '—'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ marginTop:12, fontSize:11, color:'var(--text-hint)', display:'flex', gap:16 }}>
                      <span><span style={{ color:'#22c55e' }}>■</span> MAE ≤0.25% (muy preciso)</span>
                      <span><span style={{ color:'#f59e0b' }}>■</span> MAE ≤0.5%</span>
                      <span><span style={{ color:'#6366f1' }}>■</span> R² del modelo firmado (0→1)</span>
                    </div>
                  </div>
                )
              })()}
            </>
          )}

          {tab === 'modelos' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* Explanation card */}
              <div style={card()}>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Aprendizaje automático de pesos intraday</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.7, marginBottom:12 }}>
                  Cada vez que <b>juez-intraday</b> evalúa predicciones vencidas (cada 5 min en horario de mercado),
                  recalcula los pesos del ensemble de 4 votos (LGBM, Ridge, sentimiento, reversión) basándose en las
                  últimas 500 predicciones cerradas. Los votos más precisos reciben mayor peso en el consenso.
                  <br /><span style={{ color:'var(--text-hint)' }}>
                    Fórmula: peso = max(0.1, min(3.0, 1.0 + (accuracy − 0.5) × 4))
                  </span>
                </div>
                <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                  <button
                    onClick={recalcWeights}
                    disabled={recalculating}
                    style={{
                      background: recalculating ? 'var(--border)' : '#7c3aed', color:'#fff',
                      border:'none', borderRadius:7, padding:'8px 18px', fontSize:12, fontWeight:700,
                      cursor: recalculating ? 'default' : 'pointer',
                    }}
                  >
                    {recalculating ? 'Recalculando...' : 'Forzar recálculo de pesos'}
                  </button>
                  <span style={{ fontSize:11, color:'var(--text-hint)' }}>
                    Cierra predicciones vencidas y actualiza pesos inmediatamente
                  </span>
                </div>
              </div>

              {/* Weights table */}
              {modelWeights.length > 0 ? (
                <div style={card({ padding:0, overflow:'hidden' })}>
                  <div style={{ padding:'14px 20px 12px' }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>Pesos actuales por modelo</div>
                    {modelWeights[0]?.last_updated && (
                      <div style={{ fontSize:11, color:'var(--text-hint)', marginTop:3 }}>
                        Último cálculo: {new Date(modelWeights[0].last_updated).toLocaleString('es-AR')}
                        · basado en {modelWeights[0].sample_size} predicciones
                      </div>
                    )}
                  </div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr>
                          {['#','Modelo','MAE medio','Precisión dir.','Peso','Muestras'].map((h, i) => (
                            <th key={h} style={{ ...th, textAlign: i <= 1 ? 'left' : 'center', ...(h === 'MAE medio' ? { color:'#f59e0b' } : {}) }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...modelWeights].sort((a, b) => {
                          const mA = a.mae_avg != null ? Number(a.mae_avg) : Infinity
                          const mB = b.mae_avg != null ? Number(b.mae_avg) : Infinity
                          return mA - mB
                        }).map((w, i) => {
                          const wNum = Number(w.weight)
                          const acc  = w.direction_accuracy != null ? Number(w.direction_accuracy) : null
                          const mae  = w.mae_avg != null ? Number(w.mae_avg) : null
                          const wColor = wNum > 1.3 ? '#22c55e' : wNum < 0.7 ? '#ef4444' : 'var(--text)'
                          const maeColor = mae == null ? 'var(--text-hint)' : mae <= 0.25 ? '#22c55e' : mae <= 0.5 ? '#f59e0b' : '#ef4444'
                          return (
                            <tr key={w.model_name} style={{ borderBottom:'1px solid var(--border)' }}>
                              <td style={td({ color:'var(--text-hint)', fontWeight:600 })}>{i + 1}</td>
                              <td style={td({ fontWeight:700, fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" })}>{modelLabel(w.model_name)}</td>
                              <td style={td({ textAlign:'center', fontWeight:700, color: maeColor, fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" })}>
                                {mae != null ? `${mae.toFixed(3)}%` : '—'}
                              </td>
                              <td style={td({ textAlign:'center', color: accColor(acc) })}>
                                {acc != null ? `${(acc * 100).toFixed(1)}%` : '—'}
                              </td>
                              <td style={td({ textAlign:'center', fontWeight:700, color: wColor, fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" })}>
                                {wNum.toFixed(3)}
                              </td>
                              <td style={td({ textAlign:'center', color:'var(--text-muted)' })}>{w.sample_size}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={card({ textAlign:'center', padding:'40px 24px' })}>
                  <p style={{ color:'var(--text-muted)', margin:0 }}>
                    Pesos aún no calculados. Se calcularán automáticamente cuando se cierren las primeras predicciones.
                  </p>
                </div>
              )}

              {/* LR Training */}
              <div style={card()}>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Entrenamiento ML — Modelo firmado (magnitud + dirección)</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.7, marginBottom:12 }}>
                  Entrena un <b>Ridge regression firmado</b> por cada horizonte (60, 120, 240 min).
                  Predice directamente el <b>% de movimiento con signo</b> (positivo = sube, negativo = baja),
                  de forma que dirección y magnitud salen del mismo modelo.
                  <br />
                  <span style={{ color:'var(--text-hint)' }}>
                    Features: 13 scores + RSI, VWAP, Bollinger, volumen, momentum, ATR, minutos transcurridos.
                    Mínimo 20 muestras por horizonte para entrenar.
                    La métrica clave es R² (cuánta varianza del movimiento real explica el modelo).
                  </span>
                </div>
                <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                  <button
                    onClick={trainLRModels}
                    disabled={trainLRStatus === 'training'}
                    style={{
                      background: trainLRStatus === 'training' ? 'var(--border)' : '#2563eb', color:'#fff',
                      border:'none', borderRadius:7, padding:'8px 18px', fontSize:12, fontWeight:700,
                      cursor: trainLRStatus === 'training' ? 'default' : 'pointer', flexShrink:0,
                    }}
                  >
                    {trainLRStatus === 'training' ? 'Entrenando...' : 'Entrenar modelo firmado (MAE)'}
                  </button>
                  {trainLRStatus === 'done' && (
                    <span style={{ fontSize:12, color:'#22c55e' }}>✓ {trainLRMsg}</span>
                  )}
                  {trainLRStatus === 'error' && (
                    <span style={{ fontSize:12, color:'#ef4444' }}>✗ {trainLRMsg}</span>
                  )}
                </div>

                {/* Progress bar — visible solo mientras entrena */}
                {trainLRStatus === 'training' && (
                  <div style={{ marginTop:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                      <span style={{ fontSize:12, color:'var(--text-muted)' }}>{trainLRMsg}</span>
                      {lrProgress.eta != null && lrProgress.phase === 'training' && (
                        <span style={{ fontSize:11, color:'var(--text-hint)', fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" }}>
                          ~{lrProgress.eta < 60
                            ? `${lrProgress.eta}s`
                            : `${Math.floor(lrProgress.eta / 60)}m ${lrProgress.eta % 60}s`} restantes
                        </span>
                      )}
                    </div>
                    <div style={{ background:'var(--border)', borderRadius:99, height:8, overflow:'hidden' }}>
                      {lrProgress.phase === 'fetching' ? (
                        /* Indeterminate animation while fetching */
                        <div style={{
                          height:'100%', width:'30%', borderRadius:99,
                          background:'linear-gradient(90deg, #2563eb 0%, #60a5fa 50%, #2563eb 100%)',
                          backgroundSize:'200% 100%',
                          animation:'lr-shimmer 1.5s infinite linear',
                        }} />
                      ) : (
                        /* Determinate bar during training */
                        <div style={{
                          height:'100%', borderRadius:99, background:'#2563eb',
                          width: lrProgress.total > 0
                            ? `${Math.round(lrProgress.done / lrProgress.total * 100)}%`
                            : '0%',
                          transition:'width 0.4s ease',
                        }} />
                      )}
                    </div>
                    {lrProgress.phase === 'training' && lrProgress.total > 0 && (
                      <div style={{ fontSize:11, color:'var(--text-hint)', marginTop:4, textAlign:'right' }}>
                        {lrProgress.done} / {lrProgress.total} modelos ({Math.round(lrProgress.done / lrProgress.total * 100)}%)
                      </div>
                    )}
                  </div>
                )}
                <style>{`
                  @keyframes lr-shimmer {
                    0%   { background-position: 200% 0 }
                    100% { background-position: -200% 0 }
                  }
                `}</style>
              </div>

              {/* Error percentiles por horizonte (LGBM session models) */}
              {sessionStats.length > 0 && <SessionErrorPanel stats={sessionStats} />}

              {/* LR Results visualization */}
              <LRResultsPanel params={lrParams} />
            </div>
          )}

          {tab !== 'analysis' && filtered.length === 0 && (
            <div style={{ ...card(), textAlign:'center', padding:'40px 24px' }}>
              <p style={{ color:'var(--text-muted)', fontSize:14, margin:'0 0 8px' }}>
                {source.length === 0
                  ? tab === 'open'
                    ? marketOpen ? 'No hay predicciones activas. Usá ⚡ Forzar ciclo.' : 'El mercado está cerrado (9:30–16:00 ET).'
                    : 'No hay predicciones cerradas aún.'
                  : 'Ningún resultado para los filtros aplicados.'}
              </p>
            </div>
          )}

          {tab !== 'analysis' && paginated.length > 0 && (
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
              <PredTable preds={paginated} showStatus={tab === 'closed'} scorecardBolsas={scorecardBolsas} />
            </div>
          )}

          {tab !== 'analysis' && <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />}
        </>
      )}

      <p style={{ fontSize:11, color:'var(--text-hint)', lineHeight:1.5 }}>
        Ensemble de 4 votos (LGBM, Ridge, sentimiento, reversión) · horizontes 60, 120 y 240 min · auditoría automática al vencimiento
      </p>
    </div>
  )
}
