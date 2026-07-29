import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import {
  fetchClosedPaginated, sinceFor,
  DAILY_CLOSED_SELECT, MAX_ROWS_DAILY,
  type ClosedRange,
} from '@/lib/closedPredictions'

const RANGES: ClosedRange[] = ['7d', '30d', '90d', 'month', 'all']

// Etapa 16: el filtro de fecha de las pestañas Análisis/¿Funciona?/Historial vive acá ahora
// (antes filtraban en el cliente un array ya truncado a 500 filas por page.tsx). Este endpoint
// corre la query real contra Supabase con el rango pedido cada vez que el usuario cambia el
// filtro en la UI. Sólo diario — el equivalente intradiario (Backlog post-16) es agregación en
// SQL, no filas crudas, ver /api/intraday-scorecard-stats.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const type = req.nextUrl.searchParams.get('type')
  const range = req.nextUrl.searchParams.get('range') as ClosedRange | null
  if (type !== 'daily') {
    return NextResponse.json({ ok: false, error: 'type debe ser daily' }, { status: 400 })
  }
  if (!range || !RANGES.includes(range)) {
    return NextResponse.json({ ok: false, error: `range debe ser uno de ${RANGES.join('|')}` }, { status: 400 })
  }

  try {
    const { rows, truncated } = await fetchClosedPaginated(supabase, {
      table: 'consensus_predictions', dateCol: 'target_date', select: DAILY_CLOSED_SELECT,
      since: sinceFor(range, 'target_date'), maxRows: MAX_ROWS_DAILY,
    })
    return NextResponse.json({ ok: true, rows, truncated })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
