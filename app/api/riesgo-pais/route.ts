import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function tryFetch(url: string, headers: Record<string, string> = {}): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json, */*', ...headers },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function GET() {
  // 1. Try BCRA principalesvariables — official Argentine central bank API
  const bcra = await tryFetch('https://api.bcra.gob.ar/estadisticas/v2/principalesvariables', {
    'Accept-Language': 'es-AR,es;q=0.9',
  })
  if (bcra) {
    const results: any[] = Array.isArray(bcra.results) ? bcra.results : []
    const rpVar = results.find((v: any) =>
      v.descripcion?.toLowerCase().includes('riesgo') ||
      v.descripcion?.toLowerCase().includes('embi')
    )
    if (rpVar?.valor != null) {
      return NextResponse.json({
        ok: true,
        valor: Math.round(Number(rpVar.valor)),
        fecha: rpVar.fecha ?? null,
        valor_cierre_anterior: null,
        source: 'bcra',
      })
    }
  }

  // 2. Try Argentine government open data API (datos.gob.ar time series)
  //    Search for EMBI+ series
  const govSearch = await tryFetch(
    'https://apis.datos.gob.ar/series/api/search/?q=embi+argentina&format=json&limit=3'
  )
  if (govSearch?.data?.length > 0) {
    const seriesId: string = govSearch.data[0]?.id
    if (seriesId) {
      const govData = await tryFetch(
        `https://apis.datos.gob.ar/series/api/series/?ids=${encodeURIComponent(seriesId)}&limit=5&format=json`
      )
      // govData.data is array of [date, value] pairs, sorted desc
      const rows: any[] = Array.isArray(govData?.data) ? govData.data : []
      if (rows.length > 0) {
        const [fecha, valor] = rows[0]
        const prev = rows[1]?.[1] ?? null
        return NextResponse.json({
          ok: true,
          valor: Math.round(Number(valor)),
          fecha: fecha ?? null,
          valor_cierre_anterior: prev != null ? Math.round(Number(prev)) : null,
          source: 'datosgob',
        })
      }
    }
  }

  // 3. Try Ambito (likely blocked from cloud but worth one shot)
  const ambito = await tryFetch('https://mercados.ambito.com/riesgo_pais/info', {
    'Referer': 'https://www.ambito.com/',
    'Origin': 'https://www.ambito.com',
  })
  if (ambito?.valor != null) {
    const v = parseInt(String(ambito.valor), 10)
    const ant = ambito.valor_cierre_anterior != null ? parseInt(String(ambito.valor_cierre_anterior), 10) : null
    if (!isNaN(v) && v > 0) {
      return NextResponse.json({
        ok: true,
        valor: v,
        fecha: ambito.fecha ?? null,
        valor_cierre_anterior: ant && !isNaN(ant) ? ant : null,
        source: 'ambito',
      })
    }
  }

  return NextResponse.json({ ok: false, error: 'all sources failed' }, { status: 502 })
}
