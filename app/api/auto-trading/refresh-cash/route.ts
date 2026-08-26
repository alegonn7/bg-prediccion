import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// Etapa 30 (26/08/2026, a pedido explícito del usuario): botón "actualizar ahora" del panel de
// plata real — proxea a python-api/api/refresh_cash (mismo patrón que app/api/lr-train-intraday),
// que sólo lee el efectivo real de IOL y actualiza auto_trading_config, sin correr entradas/salidas.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  if (!process.env.PYTHON_API_URL) {
    return NextResponse.json({ ok: false, error: 'PYTHON_API_URL not configured' }, { status: 500 })
  }

  const pythonUrl = `${process.env.PYTHON_API_URL}/api/refresh_cash`
  const secret = process.env.XGB_INTERNAL_SECRET ?? ''

  try {
    const resp = await fetch(pythonUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      signal: AbortSignal.timeout(20_000),
    })
    const result = await resp.json().catch(() => ({ ok: false, error: 'Python API returned invalid JSON' }))
    return NextResponse.json(result, { status: resp.ok ? 200 : 500 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: `Fetch failed: ${msg}` }, { status: 500 })
  }
}
