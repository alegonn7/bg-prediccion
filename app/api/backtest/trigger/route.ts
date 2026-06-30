import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const BATCH_SIZE   = 25   // concurrent calls per wave — safe for Yahoo Finance
const WAVE_DELAY   = 3000 // ms between waves

async function fireAsset(ticker: string): Promise<{ ticker: string; ok: boolean }> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/backtest-asset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ ticker }),
      signal: AbortSignal.timeout(8000),
    })
    return { ticker, ok: true }
  } catch {
    return { ticker, ok: false }
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const all   = searchParams.get('all')   === 'true'
  const force = searchParams.get('force') === 'true'
  const limit = all ? 200 : 10

  const { data: pending } = await supabase
    .from('assets')
    .select('ticker')
    .eq('is_active', true)
    .limit(200)

  const { data: runs } = await supabase
    .from('backtest_runs')
    .select('ticker, status')

  const runMap: Record<string, string> = {}
  for (const r of (runs ?? [])) runMap[r.ticker] = r.status

  const toRun = (pending ?? [])
    .filter(a => force || !runMap[a.ticker] || runMap[a.ticker] === 'error')
    .slice(0, limit)
    .map(a => a.ticker)

  // En modo force: resetear los que ya están done para mostrar progreso correcto
  if (force && toRun.length > 0) {
    await supabase.from('backtest_runs')
      .update({ status: 'pending', dates_processed: 0, predictions_evaluated: 0, error_msg: null })
      .in('ticker', toRun)
  }

  if (toRun.length === 0) {
    return NextResponse.json({ ok: true, triggered: 0, message: 'Nada pendiente' })
  }

  // Pre-insert all as pending so cron doesn't re-queue them
  await supabase.from('backtest_runs').upsert(
    toRun.map(ticker => ({ ticker, status: 'pending' })),
    { onConflict: 'ticker', ignoreDuplicates: true }
  )

  // Fire in waves of BATCH_SIZE to avoid overwhelming Yahoo Finance
  const results: { ticker: string; ok: boolean }[] = []
  for (let i = 0; i < toRun.length; i += BATCH_SIZE) {
    const wave = toRun.slice(i, i + BATCH_SIZE)
    const waveResults = await Promise.all(wave.map(fireAsset))
    results.push(...waveResults)
    if (i + BATCH_SIZE < toRun.length) {
      await new Promise(r => setTimeout(r, WAVE_DELAY))
    }
  }

  return NextResponse.json({
    ok: true,
    triggered: toRun.length,
    tickers: toRun,
    waves: Math.ceil(toRun.length / BATCH_SIZE),
  })
}
