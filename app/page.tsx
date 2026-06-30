import { createClient } from '@/lib/supabase-server'
import { DashboardClient } from '@/components/DashboardClient'
import type { BacktestRun, HorizonWeight } from '@/components/EntrenamientoSection'

const ALL_MODELS = [
  'tendencia','momentum','volatilidad','volumen','estructura','elliott',
  'velas','macro','fundamental','sentimiento',
  'regresion','reversion','divergencias',
  'estacionalidad','beta_mercado','fuerza_relativa',
]

export type ModelDetailStat = {
  model_name: string
  total: number
  correct: number
  dir_accuracy: number | null
  called_up: number; correct_up: number
  called_down: number; correct_down: number
  mae_avg: number | null
  rmse_avg: number | null
  mae_when_correct: number | null
  mae_when_wrong: number | null
  avg_confidence: number
  conf_low:  { total: number; correct: number }
  conf_mid:  { total: number; correct: number }
  conf_high: { total: number; correct: number }
  by_ticker: { ticker: string; total: number; correct: number; accuracy: number; mae_avg: number | null }[]
  mae_by_horizon: { horizon: number; mae: number; n: number }[]
  recent: { correct: boolean; confidence: number; ticker: string }[]
}

function buildModelStats(preds: any[]): ModelDetailStat[] {
  const byModel: Record<string, any[]> = {}
  for (const mn of ALL_MODELS) byModel[mn] = []
  for (const p of preds) {
    if (!byModel[p.model_name]) byModel[p.model_name] = []
    byModel[p.model_name].push(p)
  }

  return ALL_MODELS.map(mn => {
    const ps = byModel[mn] ?? []
    const total   = ps.length
    const correct = ps.filter((p: any) => p.direction_correct).length
    const up      = ps.filter((p: any) => p.direction === 'up')
    const down    = ps.filter((p: any) => p.direction === 'down')

    const maes = ps.filter((p: any) => p.mae  != null).map((p: any) => Number(p.mae))
    const sqs  = ps.filter((p: any) => p.rmse != null).map((p: any) => Number(p.rmse))
    const confs = ps.map((p: any) => Number(p.confidence))

    const LOW = 0.40, HIGH = 0.65
    const lowConf  = ps.filter((p: any) => Number(p.confidence) <  LOW)
    const midConf  = ps.filter((p: any) => Number(p.confidence) >= LOW && Number(p.confidence) < HIGH)
    const highConf = ps.filter((p: any) => Number(p.confidence) >= HIGH)

    const byTicker: Record<string, { total: number; correct: number; maes: number[] }> = {}
    for (const p of ps) {
      const t = (p.assets as any)?.ticker ?? '?'
      if (!byTicker[t]) byTicker[t] = { total: 0, correct: 0, maes: [] }
      byTicker[t].total++
      if (p.direction_correct) byTicker[t].correct++
      if (p.mae != null) byTicker[t].maes.push(Number(p.mae))
    }

    const HORIZON_BUCKETS = [1, 2, 7, 14, 30, 60, 90]
    const byHorizon: Record<number, number[]> = {}
    for (const h of HORIZON_BUCKETS) byHorizon[h] = []
    for (const p of ps) {
      if (p.mae == null) continue
      const h = Number(p.horizon_days)
      const bucket = HORIZON_BUCKETS.find(b => h <= b) ?? 90
      byHorizon[bucket].push(Number(p.mae))
    }

    const correctPreds = ps.filter((p: any) => p.direction_correct && p.mae != null)
    const wrongPreds   = ps.filter((p: any) => !p.direction_correct && p.mae != null)
    const avgMae = (arr: any[]) => arr.length ? arr.reduce((s, p) => s + Number(p.mae), 0) / arr.length : null

    return {
      model_name:    mn,
      total, correct,
      dir_accuracy:  total >= 3 ? correct / total : null,
      called_up:     up.length,
      correct_up:    up.filter((p: any)   => p.direction_correct).length,
      called_down:   down.length,
      correct_down:  down.filter((p: any) => p.direction_correct).length,
      mae_avg:       maes.length ? maes.reduce((a, b) => a + b, 0) / maes.length : null,
      rmse_avg:      sqs.length  ? Math.sqrt(sqs.reduce((a, b) => a + b, 0) / sqs.length) : null,
      mae_when_correct: avgMae(correctPreds),
      mae_when_wrong:   avgMae(wrongPreds),
      avg_confidence:confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0,
      conf_low:  { total: lowConf.length,  correct: lowConf.filter((p: any)  => p.direction_correct).length },
      conf_mid:  { total: midConf.length,  correct: midConf.filter((p: any)  => p.direction_correct).length },
      conf_high: { total: highConf.length, correct: highConf.filter((p: any) => p.direction_correct).length },
      by_ticker: Object.entries(byTicker)
        .map(([ticker, v]) => ({
          ticker, total: v.total, correct: v.correct,
          accuracy: v.total > 0 ? v.correct / v.total : 0,
          mae_avg: v.maes.length ? v.maes.reduce((a, b) => a + b, 0) / v.maes.length : null,
        }))
        .sort((a, b) => b.total - a.total),
      mae_by_horizon: HORIZON_BUCKETS
        .filter(h => byHorizon[h].length > 0)
        .map(h => ({
          horizon: h,
          mae: byHorizon[h].reduce((a, b) => a + b, 0) / byHorizon[h].length,
          n: byHorizon[h].length,
        })),
      recent: ps.slice(0, 20).map((p: any) => ({
        correct: p.direction_correct as boolean,
        confidence: Number(p.confidence),
        ticker: (p.assets as any)?.ticker ?? '?',
      })),
    }
  })
}

async function getData() {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const [
    { data: open },
    { data: closed },
    { data: modelWeights },
    { data: allAssets },
    { data: closedModelPreds },
    { data: backtestRuns },
    { data: horizonWeights },
  ] = await Promise.all([
    supabase
      .from('consensus_predictions')
      .select(`
        id, direction, confidence, horizon_days, target_date,
        price_at_creation, created_at, agreement_pct,
        models_bullish, models_bearish, models_neutral, models_total,
        final_pct_predicted, asset_id, price_path, model_prediction_ids,
        assets(ticker, name, asset_class, currency)
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1000),

    supabase
      .from('consensus_predictions')
      .select(`id, direction, confidence, direction_correct, actual_final_pct,
        final_pct_predicted, agreement_pct, target_date,
        asset_id, assets(ticker, name)`)
      .eq('status', 'closed')
      .order('target_date', { ascending: false })
      .limit(500),

    supabase
      .from('model_weights')
      .select('model_name, weight, direction_accuracy, sample_size, mae_avg')
      .order('direction_accuracy', { ascending: false, nullsFirst: false }),

    supabase
      .from('assets')
      .select('id, ticker, name, sector, asset_class, currency, is_active, horizon_days')
      .eq('is_macro', false)
      .order('ticker'),

    supabase
      .from('model_predictions')
      .select('model_name, direction, direction_correct, mae, rmse, confidence, horizon_days, assets(ticker)')
      .eq('status', 'closed')
      .not('direction_correct', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5000),

    supabase
      .from('backtest_runs')
      .select('ticker, status, dates_processed, predictions_evaluated, error_msg, started_at, completed_at')
      .order('ticker'),

    supabase
      .from('model_weights_horizon')
      .select('model_name, horizon_bucket, weight, direction_accuracy, sample_size, mae_avg')
      .order('model_name'),
  ])

  // Attach current prices to open predictions
  const assetIds = [...new Set((open ?? []).map((p: any) => p.asset_id))]
  let priceMap: Record<string, number> = {}
  if (assetIds.length > 0) {
    const { data: prices } = await supabase
      .from('price_history')
      .select('asset_id, trade_date, close')
      .in('asset_id', assetIds)
      .lte('trade_date', today)
      .order('trade_date', { ascending: false })
      .limit(assetIds.length * 10)
    for (const p of (prices ?? [])) {
      if (!priceMap[p.asset_id]) priceMap[p.asset_id] = Number(p.close)
    }
  }

  const openWithPrices = (open ?? []).map((p: any) => ({
    ...p,
    current_price: priceMap[p.asset_id] ?? null,
  }))

  const closedAll = closed ?? []

  // Open predictions summary for Settings tab (ticker + horizon combos)
  const openPredsSummary = (open ?? []).map((p: any) => ({
    id: p.id,
    ticker: p.assets?.ticker ?? '?',
    horizon_days: p.horizon_days,
    direction: p.direction,
    confidence: p.confidence,
    agreement_pct: p.agreement_pct,
    final_pct_predicted: p.final_pct_predicted,
    target_date: p.target_date,
    created_at: p.created_at,
  }))

  const modelDetailStats = buildModelStats(closedModelPreds ?? [])

  return {
    open: openWithPrices,
    closed: closedAll,
    modelWeights: modelWeights ?? [],
    hits:  closedAll.filter((c: any) => c.direction_correct).length,
    total: closedAll.length,
    assets: allAssets ?? [],
    openPredsSummary,
    modelDetailStats,
    backtestRuns: (backtestRuns ?? []) as BacktestRun[],
    horizonWeights: (horizonWeights ?? []) as HorizonWeight[],
  }
}

export const revalidate = 300

export default async function Dashboard() {
  const { open, closed, modelWeights, hits, total, assets, openPredsSummary, modelDetailStats, backtestRuns, horizonWeights } = await getData()
  return (
    <DashboardClient
      open={open}
      closed={closed}
      modelWeights={modelWeights}
      hits={hits}
      total={total}
      assets={assets}
      openPredsSummary={openPredsSummary}
      modelDetailStats={modelDetailStats}
      backtestRuns={backtestRuns}
      horizonWeights={horizonWeights}
    />
  )
}
