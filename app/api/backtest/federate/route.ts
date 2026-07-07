import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const trigger = (body?.trigger as string) ?? 'manual'

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/backtest-compute-weights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ trigger }),
      signal: AbortSignal.timeout(30000),
    })
    const json = await res.json()
    return NextResponse.json({ ok: true, ...json })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
