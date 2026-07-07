'use client'
import { useState } from 'react'
import { InfoTip } from './InfoTip'
import { SemaforoBadge } from './Semaforo'
import { bolsaKey, type ScorecardBolsa } from '@/lib/scorecard'
import type { CedearPair, CclInfo } from '@/app/page'

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

export function CedearDualSection({
  pairs, ccl, openPredictions, scorecardBolsas,
}: {
  pairs: CedearPair[]
  ccl: CclInfo
  openPredictions: OpenPred[]
  scorecardBolsas: Record<string, ScorecardBolsa>
}) {
  const [horizon, setHorizon] = useState(7)

  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 6px' }}>
            CEDEAR de doble precio
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, maxWidth: 640, display: 'flex', alignItems: 'center', gap: 6 }}>
            Predicción del subyacente en USD (señal limpia) vs. predicción del CEDEAR en ARS (con el ruido cambiario del CCL sumado).
            <InfoTip text="Cada CEDEAR corre por el mismo motor dos veces: una vez sobre la acción real en EEUU (dólares) y otra sobre el certificado en pesos (BYMA). Son bolsas separadas — nunca se mezcla su semáforo." />
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {ccl && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>
              CCL {fmtArs(ccl.venta)} · {ccl.fecha}
            </span>
          )}
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
      </div>

      {!pairs.length ? (
        <div style={{ padding: '24px 18px', borderRadius: 10, fontSize: 13, color: 'var(--text-hint)', border: '1px solid var(--border)' }}>
          Todavía no hay CEDEARs con ratio y subyacente cargados.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-muted)' }}>
                {['CEDEAR', 'Ratio', 'Precio ARS', 'USD implícito', 'USD real (subyacente)', 'Brecha vs. real', `Predicción USD (${horizon}d)`, `Predicción ARS (${horizon}d)`].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-hint)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pairs.map(p => {
                const usdPred = openPredictions.find(pr => pr.asset_id === p.underlyingAssetId && pr.horizon_days === horizon)
                const arsPred = openPredictions.find(pr => pr.asset_id === p.cedearAssetId && pr.horizon_days === horizon)
                const usdBolsa = scorecardBolsas[bolsaKey(p.underlyingAssetId, 'usd', horizon, 'days')] ?? null
                const arsBolsa = scorecardBolsas[bolsaKey(p.cedearAssetId, 'ars', horizon, 'days')] ?? null
                const gapColor = p.gapPct == null ? 'var(--text-hint)' : Math.abs(p.gapPct) > 5 ? 'var(--down)' : 'var(--text)'
                return (
                  <tr key={p.cedearAssetId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px', fontFamily: MONO, fontWeight: 600 }}>
                      {p.cedearTicker}
                      <div style={{ fontSize: 10, color: 'var(--text-hint)', fontWeight: 400, marginTop: 2 }}>{p.underlyingTicker}</div>
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: MONO, color: 'var(--text-muted)' }}>{p.ratio != null ? `${p.ratio}:1` : '—'}</td>
                    <td style={{ padding: '12px 14px', fontFamily: MONO }}>{fmtArs(p.cedearPriceArs)}</td>
                    <td style={{ padding: '12px 14px', fontFamily: MONO }}>{fmtUsd(p.impliedUsdPrice)}</td>
                    <td style={{ padding: '12px 14px', fontFamily: MONO }}>{fmtUsd(p.underlyingPriceUsd)}</td>
                    <td style={{ padding: '12px 14px', fontFamily: MONO, color: gapColor, fontWeight: 600 }}>{fmtPct(p.gapPct, 1)}</td>
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
