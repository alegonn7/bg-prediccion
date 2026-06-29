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

const MODEL_LABELS: Record<string, string> = {
  tendencia:      'Tendencia',
  momentum:       'Momentum',
  volatilidad:    'Volatilidad',
  volumen:        'Volumen',
  estructura:     'Estructura',
  elliott:        'Elliott',
  velas:          'Velas',
  macro:          'Macro',
  fundamental:    'Fundamental',
  sentimiento:    'Sentimiento',
  regresion:      'Regresión lineal',
  reversion:      'Reversión a media',
  divergencias:   'Divergencias',
  estacionalidad: 'Estacionalidad',
  beta_mercado:   'Beta-mercado',
  fuerza_relativa:'Fuerza relativa',
}

function getVerdict(total: number, hits: number) {
  const acc = total > 0 ? hits / total : null
  if (total === 0) return { status: 'Indeterminado', dotColor: 'var(--text-hint)', title: 'Todavía no hay datos.', body: 'El sistema aún no tiene predicciones de consenso cerradas. Volvé cuando las haya.' }
  if (total < 20) return { status: 'Indeterminado', dotColor: 'var(--text-hint)', title: 'Todavía no se puede concluir nada.', body: `Con solo ${total} predicciones, cualquier resultado es ruido estadístico. Hacen falta decenas de ciclos cerrados.` }
  const accPct = Math.round((acc ?? 0) * 100)
  if (accPct >= 60) return { status: 'Positivo', dotColor: 'var(--up)', title: '¡El ensamble muestra una ventaja real!', body: `${accPct}% de acierto de dirección en ${total} predicciones de consenso. Supera claramente el ~54% del baseline.` }
  if (accPct >= 54) return { status: 'Señal débil', dotColor: '#d97706', title: 'Hay una señal positiva, pero todavía débil.', body: `${accPct}% de acierto en ${total} predicciones. Por encima del baseline pero todavía puede ser suerte con pocos datos.` }
  return { status: 'Sin señal', dotColor: 'var(--text-muted)', title: 'Por ahora no supera el mercado.', body: `${accPct}% de acierto en ${total} predicciones. El ensamble no muestra ventaja clara todavía.` }
}

export function ScorecardSection({ modelWeights, hits, total }: { modelWeights: ModelWeight[]; hits: number; total: number }) {
  const acc = total > 0 ? hits / total : null
  const accPct = acc !== null ? Math.round(acc * 100) : null
  const basePct = 54
  const progress = Math.max(0.6, (total / TARGET) * 100)
  const { status, dotColor, title, body } = getVerdict(total, hits)
  const beating = accPct !== null && accPct > basePct
  const hasWeights = modelWeights.length > 0 && modelWeights.some(m => (m.sample_size ?? 0) >= 5)

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

        {/* IA vs baseline */}
        <div style={{ padding: 32, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Ensamble vs baseline</div>
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

        {/* Metric tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {[
            { value: accPct !== null ? `${accPct}%` : '—', label: 'Acierto de dirección', border: true },
            { value: `${basePct}%`, label: 'Baseline (compra y hold)', border: true },
            { value: String(total), label: 'Predicciones cerradas', border: true },
            { value: String(hits), label: 'Aciertos totales', border: false },
          ].map((tile, i) => (
            <div key={i} style={{ padding: '22px 24px', borderRight: tile.border ? '1px solid var(--border)' : undefined }}>
              <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em' }}>{tile.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>{tile.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Model leaderboard */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Ranking de modelos</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>ordenado por precisión de dirección</span>
        </div>
        {!hasWeights ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            Sin datos suficientes aún — el juez actualizará los pesos cuando haya predicciones cerradas.
          </div>
        ) : (
          <div>
            {modelWeights.map((m, i) => {
              const acc = m.direction_accuracy != null ? Math.round(m.direction_accuracy * 100) : null
              const hasSamples = (m.sample_size ?? 0) >= 5
              const color = acc != null && acc >= 60 ? 'var(--up)' : acc != null && acc < 50 ? 'var(--down)' : 'var(--text)'
              return (
                <div key={m.model_name} style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1fr 1fr 0.7fr',
                  gap: 16,
                  padding: '14px 24px',
                  borderBottom: i < modelWeights.length - 1 ? '1px solid var(--border)' : undefined,
                  alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', minWidth: 18 }}>#{i + 1}</span>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{MODEL_LABELS[m.model_name] ?? m.model_name}</span>
                  </div>
                  <div>
                    {hasSamples ? (
                      <>
                        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color }}>{acc}%</div>
                        <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 2 }}>acierto dirección</div>
                      </>
                    ) : (
                      <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>sin datos</span>
                    )}
                  </div>
                  <div>
                    {m.mae_avg != null ? (
                      <>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-muted)' }}>{(m.mae_avg * 100).toFixed(2)}%</div>
                        <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 2 }}>MAE promedio</div>
                      </>
                    ) : (
                      <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>—</span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-muted)' }}>×{m.weight?.toFixed(2) ?? '1.00'}</span>
                    <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 2 }}>peso</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
