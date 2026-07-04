'use client'
import { useState, useMemo } from 'react'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"
const DAILY_BUCKETS = [7, 14, 30, 60, 90]
const PAGE_SIZE = 10

type ClosedPred = {
  id: string
  direction: string
  direction_correct: boolean | null
  actual_final_pct: number | null
  final_pct_predicted: number | null
  confidence: number
  agreement_pct: number | null
  horizon_days: number
  target_date: string | null
  created_at: string
  asset_id: string
  assets: { ticker: string; name: string } | null
}

type DateRange  = '30d' | '90d' | 'all'
type SortTicker = 'n' | 'acc' | 'mae'

function maeColor(v: number) {
  if (v <= 1.5) return '#22c55e'
  if (v <= 3.5) return '#ca8a04'
  return '#ef4444'
}
function dirColor(v: number) {
  if (v >= 65) return '#22c55e'
  if (v >= 53) return '#ca8a04'
  return '#ef4444'
}
function absDiff(a: number, b: number) { return Math.abs(a - b) }

function bucketOf(horizonDays: number): number {
  return DAILY_BUCKETS.find(b => horizonDays <= b) ?? 90
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px', ...style }}>
      {children}
    </div>
  )
}
function SLabel({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 12, ...style }}>
      {children}
    </div>
  )
}

export function ModelAnalysisSection({ closedPreds }: { closedPreds: ClosedPred[] }) {
  const [dateRange,     setDateRange]     = useState<DateRange>('all')
  const [horizonFilter, setHorizonFilter] = useState<number | null>(null)
  const [sortTicker,    setSortTicker]    = useState<SortTicker>('n')
  const [page,          setPage]          = useState(0)

  function resetPage() { setPage(0) }
  function setHorizon(h: number | null) { setHorizonFilter(h); resetPage() }
  function setSort(s: SortTicker) { setSortTicker(s); resetPage() }

  // 1. filter by date
  const byDate = useMemo(() => {
    if (dateRange === 'all') return closedPreds
    const days  = dateRange === '30d' ? 30 : 90
    const cutoff = Date.now() - days * 86400000
    return closedPreds.filter(p => p.target_date && new Date(p.target_date + 'T12:00:00').getTime() >= cutoff)
  }, [closedPreds, dateRange])

  // 2. filter by horizon
  const evaled = useMemo(() => {
    const base = byDate.filter(p => p.direction_correct !== null)
    if (horizonFilter === null) return base
    return base.filter(p => bucketOf(Number(p.horizon_days)) === horizonFilter)
  }, [byDate, horizonFilter])

  const total   = evaled.length
  const correct = evaled.filter(p => p.direction_correct).length
  const globalAcc = total > 0 ? correct / total * 100 : null

  const maePs = evaled.filter(p => p.actual_final_pct != null && p.final_pct_predicted != null)
  const globalMae = maePs.length > 0
    ? maePs.reduce((s, p) => s + absDiff(Number(p.actual_final_pct), Number(p.final_pct_predicted)), 0) / maePs.length
    : null

  const avgAgr = evaled.length > 0
    ? evaled.reduce((s, p) => s + Number(p.agreement_pct ?? 0), 0) / evaled.length
    : null

  // By horizon (always over full byDate, not evaled — so the grid stays full)
  const byHorizonStats = useMemo(() => DAILY_BUCKETS.map((h, i) => {
    const lo     = DAILY_BUCKETS[i - 1] ?? 0
    const bucket = byDate.filter(p => p.direction_correct !== null && Number(p.horizon_days) > lo && Number(p.horizon_days) <= h)
    const n      = bucket.length
    const ok     = bucket.filter(p => p.direction_correct).length
    const mPs    = bucket.filter(p => p.actual_final_pct != null && p.final_pct_predicted != null)
    const m      = mPs.length > 0 ? mPs.reduce((s, p) => s + absDiff(Number(p.actual_final_pct), Number(p.final_pct_predicted)), 0) / mPs.length : null
    return { h, n, acc: n >= 3 ? ok / n * 100 : null, mae: m }
  }), [byDate])

  // By ticker
  const tickerList = useMemo(() => {
    const map: Record<string, { n: number; ok: number; maeArr: number[]; name: string }> = {}
    for (const p of evaled) {
      const t = p.assets?.ticker ?? '?'
      if (!map[t]) map[t] = { n: 0, ok: 0, maeArr: [], name: p.assets?.name ?? '' }
      map[t].n++
      if (p.direction_correct) map[t].ok++
      if (p.actual_final_pct != null && p.final_pct_predicted != null)
        map[t].maeArr.push(absDiff(Number(p.actual_final_pct), Number(p.final_pct_predicted)))
    }
    return Object.entries(map).map(([ticker, v]) => ({
      ticker,
      name: v.name,
      n: v.n,
      acc: v.n >= 3 ? v.ok / v.n * 100 : null,
      mae: v.maeArr.length > 0 ? v.maeArr.reduce((a, b) => a + b, 0) / v.maeArr.length : null,
    }))
  }, [evaled])

  const sortedTickers = useMemo(() => [...tickerList].sort((a, b) => {
    if (sortTicker === 'n')   return b.n - a.n
    if (sortTicker === 'acc') return (b.acc ?? -1) - (a.acc ?? -1)
    return (a.mae ?? 999) - (b.mae ?? 999)
  }), [tickerList, sortTicker])

  const totalPages   = Math.ceil(sortedTickers.length / PAGE_SIZE)
  const pageTickers  = sortedTickers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Confidence calibration (on evaled)
  const confBuckets = [
    { label: '<50%',   lo: 0,    hi: 0.50 },
    { label: '50-60%', lo: 0.50, hi: 0.60 },
    { label: '60-70%', lo: 0.60, hi: 0.70 },
    { label: '70-80%', lo: 0.70, hi: 0.80 },
    { label: '>80%',   lo: 0.80, hi: 1.01 },
  ].map(b => {
    const ps = evaled.filter(p => Number(p.confidence) >= b.lo && Number(p.confidence) < b.hi)
    const ok = ps.filter(p => p.direction_correct).length
    return { label: b.label, n: ps.length, acc: ps.length >= 3 ? ok / ps.length * 100 : null }
  })

  // Agreement calibration (on evaled)
  const agrBuckets = [
    { label: '<50%',   lo: 0,  hi: 50  },
    { label: '50-65%', lo: 50, hi: 65  },
    { label: '65-80%', lo: 65, hi: 80  },
    { label: '>80%',   lo: 80, hi: 101 },
  ].map(b => {
    const ps = evaled.filter(p => Number(p.agreement_pct ?? 0) >= b.lo && Number(p.agreement_pct ?? 0) < b.hi)
    const ok = ps.filter(p => p.direction_correct).length
    return { label: b.label, n: ps.length, acc: ps.length >= 3 ? ok / ps.length * 100 : null }
  })

  // Weekly trend (on evaled)
  const weeks = useMemo(() => {
    const weekMap: Record<string, { n: number; ok: number }> = {}
    for (const p of evaled.filter(p => p.target_date)) {
      const d  = new Date(p.target_date! + 'T12:00:00')
      const ms = d.getTime() - d.getDay() * 86400000
      const key = new Date(ms).toISOString().slice(0, 10)
      if (!weekMap[key]) weekMap[key] = { n: 0, ok: 0 }
      weekMap[key].n++
      if (p.direction_correct) weekMap[key].ok++
    }
    return Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10)
      .map(([date, v]) => ({ date, n: v.n, acc: v.n >= 3 ? v.ok / v.n * 100 : null }))
  }, [evaled])

  const DATE_OPTS: { id: DateRange; label: string }[] = [
    { id: '30d', label: 'Últ. 30d' },
    { id: '90d', label: 'Últ. 90d' },
    { id: 'all', label: 'Todo' },
  ]

  const pillBtn = (active: boolean, onClick: () => void, label: string) => (
    <button onClick={onClick} style={{
      padding: '4px 11px', fontSize: 11, fontFamily: MONO,
      fontWeight: active ? 700 : 400,
      background: active ? 'var(--text)' : 'var(--card)',
      color: active ? 'var(--bg)' : 'var(--text-muted)',
      border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
    }}>{label}</button>
  )

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 64 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 3 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>06</span>
              <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
                Análisis · predicciones cerradas
              </h2>
            </div>
            {total > 0 && (
              <p style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)', margin: 0 }}>
                {total} evaluadas{horizonFilter !== null && ` · H=${horizonFilter}d`} ·{' '}
                <span style={{ color: globalAcc !== null ? dirColor(globalAcc) : 'inherit', fontWeight: 600 }}>
                  {globalAcc?.toFixed(0)}% dirección
                </span>
                {globalMae !== null && (
                  <> · MAE <span style={{ color: maeColor(globalMae), fontWeight: 600 }}>±{globalMae.toFixed(2)}%</span></>
                )}
              </p>
            )}
          </div>
          {/* Date range */}
          <div style={{ display: 'flex', gap: 6 }}>
            {DATE_OPTS.map(o => pillBtn(dateRange === o.id, () => { setDateRange(o.id); resetPage() }, o.label))}
          </div>
        </div>

        {/* Horizon filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.08em' }}>HORIZONTE:</span>
          {pillBtn(horizonFilter === null, () => setHorizon(null), 'Todos')}
          {DAILY_BUCKETS.map(h => pillBtn(horizonFilter === h, () => setHorizon(h), `${h}d`))}
        </div>
      </div>

      {total === 0 ? (
        <Card>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            {horizonFilter !== null
              ? `No hay predicciones cerradas para H=${horizonFilter}d con los filtros actuales.`
              : 'Todavía no hay predicciones cerradas evaluadas. Aparecerán a medida que venzan las predicciones activas.'}
          </p>
        </Card>
      ) : (
        <>
          {/* Summary stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Card>
              <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 10 }}>Dirección correcta</div>
              <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: globalAcc !== null ? dirColor(globalAcc) : 'var(--text-hint)' }}>
                {globalAcc !== null ? `${globalAcc.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 4 }}>{correct} de {total} cerradas</div>
            </Card>
            <Card>
              <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 10 }}>Error de magnitud (MAE)</div>
              <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: globalMae !== null ? maeColor(globalMae) : 'var(--text-hint)' }}>
                {globalMae !== null ? `±${globalMae.toFixed(2)}%` : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 4 }}>promedio |real − predicho|</div>
            </Card>
            <Card>
              <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 10 }}>Acuerdo de modelos</div>
              <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: 'var(--text-muted)' }}>
                {avgAgr !== null ? `${avgAgr.toFixed(0)}%` : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 4 }}>promedio de consenso</div>
            </Card>
          </div>

          {/* By horizon — clickable cards */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <SLabel style={{ marginBottom: 0 }}>Por horizonte</SLabel>
              {horizonFilter !== null && (
                <button onClick={() => setHorizon(null)} style={{
                  fontSize: 10, fontFamily: MONO, color: 'var(--text-hint)', background: 'none',
                  border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer',
                }}>
                  × ver todos
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${DAILY_BUCKETS.length}, 1fr)`, gap: 8 }}>
              {byHorizonStats.map(({ h, n, acc, mae: m }) => {
                const isSelected = horizonFilter === h
                const hasData = n > 0
                return (
                  <div
                    key={h}
                    onClick={() => hasData && setHorizon(isSelected ? null : h)}
                    style={{
                      background: isSelected ? 'var(--bg-muted, #f3f4f6)' : 'var(--bg)',
                      borderRadius: 8, padding: '12px 10px', textAlign: 'center',
                      border: isSelected
                        ? `2px solid ${acc !== null ? dirColor(acc) : 'var(--text-muted)'}`
                        : `1px solid ${acc !== null ? dirColor(acc) + '33' : 'var(--border)'}`,
                      cursor: hasData ? 'pointer' : 'default',
                      transition: 'border 0.1s, background 0.1s',
                    }}
                  >
                    <div style={{ fontSize: 11, color: isSelected ? 'var(--text)' : 'var(--text-hint)', marginBottom: 8, fontWeight: isSelected ? 700 : 400 }}>
                      {h}d
                    </div>
                    {acc !== null ? (
                      <>
                        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: dirColor(acc) }}>{acc.toFixed(0)}%</div>
                        <div style={{ fontSize: 10, color: 'var(--text-hint)', margin: '2px 0 6px' }}>dir</div>
                        {m !== null && (
                          <div style={{ fontFamily: MONO, fontSize: 12, color: maeColor(m), fontWeight: 600 }}>±{m.toFixed(1)}%</div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 4 }}>n={n}</div>
                      </>
                    ) : (
                      <div style={{ color: 'var(--text-hint)', fontSize: 11 }}>—<br /><span style={{ fontSize: 10 }}>n={n}</span></div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-hint)' }}>
              Clic en un horizonte para filtrar toda la sección
            </div>
          </Card>

          {/* Confidence calibration + Agreement */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card>
              <SLabel>Calibración de confianza</SLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {confBuckets.map(b => (
                  <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', minWidth: 50 }}>{b.label}</span>
                    <div style={{ flex: 1, height: 12, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                      {b.acc !== null && (
                        <div style={{ height: '100%', width: `${Math.min(b.acc, 100)}%`, background: dirColor(b.acc), opacity: 0.75, borderRadius: 4 }} />
                      )}
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: b.acc !== null ? dirColor(b.acc) : 'var(--text-hint)', minWidth: 36, textAlign: 'right' }}>
                      {b.acc !== null ? `${b.acc.toFixed(0)}%` : '—'}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', minWidth: 30, textAlign: 'right' }}>n={b.n}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-hint)' }}>
                Bien calibrado: confianza 70% → acierto ~70%
              </div>
            </Card>

            <Card>
              <SLabel>Acuerdo entre modelos</SLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {agrBuckets.map(b => (
                  <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', minWidth: 54 }}>{b.label}</span>
                    <div style={{ flex: 1, height: 12, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                      {b.acc !== null && (
                        <div style={{ height: '100%', width: `${Math.min(b.acc, 100)}%`, background: dirColor(b.acc), opacity: 0.75, borderRadius: 4 }} />
                      )}
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: b.acc !== null ? dirColor(b.acc) : 'var(--text-hint)', minWidth: 36, textAlign: 'right' }}>
                      {b.acc !== null ? `${b.acc.toFixed(0)}%` : '—'}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', minWidth: 30, textAlign: 'right' }}>n={b.n}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-hint)' }}>
                Mayor acuerdo entre los 16 modelos → mayor probabilidad de acertar
              </div>
            </Card>
          </div>

          {/* Weekly accuracy trend */}
          {weeks.length >= 2 && (
            <Card>
              <SLabel>Tendencia semanal — % dirección correcta</SLabel>
              <div style={{ display: 'flex', gap: 6, height: 56, alignItems: 'flex-end' }}>
                {weeks.map(w => (
                  <div key={w.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: '100%', height: 44, position: 'relative', background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                      {w.acc !== null && (
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0,
                          height: `${Math.min(w.acc, 100)}%`,
                          background: dirColor(w.acc), opacity: 0.8,
                        }} />
                      )}
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-hint)' }}>
                      {w.acc !== null ? `${w.acc.toFixed(0)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 4 }}>
                Cada barra = una semana · últimas {weeks.length} semanas con cierre
              </div>
            </Card>
          )}

          {/* Per ticker with pagination */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <SLabel style={{ marginBottom: 0 }}>Por activo</SLabel>
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>
                  {sortedTickers.length} activos
                </span>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {([['n', 'Más pred.'], ['acc', '% Dir.'], ['mae', 'Menor MAE']] as [SortTicker, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => setSort(k)} style={{
                    padding: '3px 9px', fontSize: 10, fontFamily: MONO, border: '1px solid var(--border)',
                    borderRadius: 5, cursor: 'pointer', fontWeight: sortTicker === k ? 700 : 400,
                    background: sortTicker === k ? 'var(--text)' : 'var(--bg)',
                    color: sortTicker === k ? 'var(--bg)' : 'var(--text-muted)',
                  }}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {[
                      { label: 'Ticker',       align: 'left'   as const },
                      { label: 'Predicciones', align: 'center' as const },
                      { label: '% Dirección',  align: 'center' as const },
                      { label: 'MAE',          align: 'center' as const },
                      { label: 'Últimas',      align: 'left'   as const },
                    ].map(h => (
                      <th key={h.label} style={{ padding: '6px 10px', textAlign: h.align, color: 'var(--text-hint)', fontWeight: 500, fontSize: 11 }}>{h.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageTickers.map(t => {
                    const recent = evaled.filter(p => p.assets?.ticker === t.ticker).slice(0, 12)
                    return (
                      <tr key={t.ticker} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 700, fontFamily: MONO, fontSize: 12 }}>{t.ticker}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center', fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)' }}>{t.n}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center', fontFamily: MONO, fontWeight: 600, color: t.acc !== null ? dirColor(t.acc) : 'var(--text-hint)' }}>
                          {t.acc !== null ? `${t.acc.toFixed(0)}%` : '—'}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'center', fontFamily: MONO, color: t.mae !== null ? maeColor(t.mae) : 'var(--text-hint)' }}>
                          {t.mae !== null ? `±${t.mae.toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {recent.map((p, i) => (
                              <div
                                key={i}
                                title={`${p.direction_correct ? 'acertó' : 'falló'} · confianza ${(Number(p.confidence) * 100).toFixed(0)}%`}
                                style={{
                                  width: 9, height: 9, borderRadius: '50%',
                                  background: p.direction_correct ? '#22c55e' : '#ef4444',
                                  opacity: 0.35 + Number(p.confidence) * 0.65,
                                  flexShrink: 0,
                                }}
                              />
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedTickers.length)} de {sortedTickers.length} activos
                </span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    onClick={() => setPage(p => p - 1)}
                    disabled={page === 0}
                    style={{
                      padding: '5px 12px', fontSize: 11, fontFamily: MONO,
                      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
                      cursor: page === 0 ? 'default' : 'pointer',
                      color: page === 0 ? 'var(--text-hint)' : 'var(--text-muted)',
                      opacity: page === 0 ? 0.4 : 1,
                    }}
                  >
                    ← Anterior
                  </button>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', padding: '0 4px' }}>
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= totalPages - 1}
                    style={{
                      padding: '5px 12px', fontSize: 11, fontFamily: MONO,
                      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
                      cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                      color: page >= totalPages - 1 ? 'var(--text-hint)' : 'var(--text-muted)',
                      opacity: page >= totalPages - 1 ? 0.4 : 1,
                    }}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </section>
  )
}
