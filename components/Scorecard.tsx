import React from 'react'

type ModelWeight = {
  model_name: string
  weight: number | null
  direction_accuracy: number | null
  sample_size: number | null
  mae_avg: number | null
}

const TARGET = 400
const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"

function computeGroup(preds: any[]) {
  const evaled = preds.filter((p: any) => p.direction_correct !== null)
  const n   = evaled.length
  const ok  = evaled.filter((p: any) => p.direction_correct).length
  const maePs = evaled.filter((p: any) => p.actual_final_pct != null && p.final_pct_predicted != null)
  const mae   = maePs.length > 0
    ? maePs.reduce((s: number, p: any) => s + Math.abs(Number(p.actual_final_pct) - Number(p.final_pct_predicted)), 0) / maePs.length
    : null
  return { n, ok, acc: n > 0 ? ok / n * 100 : null, mae }
}

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

function getVerdict(total: number, hits: number, mae: number | null) {
  const acc = total > 0 ? hits / total : null
  if (total === 0) return {
    status: 'Indeterminado', dotColor: 'var(--text-hint)',
    title: 'Todavía no hay datos.',
    body: 'El sistema aún no tiene predicciones de consenso cerradas. Volvé cuando las haya.',
  }
  if (total < 20) return {
    status: 'Indeterminado', dotColor: 'var(--text-hint)',
    title: 'Todavía no se puede concluir nada.',
    body: `Con solo ${total} predicciones, cualquier resultado es ruido estadístico. Hacen falta decenas de ciclos cerrados.`,
  }
  const accPct = Math.round((acc ?? 0) * 100)
  const maeText = mae !== null ? ` El error promedio de magnitud es ±${mae.toFixed(1)}%.` : ''
  if (accPct >= 60) return {
    status: 'Positivo', dotColor: 'var(--up)',
    title: '¡El ensamble muestra una ventaja real!',
    body: `${accPct}% de acierto de dirección en ${total} predicciones de consenso. Supera claramente el ~54% del baseline.${maeText}`,
  }
  if (accPct >= 54) return {
    status: 'Señal débil', dotColor: '#d97706',
    title: 'Hay una señal positiva, pero todavía débil.',
    body: `${accPct}% de acierto en ${total} predicciones. Por encima del baseline pero todavía puede ser suerte con pocos datos.${maeText}`,
  }
  return {
    status: 'Sin señal', dotColor: 'var(--text-muted)',
    title: 'Por ahora no supera el mercado.',
    body: `${accPct}% de acierto en ${total} predicciones. El ensamble no muestra ventaja clara todavía.${maeText}`,
  }
}

function StatRow({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</span>
      {sub && <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', minWidth: 60, textAlign: 'right' }}>{sub}</span>}
    </div>
  )
}

function GroupBlock({ title, g }: { title: string; g: ReturnType<typeof computeGroup> }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 14 }}>
        {title}
      </div>
      {g.n === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-hint)' }}>Sin datos todavía</div>
      ) : (
        <div>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: g.acc !== null ? dirColor(g.acc) : 'var(--text-hint)', letterSpacing: '-0.01em' }}>
              {g.acc !== null ? `${g.acc.toFixed(0)}%` : '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              acertó dirección · {g.ok} de {g.n}
            </div>
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: g.mae !== null ? maeColor(g.mae) : 'var(--text-hint)' }}>
              {g.mae !== null ? `±${g.mae.toFixed(2)}%` : '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              error medio de magnitud
            </div>
            {g.mae !== null && (
              <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 6, lineHeight: 1.55 }}>
                Cuando predecimos un movimiento, en promedio nos alejamos{' '}
                <span style={{ fontFamily: MONO, fontWeight: 600 }}>±{g.mae.toFixed(1)} puntos</span> del valor real.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ScorecardSection({
  modelWeights, hits, total, closedPreds = [],
}: {
  modelWeights: ModelWeight[]
  hits: number
  total: number
  closedPreds?: any[]
}) {
  const acc    = total > 0 ? hits / total : null
  const accPct = acc !== null ? Math.round(acc * 100) : null
  const basePct  = 54
  const progress = Math.max(0.6, (total / TARGET) * 100)

  const daily    = computeGroup(closedPreds.filter((p: any) => Number(p.horizon_days) >= 7))
  const intraday = computeGroup(closedPreds.filter((p: any) => Number(p.horizon_days) < 7 && Number(p.horizon_days) > 0))
  const overall  = computeGroup(closedPreds)
  const { status, dotColor, title, body } = getVerdict(total, hits, overall.mae)

  const beating = accPct !== null && accPct > basePct
  const hasIntraday = intraday.n > 0

  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>01</span>
        <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
          ¿El sistema funciona?
        </h2>
      </div>

      {/* Verdict card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 24 }}>

        {/* Verdict header */}
        <div style={{ padding: 32, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 11px', borderRadius: 999, background: 'var(--bg-muted)', marginBottom: 18 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {status}
            </span>
          </div>
          <h3 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.25, margin: '0 0 12px', maxWidth: 660 }}>{title}</h3>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--text-muted)', margin: 0, maxWidth: 640 }}>{body}</p>
          <div style={{ marginTop: 26, maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)', marginBottom: 8 }}>
              <span>{total} de {TARGET} ciclos necesarios</span>
              <span>{((total / TARGET) * 100).toFixed(1)}%</span>
            </div>
            <div style={{ height: 8, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress.toFixed(2)}%`, minWidth: 4, background: 'var(--text-muted)', borderRadius: 999 }} />
            </div>
          </div>
        </div>

        {/* Ensamble vs baseline */}
        <div style={{ padding: 32, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Dirección: ensamble vs baseline</div>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)', margin: '0 0 22px', maxWidth: 600 }}>
            El baseline es apostar siempre a que sube (~54% históricamente). El ensamble de {modelWeights.length || 16} modelos tiene que superar eso para valer la pena.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>Ensamble ({modelWeights.length || 16} modelos)</span>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: beating ? 'var(--up)' : 'var(--down)' }}>{accPct !== null ? `${accPct}%` : '—'}</span>
              </div>
              <div style={{ height: 10, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'hidden' }}>
                {accPct !== null && <div style={{ height: '100%', width: `${accPct}%`, background: beating ? 'var(--up)' : 'var(--down)', borderRadius: 999 }} />}
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>Baseline (siempre sube)</span>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>{basePct}%</span>
              </div>
              <div style={{ height: 10, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${basePct}%`, background: 'var(--text-hint)', borderRadius: 999 }} />
              </div>
            </div>
          </div>
        </div>

        {/* Daily vs intraday breakdown */}
        <div style={{ padding: 32, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Dirección y magnitud — por tipo de predicción</div>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)', margin: '0 0 24px', maxWidth: 600 }}>
            Acertar la dirección (sube/baja) es solo la mitad. La magnitud responde "¿cuánto?". Aquí mostramos ambas métricas separadas por horizonte.
          </p>
          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            <GroupBlock title={`Diario (H ≥ 7d) · ${daily.n} pred`} g={daily} />
            {hasIntraday && (
              <>
                <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
                <GroupBlock title={`Intradiario · ${intraday.n} pred`} g={intraday} />
              </>
            )}
          </div>
        </div>

        {/* Metric tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hasIntraday ? 6 : 5}, 1fr)` }}>
          {[
            { value: accPct !== null ? `${accPct}%` : '—', label: 'Dirección acertada', color: accPct !== null ? dirColor(accPct) : undefined },
            { value: `${basePct}%`, label: 'Baseline compra-y-hold' },
            { value: overall.mae !== null ? `±${overall.mae.toFixed(1)}%` : '—', label: 'Error medio magnitud (MAE)', color: overall.mae !== null ? maeColor(overall.mae) : undefined },
            { value: String(total), label: 'Predicciones cerradas' },
            { value: String(hits), label: 'Aciertos de dirección' },
            ...(hasIntraday ? [{ value: intraday.mae !== null ? `±${intraday.mae.toFixed(1)}%` : '—', label: 'MAE intradiario', color: intraday.mae !== null ? maeColor(intraday.mae) : undefined }] : []),
          ].map((tile, i, arr) => (
            <div key={i} style={{ padding: '22px 24px', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : undefined }}>
              <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 500, color: tile.color ?? 'var(--text)', letterSpacing: '-0.01em' }}>{tile.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>{tile.label}</div>
            </div>
          ))}
        </div>
      </div>

    </section>
  )
}
