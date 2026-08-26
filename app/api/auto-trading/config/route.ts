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

  const admin = createAdminClient()

  // Etapa 30 (continuación, 19/08/2026, a pedido explícito del usuario): no dejar guardar topes
  // que sumen más que el efectivo real conocido — la foto la escribe python-api en cada corrida
  // (last_known_*_cash), puede tener hasta ~15 min de atraso, no es en tiempo real.
  const touchesCapitalFields = ['live_capital_intraday_ars', 'live_capital_daily_ars', 'live_capital_usd']
    .some(f => updates[f] !== undefined)
  if (touchesCapitalFields) {
    const { data: current, error: currentErr } = await admin
      .from('auto_trading_config')
      .select('live_capital_intraday_ars, live_capital_daily_ars, live_capital_usd, last_known_ars_cash, last_known_usd_cash')
      .eq('id', true)
      .single()
    if (currentErr) return NextResponse.json({ ok: false, error: currentErr.message }, { status: 500 })

    const nextIntradia = (updates.live_capital_intraday_ars as number) ?? current.live_capital_intraday_ars
    const nextDiario = (updates.live_capital_daily_ars as number) ?? current.live_capital_daily_ars
    const nextUsd = (updates.live_capital_usd as number) ?? current.live_capital_usd

    // Etapa 30 (26/08/2026, bug real reportado por el usuario): comparar contra el cash CRUDO
    // (ej. 12719.73) mientras el mensaje de error lo redondeaba a enteros para mostrarlo (12720)
    // hacía que "12720 supera a 12720" pareciera un empate imposible -- en realidad perdía por 27
    // centavos que el usuario no podía ver ni escribir (los topes se cargan en pesos enteros). Se
    // compara contra el mismo redondeo que se muestra en pantalla (enteros para ARS, 2 decimales
    // para USD, igual que formatMoney/.toFixed de abajo) -- así usar el 100% del efectivo que el
    // usuario VE siempre valida, sin abrir la puerta a un tope mayor al real (sigue rechazando
    // cualquier cosa por encima de ese redondeo, no sólo lo que es estrictamente igual).
    const arsCashRounded = current.last_known_ars_cash != null ? Math.round(current.last_known_ars_cash) : null
    const usdCashRounded = current.last_known_usd_cash != null ? Math.round(current.last_known_usd_cash * 100) / 100 : null

    if (arsCashRounded != null && nextIntradia + nextDiario > arsCashRounded) {
      return NextResponse.json({
        ok: false,
        error: `Los topes ARS (intradiario + diario = ${(nextIntradia + nextDiario).toFixed(0)}) superan tu efectivo real conocido (${arsCashRounded.toFixed(0)}). Bajá alguno de los dos.`,
      }, { status: 400 })
    }
    if (usdCashRounded != null && nextUsd > usdCashRounded) {
      return NextResponse.json({
        ok: false,
        error: `El tope USD (${nextUsd.toFixed(2)}) supera tu efectivo real conocido (US$${usdCashRounded.toFixed(2)}).`,
      }, { status: 400 })
    }
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await admin
    .from('auto_trading_config')
    .update(updates)
    .eq('id', true)
    .select('*')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, config: data })
}
