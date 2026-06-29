'use client'
import { useState, useMemo, useEffect } from 'react'
import { PredictionDetailModal } from './PredictionDetailModal'
import { InfoTip } from './InfoTip'
import { Pagination } from './Pagination'

const PAGE_SIZE = 9

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const AUTH_HEADER  = 'Bearer ' + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

async function callFn(slug: string, body: object) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: 'POST',
    headers: { 'Authorization': AUTH_HEADER, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
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
  current_price: number | null
  current_date: string | null
  price_path: any[] | null
  model_prediction_ids: string[] | null
  assets: { ticker: string; name: string; asset_class: string; currency: string } | null
}

type DirFilter = 'all' | 'up' | 'down'
type SortKey  = 'pct_desc' | 'pct_asc' | 'confidence' | 'agreement' | 'move_desc' | 'move_asc' | 'recent'

function timeAgo(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'hace 1 día'
  return `hace ${days} días`
}

function movePct(p: ConsensusPrediction) {
  return p.current_price != null
    ? ((p.current_price - p.price_at_creation) / p.price_at_creation) * 100
    : null
}

// ── Chip button ────────────────────────────────────────────────────────────
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 11px', borderRadius: 7, border: '1px solid',
        borderColor: active ? 'var(--text-muted)' : 'var(--border)',
        background: active ? 'var(--bg-muted)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text-hint)',
        fontFamily: MONO, fontSize: 11, fontWeight: active ? 600 : 400,
        cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'color 0.12s, border-color 0.12s, background 0.12s',
      }}
    >
      {label}
    </button>
  )
}

export function OpenPredictionsSection({ predictions: initialPredictions }: { predictions: ConsensusPrediction[] }) {
  const [predictions,    setPredictions]    = useState(initialPredictions)
  const [selected,       setSelected]       = useState<ConsensusPrediction | null>(null)
  const [dirFilter,      setDirFilter]      = useState<DirFilter>('all')
  const [horizonFilter,  setHorizonFilter]  = useState<number | null>(null)
  const [sortKey,        setSortKey]        = useState<SortKey>('pct_desc')
  const [confirming,     setConfirming]     = useState<string | null>(null)
  const [deleting,       setDeleting]       = useState<string | null>(null)
  const [page,           setPage]           = useState(1)

  async function handleDelete(id: string) {
    if (confirming !== id) { setConfirming(id); return }
    setDeleting(id)
    setConfirming(null)
    const res = await callFn('asset-config', { action: 'delete_prediction', prediction_id: id })
    if (res.ok) {
      setPredictions(prev => prev.filter(p => p.id !== id))
      if (selected?.id === id) setSelected(null)
    }
    setDeleting(null)
  }

  // Reset to page 1 whenever filters/sort change
  useEffect(() => { setPage(1) }, [dirFilter, horizonFilter, sortKey])

  const horizons = useMemo(
    () => [...new Set(predictions.map(p => p.horizon_days))].sort((a, b) => a - b),
    [predictions]
  )

  const visible = useMemo(() => {
    let list = [...predictions]
    if (dirFilter !== 'all') list = list.filter(p => p.direction === dirFilter)
    if (horizonFilter !== null) list = list.filter(p => p.horizon_days === horizonFilter)
    list.sort((a, b) => {
      switch (sortKey) {
        case 'pct_desc':    return b.final_pct_predicted - a.final_pct_predicted
        case 'pct_asc':     return a.final_pct_predicted - b.final_pct_predicted
        case 'confidence':  return b.confidence - a.confidence
        case 'agreement':   return b.agreement_pct - a.agreement_pct
        case 'move_desc':   return (movePct(b) ?? -Infinity) - (movePct(a) ?? -Infinity)
        case 'move_asc':    return (movePct(a) ?? Infinity)  - (movePct(b) ?? Infinity)
        case 'recent':      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        default: return 0
      }
    })
    return list
  }, [predictions, dirFilter, horizonFilter, sortKey])

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'pct_desc',   label: '% pred. ↓ mayor a menor' },
    { key: 'pct_asc',    label: '% pred. ↑ menor a mayor' },
    { key: 'confidence', label: 'Mayor confianza' },
    { key: 'agreement',  label: 'Mayor acuerdo' },
    { key: 'move_desc',  label: 'Mov. actual ↑' },
    { key: 'move_asc',   label: 'Mov. actual ↓' },
    { key: 'recent',     label: 'Más recientes' },
  ]

  return (
    <section style={{ marginBottom: 64 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>02</span>
        <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
          Predicciones activas
        </h2>
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>
          {visible.length}{visible.length !== predictions.length ? `/${predictions.length}` : ''}
        </span>
      </div>

      {predictions.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Sin predicciones de consenso activas. El pipeline corre cada día hábil a las 22:00 UTC.
        </div>
      ) : (
        <>
          {/* ── Filtros ── */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
            padding: '14px 16px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {/* Dirección */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', width: 68, flexShrink: 0 }}>Dirección</span>
              <Chip label="Todas"  active={dirFilter === 'all'}  onClick={() => setDirFilter('all')} />
              <Chip label="↑ Suben" active={dirFilter === 'up'}  onClick={() => setDirFilter('up')} />
              <Chip label="↓ Bajan" active={dirFilter === 'down'} onClick={() => setDirFilter('down')} />
            </div>

            {/* Horizonte */}
            {horizons.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', width: 68, flexShrink: 0 }}>Horizonte</span>
                <Chip label="Todos" active={horizonFilter === null} onClick={() => setHorizonFilter(null)} />
                {horizons.map(h => (
                  <Chip key={h} label={`${h}d`} active={horizonFilter === h} onClick={() => setHorizonFilter(h)} />
                ))}
              </div>
            )}

            {/* Ordenar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', width: 68, flexShrink: 0 }}>Ordenar</span>
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                style={{
                  fontFamily: MONO, fontSize: 11, padding: '5px 10px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--bg-muted)',
                  color: 'var(--text)', cursor: 'pointer', outline: 'none',
                }}
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Resultados */}
          {visible.length === 0 ? (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Ninguna predicción coincide con los filtros seleccionados.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                {visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(p => (
                  <ConsensusCard
                    key={p.id} p={p}
                    onClick={() => setSelected(p)}
                    onDelete={() => handleDelete(p.id)}
                    isConfirming={confirming === p.id}
                    onCancelDelete={() => setConfirming(null)}
                    isDeleting={deleting === p.id}
                  />
                ))}
              </div>
              <Pagination
                page={page}
                totalItems={visible.length}
                pageSize={PAGE_SIZE}
                onChange={setPage}
              />
            </>
          )}
        </>
      )}

      {selected && (
        <PredictionDetailModal
          prediction={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  )
}

function ConsensusCard({ p, onClick, onDelete, onCancelDelete, isConfirming, isDeleting }: {
  p: ConsensusPrediction
  onClick: () => void
  onDelete: () => void
  onCancelDelete: () => void
  isConfirming: boolean
  isDeleting: boolean
}) {
  const asset = p.assets
  const predPct = p.final_pct_predicted
  const up = predPct >= 0
  const confPct = Math.round(p.confidence * 100)
  const agreePct = p.agreement_pct ?? 0
  const dirColor = up ? 'var(--up)' : 'var(--down)'
  const dirSoft  = up ? 'var(--up-soft)' : 'var(--down-soft)'
  const movePct = p.current_price != null
    ? ((p.current_price - p.price_at_creation) / p.price_at_creation) * 100
    : null

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
        boxShadow: 'var(--shadow)', padding: 22, display: 'flex', flexDirection: 'column',
        cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--text-muted)'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow)'
      }}
    >
      {/* Top: ticker + direction badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 600, letterSpacing: '0.02em' }}>{asset?.ticker ?? '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 2 }}>{asset?.name ?? ''}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 8, background: dirSoft, flexShrink: 0 }}>
            <span style={{ fontSize: 13, color: dirColor }}>{up ? '↑' : '↓'}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: dirColor }}>{up ? 'SUBE' : 'BAJA'}</span>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)' }}>Ver detalle →</span>
        </div>
      </div>

      {/* Ensemble vote bar */}
      <div style={{ background: 'var(--bg-muted)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>Votos del ensamble</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>{p.models_total} modelos</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', gap: 1 }}>
          {p.models_bullish > 0 && (
            <div style={{ flex: p.models_bullish, background: 'var(--up)', borderRadius: 999 }} title={`${p.models_bullish} alcistas`} />
          )}
          {p.models_neutral > 0 && (
            <div style={{ flex: p.models_neutral, background: 'var(--text-hint)', borderRadius: 999 }} title={`${p.models_neutral} neutros`} />
          )}
          {p.models_bearish > 0 && (
            <div style={{ flex: p.models_bearish, background: 'var(--down)', borderRadius: 999 }} title={`${p.models_bearish} bajistas`} />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)' }}>
          <span style={{ color: 'var(--up)' }}>▲ {p.models_bullish}</span>
          {p.models_neutral > 0 && <span>— {p.models_neutral}</span>}
          <span style={{ color: 'var(--down)' }}>▼ {p.models_bearish}</span>
        </div>
      </div>

      {/* Confidence + agreement */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[
          {
            label: 'Confianza', value: `${confPct}%`, fill: confPct,
            tip: 'Promedio ponderado de la certeza de cada modelo sobre su propia predicción. Se basa en la fuerza de señales como RSI extremo, ADX alto o squeeze de Bollinger. No dice si la predicción es correcta, sino cuán convencido está el modelo.',
          },
          {
            label: 'Acuerdo', value: `${agreePct}%`, fill: agreePct,
            tip: 'Porcentaje de modelos que votan la misma dirección que la predicción final. 70% = 7 de 10 modelos coinciden. Puede haber mayoría alcista y aún así una predicción negativa, si los modelos bajistas tienen más confianza.',
          },
        ].map(m => (
          <div key={m.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: 'var(--text-hint)', display: 'flex', alignItems: 'center', gap: 5 }}>
                {m.label} <InfoTip text={m.tip} />
              </span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{m.value}</span>
            </div>
            <div style={{ height: 5, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${m.fill}%`, background: 'var(--text-muted)', borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Price grid: entry + current */}
      <div style={{ display: 'flex', background: 'var(--bg-muted)', borderRadius: 10, padding: '12px 0', marginBottom: 10 }}>
        <div style={{ flex: 1, padding: '0 14px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 3 }}>Al predecir</div>
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 500 }}>${p.price_at_creation?.toFixed(2)}</div>
        </div>
        <div style={{ flex: 1, padding: '0 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 3 }}>{p.current_price != null ? 'Hoy' : 'Precio actual'}</div>
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 500 }}>
            {p.current_price != null ? `$${p.current_price.toFixed(2)}` : '—'}
          </div>
        </div>
      </div>

      {/* Prediction target — own section */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: dirSoft, borderRadius: 10, padding: '14px 16px', marginBottom: 14,
        border: `1px solid ${up ? 'var(--up)' : 'var(--down)'}22`,
      }}>
        <div>
          <div style={{ fontSize: 11, color: dirColor, opacity: 0.75, marginBottom: 4 }}>
            Target a {p.horizon_days} días
          </div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: dirColor }}>
            ${(p.price_at_creation * (1 + predPct / 100)).toFixed(2)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: dirColor, opacity: 0.75, marginBottom: 4 }}>
            Variación esperada
          </div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: dirColor }}>
            {predPct >= 0 ? '+' : ''}{predPct?.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Current movement */}
      {movePct !== null && (
        <div style={{ background: (movePct >= 0 ? 'var(--up-soft)' : 'var(--down-soft)'), borderRadius: 8, padding: '8px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Movimiento actual</span>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: movePct >= 0 ? 'var(--up)' : 'var(--down)' }}>
            {movePct >= 0 ? '+' : ''}{movePct.toFixed(2)}%
          </span>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 'auto', paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-hint)', lineHeight: 1 }}>🔒</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', flex: 1 }}>
          Congelada · {timeAgo(p.created_at)} · vence {p.target_date}
        </span>

        {/* Delete controls */}
        {isDeleting ? (
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)' }}>Borrando…</span>
        ) : isConfirming ? (
          <div style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={onDelete}
              style={{
                padding: '3px 9px', borderRadius: 5, border: '1px solid var(--down)',
                background: 'var(--down-soft)', color: 'var(--down)',
                fontFamily: MONO, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Confirmar
            </button>
            <button
              onClick={onCancelDelete}
              style={{
                padding: '3px 9px', borderRadius: 5, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-hint)',
                fontFamily: MONO, fontSize: 10, cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            style={{
              padding: '3px 9px', borderRadius: 5, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-hint)',
              fontFamily: MONO, fontSize: 10, cursor: 'pointer',
              transition: 'color 0.12s, border-color 0.12s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--down)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--down)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-hint)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
            }}
          >
            Borrar
          </button>
        )}
      </div>
    </div>
  )
}
