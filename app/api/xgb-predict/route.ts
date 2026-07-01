import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const pythonUrl = `${process.env.PYTHON_API_URL ?? 'http://localhost:3001'}/api/predict_xgb`
  const secret = process.env.XGB_INTERNAL_SECRET ?? ''

  const resp = await fetch(pythonUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: '{}',
  })

  const result = await resp.json().catch(() => ({ ok: false, error: 'Python function returned invalid JSON' }))
  return NextResponse.json(result, { status: resp.ok ? 200 : 500 })
}
