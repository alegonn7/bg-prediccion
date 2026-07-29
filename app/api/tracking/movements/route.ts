import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// Backlog post-21 (a pedido explícito del usuario): fondeos/retiros de capital, separados de
// tracking_portfolios.capital_inicial — ver comentario de la migración
// create_tracking_capital_movements_backlog21 y computeCapitalCurve() en lib/tracking.ts para el
// porqué de no mezclar ambos.

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tracking_capital_movements')
    .select('id, portfolio_id, amount, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, movements: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const portfolioId = body?.portfolio_id as string | undefined
  const type = body?.type as 'deposito' | 'retiro' | undefined
  const amountRaw = Number(body?.amount)

  if (!portfolioId) return NextResponse.json({ ok: false, error: 'portfolio_id requerido' }, { status: 400 })
  if (type !== 'deposito' && type !== 'retiro') {
    return NextResponse.json({ ok: false, error: 'type debe ser deposito|retiro' }, { status: 400 })
  }
  if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
    return NextResponse.json({ ok: false, error: 'amount debe ser un número positivo (el signo lo decide type)' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: portfolio, error: portfolioErr } = await admin
    .from('tracking_portfolios')
    .select('id')
    .eq('id', portfolioId)
    .maybeSingle()
  if (portfolioErr) return NextResponse.json({ ok: false, error: portfolioErr.message }, { status: 500 })
  if (!portfolio) return NextResponse.json({ ok: false, error: 'Portfolio no encontrado' }, { status: 404 })

  const amount = type === 'retiro' ? -amountRaw : amountRaw
  const { data, error } = await admin
    .from('tracking_capital_movements')
    .insert({ portfolio_id: portfolioId, amount })
    .select('id, portfolio_id, amount, created_at')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, movement: data })
}
