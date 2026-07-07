import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const symbol = req.nextUrl.searchParams.get('symbol') ?? ''
  if (!symbol) return NextResponse.json({ ok: false, error: 'symbol required' }, { status: 400 })

  const key = process.env.FINNHUB_KEY
  if (!key) return NextResponse.json({ ok: false, error: 'FINNHUB_KEY not configured' }, { status: 500 })

  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.ok ? 200 : 500 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: `Fetch failed: ${msg}` }, { status: 500 })
  }
}
