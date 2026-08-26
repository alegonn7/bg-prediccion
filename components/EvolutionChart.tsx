'use client'
import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts'
import { formatMoney, type Currency, type CapitalCurvePoint } from '@/lib/tracking'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"

type RangeKey = '7d' | '15d' | '30d' | '1m' | 'custom'
const RANGE_LABELS: Record<RangeKey, string> = {
  '7d': 'Última semana', '15d': '15 días', '30d': '30 días', '1m': 'Último mes', custom: 'Fecha libre',
}

function rangeStart(key: RangeKey, now: Date, customFrom: string): Date {
  if (key === 'custom') return customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(now.getTime() - 30 * 86400000)
  if (key === '1m') { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d }
  const days = key === '7d' ? 7 : key === '15d' ? 15 : 30
  return new Date(now.getTime() - days * 86400000)
}

// Etapa 30 (26/08/2026, a pedido explícito del usuario): valor de la curva en un instante
// arbitrario `t` — última fila conocida ANTES o EN `t` (carry-forward), o el primer punto de la
// curva si `t` es anterior a toda la historia. Es la base para "rebasar" el gráfico al inicio del
// período elegido, no al inicio de toda la cuenta.
function valueAt(curve: CapitalCurvePoint[], t: number): number {
  let v = curve[0]?.capital ?? 0
  for (const p of curve) {
    const pt = new Date(p.date).getTime()
    if (pt <= t) v = p.capital
    else break
  }
  return v
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

type ChartPoint = { ts: number; dateLabel: string; capital: number; above: number | null; below: number | null; trend: number }

// Etapa 30 (26/08/2026): separa la curva en dos series (arriba/abajo de la base del período) para
// pintar cada tramo del color que corresponde — Recharts no tiene una forma directa de colorear un
// solo <Line> por tramo, así que se arman dos <Line> superpuestas con un punto interpolado exacto
// en cada cruce de la base (mismo valor en `above` y `below` ahí) para que ambos tramos empalmen
// sin salto visual, en vez de una sola línea que ignora si viene de arriba o de abajo.
function splitByBaseline(points: { date: string; capital: number }[], baseline: number): { ts: number; capital: number; above: number | null; below: number | null }[] {
  const out: { ts: number; capital: number; above: number | null; below: number | null }[] = []
  const isAbove = (v: number) => v >= baseline
  for (let i = 0; i < points.length; i++) {
    const cur = points[i]
    const ts = new Date(cur.date).getTime()
    if (i > 0) {
      const prev = points[i - 1]
      const prevTs = new Date(prev.date).getTime()
      if (isAbove(prev.capital) !== isAbove(cur.capital) && cur.capital !== prev.capital) {
        const frac = (baseline - prev.capital) / (cur.capital - prev.capital)
        const crossTs = prevTs + frac * (ts - prevTs)
        out.push({ ts: crossTs, capital: baseline, above: baseline, below: baseline })
      }
    }
    const above = isAbove(cur.capital)
    out.push({ ts, capital: cur.capital, above: above ? cur.capital : null, below: above ? null : cur.capital })
  }
  return out
}

function linearTrend(points: { ts: number; capital: number }[]): (ts: number) => number {
  const n = points.length
  if (n < 2) return () => points[0]?.capital ?? 0
  const meanT = points.reduce((s, p) => s + p.ts, 0) / n
  const meanY = points.reduce((s, p) => s + p.capital, 0) / n
  let num = 0, den = 0
  for (const p of points) { num += (p.ts - meanT) * (p.capital - meanY); den += (p.ts - meanT) ** 2 }
  const slope = den === 0 ? 0 : num / den
  const intercept = meanY - slope * meanT
  return (ts: number) => slope * ts + intercept
}

export function EvolutionChart({ curve, currency }: { curve: CapitalCurvePoint[]; currency: Currency }) {
  const [range, setRange] = useState<RangeKey>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const now = useMemo(() => new Date(), [])
  const start = rangeStart(range, now, customFrom)
  const end = range === 'custom' && customTo ? new Date(`${customTo}T23:59:59`) : now
  const startTs = start.getTime()
  const endTs = end.getTime()

  const { chartData, baseline, maxVal, minVal, changePct } = useMemo(() => {
    const baseline = valueAt(curve, startTs)
    const windowed = curve.filter(p => {
      const t = new Date(p.date).getTime()
      return t > startTs && t <= endTs
    })
    const points = [{ date: start.toISOString(), capital: baseline }, ...windowed]
    const split = splitByBaseline(points, baseline)
    const trendFn = linearTrend(split.map(p => ({ ts: p.ts, capital: p.capital })))
    const chartData: ChartPoint[] = split.map(p => ({
      ts: p.ts, dateLabel: fmtDate(p.ts), capital: p.capital, above: p.above, below: p.below, trend: trendFn(p.ts),
    }))
    const vals = points.map(p => p.capital)
    const last = points[points.length - 1].capital
    return {
      chartData,
      baseline,
      maxVal: Math.max(...vals),
      minVal: Math.min(...vals),
      changePct: baseline > 0 ? ((last - baseline) / baseline) * 100 : 0,
    }
  }, [curve, startTs, endTs, start])

  const rangeBtn = (key: RangeKey) => ({
    background: range === key ? 'var(--text)' : 'var(--bg-muted)',
    color: range === key ? 'var(--bg)' : 'var(--text-muted)',
    border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', fontFamily: MONO,
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {(['7d', '15d', '30d', '1m', 'custom'] as RangeKey[]).map(key => (
          <button key={key} style={rangeBtn(key)} onClick={() => setRange(key)}>{RANGE_LABELS[key]}</button>
        ))}
      </div>
      {range === 'custom' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, fontSize: 11, color: 'var(--text-hint)' }}>
          Desde <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontFamily: MONO, fontSize: 11, color: 'var(--text)' }} />
          Hasta <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontFamily: MONO, fontSize: 11, color: 'var(--text)' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10, fontSize: 11 }}>
        <div>
          <span style={{ color: 'var(--text-hint)' }}>Período: </span>
          <span style={{ fontFamily: MONO }}>{fmtDate(startTs)} – {fmtDate(endTs)}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-hint)' }}>Base (inicio): </span>
          <span style={{ fontFamily: MONO }}>{formatMoney(baseline, currency)}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-hint)' }}>Máximo: </span>
          <span style={{ fontFamily: MONO, color: 'var(--up)' }}>{formatMoney(maxVal, currency)}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-hint)' }}>Mínimo: </span>
          <span style={{ fontFamily: MONO, color: 'var(--down)' }}>{formatMoney(minVal, currency)}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-hint)' }}>Tendencia del período: </span>
          <span style={{ fontFamily: MONO, fontWeight: 700, color: changePct >= 0 ? 'var(--up)' : 'var(--down)' }}>
            {changePct >= 0 ? '▲ +' : '▼ '}{changePct.toFixed(2)}%
          </span>
        </div>
      </div>

      {chartData.length >= 2 ? (
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="dateLabel" tick={{ fontFamily: MONO, fontSize: 9, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontFamily: MONO, fontSize: 9, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false}
              width={56} domain={['auto', 'auto']}
              tickFormatter={v => currency === 'usd' ? `$${Number(v).toFixed(0)}` : `${(Number(v) / 1000).toFixed(1)}k`}
            />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: MONO, fontSize: 11 }}
              formatter={(v, name) => [formatMoney(Number(v), currency), name === 'trend' ? 'Tendencia' : 'Capital']}
              labelFormatter={l => `Fecha: ${l}`}
            />
            <ReferenceLine y={baseline} stroke="var(--text-hint)" strokeDasharray="4 4" strokeWidth={1} />
            <Line type="monotone" dataKey="trend" stroke="var(--text-hint)" strokeWidth={1} strokeDasharray="2 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="above" stroke="var(--up)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="below" stroke="var(--down)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-hint)' }}>No hay suficientes datos en este período todavía.</p>
      )}
    </div>
  )
}
