import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await fetch('https://mercados.ambito.com/riesgo_pais/info', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.ambito.com/',
        'Origin': 'https://www.ambito.com',
        'Accept': 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(6000),
    })

    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, data })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
