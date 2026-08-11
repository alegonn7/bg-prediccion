'use client'
import { InfoTip } from './InfoTip'
import { ESTADO_META, estadoTip, fmtPct, type ScorecardBolsa } from '@/lib/scorecard'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"

export function SemaforoBadge({ bolsa, compact = false }: { bolsa: ScorecardBolsa | null; compact?: boolean }) {
  const meta = ESTADO_META[bolsa?.estado ?? 'insuficiente']
  const n = bolsa?.n_closed ?? 0
  const tip = estadoTip(bolsa)

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: compact ? '3px 8px' : '4px 10px', borderRadius: 999,
      background: meta.bg, fontFamily: MONO, fontSize: compact ? 10 : 11,
      fontWeight: 600, color: meta.color, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.dot, flexShrink: 0 }} />
      {meta.label}{!compact ? ` · n=${n}` : ''}
      <InfoTip text={tip} />
    </span>
  )
}

// Bloque de detalle completo — usado en el modal de detalle de predicción.
export function SemaforoDetail({ bolsa }: { bolsa: ScorecardBolsa | null }) {
  const meta = ESTADO_META[bolsa?.estado ?? 'insuficiente']
  return (
    <div style={{ background: 'var(--bg-muted)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-hint)', display: 'flex', alignItems: 'center', gap: 5 }}>
          Semáforo de esta bolsa <InfoTip text="Una bolsa = este activo + esta moneda + este horizonte. Nunca se mezcla con otras." />
        </span>
        <SemaforoBadge bolsa={bolsa} />
      </div>
      {bolsa ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontFamily: MONO }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Cerrados</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{bolsa.n_correct}/{bolsa.n_closed}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                Baseline a vencer
                <InfoTip text="Acierto de la mejor estrategia constante (apostar siempre a lo mismo) sobre esta misma muestra. Si un activo sube el 20% de las veces, 'siempre bajista' acierta 80% — ese es el número a superar, no el 20%." />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {bolsa.baseline_acc != null ? `${(bolsa.baseline_acc * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>p-valor (McNemar)</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: bolsa.p_value != null && bolsa.p_value < 0.05 ? meta.color : 'var(--text)' }}>
                {bolsa.p_value != null ? bolsa.p_value.toFixed(3) : '—'}
              </div>
            </div>
          </div>

          {/* Etapa 27.5 — la fila que realmente decide si conviene operar esta bolsa. El acierto
              direccional es la métrica equivocada para un sistema operado con stop-loss: se puede
              acertar 1 de cada 3 veces y tener esperanza positiva si el payoff es asimétrico. */}
          {bolsa.expectancy_net_pct != null && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontFamily: MONO,
              marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Esperanza por operación
                  <InfoTip text="Cuánto deja en promedio cada operación siguiendo esta señal, ya descontado el costo de ida y vuelta. Es la métrica que decide si conviene operar la bolsa — más que el porcentaje de acierto." />
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  color: bolsa.expectancy_net_pct > 0 ? '#22c55e' : '#ef4444',
                }}>
                  {fmtPct(bolsa.expectancy_net_pct)}
                </div>
                {bolsa.expectancy_gross_pct != null && (
                  <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 2 }}>
                    {fmtPct(bolsa.expectancy_gross_pct)} sin costo
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Payoff
                  <InfoTip text="Ganancia media dividida pérdida media. Por encima de 1 quiere decir que cuando acierta gana más de lo que pierde cuando falla — que es lo que permite ganar plata acertando menos del 50%." />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {bolsa.payoff_ratio != null ? `${bolsa.payoff_ratio.toFixed(2)} : 1` : '—'}
                </div>
                {bolsa.avg_win_pct != null && bolsa.avg_loss_pct != null && (
                  <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 2 }}>
                    {fmtPct(bolsa.avg_win_pct)} / {fmtPct(bolsa.avg_loss_pct)}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Movimiento capturado
                  <InfoTip text="De todo lo que la operación llegó a tener a favor en algún momento, cuánto queda al sostener hasta el cierre del horizonte. Un 25% significa que se devuelven 3 de cada 4 puntos ganados." />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {bolsa.capture_pct != null ? `${bolsa.capture_pct.toFixed(0)}%` : '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 2 }}>
                  {bolsa.capture_pct != null ? `sobre ${bolsa.capture_n ?? 0} ops.` : 'pendiente (Etapa 28)'}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-hint)', margin: 0 }}>
          Todavía no hay ninguna predicción cerrada para este activo, moneda y horizonte.
        </p>
      )}
    </div>
  )
}
