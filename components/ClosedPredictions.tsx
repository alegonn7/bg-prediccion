'use client'
import { useState } from 'react'
import { Pagination } from './Pagination'
import { SemaforoBadge } from './Semaforo'
import { bolsaKey, type ScorecardBolsa } from '@/lib/scorecard'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"
const COLS = '0.7fr 0.8fr 1fr 1fr 1fr 1fr 1.4fr'
const PAGE_SIZE = 15

type ClosedConsensus = {
  id: string
  direction: string
  direction_correct: boolean | null
  actual_final_pct: number | null
  final_pct_predicted: number | null
  agreement_pct: number | null
  target_date: string
  horizon_days: number
  asset_id: string
  assets: { ticker: string; name: string; currency: string } | null
}

type DateFilter = '7d' | '30d' | 'month' | 'all'

function filterByDate(items: ClosedConsensus[], filter: DateFilter): ClosedConsensus[] {
  if (filter === 'all') return items
  const now = new Date()
  return items.filter(r => {
    const d = new Date(r.target_date + 'T12:00:00')
    if (filter === '7d')    return now.getTime() - d.getTime() <= 7  * 86400000
    if (filter === '30d')   return now.getTime() - d.getTime() <= 30 * 86400000
    if (filter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    return true
  })
}

const DATE_FILTER_OPTS: { id: DateFilter; label: string }[] = [
  { id: '7d',    label: 'Últ. 7 días' },
  { id: '30d',   label: 'Últ. 30 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'all',   label: 'Todo' },
]

export function ClosedPredictionsSection({ results, scorecardBolsas = {} }: { results: ClosedConsensus[]; scorecardBolsas?: Record<string, ScorecardBolsa> }) {
  const [page, setPage] = useState(1)
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')

  const filtered = filterByDate(results, dateFilter)
  const hits    = filtered.filter(r => r.direction_correct === true).length
  const misses  = filtered.filter(r => r.direction_correct === false).length
  const accuracy = (hits + misses) > 0 ? (hits / (hits + misses) * 100).toFixed(1) : null

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flex: 1 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>03</span>
          <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
            Historial de cierres
          </h2>
          {filtered.length > 0 && (
            <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>
              {filtered.length} pred.{accuracy ? ` · ${accuracy}% correctas` : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {DATE_FILTER_OPTS.map(o => (
            <button
              key={o.id}
              onClick={() => { setDateFilter(o.id); setPage(1) }}
              style={{
                padding: '4px 11px', fontSize: 11, fontWeight: dateFilter === o.id ? 700 : 400,
                background: dateFilter === o.id ? 'var(--text)' : 'var(--bg-card)',
                color: dateFilter === o.id ? 'var(--bg)' : 'var(--text-muted)',
                border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                fontFamily: MONO,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          {results.length === 0
            ? 'Todavía no hay predicciones cerradas. Los cierres ocurren al llegar a la fecha objetivo.'
            : `Sin predicciones cerradas en el período seleccionado.`}
        </div>
      ) : (
        <>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '14px 24px',
              background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)',
              fontFamily: MONO, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-hint)',
            }}>
              <div>Acción</div>
              <div>Predijo</div>
              <div>Acuerdo</div>
              <div>Predicho</div>
              <div>Real</div>
              <div>Resultado</div>
              <div>Bolsa</div>
            </div>

            {pageItems.map((r, i) => {
              const asset    = r.assets
              const up       = r.direction === 'up'
              const correct  = r.direction_correct
              const predPct  = r.final_pct_predicted
              const actualPct = r.actual_final_pct
              const actualUp  = actualPct != null && actualPct >= 0
              const bolsa    = asset ? scorecardBolsas[bolsaKey(r.asset_id, asset.currency, r.horizon_days)] ?? null : null

              return (
                <div key={r.id} style={{
                  display: 'grid', gridTemplateColumns: COLS, gap: 12,
                  padding: '16px 24px',
                  borderBottom: i < pageItems.length - 1 ? '1px solid var(--border)' : undefined,
                  alignItems: 'center',
                }}>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>
                    {asset?.ticker ?? '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-muted)' }}>
                    <span style={{ color: up ? 'var(--up)' : 'var(--down)' }}>{up ? '↑' : '↓'}</span>
                    {up ? 'Subir' : 'Bajar'}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>
                    {r.agreement_pct != null ? `${r.agreement_pct}%` : '—'}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-muted)' }}>
                    {predPct != null ? `${predPct >= 0 ? '+' : ''}${predPct.toFixed(2)}%` : '—'}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: actualPct != null ? (actualUp ? 'var(--up)' : 'var(--down)') : 'var(--text-hint)' }}>
                    {actualPct != null ? `${actualUp ? '+' : ''}${actualPct.toFixed(2)}%` : '—'}
                  </div>
                  <div>
                    {correct != null ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                        borderRadius: 7, fontSize: 12, fontWeight: 600,
                        background: correct ? 'var(--up-soft)' : 'var(--down-soft)',
                        color: correct ? 'var(--up)' : 'var(--down)',
                      }}>
                        {correct ? '✓' : '✗'} {correct ? 'Acertó dirección' : 'Falló dirección'}
                      </span>
                    ) : (
                      <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>pendiente</span>
                    )}
                  </div>
                  <div><SemaforoBadge bolsa={bolsa} compact /></div>
                </div>
              )
            })}
          </div>

          <Pagination
            page={page}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          />

          <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-hint)', margin: '16px 4px 0', fontFamily: MONO }}>
            Cada fila es un consenso de hasta 4 votos (LGBM, Ridge, sentimiento, reversión). La predicción se congela al emitirse y no puede modificarse.
          </p>
        </>
      )}
    </section>
  )
}
