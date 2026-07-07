'use client'
import { InfoTip } from './InfoTip'
import { ESTADO_META, estadoTip, type ScorecardBolsa } from '@/lib/scorecard'

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontFamily: MONO }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Cerrados</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{bolsa.n_correct}/{bolsa.n_closed}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>Baseline empírico</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{bolsa.baseline_rate != null ? `${(bolsa.baseline_rate * 100).toFixed(1)}%` : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 3 }}>p-valor (McNemar)</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: bolsa.p_value != null && bolsa.p_value < 0.05 ? meta.color : 'var(--text)' }}>
              {bolsa.p_value != null ? bolsa.p_value.toFixed(3) : '—'}
            </div>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-hint)', margin: 0 }}>
          Todavía no hay ninguna predicción cerrada para este activo, moneda y horizonte.
        </p>
      )}
    </div>
  )
}
