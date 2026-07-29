import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { sinceFor, type ClosedRange } from '@/lib/closedPredictions'
import { fetchIntradayScorecardStats } from '@/lib/intradayScorecardStats'

const RANGES: ClosedRange[] = ['7d', '30d', '90d', 'month', 'all']

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const range = req.nextUrl.searchParams.get('range') as ClosedRange | null
  if (!range || !RANGES.includes(range)) {
    return NextResponse.json({ ok: false, error: `range debe ser uno de ${RANGES.join('|')}` }, { status: 400 })
  }

  try {
    const stats = await fetchIntradayScorecardStats(supabase, sinceFor(range, 'closed_at'))
    return NextResponse.json({ ok: true, stats })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
