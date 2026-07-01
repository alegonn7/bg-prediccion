import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  if (!process.env.PYTHON_API_URL) {
    return NextResponse.json({ ok: false, error: 'PYTHON_API_URL not configured' }, { status: 500 })
  }

  const pythonUrl = `${process.env.PYTHON_API_URL}/api/predict_xgb`
  const secret = process.env.XGB_INTERNAL_SECRET ?? ''

  try {
    const resp = await fetch(pythonUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
      },
      body: '{}',
    })
    const result = await resp.json().catch(() => ({ ok: false, error: 'Python API returned invalid JSON' }))
    return NextResponse.json(result, { status: resp.ok ? 200 : 500 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: `Fetch failed: ${msg}` }, { status: 500 })
  }
}
