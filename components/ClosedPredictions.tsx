'use client'
import { useState } from 'react'
import { Pagination } from './Pagination'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"
const COLS = '0.7fr 0.8fr 1fr 1fr 1fr 1.4fr'
const PAGE_SIZE = 15

type ClosedConsensus = {
  id: string
  direction: string
  direction_correct: boolean | null
  actual_final_pct: number | null
  final_pct_predicted: number | null
  agreement_pct: number | null
  target_date: string
  assets: { ticker: string; name: string } | null
}

export function ClosedPredictionsSection({ results }: { results: ClosedConsensus[] }) {
  const [page, setPage] = useState(1)

  const pageItems = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>03</span>
        <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
          Historial de cierres
        </h2>
        {results.length > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>{results.length} total</span>
        )}
      </div>

      {results.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Todavía no hay predicciones cerradas. Los cierres ocurren al llegar a la fecha objetivo.
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
            </div>

            {pageItems.map((r, i) => {
              const asset    = r.assets
              const up       = r.direction === 'up'
              const correct  = r.direction_correct
              const predPct  = r.final_pct_predicted
              const actualPct = r.actual_final_pct
              const actualUp  = actualPct != null && actualPct >= 0

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
                </div>
              )
            })}
          </div>

          <Pagination
            page={page}
            totalItems={results.length}
            pageSize={PAGE_SIZE}
            onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          />

          <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-hint)', margin: '16px 4px 0', fontFamily: MONO }}>
            Cada fila es un consenso de 16 modelos. La predicción se congela al emitirse y no puede modificarse.
          </p>
        </>
      )}
    </section>
  )
}
