'use client'
import { useState, useTransition } from 'react'
import { AssetSuggestions } from './AssetSuggestions'
import { Pagination } from './Pagination'

const ASSETS_PAGE_SIZE = 15

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const AUTH_HEADER   = 'Bearer ' + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SECS_PER_PRED = 10  // estimado conservador por predicción (s)

type Asset    = { id: string; ticker: string; name: string; sector: string | null; asset_class: string; currency: string; is_active: boolean; horizon_days: number }
type OpenPred = { id: string; ticker: string; horizon_days: number; direction: string; confidence: number; agreement_pct: number; final_pct_predicted: number; target_date: string; created_at: string }
type QueueState = { total: number; done: number; currentTicker: string; errors: string[] }

async function callFn(slug: string, body: object) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: 'POST',
    headers: { 'Authorization': AUTH_HEADER, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

async function callGet(slug: string) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, { headers: { 'Authorization': AUTH_HEADER } })
  return r.json()
}

function fmtSecs(s: number) {
  if (s < 60) return `${s}s`
  return `${Math.ceil(s / 60)}min`
}

type Props = { initialAssets: Asset[]; initialOpenPreds: OpenPred[] }

export function SettingsSection({ initialAssets, initialOpenPreds }: Props) {
  const [assets,    setAssets]    = useState<Asset[]>(initialAssets)
  const [openPreds, setOpenPreds] = useState<OpenPred[]>(initialOpenPreds)

  const [newTicker, setNewTicker] = useState('')
  const [newName,   setNewName]   = useState('')

  // Multi-ticker selection
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set())
  const [customInput,     setCustomInput]     = useState('')   // campo "otro ticker"
  const [predHorizon,     setPredHorizon]     = useState('')

  // Queue progress
  const [creating,    setCreating]    = useState(false)
  const [queueState,  setQueueState]  = useState<QueueState | null>(null)

  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [adding, startAdd] = useTransition()

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 5000)
  }

  function toggleTicker(ticker: string) {
    setSelectedTickers(prev => {
      const next = new Set(prev)
      next.has(ticker) ? next.delete(ticker) : next.add(ticker)
      return next
    })
  }

  function addCustomTicker() {
    const t = customInput.toUpperCase().trim()
    if (!t) return
    setSelectedTickers(prev => new Set([...prev, t]))
    setCustomInput('')
  }

  async function toggleAsset(a: Asset) {
    const next = !a.is_active
    setAssets(prev => prev.map(x => x.id === a.id ? { ...x, is_active: next } : x))
    const res = await callFn('asset-config', { action: 'toggle_active', asset_id: a.id, is_active: next })
    if (!res.ok) {
      setAssets(prev => prev.map(x => x.id === a.id ? { ...x, is_active: !next } : x))
      flash('Error: ' + res.error, false)
    }
  }

  function addAsset() {
    const ticker = newTicker.toUpperCase().trim()
    if (!ticker) return
    startAdd(async () => {
      const res = await callFn('asset-config', { action: 'add_asset', ticker, name: newName || ticker })
      if (!res.ok) { flash('Error: ' + res.error, false); return }
      setNewTicker(''); setNewName('')
      const data = await callGet('asset-config')
      setAssets(data.assets ?? assets)
      flash(res.reactivated ? `${ticker} reactivado` : `${ticker} agregado`, true)
    })
  }

  async function crearPredicciones() {
    const tickers = [...selectedTickers]
    const h = parseInt(predHorizon, 10)
    if (!tickers.length || !h || h < 1 || h > 365) {
      flash('Seleccioná al menos un ticker y un horizonte válido (1-365 días)', false)
      return
    }
    setCreating(true)
    const errors: string[] = []
    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i]
      setQueueState({ total: tickers.length, done: i, currentTicker: ticker, errors: [...errors] })
      const res = await callFn('crear-prediccion', { ticker, horizon_days: h })
      if (!res.ok) errors.push(`${ticker}: ${res.error ?? 'error'}`)
    }
    setQueueState({ total: tickers.length, done: tickers.length, currentTicker: '', errors })
    setCreating(false)

    if (errors.length === 0) {
      flash(`${tickers.length} predicción${tickers.length > 1 ? 'es' : ''} creada${tickers.length > 1 ? 's' : ''} correctamente`, true)
    } else if (errors.length < tickers.length) {
      flash(`${tickers.length - errors.length} OK · ${errors.length} con error`, false)
    } else {
      flash('No se pudo crear ninguna predicción', false)
    }

    setTimeout(() => {
      setQueueState(null)
      setSelectedTickers(new Set())
      setPredHorizon('')
      window.location.reload()
    }, 1500)
  }

  const [showSuggestions, setShowSuggestions] = useState(false)
  const [assetsPage, setAssetsPage] = useState(1)
  const active   = assets.filter(a => a.is_active)
  const inactive = assets.filter(a => !a.is_active)
  const activePageItems = active.slice((assetsPage - 1) * ASSETS_PAGE_SIZE, assetsPage * ASSETS_PAGE_SIZE)

  const selCount    = selectedTickers.size
  const estSecs     = selCount * SECS_PER_PRED
  const qDone       = queueState?.done ?? 0
  const qTotal      = queueState?.total ?? 0
  const qPct        = qTotal > 0 ? Math.round((qDone / qTotal) * 100) : 0
  const qRemaining  = qTotal > 0 ? fmtSecs((qTotal - qDone) * SECS_PER_PRED) : ''
  const canCreate   = !creating && selCount > 0 && !!predHorizon

  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>04</span>
        <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
          Configuración
        </h2>
      </div>

      {msg && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 20, fontSize: 13,
          background: msg.ok ? 'var(--up-soft)' : 'var(--down-soft)',
          color: msg.ok ? 'var(--up)' : 'var(--down)',
          border: `1px solid ${msg.ok ? 'var(--up)' : 'var(--down)'}`,
        }}>
          {msg.text}
        </div>
      )}

      {/* ── CREAR PREDICCIÓN ─────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '2px solid var(--border)', borderRadius: 14, padding: 28, marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Crear predicción</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
          Seleccioná uno o varios activos y el horizonte. Las predicciones se crean en cola, una por una.
        </p>

        {/* Ticker chips */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
            Tickers
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {active.map(a => {
              const sel = selectedTickers.has(a.ticker)
              return (
                <button
                  key={a.id}
                  disabled={creating}
                  onClick={() => toggleTicker(a.ticker)}
                  style={{
                    padding: '6px 13px', borderRadius: 7, cursor: 'pointer',
                    fontFamily: MONO, fontSize: 13, fontWeight: sel ? 700 : 400,
                    border: `1px solid ${sel ? 'var(--text)' : 'var(--border)'}`,
                    background: sel ? 'var(--text)' : 'var(--bg-muted)',
                    color: sel ? 'var(--bg)' : 'var(--text-muted)',
                    transition: 'all 0.12s',
                    opacity: creating ? 0.5 : 1,
                  }}
                >
                  {a.ticker}
                </button>
              )
            })}
            {/* Chips de custom tickers que no están en la lista activa */}
            {[...selectedTickers].filter(t => !active.some(a => a.ticker === t)).map(t => (
              <button
                key={t}
                disabled={creating}
                onClick={() => toggleTicker(t)}
                style={{
                  padding: '6px 13px', borderRadius: 7, cursor: 'pointer',
                  fontFamily: MONO, fontSize: 13, fontWeight: 700,
                  border: '1px solid var(--text-muted)',
                  background: 'var(--text)', color: 'var(--bg)',
                  transition: 'all 0.12s', opacity: creating ? 0.5 : 1,
                }}
              >
                {t} ×
              </button>
            ))}
          </div>

          {/* Input para ticker personalizado */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <input
              value={customInput}
              onChange={e => setCustomInput(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') addCustomTicker() }}
              placeholder="Otro ticker (ej: GOOGL)"
              disabled={creating}
              style={{
                padding: '8px 12px', borderRadius: 7, width: 180,
                border: '1px solid var(--border)', background: 'var(--bg-muted)',
                color: 'var(--text)', fontFamily: MONO, fontSize: 13, outline: 'none',
                opacity: creating ? 0.5 : 1,
              }}
            />
            <button
              onClick={addCustomTicker}
              disabled={creating || !customInput.trim()}
              style={{
                padding: '8px 14px', borderRadius: 7,
                border: '1px solid var(--border)', background: 'var(--bg-muted)',
                color: 'var(--text-muted)', fontFamily: MONO, fontSize: 12, cursor: 'pointer',
                opacity: creating || !customInput.trim() ? 0.4 : 1,
              }}
            >
              + Agregar
            </button>
            {selCount > 0 && (
              <button
                onClick={() => setSelectedTickers(new Set())}
                disabled={creating}
                style={{
                  padding: '8px 14px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-hint)', fontFamily: MONO, fontSize: 11, cursor: 'pointer',
                  opacity: creating ? 0.4 : 1,
                }}
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Horizonte + botón */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 6 }}>Horizonte</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min={1} max={365}
                value={predHorizon}
                onChange={e => setPredHorizon(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && crearPredicciones()}
                placeholder="14"
                disabled={creating}
                style={{
                  padding: '11px 14px', borderRadius: 8, width: 90, textAlign: 'right',
                  border: '1px solid var(--border)', background: 'var(--bg-muted)',
                  color: 'var(--text)', fontFamily: MONO, fontSize: 14, outline: 'none',
                  opacity: creating ? 0.5 : 1,
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-hint)' }}>días hábiles</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              onClick={crearPredicciones}
              disabled={!canCreate}
              style={{
                padding: '11px 28px', borderRadius: 8, border: 'none',
                background: canCreate ? 'var(--text)' : 'var(--bg-muted)',
                color: canCreate ? 'var(--bg)' : 'var(--text-hint)',
                fontFamily: MONO, fontSize: 14, fontWeight: 600,
                cursor: canCreate ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
            >
              {creating
                ? `Creando ${queueState?.currentTicker ?? ''}…`
                : selCount > 0
                  ? `Crear ${selCount} predicción${selCount > 1 ? 'es' : ''}`
                  : 'Crear predicción'
              }
            </button>
            {selCount > 0 && !creating && (
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)', textAlign: 'center' }}>
                ~{fmtSecs(estSecs)} estimados
              </span>
            )}
          </div>
        </div>

        {/* Barra de progreso de cola */}
        {queueState && (
          <div style={{
            background: 'var(--bg-muted)', borderRadius: 10, padding: '14px 16px',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text)' }}>
                {queueState.done < queueState.total
                  ? <>Procesando <strong>{queueState.currentTicker}</strong> · {queueState.done + 1} de {queueState.total}</>
                  : `Completado · ${queueState.total} prediccion${queueState.total > 1 ? 'es' : ''}`
                }
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>
                {queueState.done < queueState.total ? `~${qRemaining} restantes` : ''}
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 999,
                background: queueState.done === queueState.total ? 'var(--up)' : 'var(--text)',
                width: `${qPct}%`,
                transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)' }}>{qPct}%</span>
              {queueState.errors.length > 0 && (
                <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--down)' }}>
                  {queueState.errors.length} error{queueState.errors.length > 1 ? 'es' : ''}
                </span>
              )}
            </div>
            {queueState.errors.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--down)', fontFamily: MONO }}>
                {queueState.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
          </div>
        )}

        {/* Predicciones activas existentes */}
        {openPreds.length > 0 && (
          <div style={{ marginTop: 22, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 12 }}>
              Predicciones activas
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {openPreds.map(p => {
                const up = p.direction === 'up'
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '10px 14px', borderRadius: 8, background: 'var(--bg-muted)',
                    flexWrap: 'wrap',
                  }}>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, minWidth: 60 }}>{p.ticker}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)' }}>{p.horizon_days}d → {p.target_date}</span>
                    <span style={{ color: up ? 'var(--up)' : 'var(--down)', fontSize: 13, fontWeight: 600 }}>
                      {up ? '↑' : '↓'} {p.final_pct_predicted >= 0 ? '+' : ''}{p.final_pct_predicted.toFixed(2)}%
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>acuerdo {p.agreement_pct}%</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', marginLeft: 'auto' }}>
                      conf {Math.round(p.confidence * 100)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── SUGERENCIAS ──────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
        <button
          onClick={() => setShowSuggestions(v => !v)}
          style={{
            width: '100%', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12,
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Activos recomendados</span>
          <span style={{ fontSize: 12, color: 'var(--text-hint)', flex: 1 }}>
            populares · fuera del radar · favorecidos por noticias
          </span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)', transform: showSuggestions ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>
        {showSuggestions && (
          <div style={{ padding: '0 24px 28px', borderTop: '1px solid var(--border)' }}>
            <div style={{ height: 24 }} />
            <AssetSuggestions
              trackedTickers={assets.map(a => a.ticker)}
              onAdded={(ticker, name) => {
                flash(`${ticker} agregado a activos`, true)
                callGet('asset-config').then(d => setAssets(d.assets ?? assets))
              }}
            />
          </div>
        )}
      </div>

      {/* ── ACTIVOS ──────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Activos disponibles</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>{active.length} activos</span>
        </div>
        {activePageItems.map((a, i) => (
          <div key={a.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            padding: '13px 24px',
            borderBottom: i < activePageItems.length - 1 ? '1px solid var(--border)' : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, minWidth: 70 }}>{a.ticker}</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{a.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-hint)' }}>{a.asset_class} · {a.currency}</span>
            </div>
            <button onClick={() => toggleAsset(a)} style={{
              padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--down-soft)', color: 'var(--down)',
              fontFamily: MONO, fontSize: 10, fontWeight: 600, cursor: 'pointer',
            }}>Quitar</button>
          </div>
        ))}
        {active.length > ASSETS_PAGE_SIZE && (
          <div style={{ padding: '8px 16px' }}>
            <Pagination page={assetsPage} totalItems={active.length} pageSize={ASSETS_PAGE_SIZE} onChange={setAssetsPage} />
          </div>
        )}

        {/* Agregar ticker nuevo */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={newTicker}
            onChange={e => setNewTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addAsset()}
            placeholder="Nuevo ticker (ej: GOOGL)"
            style={{
              padding: '9px 13px', borderRadius: 8, width: 180,
              border: '1px solid var(--border)', background: 'var(--bg-muted)',
              color: 'var(--text)', fontFamily: MONO, fontSize: 13, outline: 'none',
            }}
          />
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addAsset()}
            placeholder="Nombre (opcional)"
            style={{
              padding: '9px 13px', borderRadius: 8, flex: 1, minWidth: 140,
              border: '1px solid var(--border)', background: 'var(--bg-muted)',
              color: 'var(--text)', fontSize: 13, outline: 'none',
            }}
          />
          <button onClick={addAsset} disabled={adding || !newTicker.trim()} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: 'var(--text)', color: 'var(--bg)',
            fontFamily: MONO, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            opacity: adding || !newTicker.trim() ? 0.5 : 1,
          }}>
            {adding ? 'Agregando…' : '+ Agregar'}
          </button>
        </div>
      </div>

      {inactive.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Desactivados ({inactive.length})</span>
          </div>
          {inactive.map((a, i) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              padding: '12px 24px', opacity: 0.5,
              borderBottom: i < inactive.length - 1 ? '1px solid var(--border)' : undefined,
            }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>{a.ticker}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{a.name}</span>
              </div>
              <button onClick={() => toggleAsset(a)} style={{
                padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--up-soft)', color: 'var(--up)',
                fontFamily: MONO, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              }}>Reactivar</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
