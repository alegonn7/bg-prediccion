import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import type { Currency } from '@/lib/tracking'

// Etapa 30: portfolios del motor automático (uno por moneda). A diferencia de
// tracking_portfolios no tienen costo propio — el costo lo determina el venue de ejecución
// (routeInstrument()/costoConfigForVenue() en lib/tracking.ts), no un valor editable acá.
const CURRENCIES: Currency[] = ['usd', 'ars']
const SELECT_COLUMNS = 'id, currency, capital_inicial, monto_base_operacion, created_at'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('auto_portfolios')
    .select(SELECT_COLUMNS)
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
    .from('auto_portfolios')
    .select('id')
    .eq('currency', currency)
    .maybeSingle()
  if (existingErr) return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 })
  if (existing) return NextResponse.json({ ok: false, error: `Ya existe un portfolio automático ${currency}` }, { status: 409 })

  const { data, error } = await admin
    .from('auto_portfolios')
    .insert({ currency, capital_inicial: capitalInicial })
    .select(SELECT_COLUMNS)
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, portfolio: data })
}

// Etapa 30 (26/08/2026, corregido a pedido explícito del usuario tras un diseño equivocado): al
// principio esto sólo tenía `capital_inicial`, y para poder "editar el monto que usa cada
// operación" se despejaba capital_inicial a partir del % configurado — pero eso CAMBIABA
// capital_inicial como efecto secundario, y el usuario lo quiere fijo (representa el capital total
// simulado, ej. US$1.000, no una perilla de ajuste). Ahora son dos campos independientes: tocar
// uno nunca cambia el otro. `capital_inicial` casi no debería editarse en la práctica (por eso
// sigue habiendo un camino para hacerlo, por si alguna vez hace falta de verdad), el control que
// se usa día a día es `monto_base_operacion`.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const id = body?.id as string | undefined
  if (!id) return NextResponse.json({ ok: false, error: 'Falta id' }, { status: 400 })

  const updates: Record<string, number> = {}
  if (body?.capital_inicial !== undefined) {
    const v = Number(body.capital_inicial)
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json({ ok: false, error: 'capital_inicial debe ser un número positivo' }, { status: 400 })
    }
    updates.capital_inicial = v
  }
  if (body?.monto_base_operacion !== undefined) {
    const v = Number(body.monto_base_operacion)
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json({ ok: false, error: 'monto_base_operacion debe ser un número positivo' }, { status: 400 })
    }
    updates.monto_base_operacion = v
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'Nada para actualizar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('auto_portfolios')
    .update(updates)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, portfolio: data })
}
