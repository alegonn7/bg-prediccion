import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// Etapa 30: config del motor de trading automático (kill switch + límites de riesgo). Fila única
// (id=true, ver migración etapa30_auto_trading_schema) — mismo patrón admin-client que
// app/api/tracking/portfolios/route.ts, sólo que acá siempre hay exactamente una fila.

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('auto_trading_config').select('*').eq('id', true).single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, config: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const updates: Record<string, number | boolean | string> = {}

  if (body?.kill_switch !== undefined) {
    if (typeof body.kill_switch !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'kill_switch debe ser true|false' }, { status: 400 })
    }
    updates.kill_switch = body.kill_switch
  }
  for (const field of ['max_position_pct_capital', 'max_daily_loss_pct'] as const) {
    if (body?.[field] === undefined) continue
    const v = Number(body[field])
    if (!Number.isFinite(v) || v <= 0 || v > 100) {
      return NextResponse.json({ ok: false, error: `${field} debe ser un número entre 0 y 100` }, { status: 400 })
    }
    updates[field] = v
  }
  if (body?.max_concurrent_positions !== undefined) {
    const v = Number(body.max_concurrent_positions)
    if (!Number.isInteger(v) || v <= 0) {
      return NextResponse.json({ ok: false, error: 'max_concurrent_positions debe ser un entero positivo' }, { status: 400 })
    }
    updates.max_concurrent_positions = v
  }

  // Etapa 30 (continuación, 19/08/2026): controles de plata real, antes sólo editables por SQL.
  for (const field of ['override_statistical_gate', 'live_enabled_byma', 'live_enabled_us'] as const) {
    if (body?.[field] === undefined) continue
    if (typeof body[field] !== 'boolean') {
      return NextResponse.json({ ok: false, error: `${field} debe ser true|false` }, { status: 400 })
    }
    updates[field] = body[field]
  }
  if (body?.live_position_pct !== undefined) {
    const v = Number(body.live_position_pct)
    if (!Number.isFinite(v) || v <= 0 || v > 100) {
      return NextResponse.json({ ok: false, error: 'live_position_pct debe ser un número entre 0 y 100' }, { status: 400 })
    }
    updates.live_position_pct = v
  }
  for (const field of ['live_capital_intraday_ars', 'live_capital_daily_ars', 'live_capital_usd'] as const) {
    if (body?.[field] === undefined) continue
    const v = Number(body[field])
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ ok: false, error: `${field} debe ser un número ≥ 0` }, { status: 400 })
    }
    updates[field] = v
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'Nada para actualizar' }, { status: 400 })
  }
  updates.updated_at = new Date().toISOString()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('auto_trading_config')
    .update(updates)
    .eq('id', true)
    .select('*')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, config: data })
}
