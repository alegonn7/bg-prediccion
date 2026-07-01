import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ ok: false, error: 'Missing jobId' }, { status: 400 })

  if (!process.env.PYTHON_API_URL) {
    return NextResponse.json({ ok: false, error: 'PYTHON_API_URL not configured' }, { status: 500 })
  }

  const pythonUrl = `${process.env.PYTHON_API_URL}/api/train_status/${jobId}`
  const secret = process.env.XGB_INTERNAL_SECRET ?? ''

  try {
    const resp = await fetch(pythonUrl, {
      headers: { 'x-internal-secret': secret },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    const result = await resp.json().catch(() => ({ ok: false, error: 'Invalid JSON' }))
    return NextResponse.json(result, { status: resp.ok ? 200 : resp.status })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
