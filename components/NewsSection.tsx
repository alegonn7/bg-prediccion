'use client'
import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const CACHE_KEY = 'noticias_cache_v3'
const CACHE_TTL_MS = 4 * 60 * 60 * 1000

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"

const TOPIC_LABELS: Record<string, string> = {
  fed_tasas:    'Fed · Tasas',
  tech_ai:      'Tech · IA',
  farmaceutico: 'Farmacéutico',
  macro:        'Macro',
  bonos:        'Bonos',
  energia:      'Energía',
  banca:        'Banca',
  geopolitica:  'Geopolítica',
  mercado:      'Mercado',
  quantum:      'Quantum',
}

type Impact = {
  ticker: string
  direction: 'up' | 'down'
  effect: 'favorece' | 'perjudica' | 'neutro'
  razon: string
}

type NewsItem = {
  id: string
  headline_es: string
  headline_en: string
  summary: string
  source: string
  url: string
  datetime: number
  topics: string[]
  sentiment: 'positive' | 'negative' | 'neutral'
  impacts: Impact[]
}

type NewsData = {
  generated_at: string
  conclusion: string | null
  gemini_error?: string | null
  news: NewsItem[]
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 120) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return 'ayer'
}

function TopicBadge({ id }: { id: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      background: 'var(--bg-muted)', border: '1px solid var(--border)',
      fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em',
    }}>
      {TOPIC_LABELS[id] ?? id}
    </span>
  )
}

function ImpactRow({ impact }: { impact: Impact }) {
  const [open, setOpen] = useState(false)
  const favors = impact.effect === 'favorece'
  const harms  = impact.effect === 'perjudica'
  const color  = favors ? 'var(--up)' : harms ? 'var(--down)' : 'var(--text-hint)'
  const bg     = favors ? 'rgba(34,197,94,0.1)' : harms ? 'rgba(239,68,68,0.1)' : 'var(--bg-muted)'
  const label  = favors ? 'favorece predicción' : harms ? 'perjudica predicción' : 'sin impacto directo'
  // Arrow reflects portfolio effect (green=↑ good, red=↓ bad), not raw stock direction
  const arrow  = favors ? '↑' : harms ? '↓' : impact.direction === 'up' ? '↑' : '↓'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: impact.razon ? 'pointer' : 'default' }}
        onClick={() => impact.razon && setOpen(v => !v)}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 9px',
          borderRadius: 999, background: bg, border: `1px solid ${color}`,
          fontFamily: MONO, fontSize: 11, color, fontWeight: 600, whiteSpace: 'nowrap',
        }}>
          {arrow} {impact.ticker}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {label}
          {impact.razon && (
            <span style={{ color: 'var(--text-hint)', marginLeft: 5, fontSize: 10 }}>
              {open ? '▲' : '▾'}
            </span>
          )}
        </span>
      </div>
      {open && impact.razon && (
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
          padding: '7px 12px', background: 'var(--bg-muted)',
          borderRadius: 8, marginLeft: 4,
        }}>
          {impact.razon}
        </div>
      )}
    </div>
  )
}

function NewsCard({ item }: { item: NewsItem }) {
  const [expanded, setExpanded] = useState(false)
  const sentColor  = item.sentiment === 'positive' ? 'var(--up)' : item.sentiment === 'negative' ? 'var(--down)' : 'var(--text-hint)'
  const sentMark   = item.sentiment === 'positive' ? '+' : item.sentiment === 'negative' ? '−' : '·'
  const hasImpacts = item.impacts.length > 0
  const hasSummary = !!item.summary

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Meta row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: sentColor, fontWeight: 700, lineHeight: 1 }}>
            {sentMark}
          </span>
          {item.topics.map(t => <TopicBadge key={t} id={t} />)}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {item.source} · {timeAgo(item.datetime)}
        </span>
      </div>

      {/* Headline */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        {item.url ? (
          <a
            href={item.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.45, color: 'var(--text)', textDecoration: 'none', flex: 1 }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            {item.headline_es}
          </a>
        ) : (
          <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.45, color: 'var(--text)', flex: 1 }}>
            {item.headline_es}
          </span>
        )}
        {hasSummary && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              appearance: 'none', border: '1px solid var(--border)', borderRadius: 6,
              background: expanded ? 'var(--bg-muted)' : 'transparent',
              color: 'var(--text-hint)', fontFamily: MONO, fontSize: 10,
              padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {expanded ? 'ocultar' : 'ver más'}
          </button>
        )}
      </div>

      {/* Summary (Finnhub raw, no AI) */}
      {expanded && hasSummary && (
        <p style={{
          fontSize: 13, lineHeight: 1.65, color: 'var(--text-muted)', margin: 0,
          padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8,
        }}>
          {item.summary}
        </p>
      )}

      {/* Impacts */}
      {hasImpacts && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          {item.impacts.map((imp, i) => <ImpactRow key={i} impact={imp} />)}
        </div>
      )}
    </div>
  )
}

function createSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export function NewsSectionClient() {
  const [data, setData] = useState<NewsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    if (!force) {
      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const { payload, at } = JSON.parse(cached)
          if (Date.now() - at < CACHE_TTL_MS) { setData(payload); return }
        }
      } catch { /* ignore */ }
    }

    setLoading(true)
    setError(null)
    try {
      const supabase = createSupabase()
      const { data: res, error: err } = await supabase.functions.invoke('noticias-mercado', force ? { body: { force: true } } : undefined)
      if (err) throw new Error(err.message)
      if (!res?.ok) throw new Error(res?.error ?? 'Error desconocido')
      if (res.gemini_error) console.warn('[noticias] Gemini error:', res.gemini_error)
      setData(res as NewsData)
      localStorage.setItem(CACHE_KEY, JSON.stringify({ payload: res, at: Date.now() }))
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const genTime = data?.generated_at
    ? new Date(data.generated_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <section style={{ marginBottom: 64 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>06</span>
          <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
            Noticias del mercado
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {genTime && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>
              actualizado {genTime}
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={loading}
            style={{
              appearance: 'none', border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--bg-card)', color: 'var(--text-muted)',
              fontFamily: MONO, fontSize: 11, padding: '5px 12px',
              cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Cargando…' : '↻ Actualizar'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '14px 18px', borderRadius: 10, marginBottom: 20, fontSize: 13,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          color: 'var(--down)',
        }}>
          Error al cargar noticias: {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[120, 90, 110].map((h, i) => (
            <div key={i} style={{ height: h, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, opacity: 0.4 }} />
          ))}
        </div>
      )}

      {/* AI conclusion */}
      {data?.conclusion && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderLeft: '3px solid var(--text-muted)',
          borderRadius: 12, padding: '18px 22px', marginBottom: 20,
        }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
            Análisis · IA
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text)', margin: 0 }}>
            {data.conclusion}
          </p>
        </div>
      )}
      {data && !data.conclusion && data.news.length > 0 && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 12,
          color: 'var(--text-hint)', border: '1px solid var(--border)',
          fontFamily: MONO,
        }}>
          análisis IA no disponible · mostrando titulares en inglés
        </div>
      )}

      {/* News cards */}
      {data && data.news.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.news.map(item => <NewsCard key={item.id} item={item} />)}
        </div>
      )}

      {/* Empty */}
      {data && data.news.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          color: 'var(--text-muted)', fontSize: 14,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
        }}>
          No hay noticias relevantes en este momento. Intentá más tarde o fuera de fin de semana.
        </div>
      )}
    </section>
  )
}
