'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'

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
  assets: { ticker: string; name: string } | null
}

interface ModelPred {
  model_name: string; direction: string; direction_correct: boolean | null
  confidence: number; horizon_minutes: number; mae: number | null; created_at: string
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
}

function isMarketOpen(): boolean {
  const now  = new Date()
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
  const day  = now.getUTCDay()
  if (day === 0 || day === 6) return false
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
function PredTable({ preds, showStatus }: { preds: IntraConsensus[]; showStatus?: boolean }) {
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr>
            {['Ticker','Dirección','Conf.','Acuerdo','Horizonte','Pred %','Real %','Modelos', showStatus ? 'Estado' : 'Cierra en'].map((h, i) => (
              <th key={h} style={{ ...th, textAlign: i >= 2 ? 'center' : 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preds.map(p => (
            <tr key={p.id} style={{ borderBottom:'1px solid var(--border)' }}>
              <td style={td({ fontWeight:700, ...mono })}>{p.assets?.ticker ?? '?'}</td>
              <td style={td()}><DirChip d={p.direction} correct={p.direction_correct} /></td>
              <td style={td({ textAlign:'center' })}>{Math.round(p.confidence * 100)}%</td>
              <td style={td({ textAlign:'center' })}>{Math.round(p.agreement_pct * 100)}%</td>
              <td style={td({ textAlign:'center' })}><span style={{ background:'var(--border)', borderRadius:4, padding:'1px 6px', fontSize:11, ...mono }}>{p.horizon_minutes}m</span></td>
              <td style={td({ textAlign:'center', color: p.final_pct_predicted >= 0 ? '#22c55e' : '#ef4444', ...mono })}>{p.final_pct_predicted >= 0 ? '+' : ''}{p.final_pct_predicted?.toFixed(2)}%</td>
              <td style={td({ textAlign:'center', ...mono })}>
                {p.actual_pct != null
                  ? <span style={{ color: p.actual_pct >= 0 ? '#22c55e' : '#ef4444' }}>{p.actual_pct >= 0 ? '+' : ''}{p.actual_pct.toFixed(2)}%</span>
                  : <span style={{ color:'var(--text-hint)' }}>—</span>}
              </td>
              <td style={td({ textAlign:'center', fontSize:11, color:'var(--text-muted)' })}>↑{p.models_bullish} ↓{p.models_bearish} —{p.models_neutral}</td>
              {showStatus
                ? <td style={td({ textAlign:'center' })}>
                    <span style={{ fontSize:11, color: p.direction_correct === true ? '#22c55e' : p.direction_correct === false ? '#ef4444' : 'var(--text-hint)' }}>
                      {p.direction_correct === true ? 'Correcto' : p.direction_correct === false ? 'Incorrecto' : p.status}
                    </span>
                  </td>
                : <td style={td({ textAlign:'center' })}><CountdownCell iso={p.target_time} /></td>
              }
            </tr>
          ))}
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
    const byHorizon: Record<number, { n: number; c: number; confs: number[]; maes: number[] }> = {}
    for (const p of cp) {
      const h = p.horizon_minutes
      if (!byHorizon[h]) byHorizon[h] = { n: 0, c: 0, confs: [], maes: [] }
      byHorizon[h].n++
      if (p.direction_correct) byHorizon[h].c++
      byHorizon[h].confs.push(p.confidence)
      if (p.actual_pct != null) byHorizon[h].maes.push(Math.abs(p.actual_pct - p.final_pct_predicted))
    }

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
    const byModel: Record<string, { n: number; c: number; up_n: number; up_c: number; down_n: number; down_c: number; maes: number[] }> = {}
    for (const p of modelPreds) {
      if (p.direction_correct == null) continue
      if (!byModel[p.model_name]) byModel[p.model_name] = { n: 0, c: 0, up_n: 0, up_c: 0, down_n: 0, down_c: 0, maes: [] }
      const m = byModel[p.model_name]
      m.n++; if (p.direction_correct) m.c++
      if (p.direction === 'up') { m.up_n++; if (p.direction_correct) m.up_c++ }
      else if (p.direction === 'down') { m.down_n++; if (p.direction_correct) m.down_c++ }
      if (p.mae != null) m.maes.push(Number(p.mae))
    }

    return { total, correct, accuracy, mae, byHorizon, byDir, byAgree, confBuckets, bySession, byTicker, dailyTrend, byModel }
  }, [closedPreds, modelPreds])

  if (!stats || closedPreds.length === 0) {
    return (
      <div style={card({ textAlign:'center', padding:'60px 24px' })}>
        <p style={{ color:'var(--text-muted)', margin:0 }}>No hay predicciones cerradas aún para analizar.</p>
        <p style={{ color:'var(--text-hint)', fontSize:12, marginTop:8 }}>Los datos aparecerán automáticamente a medida que las predicciones venzan durante el horario de mercado.</p>
      </div>
    )
  }

  const { total, correct, accuracy, mae, byHorizon, byDir, byAgree, confBuckets, bySession, byTicker, dailyTrend, byModel } = stats

  const horizons = [60, 120, 240]
  const sessionOrder = ['Apertura (0-30m)', 'Mañana (30-120m)', 'Mediodía (2-4h)', 'Tarde (4h+)']
  const sortedTickers = Object.entries(byTicker).sort((a, b) => b[1].n - a[1].n)
  const sortedModels  = Object.entries(byModel).sort((a, b) => (b[1].n > 0 ? b[1].c/b[1].n : 0) - (a[1].n > 0 ? a[1].c/a[1].n : 0))

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

      {/* ── Global stats ── */}
      <div>
        <h3 style={{ fontSize:14, fontWeight:600, margin:'0 0 14px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Resumen global</h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px,1fr))', gap:12 }}>
          <StatCard label="Cerradas" value={total} />
          <StatCard label="Correctas" value={correct} color="#22c55e" />
          <StatCard label="Precisión" value={fmt(accuracy)} color={accColor(accuracy)} />
          <StatCard label="Error medio" value={mae != null ? `${mae.toFixed(2)}%` : '—'} sub="|pred − real|" />
          <StatCard label="Mejor horizonte" value={
            horizons.map(h => ({ h, acc: pct(byHorizon[h]?.c ?? 0, byHorizon[h]?.n ?? 0) }))
              .filter(x => x.acc != null).sort((a, b) => b.acc! - a.acc!)[0]?.h ?? '—'
          } sub="en precisión" />
          <StatCard label="Mejor dirección" value={
            Object.entries(byDir).sort((a, b) => pct(b[1].c, b[1].n)! - pct(a[1].c, a[1].n)!)[0]?.[0] === 'up' ? '↑ Sube' :
            Object.entries(byDir).sort((a, b) => pct(b[1].c, b[1].n)! - pct(a[1].c, a[1].n)!)[0]?.[0] === 'down' ? '↓ Baja' : '—'
          } />
        </div>
      </div>

      {/* ── Por horizonte ── */}
      <div>
        <h3 style={{ fontSize:14, fontWeight:600, margin:'0 0 14px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Por horizonte</h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          {horizons.map(h => {
            const d = byHorizon[h]
            const acc = pct(d?.c ?? 0, d?.n ?? 0)
            return (
              <div key={h} style={card()}>
                <div style={{ fontSize:11, color:'var(--text-hint)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.08em' }}>{h} minutos</div>
                <div style={{ fontSize:26, fontWeight:700, color: accColor(acc), lineHeight:1, marginBottom:6 }}>{fmt(acc)}</div>
                <MiniBar pct={acc ?? 0} color={acc != null && acc >= 0.6 ? '#22c55e' : acc != null && acc < 0.4 ? '#ef4444' : '#f59e0b'} />
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:11, color:'var(--text-hint)' }}>
                  <span>{d?.c ?? 0}/{d?.n ?? 0} correctas</span>
                  <span>conf. media {fmt(avg(d?.confs ?? []))}</span>
                </div>
                {d?.maes.length ? <div style={{ fontSize:11, color:'var(--text-hint)', marginTop:2 }}>MAE {avg(d.maes)!.toFixed(2)}%</div> : null}
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

      {/* ── Ranking de modelos individuales ── */}
      {sortedModels.length > 0 && (
        <div style={card({ padding:0, overflow:'hidden' })}>
          <div style={{ padding:'16px 20px 14px' }}>
            <h3 style={{ fontSize:13, fontWeight:600, margin:0 }}>Ranking de los 13 modelos individuales</h3>
            <p style={{ fontSize:11, color:'var(--text-hint)', margin:'4px 0 0' }}>Precisión de cada modelo por separado (no el consenso)</p>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr>
                  {['#','Modelo','Total','Precisión global','↑ Precisión','↓ Precisión','MAE medio','Barra'].map(h => (
                    <th key={h} style={{ ...th, textAlign: h === 'Modelo' || h === '#' ? 'left' : 'center' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedModels.map(([model, d], i) => {
                  const a     = pct(d.c, d.n)
                  const upAcc = pct(d.up_c, d.up_n)
                  const dnAcc = pct(d.down_c, d.down_n)
                  const maeA  = avg(d.maes)
                  return (
                    <tr key={model} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={td({ color:'var(--text-hint)', fontWeight:600 })}>{i + 1}</td>
                      <td style={td({ fontWeight:600, ...mono })}>{model}</td>
                      <td style={td({ textAlign:'center', color:'var(--text-muted)' })}>{d.n}</td>
                      <td style={td({ textAlign:'center', fontWeight:700, color: accColor(a) })}>{fmt(a)}</td>
                      <td style={td({ textAlign:'center', color: accColor(upAcc) })}>{fmt(upAcc)}</td>
                      <td style={td({ textAlign:'center', color: accColor(dnAcc) })}>{fmt(dnAcc)}</td>
                      <td style={td({ textAlign:'center', color:'var(--text-muted)', ...mono })}>{fmtN(maeA)}%</td>
                      <td style={td({ minWidth:100 })}><MiniBar pct={a ?? 0} color={a != null && a >= 0.6 ? '#22c55e' : a != null && a < 0.4 ? '#ef4444' : '#f59e0b'} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
            <div style={{ fontSize:13, fontWeight:600 }}>Mapa de precisión LR · {params.length} combinaciones entrenadas</div>
            {lastTrained && <div style={{ fontSize:11, color:'var(--text-hint)', marginTop:3 }}>Último entrenamiento: {lastTrained}</div>}
          </div>
          <div style={{ display:'flex', gap:10, fontSize:11, color:'var(--text-hint)' }}>
            <span style={{ color:'#22c55e' }}>■ ≥60%</span>
            <span style={{ color:'#f59e0b' }}>■ 50–60%</span>
            <span style={{ color:'#ef4444' }}>■ &lt;50%</span>
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
                  <td style={td({ fontWeight:600, fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)", fontSize:11 })}>{model}</td>
                  {horizons.map(h => {
                    const p = grid.get(model)?.get(h)
                    const acc = p?.train_accuracy ?? null
                    const blend = p ? Math.min(p.train_samples / 500, 0.7) : 0
                    return (
                      <td key={h} style={{ ...td({ textAlign:'center' }), background: cellBg(acc) }}>
                        {p ? (
                          <div style={{ display:'flex', flexDirection:'column', gap:2, alignItems:'center' }}>
                            <span style={{ fontWeight:700, color: cellCol(acc) }}>
                              {(acc! * 100).toFixed(1)}%
                            </span>
                            <span style={{ fontSize:10, color:'var(--text-hint)' }}>
                              {p.train_samples} muestras
                            </span>
                            <span style={{ fontSize:10, color:'#6366f1' }}>
                              LR influye {(blend * 100).toFixed(0)}%
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
          <b style={{ color:'#6366f1' }}>LR influye X%</b> = cuánto pesa la RL en la confianza final vs el score base.
          Aumenta con más datos (máx. 70% con ≥500 muestras).
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
export function IntradaySectionClient() {
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
  const [lrParams, setLRParams]             = useState<LRParam[]>([])
  const marketOpen = isMarketOpen()

  const load = useCallback(async () => {
    const [{ data: openData }, { data: closedData }, { data: mpData }, { data: weightsData }, { data: lrData }] = await Promise.all([
      supabase.from('consensus_predictions_intraday')
        .select('*, assets(ticker, name)').eq('status','open')
        .order('created_at', { ascending: false }).limit(500),
      supabase.from('consensus_predictions_intraday')
        .select('*, assets(ticker, name)').eq('status','closed')
        .order('closed_at', { ascending: false }).limit(2000),
      supabase.from('model_predictions_intraday')
        .select('model_name, direction, direction_correct, confidence, horizon_minutes, mae, created_at, assets!asset_id(ticker)')
        .eq('status','closed').not('direction_correct','is',null).limit(5000),
      supabase.from('model_weights_intraday')
        .select('model_name, weight, direction_accuracy, sample_size, mae_avg, last_updated')
        .order('direction_accuracy', { ascending: false, nullsFirst: false }),
      supabase.from('model_learned_params_intraday')
        .select('model_name, horizon_minutes, train_samples, train_accuracy, coefficients, feature_names, last_updated')
        .order('model_name'),
    ])
    setOpen((openData ?? []) as IntraConsensus[])
    setClosed((closedData ?? []) as IntraConsensus[])
    setModelPreds((mpData ?? []) as unknown as ModelPred[])
    setModelWeights((weightsData ?? []) as ModelWeightIntraday[])
    setLRParams((lrData ?? []) as LRParam[])
    setLastRefresh(new Date()); setLoading(false)
  }, [])

  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id) }, [load])
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
    await load()
    setRecalculating(false)
  }

  async function triggerNow() {
    setTriggering(true); await callFn('crear-prediccion-intraday', {}); await load(); setTriggering(false)
  }

  async function trainLRModels() {
    setTrainLRStatus('training')
    setTrainLRMsg('Iniciando entrenamiento...')

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

        const { status, models_done, models_total, total_samples } = pollData
        if (status === 'fetching') {
          setTrainLRMsg(`Obteniendo datos (${total_samples ?? 0} rows)...`)
        } else if (status === 'training') {
          setTrainLRMsg(`Entrenando modelos ${models_done}/${models_total}...`)
        } else if (status === 'done') {
          setTrainLRStatus('done')
          const skipped = (models_total ?? 0) - (pollData.models_trained ?? 0)
          setTrainLRMsg(`✓ ${pollData.models_trained} modelos entrenados · ${pollData.total_samples} muestras · ${skipped} sin datos suficientes`)
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
          {accToday != null && (
            <span style={{ fontSize:12, background:'var(--card)', border:'1px solid var(--border)', borderRadius:7, padding:'4px 12px' }}>
              Hoy: <strong style={{ color: accToday >= 60 ? '#22c55e' : accToday < 40 ? '#ef4444' : 'var(--text)' }}>{hitsToday}/{closedToday.length} ({accToday}%)</strong>
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
          <AssetSelector onSave={load} />
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
                // Compute observed accuracy per model from modelPreds
                const obsMap = new Map<string, { correct: number; total: number }>()
                for (const p of analysisModelPreds) {
                  const key = p.model_name
                  if (!obsMap.has(key)) obsMap.set(key, { correct:0, total:0 })
                  const e = obsMap.get(key)!
                  e.total++
                  if (p.direction_correct === true) e.correct++
                }
                // Average LR accuracy per model (across horizons)
                const lrMap = new Map<string, number[]>()
                for (const p of lrParams) {
                  if (!lrMap.has(p.model_name)) lrMap.set(p.model_name, [])
                  lrMap.get(p.model_name)!.push(p.train_accuracy)
                }
                const models = [...new Set([...obsMap.keys(), ...lrMap.keys()])].sort()
                return (
                  <div style={card()}>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Precisión observada vs precisión LR entrenada</div>
                    <div style={{ fontSize:11, color:'var(--text-hint)', marginBottom:14 }}>
                      Comparación entre la precisión real de cada modelo en el período seleccionado y la precisión del modelo LR entrenado con datos históricos.
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {models.map(model => {
                        const obs     = obsMap.get(model)
                        const obsAcc  = obs && obs.total > 0 ? obs.correct / obs.total : null
                        const lrAcArr = lrMap.get(model)
                        const lrAcc   = lrAcArr ? lrAcArr.reduce((s, v) => s + v, 0) / lrAcArr.length : null
                        return (
                          <div key={model} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                              <span style={{ fontSize:11, fontWeight:600, fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" }}>{model}</span>
                              <span style={{ fontSize:10, color:'var(--text-hint)' }}>{obs?.total ?? 0} predicciones</span>
                            </div>
                            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                              <span style={{ fontSize:10, color:'var(--text-muted)', width:90, flexShrink:0 }}>Observada</span>
                              <div style={{ flex:1, background:'var(--border)', borderRadius:3, height:10, overflow:'hidden' }}>
                                {obsAcc != null && <div style={{ width:`${obsAcc * 100}%`, height:'100%', background: obsAcc >= 0.60 ? '#22c55e' : obsAcc >= 0.50 ? '#f59e0b' : '#ef4444', borderRadius:3 }} />}
                              </div>
                              <span style={{ fontSize:11, fontWeight:700, width:40, textAlign:'right', color: obsAcc != null && obsAcc >= 0.60 ? '#22c55e' : obsAcc != null && obsAcc < 0.50 ? '#ef4444' : '#f59e0b' }}>
                                {obsAcc != null ? `${(obsAcc*100).toFixed(0)}%` : '—'}
                              </span>
                            </div>
                            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                              <span style={{ fontSize:10, color:'var(--text-muted)', width:90, flexShrink:0 }}>LR entrenada</span>
                              <div style={{ flex:1, background:'var(--border)', borderRadius:3, height:10, overflow:'hidden' }}>
                                {lrAcc != null && <div style={{ width:`${lrAcc * 100}%`, height:'100%', background:'#6366f1', borderRadius:3, opacity:0.8 }} />}
                              </div>
                              <span style={{ fontSize:11, fontWeight:700, width:40, textAlign:'right', color:'#6366f1' }}>
                                {lrAcc != null ? `${(lrAcc*100).toFixed(0)}%` : '—'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ marginTop:12, fontSize:11, color:'var(--text-hint)', display:'flex', gap:16 }}>
                      <span><span style={{ color:'#22c55e' }}>■</span> Observada ≥60%</span>
                      <span><span style={{ color:'#6366f1' }}>■</span> LR entrenada (histórico completo)</span>
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
                  recalcula los pesos de los 13 modelos basándose en las últimas 500 predicciones cerradas.
                  Los modelos más precisos reciben mayor peso en el consenso.
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
                          {['#','Modelo','Peso','Precisión','Muestras','MAE medio','Barra precisión'].map((h, i) => (
                            <th key={h} style={{ ...th, textAlign: i <= 1 ? 'left' : 'center' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...modelWeights].sort((a, b) => (b.direction_accuracy ?? 0) - (a.direction_accuracy ?? 0)).map((w, i) => {
                          const wNum = Number(w.weight)
                          const acc  = w.direction_accuracy != null ? Number(w.direction_accuracy) : null
                          const wColor = wNum > 1.3 ? '#22c55e' : wNum < 0.7 ? '#ef4444' : 'var(--text)'
                          return (
                            <tr key={w.model_name} style={{ borderBottom:'1px solid var(--border)' }}>
                              <td style={td({ color:'var(--text-hint)', fontWeight:600 })}>{i + 1}</td>
                              <td style={td({ fontWeight:700, fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" })}>{w.model_name}</td>
                              <td style={td({ textAlign:'center', fontWeight:700, color: wColor, fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" })}>
                                {wNum.toFixed(3)}
                              </td>
                              <td style={td({ textAlign:'center', fontWeight:700, color: accColor(acc) })}>
                                {acc != null ? `${(acc * 100).toFixed(1)}%` : '—'}
                              </td>
                              <td style={td({ textAlign:'center', color:'var(--text-muted)' })}>{w.sample_size}</td>
                              <td style={td({ textAlign:'center', color:'var(--text-muted)', fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" })}>
                                {w.mae_avg != null ? `${Number(w.mae_avg).toFixed(3)}%` : '—'}
                              </td>
                              <td style={td({ minWidth:120 })}>
                                <MiniBar pct={acc ?? 0} color={acc != null && acc >= 0.6 ? '#22c55e' : acc != null && acc < 0.4 ? '#ef4444' : '#f59e0b'} />
                              </td>
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
                <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Entrenamiento ML — Regresión Logística</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.7, marginBottom:12 }}>
                  Entrena un modelo LR independiente por cada combinación <b>modelo × horizonte</b> (hasta 39 combinaciones).
                  Aprende qué condiciones del mercado hacen que cada modelo sea confiable, usando las predicciones cerradas como datos de entrenamiento.
                  <br />
                  <span style={{ color:'var(--text-hint)' }}>
                    Features: 13 scores + RSI, VWAP, Bollinger, volumen, momentum, ATR, minutos transcurridos.
                    La confianza calibrada se incorpora gradualmente (aumenta con más datos).
                    Mínimo 20 muestras por modelo×horizonte para entrenar.
                  </span>
                </div>
                <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                  <button
                    onClick={trainLRModels}
                    disabled={trainLRStatus === 'training'}
                    style={{
                      background: trainLRStatus === 'training' ? 'var(--border)' : '#2563eb', color:'#fff',
                      border:'none', borderRadius:7, padding:'8px 18px', fontSize:12, fontWeight:700,
                      cursor: trainLRStatus === 'training' ? 'default' : 'pointer',
                    }}
                  >
                    {trainLRStatus === 'training' ? 'Entrenando...' : 'Entrenar modelos LR'}
                  </button>
                  {trainLRStatus === 'done' && (
                    <span style={{ fontSize:12, color:'#22c55e' }}>✓ {trainLRMsg}</span>
                  )}
                  {trainLRStatus === 'error' && (
                    <span style={{ fontSize:12, color:'#ef4444' }}>✗ {trainLRMsg}</span>
                  )}
                </div>
              </div>

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
              <PredTable preds={paginated} showStatus={tab === 'closed'} />
            </div>
          )}

          {tab !== 'analysis' && <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />}
        </>
      )}

      <p style={{ fontSize:11, color:'var(--text-hint)', lineHeight:1.5 }}>
        13 modelos · horizontes 60, 120 y 240 min · auditoría automática al vencimiento
      </p>
    </div>
  )
}
