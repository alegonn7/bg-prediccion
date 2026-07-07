import React, { useState, useMemo } from 'react'
import type { ClosedIntradayPred } from '@/app/page'
import { ESTADO_META, type ScorecardBolsa, type Estado } from '@/lib/scorecard'
import { InfoTip } from './InfoTip'

const MONO   = "var(--font-mono, 'IBM Plex Mono', monospace)"
const CYCLES = 400

type ModelWeight = {
  model_name: string; weight: number | null
  direction_accuracy: number | null; sample_size: number | null; mae_avg: number | null
}

type G = {
  n: number; ok: number; acc: number | null; mae: number | null
  capturedPct: number | null; capturedN: number
}

// % del movimiento real capturado: final_pct_predicted / actual , solo cuando el signo coincide.
// Se ignoran movimientos reales casi nulos (<0.05%) porque el ratio se dispara sin aportar señal.
function computeCaptured(evaled: any[], actualField: string): { capturedPct: number | null; capturedN: number } {
  const ratios = evaled
    .filter(p => p.direction_correct && p[actualField] != null && p.final_pct_predicted != null && Math.abs(Number(p[actualField])) >= 0.05)
    .map(p => Number(p.final_pct_predicted) / Number(p[actualField]) * 100)
  return {
    capturedPct: ratios.length > 0 ? ratios.reduce((s, v) => s + v, 0) / ratios.length : null,
    capturedN: ratios.length,
  }
}

// Daily: actual_final_pct field
function computeDailyGroup(preds: any[]): G {
  const evaled = preds.filter((p: any) => p.direction_correct !== null)
  const n      = evaled.length
  const ok     = evaled.filter((p: any) => p.direction_correct).length
  const maePs  = evaled.filter((p: any) => p.actual_final_pct != null && p.final_pct_predicted != null)
  const mae    = maePs.length > 0
    ? maePs.reduce((s: number, p: any) => s + Math.abs(Number(p.actual_final_pct) - Number(p.final_pct_predicted)), 0) / maePs.length
    : null
  const { capturedPct, capturedN } = computeCaptured(evaled, 'actual_final_pct')
  return { n, ok, acc: n > 0 ? ok / n * 100 : null, mae, capturedPct, capturedN }
}

// Intraday: actual_pct field
function computeIntradayGroup(preds: ClosedIntradayPred[]): G {
  const evaled = preds.filter(p => p.direction_correct !== null)
  const n      = evaled.length
  const ok     = evaled.filter(p => p.direction_correct).length
  const maePs  = evaled.filter(p => p.actual_pct != null && p.final_pct_predicted != null)
  const mae    = maePs.length > 0
    ? maePs.reduce((s, p) => s + Math.abs(Number(p.actual_pct) - Number(p.final_pct_predicted)), 0) / maePs.length
    : null
  const { capturedPct, capturedN } = computeCaptured(evaled, 'actual_pct')
  return { n, ok, acc: n > 0 ? ok / n * 100 : null, mae, capturedPct, capturedN }
}

type DateRange = '30d' | '90d' | 'all'

type HorizonStat = { label: string; n: number; ok: number; acc: number | null; mae: number | null }

const DAILY_BUCKETS = [7, 14, 30, 60, 90]

function bucketLabel(h: number): string {
  return DAILY_BUCKETS.find(b => h <= b)?.toString().concat('d') ?? '90d'
}

function computeDailyByHorizon(preds: any[]): HorizonStat[] {
  const groups: Record<string, { n: number; ok: number; maeArr: number[] }> = {}
  for (const b of DAILY_BUCKETS) groups[`${b}d`] = { n: 0, ok: 0, maeArr: [] }
  for (const p of preds) {
    if (p.direction_correct === null) continue
    const lbl = bucketLabel(Number(p.horizon_days))
    if (!groups[lbl]) groups[lbl] = { n: 0, ok: 0, maeArr: [] }
    groups[lbl].n++
    if (p.direction_correct) groups[lbl].ok++
    if (p.actual_final_pct != null && p.final_pct_predicted != null)
      groups[lbl].maeArr.push(Math.abs(Number(p.actual_final_pct) - Number(p.final_pct_predicted)))
  }
  return DAILY_BUCKETS.map(b => {
    const g = groups[`${b}d`]
    return {
      label: `${b}d`,
      n: g.n, ok: g.ok,
      acc: g.n >= 3 ? g.ok / g.n * 100 : null,
      mae: g.maeArr.length >= 3 ? g.maeArr.reduce((s, v) => s + v, 0) / g.maeArr.length : null,
    }
  })
}

function computeIntradayByHorizon(preds: ClosedIntradayPred[]): HorizonStat[] {
  const groups: Record<number, { n: number; ok: number; maeArr: number[] }> = {}
  for (const p of preds) {
    if (p.direction_correct === null) continue
    const h = p.horizon_minutes
    if (!groups[h]) groups[h] = { n: 0, ok: 0, maeArr: [] }
    groups[h].n++
    if (p.direction_correct) groups[h].ok++
    if (p.actual_pct != null && p.final_pct_predicted != null)
      groups[h].maeArr.push(Math.abs(Number(p.actual_pct) - Number(p.final_pct_predicted)))
  }
  return Object.entries(groups)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([h, g]) => ({
      label: `${h}min`,
      n: g.n, ok: g.ok,
      acc: g.n >= 3 ? g.ok / g.n * 100 : null,
      mae: g.maeArr.length >= 3 ? g.maeArr.reduce((s, v) => s + v, 0) / g.maeArr.length : null,
    }))
}

function dirColor(v: number, target: number) {
  if (v >= target) return '#22c55e'
  if (v >= 54)     return '#d97706'
  return '#ef4444'
}
function maeColor(v: number, target: number) {
  if (v <= target)         return '#22c55e'
  if (v <= target * 1.75)  return '#d97706'
  return '#ef4444'
}
function capturedColor(v: number) {
  const dist = Math.abs(v - 100)
  if (dist <= 30) return '#22c55e'
  if (dist <= 60) return '#d97706'
  return '#ef4444'
}

function verdict(g: G, dirTarget: number, maeTarget: number, isDaily: boolean) {
  if (g.n === 0) return {
    dot: 'var(--text-hint)', badge: 'Sin datos aún',
    title: 'Todavía no hay predicciones cerradas evaluadas.',
    body: isDaily
      ? 'Las predicciones se cierran cuando vence su horizonte. Aparecerán aquí automáticamente.'
      : 'Las predicciones intradiarias se evalúan al cierre del mismo día. Volvé mañana.',
  }
  if (g.n < 15) return {
    dot: 'var(--text-hint)', badge: 'Datos insuficientes',
    title: `Solo ${g.n} predicción${g.n > 1 ? 'es' : ''} cerrada${g.n > 1 ? 's' : ''} — aún no se puede concluir nada.`,
    body: 'Hacen falta al menos 15 ciclos para filtrar el ruido estadístico y ver si hay una tendencia real.',
  }
  const acc = g.acc!
  const maeOk  = g.mae !== null && g.mae  <= maeTarget
  const maeNok = g.mae !== null && g.mae  >  maeTarget * 1.75

  if (acc >= dirTarget && maeOk) return {
    dot: '#22c55e', badge: 'Funcionando bien',
    title: '¡El sistema supera todos sus objetivos!',
    body: `Acertamos la dirección el ${acc.toFixed(0)}% de las veces (meta ${dirTarget}%) y la magnitud tiene un error promedio de ±${g.mae!.toFixed(1)}% (meta <${maeTarget}%). Claramente por encima del baseline del 54%.`,
  }
  if (acc >= dirTarget) return {
    dot: '#22c55e', badge: 'Dirección lograda',
    title: `Acertamos la dirección — la magnitud todavía tiene margen de mejora.`,
    body: `${acc.toFixed(0)}% de acierto en dirección (meta ${dirTarget}%). El error de magnitud es ±${g.mae?.toFixed(1) ?? '—'}% contra un objetivo de <${maeTarget}%.`,
  }
  if (acc >= 54) return {
    dot: '#d97706', badge: 'Señal positiva',
    title: 'Hay una ventaja sobre el baseline, pero todavía no alcanzamos el objetivo.',
    body: `${acc.toFixed(0)}% de acierto en dirección — por encima del 54% del baseline, pero el objetivo son ${dirTarget}%.${g.mae !== null ? ` El error de magnitud promedio es ±${g.mae.toFixed(1)}%.` : ''}`,
  }
  return {
    dot: '#ef4444', badge: 'Sin ventaja clara',
    title: 'Por ahora el sistema no supera al mercado.',
    body: `${acc.toFixed(0)}% de acierto en dirección — sin superar el baseline del 54%. Se necesitan más datos y posiblemente ajustes al modelo.`,
  }
}

// ─── Sub-component: one type block ───────────────────────────────────────────

function TypeCard({
  typeLabel, horizonNote, g, dirTarget, maeTarget, totalCycles, isDaily, horizonStats,
}: {
  typeLabel: string; horizonNote: string; g: G
  dirTarget: number; maeTarget: number; totalCycles: number; isDaily: boolean
  horizonStats: HorizonStat[]
}) {
  const v       = verdict(g, dirTarget, maeTarget, isDaily)
  const hasData = g.n >= 1

  // Find best horizons (min 3 predictions)
  const qualified    = horizonStats.filter(h => h.n >= 3)
  const bestDir      = qualified.length > 0 ? qualified.reduce((a, b) => (b.acc ?? -1) > (a.acc ?? -1) ? b : a) : null
  const bestMae      = qualified.filter(h => h.mae !== null).length > 0
    ? qualified.filter(h => h.mae !== null).reduce((a, b) => b.mae! < a.mae! ? b : a)
    : null

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 3 }}>
            {horizonNote}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{typeLabel}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 999, background: 'var(--bg-muted)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: v.dot, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.07em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{v.badge}</span>
        </div>
      </div>

      {/* Verdict */}
      <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3, margin: '0 0 10px', maxWidth: 620 }}>{v.title}</h3>
        <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-muted)', margin: 0, maxWidth: 620 }}>{v.body}</p>
      </div>

      {hasData && (
        <>
          {/* Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
            {/* Direction */}
            <div style={{ padding: '24px 28px', borderRight: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 14 }}>
                Dirección · sube o baja
              </div>
              <div style={{ fontFamily: MONO, fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', color: g.acc !== null ? dirColor(g.acc, dirTarget) : 'var(--text-hint)', marginBottom: 4 }}>
                {g.acc !== null ? `${g.acc.toFixed(0)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                acertamos {g.ok} de {g.n} predicciones
              </div>

              {/* Bar with markers */}
              <div style={{ position: 'relative', height: 10, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'visible', marginBottom: 10 }}>
                {g.acc !== null && (
                  <div style={{
                    height: '100%', width: `${Math.min(g.acc, 100)}%`,
                    background: dirColor(g.acc, dirTarget), borderRadius: 999, opacity: 0.8,
                  }} />
                )}
                {/* Baseline marker */}
                <div style={{ position: 'absolute', top: -2, left: '54%', width: 2, height: 14, background: 'var(--text-muted)', borderRadius: 1 }} />
                {/* Target marker */}
                <div style={{ position: 'absolute', top: -2, left: `${dirTarget}%`, width: 2, height: 14, background: '#22c55e', borderRadius: 1 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)' }}>
                <span>Baseline: 54%</span>
                <span style={{ color: '#22c55e' }}>Meta: {dirTarget}%</span>
              </div>
            </div>

            {/* MAE */}
            <div style={{ padding: '24px 28px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 14 }}>
                Magnitud · ¿cuánto?
              </div>
              {g.mae !== null ? (
                <>
                  <div style={{ fontFamily: MONO, fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', color: maeColor(g.mae, maeTarget), marginBottom: 4 }}>
                    ±{g.mae.toFixed(2)}%
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                    error medio de magnitud
                  </div>
                  {/* MAE bar (lower = better; scale 0–6%) */}
                  <div style={{ position: 'relative', height: 10, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'visible', marginBottom: 10 }}>
                    <div style={{
                      height: '100%', width: `${Math.min(g.mae / 6 * 100, 100)}%`,
                      background: maeColor(g.mae, maeTarget), borderRadius: 999, opacity: 0.8,
                    }} />
                    {/* Target marker */}
                    <div style={{ position: 'absolute', top: -2, left: `${maeTarget / 6 * 100}%`, width: 2, height: 14, background: '#22c55e', borderRadius: 1 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)' }}>
                    <span>0% (perfecto)</span>
                    <span style={{ color: '#22c55e' }}>Meta: &lt;{maeTarget}%</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 12, lineHeight: 1.55 }}>
                    Cuando predecimos "sube 3%", en promedio el número real queda a{' '}
                    <strong>±{g.mae.toFixed(1)} puntos</strong> de lo que dijimos.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-hint)' }}>
                  No hay datos de magnitud todavía — se necesita que las predicciones incluyan un valor esperado.
                </div>
              )}
            </div>
          </div>

          {/* % del movimiento real capturado */}
          <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
              % del movimiento real capturado (cuando acertamos la dirección)
            </div>
            {g.capturedPct !== null ? (
              <>
                <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: capturedColor(g.capturedPct) }}>
                  {g.capturedPct.toFixed(0)}%
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, maxWidth: 520 }}>
                  Promedio de <code>predicho ÷ real</code> sobre {g.capturedN} predicción{g.capturedN !== 1 ? 'es' : ''} con dirección correcta.
                  100% = predijimos exactamente la magnitud real; menos de 100% significa que nos quedamos cortos (ej. predecir +0.6% cuando la acción se movió +6%).
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-hint)' }}>
                Sin datos suficientes todavía (se necesitan predicciones cerradas con dirección correcta y movimiento real no nulo).
              </div>
            )}
          </div>

          {/* Per-horizon breakdown */}
          {horizonStats.some(h => h.n > 0) && (
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 14 }}>
                Por horizonte
                {bestDir && (
                  <span style={{ marginLeft: 14, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#22c55e' }}>
                    mejor dirección: <strong>{bestDir.label}</strong> ({bestDir.acc!.toFixed(0)}%)
                  </span>
                )}
                {bestMae && (
                  <span style={{ marginLeft: 14, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#3b82f6' }}>
                    mejor magnitud: <strong>{bestMae.label}</strong> (±{bestMae.mae!.toFixed(2)}%)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {horizonStats.filter(h => h.n > 0).map(h => {
                  const isBestDir = bestDir?.label === h.label
                  const isBestMae = bestMae?.label === h.label
                  const highlight = isBestDir || isBestMae
                  return (
                    <div key={h.label} style={{
                      flex: '1 1 80px', minWidth: 80,
                      background: isBestDir ? '#22c55e0d' : isBestMae ? '#3b82f60d' : 'var(--bg)',
                      border: `1px solid ${isBestDir ? '#22c55e44' : isBestMae ? '#3b82f644' : 'var(--border)'}`,
                      borderRadius: 8, padding: '10px 12px', textAlign: 'center',
                    }}>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: highlight ? 'var(--text)' : 'var(--text-hint)', fontWeight: highlight ? 700 : 400, marginBottom: 6 }}>
                        {h.label}
                        {isBestDir && <span style={{ marginLeft: 4, color: '#22c55e', fontSize: 9 }}>★dir</span>}
                        {isBestMae && !isBestDir && <span style={{ marginLeft: 4, color: '#3b82f6', fontSize: 9 }}>★mag</span>}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: h.acc !== null ? dirColor(h.acc, dirTarget) : 'var(--text-hint)', lineHeight: 1 }}>
                        {h.acc !== null ? `${h.acc.toFixed(0)}%` : '—'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-hint)', margin: '3px 0 5px' }}>dir</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: h.mae !== null ? maeColor(h.mae, maeTarget) : 'var(--text-hint)', fontWeight: 600 }}>
                        {h.mae !== null ? `±${h.mae.toFixed(1)}%` : '—'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 2 }}>n={h.n}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Progress */}
          <div style={{ padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ flex: 1, maxWidth: 400 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', marginBottom: 7 }}>
                <span>{g.n} ciclos evaluados de {CYCLES} necesarios</span>
                <span>{Math.min(g.n / CYCLES * 100, 100).toFixed(1)}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max(0.5, Math.min(g.n / CYCLES * 100, 100))}%`, background: 'var(--text-muted)', borderRadius: 999 }} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Resumen del semáforo de bolsas (Etapa 3) ────────────────────────────────
function BolsasSemaforoSummary({ scorecardBolsas }: { scorecardBolsas: Record<string, ScorecardBolsa> }) {
  const bolsas = Object.values(scorecardBolsas)
  const counts: Record<Estado, number> = { insuficiente: 0, acumulando: 0, validado: 0, sin_edge: 0 }
  for (const b of bolsas) counts[b.estado]++
  const order: Estado[] = ['validado', 'acumulando', 'sin_edge', 'insuficiente']

  if (bolsas.length === 0) return null

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
      boxShadow: 'var(--shadow)', padding: '20px 28px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Semáforo por bolsa</div>
        <InfoTip text='Una "bolsa" es un activo + moneda + horizonte específico. Cada una se evalúa contra su propio baseline empírico ("¿cuánto sube este activo, a este horizonte, en promedio?"), no contra un 50% fijo — y hace falta al menos 400 cierres para declarar "validado" o "sin edge confirmado".' />
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', marginLeft: 'auto' }}>{bolsas.length} bolsas activas</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {order.map(estado => {
          const meta = ESTADO_META[estado]
          return (
            <div key={estado} style={{ background: meta.bg, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.dot, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: meta.color }}>{counts[estado]}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

const DATE_OPTS: { id: DateRange; label: string }[] = [
  { id: '30d', label: 'Últ. 30d' },
  { id: '90d', label: 'Últ. 90d' },
  { id: 'all', label: 'Todo' },
]

export function ScorecardSection({
  modelWeights, hits, total, closedPreds = [], closedIntradayPreds = [], scorecardBolsas = {},
}: {
  modelWeights: ModelWeight[]; hits: number; total: number
  closedPreds?: any[]; closedIntradayPreds?: ClosedIntradayPred[]
  scorecardBolsas?: Record<string, ScorecardBolsa>
}) {
  const [dateRange, setDateRange] = useState<DateRange>('all')

  const filteredDaily = useMemo(() => {
    if (dateRange === 'all') return closedPreds
    const days   = dateRange === '30d' ? 30 : 90
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    return closedPreds.filter((p: any) => p.target_date >= cutoff)
  }, [closedPreds, dateRange])

  const filteredIntraday = useMemo(() => {
    if (dateRange === 'all') return closedIntradayPreds
    const days   = dateRange === '30d' ? 30 : 90
    const cutoff = new Date(Date.now() - days * 86400000).toISOString()
    return closedIntradayPreds.filter(p => (p.closed_at ?? p.created_at) >= cutoff)
  }, [closedIntradayPreds, dateRange])

  const daily           = computeDailyGroup(filteredDaily)
  const intraday        = computeIntradayGroup(filteredIntraday)
  const dailyByHorizon  = useMemo(() => computeDailyByHorizon(filteredDaily),    [filteredDaily])
  const intradayByHorizon = useMemo(() => computeIntradayByHorizon(filteredIntraday), [filteredIntraday])

  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>01</span>
        <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0, flex: 1 }}>
          ¿El sistema funciona?
        </h2>
        {/* Date range filter */}
        <div style={{ display: 'flex', gap: 5 }}>
          {DATE_OPTS.map(o => (
            <button key={o.id} onClick={() => setDateRange(o.id)} style={{
              padding: '5px 12px', fontSize: 11, fontFamily: MONO, border: '1px solid var(--border)', borderRadius: 6,
              cursor: 'pointer', fontWeight: dateRange === o.id ? 700 : 400,
              background: dateRange === o.id ? 'var(--text)' : 'var(--bg)',
              color: dateRange === o.id ? 'var(--bg)' : 'var(--text-muted)',
            }}>{o.label}</button>
          ))}
        </div>
      </div>

      <BolsasSemaforoSummary scorecardBolsas={scorecardBolsas} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <TypeCard
          typeLabel="Predicciones diarias"
          horizonNote="Horizonte de 1 a 90 días · modelo LGBM + Ridge · 16 modelos diarios"
          g={daily}
          dirTarget={65}
          maeTarget={2.0}
          totalCycles={daily.n}
          isDaily={true}
          horizonStats={dailyByHorizon}
        />
        <TypeCard
          typeLabel="Predicciones intradiarias"
          horizonNote="Dentro del mismo día de mercado · 13 modelos intradiarios"
          g={intraday}
          dirTarget={60}
          maeTarget={0.5}
          totalCycles={intraday.n}
          isDaily={false}
          horizonStats={intradayByHorizon}
        />
      </div>
    </section>
  )
}
