'use client'
import { useState } from 'react'
import { InfoTip } from './InfoTip'
import { SemaforoBadge } from './Semaforo'
import { bolsaKey, type ScorecardBolsa } from '@/lib/scorecard'
import type { AccionArgPair } from '@/app/page'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"
const HORIZONS = [1, 7, 14, 30, 60, 90]

type OpenPred = {
  asset_id: string
  horizon_days: number
  direction: string
  confidence: number
  final_pct_predicted: number
}

function fmtUsd(n: number | null): string {
  if (n == null) return '—'
  return `US$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}
function fmtArs(n: number | null): string {
  if (n == null) return '—'
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}
function fmtPct(n: number | null, decimals = 2): string {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(decimals)}%`
}

function DirectionCell({ pred }: { pred: OpenPred | undefined }) {
  if (!pred) return <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>sin predicción</span>
  const up = pred.direction === 'up'
  const color = up ? 'var(--up)' : pred.direction === 'down' ? 'var(--down)' : 'var(--text-hint)'
  return (
    <div style={{ fontFamily: MONO, fontSize: 13 }}>
      <span style={{ color, fontWeight: 600 }}>{up ? '↑' : pred.direction === 'down' ? '↓' : '·'} {fmtPct(pred.final_pct_predicted, 2)}</span>
      <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 2 }}>confianza {(pred.confidence * 100).toFixed(0)}%</div>
    </div>
  )
}

// Etapa 23: mismo patrón visual que CedearDualSection, pero para el par acción argentina local
// (BYMA, pesos) <-> ADR (NYSE/NASDAQ, dólares) — GGAL.BA/GGAL, YPFD.BA/YPF, etc. A diferencia de
// los CEDEARs, acá NO hay ratio de conversión ni reconstrucción de "precio implícito": son dos
// cotizaciones directas del mismo negocio en dos mercados, no un certificado sintético. El usuario
// no puede operar el ADR (broker argentino, sólo pesos) — se muestra como referencia de la señal
// más rica en datos (Finnhub cubre bien NYSE/NASDAQ, no BYMA), no como algo comprable.
export function AccionArgDualSection({
  pairs, openPredictions, scorecardBolsas,
}: {
  pairs: AccionArgPair[]
  openPredictions: OpenPred[]
  scorecardBolsas: Record<string, ScorecardBolsa>
}) {
  const [horizon, setHorizon] = useState(7)

  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 6px' }}>
            Acciones argentinas: local vs. ADR
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, maxWidth: 640, display: 'flex', alignItems: 'center', gap: 6 }}>
            Predicción del ADR en USD (más datos, señal más rica) vs. predicción de la acción local en ARS (lo que se opera de verdad desde un broker argentino).
            <InfoTip text="Cada empresa corre por el mismo motor dos veces: una vez sobre el ADR (NYSE/NASDAQ, dólares) y otra sobre la acción local (BYMA, pesos). Son bolsas separadas — nunca se mezcla su semáforo. El modelo ARS usa la predicción del ADR como una señal más (no la reemplaza), justamente porque Finnhub cubre mucho mejor NYSE/NASDAQ que BYMA." />
          </p>
        </div>
        <select
          value={horizon}
          onChange={e => setHorizon(Number(e.target.value))}
          style={{
            appearance: 'none', border: '1px solid var(--border)', borderRadius: 8,
            background: 'var(--bg-card)', color: 'var(--text)', fontFamily: MONO, fontSize: 12,
            padding: '5px 10px', cursor: 'pointer',
          }}
        >
          {HORIZONS.map(h => <option key={h} value={h}>{h}d</option>)}
        </select>
      </div>

      {!pairs.length ? (
        <div style={{ padding: '24px 18px', borderRadius: 10, fontSize: 13, color: 'var(--text-hint)', border: '1px solid var(--border)' }}>
          Todavía no hay acciones argentinas locales con su ADR cargado.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-muted)' }}>
                {['Acción', 'Precio ARS (local)', 'Precio USD (ADR)', `Predicción USD (${horizon}d)`, `Predicción ARS (${horizon}d)`].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-hint)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pairs.map(p => {
                const usdPred = openPredictions.find(pr => pr.asset_id === p.adrAssetId && pr.horizon_days === horizon)
                const arsPred = openPredictions.find(pr => pr.asset_id === p.localAssetId && pr.horizon_days === horizon)
                const usdBolsa = scorecardBolsas[bolsaKey(p.adrAssetId, 'usd', horizon, 'days')] ?? null
                const arsBolsa = scorecardBolsas[bolsaKey(p.localAssetId, 'ars', horizon, 'days')] ?? null
                return (
                  <tr key={p.localAssetId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px', fontFamily: MONO, fontWeight: 600 }}>
                      {p.localTicker}
                      <div style={{ fontSize: 10, color: 'var(--text-hint)', fontWeight: 400, marginTop: 2 }}>{p.adrTicker}</div>
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: MONO }}>{fmtArs(p.localPriceArs)}</td>
                    <td style={{ padding: '12px 14px', fontFamily: MONO }}>{fmtUsd(p.adrPriceUsd)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <DirectionCell pred={usdPred} />
                      <div style={{ marginTop: 4 }}><SemaforoBadge bolsa={usdBolsa} compact /></div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <DirectionCell pred={arsPred} />
                      <div style={{ marginTop: 4 }}><SemaforoBadge bolsa={arsBolsa} compact /></div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
