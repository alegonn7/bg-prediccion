'use client'
import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const CACHE_KEY = 'macro_arg_v4'
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 min

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"

function createSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

function fmtARS(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(decimals)}%`
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return ''
  // Handles both YYYY-MM-DD and full ISO
  const d = new Date(iso.includes('T') ? iso : iso + 'T12:00:00Z')
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
}

function ChangeChip({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value == null) return null
  const up    = value > 0
  const down  = value < 0
  const color = up ? 'var(--up)' : down ? 'var(--down)' : 'var(--text-hint)'
  const sign  = up ? '+' : ''
  return (
    <span style={{ fontFamily: MONO, fontSize: 11, color }}>
      {sign}{value}{suffix}
    </span>
  )
}

type DolarCard = { compra: number | null; venta: number | null; updated?: string } | null

function DollarRow({ label, data, highlight }: { label: string; data: DolarCard; highlight?: boolean }) {
  if (!data) return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', opacity: 0.4 }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>sin datos</span>
    </div>
  )
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '11px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 13, color: highlight ? 'var(--text)' : 'var(--text-muted)', fontWeight: highlight ? 600 : 400 }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        {data.compra != null && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', marginBottom: 1 }}>compra</div>
            <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-muted)' }}>${fmtARS(data.compra)}</div>
          </div>
        )}
        <div style={{ textAlign: 'right' }}>
          {data.compra != null && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', marginBottom: 1 }}>venta</div>
          )}
          <div style={{ fontFamily: MONO, fontSize: highlight ? 15 : 14, fontWeight: highlight ? 600 : 500, color: 'var(--text)' }}>
            ${fmtARS(data.venta)}
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 14 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function BigCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '20px 22px', ...style,
    }}>
      {children}
    </div>
  )
}

type MacroData = {
  generated_at: string
  dolares: {
    oficial: DolarCard; blue: DolarCard; mep: DolarCard; ccl: DolarCard
    cripto: DolarCard; tarjeta: DolarCard; mayorista: DolarCard
    brecha_blue: number | null; brecha_ccl: number | null
  }
  riesgo_pais: { valor: number | null; fecha: string | null; cambio_vs_anterior: number | null }
  inflacion: {
    mensual: { valor: number; fecha: string } | null
    interanual: { valor: number; fecha: string } | null
    acumulado_anio: number | null
  }
  plazo_fijo: { tna: number | null; fecha: string | null }
  merval: {
    precio: number | null; cambio_pct: number | null; cambio_abs: number | null
    prev_close: number | null; updated: string | null
  } | null
}

export function ArgentinaSectionClient() {
  const [data, setData]       = useState<MacroData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    if (!force) {
      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const { payload, at } = JSON.parse(cached)
          if (Date.now() - at < CACHE_TTL_MS) { setData(payload); return }
        }
      } catch { /* ignore */ }
    }
    setLoading(true)
    setError(null)
    try {
      const supabase = createSupabase()
      const [{ data: res, error: err }, rpRoute] = await Promise.all([
        supabase.functions.invoke('macro-argentina'),
        fetch('/api/riesgo-pais').then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      if (err) throw new Error(err.message)
      if (!res?.ok) throw new Error(res?.error ?? 'Error desconocido')

      // Override riesgo_pais with fresher data if the Next.js route got through
      if (rpRoute?.ok && rpRoute.valor != null) {
        const anterior = rpRoute.valor_cierre_anterior
        res.riesgo_pais = {
          valor: rpRoute.valor,
          fecha: rpRoute.fecha ?? res.riesgo_pais?.fecha,
          cambio_vs_anterior: anterior != null ? rpRoute.valor - anterior : res.riesgo_pais?.cambio_vs_anterior,
          source: rpRoute.source ?? 'route',
        }
      }
      console.log('[macro-arg] riesgo_pais:', res.riesgo_pais, '| rpRoute:', rpRoute)
      setData(res as MacroData)
      localStorage.setItem(CACHE_KEY, JSON.stringify({ payload: res, at: Date.now() }))
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const genTime = data?.generated_at
    ? new Date(data.generated_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : null

  const mervalUp   = (data?.merval?.cambio_pct ?? 0) >= 0
  const rpCambioUp = (data?.riesgo_pais?.cambio_vs_anterior ?? 0) <= 0 // bps bajos = bueno

  return (
    <section style={{ marginBottom: 64 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>07</span>
          <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
            Datos Macro Argentina
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {genTime && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>
              actualizado {genTime}
            </span>
          )}
          <button
            onClick={() => load(true)} disabled={loading}
            style={{
              appearance: 'none', border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--bg-card)', color: 'var(--text-muted)',
              fontFamily: MONO, fontSize: 11, padding: '5px 12px',
              cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Cargando…' : '↻ Actualizar'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '14px 18px', borderRadius: 10, marginBottom: 24, fontSize: 13, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--down)' }}>
          {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[240, 180, 160].map((h, i) => (
            <div key={i} style={{ height: h, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, opacity: 0.4 }} />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Highlight row: MERVAL + Riesgo País */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 32 }}>
            {/* MERVAL */}
            <BigCard>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 12 }}>
                MERVAL
              </div>
              {data.merval ? (
                <>
                  <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em', lineHeight: 1 }}>
                    {fmtARS(data.merval.precio)}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: mervalUp ? 'var(--up)' : 'var(--down)' }}>
                      {fmtPct(data.merval.cambio_pct)}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>
                      {data.merval.cambio_abs != null ? `(${data.merval.cambio_abs >= 0 ? '+' : ''}${fmtARS(data.merval.cambio_abs)})` : ''}
                    </span>
                  </div>
                  {data.merval.updated && (
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', marginTop: 10 }}>
                      {new Date(data.merval.updated).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })} BA
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: 'var(--text-hint)', fontSize: 13 }}>sin datos</div>
              )}
            </BigCard>

            {/* Riesgo País */}
            <BigCard>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 12 }}>
                Riesgo País (EMBI+)
              </div>
              {data.riesgo_pais.valor != null ? (
                <>
                  <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em', lineHeight: 1 }}>
                    {data.riesgo_pais.valor.toLocaleString('es-AR')}
                    <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 6, color: 'var(--text-muted)' }}>bps</span>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {data.riesgo_pais.cambio_vs_anterior != null && (
                      <span style={{ fontFamily: MONO, fontSize: 12, color: rpCambioUp ? 'var(--up)' : 'var(--down)' }}>
                        {data.riesgo_pais.cambio_vs_anterior >= 0 ? '+' : ''}{data.riesgo_pais.cambio_vs_anterior} bps
                      </span>
                    )}
                    {data.riesgo_pais.fecha && (
                      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)' }}>
                        vs día anterior · {fmtFecha(data.riesgo_pais.fecha)}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--text-hint)', fontSize: 13 }}>sin datos</div>
              )}
            </BigCard>
          </div>

          {/* Dollar rates */}
          <Section title="Tipo de Cambio">
            <BigCard>
              {/* Brecha banner */}
              {(data.dolares.brecha_blue != null || data.dolares.brecha_ccl != null) && (
                <div style={{
                  display: 'flex', gap: 24, padding: '10px 0 14px', marginBottom: 4,
                  borderBottom: '1px solid var(--border)',
                }}>
                  {data.dolares.brecha_blue != null && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Brecha blue: <strong style={{ fontFamily: MONO, color: data.dolares.brecha_blue > 50 ? 'var(--down)' : 'var(--text)' }}>
                        +{data.dolares.brecha_blue.toFixed(1)}%
                      </strong> vs oficial
                    </span>
                  )}
                  {data.dolares.brecha_ccl != null && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Brecha CCL: <strong style={{ fontFamily: MONO, color: data.dolares.brecha_ccl > 50 ? 'var(--down)' : 'var(--text)' }}>
                        +{data.dolares.brecha_ccl.toFixed(1)}%
                      </strong> vs oficial
                    </span>
                  )}
                </div>
              )}
              <DollarRow label="Oficial"    data={data.dolares.oficial}   highlight />
              <DollarRow label="Blue"        data={data.dolares.blue}      highlight />
              <DollarRow label="MEP / Bolsa" data={data.dolares.mep} />
              <DollarRow label="CCL"         data={data.dolares.ccl} />
              <DollarRow label="Cripto (USDT)" data={data.dolares.cripto} />
              <DollarRow label="Tarjeta"     data={data.dolares.tarjeta} />
              <DollarRow label="Mayorista"   data={data.dolares.mayorista} />
            </BigCard>
          </Section>

          {/* Macro grid */}
          <Section title="Inflación &amp; Tasas">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              {/* Mensual */}
              <BigCard>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
                  Inflación mensual
                </div>
                {data.inflacion.mensual ? (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: 'var(--down)' }}>
                      +{data.inflacion.mensual.valor.toFixed(1)}%
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', marginTop: 6 }}>
                      {fmtFecha(data.inflacion.mensual.fecha)}
                    </div>
                  </>
                ) : <div style={{ color: 'var(--text-hint)', fontSize: 13 }}>sin datos</div>}
              </BigCard>

              {/* Interanual */}
              <BigCard>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
                  Inflación interanual
                </div>
                {data.inflacion.interanual ? (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: 'var(--down)' }}>
                      +{data.inflacion.interanual.valor.toFixed(1)}%
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', marginTop: 6 }}>
                      {fmtFecha(data.inflacion.interanual.fecha)}
                    </div>
                  </>
                ) : <div style={{ color: 'var(--text-hint)', fontSize: 13 }}>sin datos</div>}
              </BigCard>

              {/* Acumulado año */}
              {data.inflacion.acumulado_anio != null && (
                <BigCard>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
                    Acum. {new Date().getFullYear()}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: 'var(--down)' }}>
                    +{data.inflacion.acumulado_anio.toFixed(1)}%
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', marginTop: 6 }}>
                    comp. mensual acumulada
                  </div>
                </BigCard>
              )}

              {/* Plazo fijo */}
              {data.plazo_fijo.tna != null && (
                <BigCard>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
                    Plazo fijo (TNA)
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>
                    {data.plazo_fijo.tna.toFixed(1)}%
                  </div>
                  {data.plazo_fijo.fecha && (
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', marginTop: 6 }}>
                      {fmtFecha(data.plazo_fijo.fecha)}
                    </div>
                  )}
                </BigCard>
              )}
            </div>
          </Section>
        </>
      )}
    </section>
  )
}
