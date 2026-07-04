'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"
const CACHE_KEY = 'sugeridor_cache_v2'
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 días

type Popular  = { ticker: string; name: string; sector: string; desc: string }
type Radar    = { ticker: string; name: string; categoria: string; razon: string }
type MacroRec = { ticker: string; name: string; tema: string; tesis: string; catalizadores: string[]; conviction: number }

type Data = { populares: Popular[]; radar: Radar[]; macro: MacroRec[] }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const AUTH_HEADER  = 'Bearer ' + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function convictionColor(c: number) {
  if (c >= 0.75) return 'var(--up)'
  if (c >= 0.5)  return '#8bc34a'
  return 'var(--text-muted)'
}
function convictionLabel(c: number) {
  if (c >= 0.85) return 'Muy alta'
  if (c >= 0.7)  return 'Alta'
  if (c >= 0.5)  return 'Media'
  return 'Baja'
}

// ── Card genérica ──────────────────────────────────────────────────────────
function SuggestionCard({
  ticker, name, tag, tagColor = 'var(--text-hint)',
  body, onAdd, adding, added,
}: {
  ticker: string; name: string; tag: string; tagColor?: string
  body: React.ReactNode
  onAdd: () => void; adding: boolean; added: boolean
}) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700 }}>{ticker}</span>
            <span style={{
              fontSize: 10, fontFamily: MONO, padding: '2px 7px', borderRadius: 4,
              background: 'var(--bg-muted)', color: tagColor, border: `1px solid ${tagColor}44`,
            }}>{tag}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>{body}</div>

      <button
        onClick={onAdd}
        disabled={adding || added}
        style={{
          padding: '7px 14px', borderRadius: 7,
          border: '1px solid var(--border)',
          background: added ? 'var(--up-soft)' : 'var(--bg-muted)',
          color: added ? 'var(--up)' : 'var(--text)',
          fontFamily: MONO, fontSize: 11, fontWeight: 600,
          cursor: added ? 'default' : 'pointer',
          opacity: adding ? 0.5 : 1, alignSelf: 'flex-start', marginTop: 2,
        }}
      >
        {added ? '✓ Agregado' : adding ? 'Agregando…' : '+ Agregar a activos'}
      </button>
    </div>
  )
}

// ── Panel section ──────────────────────────────────────────────────────────
function SectionPanel({ num, title, subtitle, children }: {
  num: string; title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>{num}</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-hint)', margin: '0 0 16px', lineHeight: 1.5 }}>{subtitle}</p>
      {children}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export function AssetSuggestions({ trackedTickers, onAdded }: {
  trackedTickers: string[]
  onAdded: (ticker: string, name: string) => void
}) {
  const [data, setData]               = useState<Data | null>(null)
  const [loading, setLoading]         = useState(false)
  const [err, setErr]                 = useState<string | null>(null)
  const [adding, setAdding]           = useState<string | null>(null)
  const [addErr, setAddErr]           = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  function fetchData(force = false) {
    if (!force) {
      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const { ts, payload } = JSON.parse(cached)
          if (Date.now() - ts < CACHE_TTL) {
            setData(payload)
            setLastUpdated(ts)
            return
          }
        }
      } catch {}
    }

    setLoading(true)
    setErr(null)
    fetch(`${SUPABASE_URL}/functions/v1/sugeridor`, {
      method: 'POST',
      headers: { 'Authorization': AUTH_HEADER, 'Content-Type': 'application/json' },
      body: force ? JSON.stringify({ force: true }) : undefined,
    })
      .then(r => r.json())
      .then(d => {
        if (!d.ok) throw new Error(d.error ?? 'error')
        const payload: Data = { populares: d.populares, radar: d.radar, macro: d.macro }
        const ts = Date.now()
        setData(payload)
        setLastUpdated(ts)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts, payload })) } catch {}
      })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  async function handleAdd(ticker: string, name: string) {
    setAdding(ticker)
    setAddErr(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      const r = await fetch(`${SUPABASE_URL}/functions/v1/asset-config`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_asset', ticker, name }),
      })
      const res = await r.json()
      if (res.ok) {
        onAdded(ticker, name)
      } else {
        setAddErr(res.error ?? 'Error al agregar')
      }
    } catch (e) {
      setAddErr(String(e))
    } finally {
      setAdding(null)
    }
  }

  const tracked = new Set(trackedTickers)

  if (loading) return (
    <div style={{ padding: '32px 0', textAlign: 'center', fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>
      Analizando tendencias macro y armando recomendaciones…
    </div>
  )
  if (err) return (
    <div style={{ padding: 16, color: 'var(--down)', fontFamily: MONO, fontSize: 12 }}>
      Error al cargar sugerencias: {err}
    </div>
  )
  if (!data) return null

  function formatLastUpdated(ts: number) {
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    const hrs  = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 2)  return 'hace un momento'
    if (mins < 60) return `hace ${mins} min`
    if (hrs  < 24) return `hace ${hrs}h`
    return `hace ${days}d`
  }

  return (
    <div>
      {/* ── Header con última actualización y refresh ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
        marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)',
      }}>
        {lastUpdated && !loading && (
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>
            Actualizado {formatLastUpdated(lastUpdated)}
          </span>
        )}
        <button
          onClick={() => fetchData(true)}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--bg-muted)',
            color: 'var(--text-muted)', fontFamily: MONO, fontSize: 11,
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
          }}
        >
          <span style={{ display: 'inline-block', transform: loading ? 'rotate(360deg)' : 'none', transition: loading ? 'transform 1s linear' : 'none' }}>↻</span>
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {/* ── Error al agregar ── */}
      {addErr && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8,
          background: 'var(--down-soft)', color: 'var(--down)',
          fontFamily: MONO, fontSize: 12, border: '1px solid var(--down)',
        }}>
          Error al agregar: {addErr}
        </div>
      )}

      {/* ── Más manejados ── */}
      <SectionPanel
        num="A"
        title="Más operados del mercado"
        subtitle="Los activos con mayor volumen diario y cobertura global. Alta liquidez, spreads ajustados, fuerte cobertura de analistas."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {data.populares.filter(p => !tracked.has(p.ticker)).map(p => (
            <SuggestionCard
              key={p.ticker}
              ticker={p.ticker}
              name={p.name}
              tag={p.sector}
              body={p.desc}
              onAdd={() => handleAdd(p.ticker, p.name)}
              adding={adding === p.ticker}
              added={false}
            />
          ))}
        </div>
      </SectionPanel>

      {/* ── Fuera del radar ── */}
      <SectionPanel
        num="B"
        title="Fuera del radar"
        subtitle="Compañías con catalizadores reales pero baja cobertura mediática masiva. Mayor riesgo, mayor potencial de movimiento."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {data.radar.filter(r => !tracked.has(r.ticker)).map(r => (
            <SuggestionCard
              key={r.ticker}
              ticker={r.ticker}
              name={r.name}
              tag={r.categoria}
              tagColor="var(--text-muted)"
              body={r.razon}
              onAdd={() => handleAdd(r.ticker, r.name)}
              adding={adding === r.ticker}
              added={false}
            />
          ))}
        </div>
      </SectionPanel>

      {/* ── Con viento a favor macro ── */}
      <SectionPanel
        num="C"
        title="Con viento a favor macro"
        subtitle="Selección de IA basada en tendencias macroeconómicas y sectoriales globales. Horizonte: 6 a 12 meses. Se actualiza cada 24 horas."
      >
        {!data.macro || data.macro.length === 0 ? (
          <div style={{ padding: 20, background: 'var(--bg-muted)', borderRadius: 10, fontSize: 13, color: 'var(--text-hint)', textAlign: 'center' }}>
            No se pudieron generar recomendaciones macro en este momento.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.macro.filter(m => !tracked.has(m.ticker)).map(m => (
              <div key={m.ticker} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
                padding: '18px 20px',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{m.ticker}</span>
                      <span style={{
                        fontSize: 10, fontFamily: MONO, padding: '2px 8px', borderRadius: 4,
                        background: 'var(--bg-muted)', color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                      }}>{m.tema}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{m.name}</div>
                  </div>

                  {/* Conviction */}
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: convictionColor(m.conviction), fontWeight: 700 }}>
                      {convictionLabel(m.conviction)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 1 }}>convicción</div>
                    <div style={{ width: 60, height: 3, background: 'var(--bg-muted)', borderRadius: 999, marginTop: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${m.conviction * 100}%`, height: '100%', background: convictionColor(m.conviction), borderRadius: 999 }} />
                    </div>
                  </div>
                </div>

                {/* Tesis */}
                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: '0 0 12px' }}>{m.tesis}</p>

                {/* Catalizadores */}
                {m.catalizadores.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {m.catalizadores.map((cat, i) => (
                      <span key={i} style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 6,
                        background: 'var(--bg-muted)', color: 'var(--text-muted)',
                        border: '1px solid var(--border)', fontFamily: MONO,
                      }}>
                        {cat}
                      </span>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => handleAdd(m.ticker, m.name)}
                  disabled={adding === m.ticker || tracked.has(m.ticker)}
                  style={{
                    padding: '7px 14px', borderRadius: 7,
                    border: '1px solid var(--border)',
                    background: tracked.has(m.ticker) ? 'var(--up-soft)' : 'var(--bg-muted)',
                    color: tracked.has(m.ticker) ? 'var(--up)' : 'var(--text)',
                    fontFamily: MONO, fontSize: 11, fontWeight: 600,
                    cursor: tracked.has(m.ticker) ? 'default' : 'pointer',
                    opacity: adding === m.ticker ? 0.5 : 1,
                  }}
                >
                  {tracked.has(m.ticker) ? '✓ Agregado' : adding === m.ticker ? 'Agregando…' : '+ Agregar a activos'}
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionPanel>
    </div>
  )
}
