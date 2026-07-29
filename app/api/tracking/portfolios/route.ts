import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { DEFAULT_COSTO_CONFIG, type Currency } from '@/lib/tracking'

const CURRENCIES: Currency[] = ['usd', 'ars']

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tracking_portfolios')
    .select('id, currency, capital_inicial, costo_ida_vuelta_pct, costo_ida_vuelta_intradia_pct, created_at')
    .order('currency')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, portfolios: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const currency = body?.currency as Currency | undefined
  const capitalInicial = Number(body?.capital_inicial)

  if (!currency || !CURRENCIES.includes(currency)) {
    return NextResponse.json({ ok: false, error: `currency debe ser uno de ${CURRENCIES.join('|')}` }, { status: 400 })
  }
  if (!Number.isFinite(capitalInicial) || capitalInicial <= 0) {
    return NextResponse.json({ ok: false, error: 'capital_inicial debe ser un número positivo' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existing, error: existingErr } = await admin
    .from('tracking_portfolios')
    .select('id')
    .eq('currency', currency)
    .maybeSingle()
  if (existingErr) return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 })
  if (existing) return NextResponse.json({ ok: false, error: `Ya existe un portfolio ${currency}` }, { status: 409 })

  // El default de la columna en la migración es un valor plano (Postgres no permite un DEFAULT
  // condicional a otra columna de la misma fila) — el default real, que sí distingue ARS
  // (incluye derecho de mercado BYMA, ver lib/tracking.ts) de USD (sólo Balanz), se fija acá.
  const costoDefault = DEFAULT_COSTO_CONFIG[currency]
  const { data, error } = await admin
    .from('tracking_portfolios')
    .insert({
      currency, capital_inicial: capitalInicial,
      costo_ida_vuelta_pct: costoDefault.normal,
      costo_ida_vuelta_intradia_pct: costoDefault.intradia,
    })
    .select('id, currency, capital_inicial, costo_ida_vuelta_pct, costo_ida_vuelta_intradia_pct, created_at')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, portfolio: data })
}

// Etapa 21: edición del costo de ida y vuelta configurable (default = cálculo de la tabla Balanz,
// ver migración add_costo_operacion_to_tracking_portfolios_etapa21). Sin PATCH parcial de
// capital_inicial — eso no lo pedía ninguna etapa, sólo el costo es "configurable" por diseño.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const currency = body?.currency as Currency | undefined
  if (!currency || !CURRENCIES.includes(currency)) {
    return NextResponse.json({ ok: false, error: `currency debe ser uno de ${CURRENCIES.join('|')}` }, { status: 400 })
  }

  const updates: Record<string, number> = {}
  for (const field of ['costo_ida_vuelta_pct', 'costo_ida_vuelta_intradia_pct'] as const) {
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
  const { data: existing, error: existingErr } = await admin
    .from('tracking_portfolios')
    .select('id')
    .eq('currency', currency)
    .maybeSingle()
  if (existingErr) return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ ok: false, error: `No existe un portfolio ${currency} todavía` }, { status: 404 })

  const { data, error } = await admin
    .from('tracking_portfolios')
    .update(updates)
    .eq('currency', currency)
    .select('id, currency, capital_inicial, costo_ida_vuelta_pct, costo_ida_vuelta_intradia_pct, created_at')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, portfolio: data })
}
