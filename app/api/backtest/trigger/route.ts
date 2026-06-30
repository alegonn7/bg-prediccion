import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()

  // Pick up to 10 pending/error tickers and call backtest-asset for each
  const { data: pending } = await supabase
    .from('assets')
    .select('ticker')
    .eq('is_active', true)
    .limit(50)  // fetch more, filter below

  const { data: runs } = await supabase
    .from('backtest_runs')
    .select('ticker, status')

  const runMap: Record<string, string> = {}
  for (const r of (runs ?? [])) runMap[r.ticker] = r.status

  const toRun = (pending ?? [])
    .filter(a => !runMap[a.ticker] || runMap[a.ticker] === 'error')
    .slice(0, 10)
    .map(a => a.ticker)

  if (toRun.length === 0) {
    return NextResponse.json({ ok: true, triggered: 0, message: 'Nada pendiente' })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/backtest-asset'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Fire-and-forget each ticker (don't await all — they're long-running)
  const results = await Promise.allSettled(
    toRun.map(ticker =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ ticker }),
        signal: AbortSignal.timeout(5000),  // just confirm the function started
      }).then(r => ({ ticker, status: r.status }))
       .catch(() => ({ ticker, status: 'queued' }))
    )
  )

  return NextResponse.json({
    ok: true,
    triggered: toRun.length,
    tickers: toRun,
    results: results.map(r => r.status === 'fulfilled' ? r.value : { status: 'queued' }),
  })
}
