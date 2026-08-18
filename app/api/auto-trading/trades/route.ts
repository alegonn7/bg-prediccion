import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// Etapa 30: sólo lectura desde el dashboard — a diferencia de tracking_trades (que el usuario
// carga a mano), auto_trades sólo lo escribe el motor de python-api (service role, vía
// /api/motor_ejecucion), nunca esta ruta. No hay POST/DELETE acá a propósito.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('auto_trades')
    .select(`
      id, portfolio_id, asset_id, prediction_type, daily_prediction_id, intraday_prediction_id,
      direction, venue, modo, horizon_value, horizon_unit, bolsa_estado_al_entrar,
      bolsa_expectancy_net_at_entry, monto_invertido, cantidad, stop_loss_sugerido_pct,
      stop_loss_usado_pct, take_profit_pct, entry_price, status, exit_price, pnl_pct, pnl_monto,
      opened_at, closed_at, assets(ticker, name)
    `)
    .order('opened_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, trades: data ?? [] })
}
