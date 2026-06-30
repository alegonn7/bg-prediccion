'use client'
import { useEffect, useState, useCallback } from 'react'
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
    try { return JSON.parse(text) } catch { return { ok: false, error: `HTTP ${r.status}` } }
  } catch (e) { return { ok: false, error: String(e) } }
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

function isMarketOpen(): boolean {
  const now = new Date()
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
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setLabel(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`)
    }
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [targetIso])
  return label
}

function DirChip({ d, correct }: { d: string; correct?: boolean | null }) {
  const color = d === 'up' ? '#22c55e' : d === 'down' ? '#ef4444' : '#a3a3a3'
  const icon  = d === 'up' ? '↑' : d === 'down' ? '↓' : '—'
  const mark  = correct === true ? ' ✓' : correct === false ? ' ✗' : ''
  const bg    = correct === false ? '#f9731620' : `${color}18`
  const fc    = correct === false ? '#f97316' : color
  return (
    <span style={{ display:'inline-block', color: fc, background: bg, borderRadius: 4, padding:'1px 7px', fontWeight:700, fontSize:12 }}>
      {icon}{mark}
    </span>
  )
}

function CountdownCell({ iso }: { iso: string }) {
  const label = useCountdown(iso)
  return <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{label}</span>
}

// ── Asset config panel ────────────────────────────────────────────────────────
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
    if (!res?.ok) setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, intraday_active: !next } : a))
    setSaving(null); onSave()
  }

  const filtered = assets.filter(a =>
    a.ticker.toLowerCase().includes(search.toLowerCase()) ||
    a.name.toLowerCase().includes(search.toLowerCase())
  )
  const enabled = assets.filter(a => a.intraday_active)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontSize:13, fontWeight:600 }}>
          Activos: <span style={{ color: enabled.length > 0 ? '#22c55e' : 'var(--text-muted)' }}>{enabled.length}/{assets.length}</span>
        </span>
        <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 10px', fontSize:12, color:'var(--text)', outline:'none', width:130 }} />
      </div>
      {loading ? <p style={{ fontSize:13, color:'var(--text-hint)' }}>Cargando...</p> : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:5, maxHeight:280, overflowY:'auto' }}>
          {filtered.map(asset => {
            const on = asset.intraday_active; const busy = saving === asset.id
            return (
              <button key={asset.id} onClick={() => toggle(asset)} disabled={busy} style={{
                display:'flex', alignItems:'center', justifyContent:'space-between', gap:6,
                padding:'7px 10px', background: on ? '#22c55e12' : 'var(--card)',
                border:`1px solid ${on ? '#22c55e40' : 'var(--border)'}`, borderRadius:7,
                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, textAlign:'left', width:'100%',
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

// ── Filters bar ───────────────────────────────────────────────────────────────
type TabView = 'open' | 'closed'
interface Filters {
  ticker: string
  direction: '' | 'up' | 'down' | 'neutral'
  horizon: '' | '60' | '120' | '240'
}

function FiltersBar({ filters, onChange, tickers }: {
  filters: Filters
  onChange: (f: Filters) => void
  tickers: string[]
}) {
  const inputStyle: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6,
    padding: '5px 10px', fontSize: 12, color: 'var(--text)', outline: 'none',
  }
  const selStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
      <input
        type="text" placeholder="Ticker..." value={filters.ticker}
        onChange={e => onChange({ ...filters, ticker: e.target.value.toUpperCase() })}
        style={{ ...inputStyle, width: 90 }}
      />
      <select value={filters.direction} onChange={e => onChange({ ...filters, direction: e.target.value as Filters['direction'] })} style={selStyle}>
        <option value="">Toda dirección</option>
        <option value="up">↑ Sube</option>
        <option value="down">↓ Baja</option>
        <option value="neutral">— Neutral</option>
      </select>
      <select value={filters.horizon} onChange={e => onChange({ ...filters, horizon: e.target.value as Filters['horizon'] })} style={selStyle}>
        <option value="">Todo horizonte</option>
        <option value="60">60 min</option>
        <option value="120">120 min</option>
        <option value="240">240 min</option>
      </select>
      {(filters.ticker || filters.direction || filters.horizon) && (
        <button onClick={() => onChange({ ticker:'', direction:'', horizon:'' })}
          style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'5px 10px', fontSize:11, color:'var(--text-muted)', cursor:'pointer' }}>
          Limpiar
        </button>
      )}
    </div>
  )
}

// ── Predictions table ─────────────────────────────────────────────────────────
function PredTable({ preds, showStatus }: { preds: IntraConsensus[]; showStatus?: boolean }) {
  const th: React.CSSProperties = {
    textAlign:'left', padding:'7px 10px', color:'var(--text-hint)', fontWeight:500,
    fontSize:11, letterSpacing:'0.05em', textTransform:'uppercase', whiteSpace:'nowrap',
    borderBottom:'1px solid var(--border)', position:'sticky', top:0, background:'var(--card)', zIndex:1,
  }
  const td: React.CSSProperties = { padding:'7px 10px', fontSize:12, whiteSpace:'nowrap' }

  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr>
            <th style={th}>Ticker</th>
            <th style={th}>Dirección</th>
            <th style={{ ...th, textAlign:'center' }}>Conf.</th>
            <th style={{ ...th, textAlign:'center' }}>Acuerdo</th>
            <th style={{ ...th, textAlign:'center' }}>Horizonte</th>
            <th style={{ ...th, textAlign:'right' }}>Pred %</th>
            <th style={{ ...th, textAlign:'right' }}>Real %</th>
            <th style={{ ...th, textAlign:'center' }}>Modelos</th>
            {showStatus
              ? <th style={{ ...th, textAlign:'center' }}>Estado</th>
              : <th style={{ ...th, textAlign:'right' }}>Cierra en</th>
            }
          </tr>
        </thead>
        <tbody>
          {preds.map(p => {
            const ticker = p.assets?.ticker ?? '?'
            return (
              <tr key={p.id} style={{ borderBottom:'1px solid var(--border)' }}>
                <td style={{ ...td, fontWeight:700, fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" }}>{ticker}</td>
                <td style={td}><DirChip d={p.direction} correct={p.direction_correct} /></td>
                <td style={{ ...td, textAlign:'center' }}>{Math.round(p.confidence * 100)}%</td>
                <td style={{ ...td, textAlign:'center' }}>{Math.round(p.agreement_pct * 100)}%</td>
                <td style={{ ...td, textAlign:'center' }}>
                  <span style={{ background:'var(--border)', borderRadius:4, padding:'1px 6px', fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)", fontSize:11 }}>
                    {p.horizon_minutes}m
                  </span>
                </td>
                <td style={{ ...td, textAlign:'right', color: p.final_pct_predicted >= 0 ? '#22c55e' : '#ef4444', fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" }}>
                  {p.final_pct_predicted >= 0 ? '+' : ''}{p.final_pct_predicted?.toFixed(2)}%
                </td>
                <td style={{ ...td, textAlign:'right', fontFamily:"var(--font-mono,'IBM Plex Mono',monospace)" }}>
                  {p.actual_pct != null
                    ? <span style={{ color: p.actual_pct >= 0 ? '#22c55e' : '#ef4444' }}>
                        {p.actual_pct >= 0 ? '+' : ''}{p.actual_pct.toFixed(2)}%
                      </span>
                    : <span style={{ color:'var(--text-hint)' }}>—</span>
                  }
                </td>
                <td style={{ ...td, textAlign:'center', fontSize:11, color:'var(--text-muted)' }}>
                  ↑{p.models_bullish} ↓{p.models_bearish} —{p.models_neutral}
                </td>
                {showStatus
                  ? <td style={{ ...td, textAlign:'center' }}>
                      <span style={{ fontSize:11, color: p.direction_correct === true ? '#22c55e' : p.direction_correct === false ? '#ef4444' : 'var(--text-hint)' }}>
                        {p.direction_correct === true ? 'Correcto' : p.direction_correct === false ? 'Incorrecto' : p.status}
                      </span>
                    </td>
                  : <td style={{ ...td, textAlign:'right' }}><CountdownCell iso={p.target_time} /></td>
                }
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Pagination controls ───────────────────────────────────────────────────────
function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize)
  if (pages <= 1) return null
  const btnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--text)' : 'var(--card)',
    color: active ? 'var(--bg)' : 'var(--text-muted)',
    border: '1px solid var(--border)', borderRadius: 5,
    padding: '4px 10px', fontSize: 12, cursor: active ? 'default' : 'pointer',
  })
  const nums: number[] = []
  for (let i = Math.max(0, page - 2); i <= Math.min(pages - 1, page + 2); i++) nums.push(i)
  return (
    <div style={{ display:'flex', gap:4, alignItems:'center', justifyContent:'center', padding:'12px 0 4px' }}>
      <button disabled={page === 0} onClick={() => onChange(page - 1)} style={{ ...btnStyle(false), opacity: page === 0 ? 0.4 : 1 }}>‹</button>
      {nums[0] > 0 && <><button onClick={() => onChange(0)} style={btnStyle(false)}>1</button><span style={{ color:'var(--text-hint)', fontSize:11 }}>…</span></>}
      {nums.map(n => <button key={n} onClick={() => onChange(n)} style={btnStyle(n === page)}>{n + 1}</button>)}
      {nums[nums.length - 1] < pages - 1 && <><span style={{ color:'var(--text-hint)', fontSize:11 }}>…</span><button onClick={() => onChange(pages - 1)} style={btnStyle(false)}>{pages}</button></>}
      <button disabled={page === pages - 1} onClick={() => onChange(page + 1)} style={{ ...btnStyle(false), opacity: page === pages - 1 ? 0.4 : 1 }}>›</button>
      <span style={{ fontSize:11, color:'var(--text-hint)', marginLeft:4 }}>{total} resultados</span>
    </div>
  )
}

// ── Main section ──────────────────────────────────────────────────────────────
export function IntradaySectionClient() {
  const [open, setOpen]       = useState<IntraConsensus[]>([])
  const [closed, setClosed]   = useState<IntraConsensus[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [showConfig, setShowConfig]   = useState(false)
  const [tab, setTab]         = useState<TabView>('open')
  const [filters, setFilters] = useState<Filters>({ ticker:'', direction:'', horizon:'' })
  const [page, setPage]       = useState(0)
  const marketOpen = isMarketOpen()

  const load = useCallback(async () => {
    const [{ data: openData }, { data: closedData }] = await Promise.all([
      supabase.from('consensus_predictions_intraday')
        .select('*, assets(ticker, name)').eq('status','open')
        .order('created_at', { ascending: false }).limit(500),
      supabase.from('consensus_predictions_intraday')
        .select('*, assets(ticker, name)').eq('status','closed')
        .order('closed_at', { ascending: false }).limit(300),
    ])
    setOpen((openData ?? []) as IntraConsensus[])
    setClosed((closedData ?? []) as IntraConsensus[])
    setLastRefresh(new Date()); setLoading(false)
  }, [])

  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id) }, [load])

  // Reset page when filters or tab change
  useEffect(() => setPage(0), [filters, tab])

  async function triggerNow() {
    setTriggering(true)
    await callFn('crear-prediccion-intraday', {})
    await load(); setTriggering(false)
  }

  // Apply filters
  function applyFilters(preds: IntraConsensus[]) {
    return preds.filter(p => {
      if (filters.ticker && !(p.assets?.ticker ?? '').includes(filters.ticker)) return false
      if (filters.direction && p.direction !== filters.direction) return false
      if (filters.horizon && p.horizon_minutes !== Number(filters.horizon)) return false
      return true
    })
  }

  const source       = tab === 'open' ? open : closed
  const filtered     = applyFilters(source)
  const paginated    = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const allTickers   = [...new Set(source.map(p => p.assets?.ticker ?? '?'))].sort()

  // Stats
  const today = new Date().toISOString().slice(0, 10)
  const closedToday = closed.filter(p => (p.closed_at ?? '').startsWith(today))
  const hitsToday   = closedToday.filter(p => p.direction_correct === true).length
  const accToday    = closedToday.length > 0 ? Math.round(hitsToday / closedToday.length * 100) : null

  const tabBtn = (t: TabView, label: string, count: number): React.CSSProperties => ({
    background: tab === t ? 'var(--text)' : 'var(--card)',
    color: tab === t ? 'var(--bg)' : 'var(--text-muted)',
    border: '1px solid var(--border)', borderRadius: 7,
    padding: '6px 14px', cursor: 'pointer', fontSize: 13,
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

      {/* Header row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <div style={{
            display:'inline-flex', alignItems:'center', gap:6,
            background: marketOpen ? '#22c55e18' : '#a3a3a318',
            border:`1px solid ${marketOpen ? '#22c55e40' : '#a3a3a340'}`,
            borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:600,
          }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background: marketOpen ? '#22c55e' : '#a3a3a3', display:'inline-block', boxShadow: marketOpen ? '0 0 6px #22c55e' : 'none' }} />
            {marketOpen ? 'Mercado abierto' : 'Mercado cerrado'}
          </div>
          {lastRefresh && <span style={{ fontSize:11, color:'var(--text-hint)' }}>{lastRefresh.toLocaleTimeString('es-AR')}</span>}
          {accToday != null && (
            <span style={{ fontSize:12, background:'var(--card)', border:'1px solid var(--border)', borderRadius:7, padding:'4px 12px' }}>
              Hoy: <strong style={{ color: accToday >= 60 ? '#22c55e' : accToday < 40 ? '#ef4444' : 'var(--text)' }}>
                {hitsToday}/{closedToday.length} ({accToday}%)
              </strong>
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:7 }}>
          <button onClick={() => setShowConfig(v => !v)} style={{
            background: showConfig ? 'var(--text)' : 'var(--card)', border:'1px solid var(--border)',
            borderRadius:7, padding:'6px 12px', cursor:'pointer', color: showConfig ? 'var(--bg)' : 'var(--text)', fontSize:12,
          }}>⚙ Assets</button>
          <button onClick={triggerNow} disabled={triggering} style={{
            background:'var(--card)', border:'1px solid var(--border)', borderRadius:7,
            padding:'6px 12px', cursor:'pointer', color:'var(--text)', fontSize:12, opacity: triggering ? 0.6 : 1,
          }}>{triggering ? 'Ejecutando...' : '⚡ Forzar ciclo'}</button>
        </div>
      </div>

      {/* Asset config panel */}
      {showConfig && (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'16px 18px' }}>
          <AssetSelector onSave={load} />
        </div>
      )}

      {loading && <p style={{ color:'var(--text-hint)', fontSize:14 }}>Cargando...</p>}

      {!loading && (
        <>
          {/* Tabs + filters */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={() => setTab('open')} style={tabBtn('open', 'Activas', open.length)}>
                Activas ({open.length})
              </button>
              <button onClick={() => setTab('closed')} style={tabBtn('closed', 'Cerradas', closed.length)}>
                Cerradas ({closed.length})
              </button>
            </div>
            <FiltersBar filters={filters} onChange={f => { setFilters(f) }} tickers={allTickers} />
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'40px 24px', textAlign:'center' }}>
              <p style={{ color:'var(--text-muted)', fontSize:14, margin:'0 0 8px' }}>
                {source.length === 0
                  ? tab === 'open'
                    ? marketOpen
                      ? 'No hay predicciones activas. Usá ⚡ Forzar ciclo.'
                      : 'El mercado está cerrado (9:30–16:00 ET).'
                    : 'No hay predicciones cerradas aún.'
                  : 'Ningún resultado para los filtros aplicados.'
                }
              </p>
            </div>
          )}

          {/* Table */}
          {paginated.length > 0 && (
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
              <PredTable preds={paginated} showStatus={tab === 'closed'} />
            </div>
          )}

          <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      )}

      <p style={{ fontSize:11, color:'var(--text-hint)', lineHeight:1.5 }}>
        13 modelos · horizontes 60, 120 y 240 min · auditoría automática al vencimiento
      </p>
    </div>
  )
}
