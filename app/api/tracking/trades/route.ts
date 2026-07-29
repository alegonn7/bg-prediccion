import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tracking_trades')
    .select(`
      id, portfolio_id, asset_id, prediction_type, daily_prediction_id, intraday_prediction_id,
      direction, monto_invertido, stop_loss_sugerido_pct, stop_loss_usado_pct, entry_price,
      status, exit_price, pnl_pct, pnl_monto, opened_at, closed_at,
      assets(ticker, name)
    `)
    .order('opened_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, trades: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const assetId = body?.asset_id as string | undefined
  const predictionType = body?.prediction_type as 'daily' | 'intraday' | undefined
  const dailyPredictionId = body?.daily_prediction_id as string | null | undefined
  const intradayPredictionId = body?.intraday_prediction_id as string | null | undefined
  const direction = body?.direction as 'up' | 'down' | undefined
  const montoInvertido = Number(body?.monto_invertido)
  const stopLossSugeridoPct = body?.stop_loss_sugerido_pct != null ? Number(body.stop_loss_sugerido_pct) : null
  const stopLossUsadoPct = Number(body?.stop_loss_usado_pct)
  const entryPrice = Number(body?.entry_price)

  if (!assetId) return NextResponse.json({ ok: false, error: 'asset_id requerido' }, { status: 400 })
  if (predictionType !== 'daily' && predictionType !== 'intraday') {
    return NextResponse.json({ ok: false, error: 'prediction_type debe ser daily|intraday' }, { status: 400 })
  }
  if (predictionType === 'daily' && (!dailyPredictionId || intradayPredictionId)) {
    return NextResponse.json({ ok: false, error: 'daily_prediction_id requerido (y sólo ese) cuando prediction_type=daily' }, { status: 400 })
  }
  if (predictionType === 'intraday' && (!intradayPredictionId || dailyPredictionId)) {
    return NextResponse.json({ ok: false, error: 'intraday_prediction_id requerido (y sólo ese) cuando prediction_type=intraday' }, { status: 400 })
  }
  if (direction !== 'up' && direction !== 'down') {
    return NextResponse.json({ ok: false, error: 'direction debe ser up|down' }, { status: 400 })
  }
  if (!Number.isFinite(montoInvertido) || montoInvertido <= 0) {
    return NextResponse.json({ ok: false, error: 'monto_invertido debe ser un número positivo' }, { status: 400 })
  }
  if (!Number.isFinite(stopLossUsadoPct)) {
    return NextResponse.json({ ok: false, error: 'stop_loss_usado_pct debe ser un número' }, { status: 400 })
  }
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return NextResponse.json({ ok: false, error: 'entry_price debe ser un número positivo' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: asset, error: assetErr } = await admin
    .from('assets')
    .select('id, currency')
    .eq('id', assetId)
    .single()
  if (assetErr || !asset) return NextResponse.json({ ok: false, error: 'Activo no encontrado' }, { status: 404 })

  const { data: portfolio, error: portfolioErr } = await admin
    .from('tracking_portfolios')
    .select('id')
    .eq('currency', asset.currency)
    .maybeSingle()
  if (portfolioErr) return NextResponse.json({ ok: false, error: portfolioErr.message }, { status: 500 })
  if (!portfolio) {
    return NextResponse.json(
      { ok: false, error: `No existe un portfolio ${asset.currency} todavía — creá uno primero` },
      { status: 400 }
    )
  }

  const { data, error } = await admin
    .from('tracking_trades')
    .insert({
      portfolio_id: portfolio.id,
      asset_id: assetId,
      prediction_type: predictionType,
      daily_prediction_id: dailyPredictionId ?? null,
      intraday_prediction_id: intradayPredictionId ?? null,
      direction,
      monto_invertido: montoInvertido,
      stop_loss_sugerido_pct: stopLossSugeridoPct,
      stop_loss_usado_pct: stopLossUsadoPct,
      entry_price: entryPrice,
    })
    .select(`
      id, portfolio_id, asset_id, prediction_type, daily_prediction_id, intraday_prediction_id,
      direction, monto_invertido, stop_loss_sugerido_pct, stop_loss_usado_pct, entry_price,
      status, exit_price, pnl_pct, pnl_monto, opened_at, closed_at,
      assets(ticker, name)
    `)
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, trade: data })
}
