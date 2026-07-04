import React from 'react'

const MONO   = "var(--font-mono, 'IBM Plex Mono', monospace)"
const CYCLES = 400

type ModelWeight = {
  model_name: string; weight: number | null
  direction_accuracy: number | null; sample_size: number | null; mae_avg: number | null
}

type G = { n: number; ok: number; acc: number | null; mae: number | null }

function computeGroup(preds: any[]): G {
  const evaled  = preds.filter((p: any) => p.direction_correct !== null)
  const n       = evaled.length
  const ok      = evaled.filter((p: any) => p.direction_correct).length
  const maePs   = evaled.filter((p: any) => p.actual_final_pct != null && p.final_pct_predicted != null)
  const mae     = maePs.length > 0
    ? maePs.reduce((s: number, p: any) => s + Math.abs(Number(p.actual_final_pct) - Number(p.final_pct_predicted)), 0) / maePs.length
    : null
  return { n, ok, acc: n > 0 ? ok / n * 100 : null, mae }
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
  typeLabel, horizonNote, g, dirTarget, maeTarget, totalCycles, isDaily,
}: {
  typeLabel: string; horizonNote: string; g: G
  dirTarget: number; maeTarget: number; totalCycles: number; isDaily: boolean
}) {
  const v         = verdict(g, dirTarget, maeTarget, isDaily)
  const progress  = Math.min(100, (totalCycles / CYCLES) * 100)
  const hasData   = g.n >= 1

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

// ─── Main export ─────────────────────────────────────────────────────────────

export function ScorecardSection({
  modelWeights, hits, total, closedPreds = [],
}: {
  modelWeights: ModelWeight[]; hits: number; total: number; closedPreds?: any[]
}) {
  const daily    = computeGroup(closedPreds.filter((p: any) => Number(p.horizon_days) >= 1))
  const intraday = computeGroup(closedPreds.filter((p: any) => Number(p.horizon_days) > 0 && Number(p.horizon_days) < 1))

  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>01</span>
        <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
          ¿El sistema funciona?
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <TypeCard
          typeLabel="Predicciones diarias"
          horizonNote="Horizonte de 1 a 90 días · modelo LGBM + Ridge · 16 modelos diarios"
          g={daily}
          dirTarget={65}
          maeTarget={2.0}
          totalCycles={daily.n}
          isDaily={true}
        />
        <TypeCard
          typeLabel="Predicciones intradiarias"
          horizonNote="Horizonte inferior a 1 día (horas) · 13 modelos intradiarios"
          g={intraday}
          dirTarget={60}
          maeTarget={1.0}
          totalCycles={intraday.n}
          isDaily={false}
        />
      </div>
    </section>
  )
}
