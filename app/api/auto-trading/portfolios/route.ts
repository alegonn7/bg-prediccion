import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import type { Currency } from '@/lib/tracking'

// Etapa 30: portfolios del motor automático (uno por moneda). A diferencia de
// tracking_portfolios no tienen costo propio — el costo lo determina el venue de ejecución
// (routeInstrument()/costoConfigForVenue() en lib/tracking.ts), no un valor editable acá.
const CURRENCIES: Currency[] = ['usd', 'ars']

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('auto_portfolios')
    .select('id, currency, capital_inicial, created_at')
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
    .select('id, currency, capital_inicial, created_at')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, portfolio: data })
}

// Etapa 30 (26/08/2026, a pedido explícito del usuario): editar el capital_inicial de un
// portfolio ya creado — es la base de la que sale el tamaño de cada posición en papel
// (capital_inicial × max_position_pct_capital × multiplicador de confianza), antes sólo
// modificable por SQL directo. Cambia la curva completa hacia atrás (capital_actual = esta base +
// P&L acumulado) igual que cambiar el valor en la base directamente — no es un aporte/retiro con
// fecha propia (auto_portfolios no tiene ese concepto, a diferencia de tracking_portfolios), es la
// configuración de base de la simulación.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const id = body?.id as string | undefined
  const capitalInicial = Number(body?.capital_inicial)

  if (!id) return NextResponse.json({ ok: false, error: 'Falta id' }, { status: 400 })
  if (!Number.isFinite(capitalInicial) || capitalInicial <= 0) {
    return NextResponse.json({ ok: false, error: 'capital_inicial debe ser un número positivo' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('auto_portfolios')
    .update({ capital_inicial: capitalInicial })
    .eq('id', id)
    .select('id, currency, capital_inicial, created_at')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, portfolio: data })
}
