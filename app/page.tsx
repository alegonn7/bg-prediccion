import { createClient } from '@/lib/supabase-server'
import { DashboardClient } from '@/components/DashboardClient'
import type { BacktestRun, HorizonWeight } from '@/components/EntrenamientoSection'
import type { ModelLRParam, BacktestModelStat } from '@/components/ModelsSection'
import { bolsaKey, calibKey, type ScorecardBolsa, type CalibrationBin } from '@/lib/scorecard'

export type { ModelLRParam, BacktestModelStat }

export type ChangelogEntry = {
  id: number
  snapshot_at: string
  model_name: string
  horizon_bucket: number | null
  change_type: 'lr_params' | 'weight'
  trigger: string
  old_samples: number | null
  new_samples: number | null
  old_accuracy: number | null
  new_accuracy: number | null
  old_weight: number | null
  new_weight: number | null
  old_dir_accuracy: number | null
  new_dir_accuracy: number | null
  max_coeff_delta: number | null
  top_changed_feature: string | null
  feature_names: string[] | null
  summary: string | null
}

export type ClosedIntradayPred = {
  id: string
  direction: string
  direction_correct: boolean | null
  actual_pct: number | null
  final_pct_predicted: number | null
  agreement_pct: number | null
  horizon_minutes: number
  closed_at: string | null
  created_at: string
  asset_id: string
  assets: { ticker: string; name: string } | null
}

export type CedearPair = {
  cedearAssetId: string
  cedearTicker: string
  underlyingAssetId: string
  underlyingTicker: string
  ratio: number | null
  cedearPriceArs: number | null
  underlyingPriceUsd: number | null
  impliedUsdPrice: number | null
  gapPct: number | null
}

export type CclInfo = { venta: number; compra: number | null; fecha: string } | null

export type DailyModelParam = {
  horizon_bucket: number
  lgbm_val_mae: number | null
  val_mae_ridge: number | null
  signed_r2: number | null
  train_samples: number | null
  avg_actual_mag: number | null
  last_updated: string | null
  error_p25: number | null
  error_p50: number | null
  error_p75: number | null
  error_p90: number | null
}


async function getData() {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const [
    { data: open },
    { data: closed },
    { data: closedIntraday },
    { data: modelWeights },
    { data: allAssets },
    { data: dailyModelParamsRaw },
    { data: backtestRuns },
    { data: horizonWeights },
    { data: modelLRParamsRaw },
    { data: backtestStatsRaw },
    { data: changelogRaw },
    { data: scorecardBolsasRaw },
    { data: confidenceCalibrationRaw },
    { data: cclRaw },
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
      .limit(500),

    supabase
      .from('consensus_predictions')
      .select(`id, direction, confidence, direction_correct, actual_final_pct,
        final_pct_predicted, agreement_pct, target_date, horizon_days, created_at,
        asset_id, assets(ticker, name, currency)`)
      .eq('status', 'closed')
      .order('target_date', { ascending: false })
      .limit(500),

    supabase
      .from('consensus_predictions_intraday')
      .select('id, direction, direction_correct, actual_pct, final_pct_predicted, agreement_pct, horizon_minutes, closed_at, created_at, asset_id, assets(ticker, name)')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(500),

    supabase
      .from('model_weights')
      .select('model_name, weight, direction_accuracy, sample_size, mae_avg')
      .order('direction_accuracy', { ascending: false, nullsFirst: false }),

    supabase
      .from('assets')
      .select('id, ticker, name, sector, asset_class, currency, is_active, horizon_days, core_bucket, underlying_ticker, cedear_ratio')
      .eq('is_macro', false)
      .order('ticker'),

    supabase
      .from('model_signed_params_daily')
      .select('horizon_bucket, lgbm_val_mae, val_mae_ridge, signed_r2, train_samples, avg_actual_mag, last_updated, error_p25, error_p50, error_p75, error_p90')
      .order('horizon_bucket'),

    supabase
      .from('backtest_runs')
      .select('ticker, status, dates_processed, predictions_evaluated, error_msg, started_at, completed_at')
      .order('ticker'),

    supabase
      .from('model_weights_horizon')
      .select('model_name, horizon_bucket, weight, direction_accuracy, sample_size, mae_avg')
      .order('model_name'),

    supabase
      .from('model_learned_params')
      .select('model_name, horizon_bucket, train_samples, train_accuracy, bias, feature_names, coefficients, last_updated')
      .order('model_name'),

    supabase
      .from('backtest_stats')
      .select('model_name, horizon_bucket, correct_count, total_count, brier_sum, brier_count, mae_sum, mae_count')
      .limit(500),

    supabase
      .from('model_changelog')
      .select('id, snapshot_at, model_name, horizon_bucket, change_type, trigger, old_samples, new_samples, old_accuracy, new_accuracy, old_weight, new_weight, old_dir_accuracy, new_dir_accuracy, max_coeff_delta, top_changed_feature, feature_names, summary')
      .order('snapshot_at', { ascending: false })
      .limit(200),

    supabase
      .from('scorecard_bolsas')
      .select('asset_id, currency, horizon_bucket, horizon_unit, n_closed, n_correct, baseline_rate, baseline_n, mcnemar_n10, mcnemar_n01, p_value, estado, last_updated'),

    supabase
      .from('confidence_calibration')
      .select('currency, horizon_bucket, horizon_unit, bin_label, bin_lo, bin_hi, n, n_correct, calibrated_rate'),

    // Etapa 6.1: histórico de CCL (ver dolar_ccl_history) — sólo necesitamos el más reciente
    // para reconstruir el precio USD implícito de los CEDEARs (Etapa 6.3).
    supabase
      .from('dolar_ccl_history')
      .select('fecha, compra, venta')
      .order('fecha', { ascending: false })
      .limit(1),
  ])

  // Etapa 6.2/6.3: pares CEDEAR (ars) <-> subyacente (usd) para la vista dual. underlying_ticker
  // y cedear_ratio se cargaron en esta misma sesión (ver migración etapa6_add_cedear_underlyings_and_ratios).
  const assetsByTicker: Record<string, any> = {}
  for (const a of (allAssets ?? [])) assetsByTicker[a.ticker] = a
  const cedearAssets = (allAssets ?? []).filter((a: any) => a.core_bucket === 'cedear_arg')
  const cedearPairsBase = cedearAssets
    .map((c: any) => ({ cedear: c, underlying: c.underlying_ticker ? assetsByTicker[c.underlying_ticker] : null }))
    .filter((p: any) => p.underlying)

  // Attach current prices to open predictions (+ a los pares CEDEAR/subyacente de arriba)
  const assetIds = [...new Set([
    ...(open ?? []).map((p: any) => p.asset_id),
    ...cedearPairsBase.flatMap((p: any) => [p.cedear.id, p.underlying.id]),
  ])]
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

  const latestCcl = (cclRaw ?? [])[0] ?? null
  const cedearPairs = cedearPairsBase.map((p: any) => {
    const cedearPriceArs = priceMap[p.cedear.id] ?? null
    const underlyingPriceUsd = priceMap[p.underlying.id] ?? null
    const ratio = p.cedear.cedear_ratio != null ? Number(p.cedear.cedear_ratio) : null
    const cclVenta = latestCcl?.venta != null ? Number(latestCcl.venta) : null
    const impliedUsdPrice = (cedearPriceArs != null && ratio != null && cclVenta)
      ? (cedearPriceArs * ratio) / cclVenta
      : null
    const gapPct = (impliedUsdPrice != null && underlyingPriceUsd)
      ? ((impliedUsdPrice - underlyingPriceUsd) / underlyingPriceUsd) * 100
      : null
    return {
      cedearAssetId: p.cedear.id,
      cedearTicker: p.cedear.ticker as string,
      underlyingAssetId: p.underlying.id,
      underlyingTicker: p.underlying.ticker as string,
      ratio,
      cedearPriceArs,
      underlyingPriceUsd,
      impliedUsdPrice,
      gapPct,
    }
  })

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

  // Aggregate backtest_stats by model+horizon across all tickers
  const bsAggMap: Record<string, BacktestModelStat> = {}
  for (const r of (backtestStatsRaw ?? [])) {
    const key = `${r.model_name}_${r.horizon_bucket}`
    if (!bsAggMap[key]) {
      bsAggMap[key] = {
        model_name: r.model_name, horizon_bucket: r.horizon_bucket,
        correct: 0, total: 0, brier_sum: 0, brier_count: 0, mae_sum: 0, mae_count: 0,
        pct: 0, brier_avg: 0, mae_avg: 0,
      } as any
    }
    const s = bsAggMap[key] as any
    s.correct    += r.correct_count ?? 0
    s.total      += r.total_count ?? 0
    s.brier_sum  += r.brier_sum ?? 0
    s.brier_count+= r.brier_count ?? 0
    s.mae_sum    += r.mae_sum ?? 0
    s.mae_count  += r.mae_count ?? 0
  }
  const backtestModelStats: BacktestModelStat[] = Object.values(bsAggMap).map((s: any) => ({
    ...s,
    pct:       s.total       > 0 ? s.correct    / s.total       : 0,
    brier_avg: s.brier_count > 0 ? s.brier_sum  / s.brier_count : 0,
    mae_avg:   s.mae_count   > 0 ? s.mae_sum    / s.mae_count   : 0,
  }))

  // Etapa 3: mapas de scorecard por bolsa (asset+moneda+horizonte) y curva de
  // calibración de confianza por (moneda, horizonte) — ver dashboard/lib/scorecard.ts.
  const scorecardBolsas: Record<string, ScorecardBolsa> = {}
  for (const r of (scorecardBolsasRaw ?? []) as ScorecardBolsa[]) {
    scorecardBolsas[bolsaKey(r.asset_id, r.currency, r.horizon_bucket, r.horizon_unit)] = r
  }
  const confidenceCalibration: Record<string, CalibrationBin[]> = {}
  for (const r of (confidenceCalibrationRaw ?? []) as CalibrationBin[]) {
    const key = calibKey(r.currency, r.horizon_bucket, r.horizon_unit)
    if (!confidenceCalibration[key]) confidenceCalibration[key] = []
    confidenceCalibration[key].push(r)
  }

  return {
    open: openWithPrices,
    closed: closedAll,
    scorecardBolsas,
    confidenceCalibration,
    closedIntraday: (closedIntraday ?? []) as unknown as ClosedIntradayPred[],
    modelWeights: modelWeights ?? [],
    hits:  closedAll.filter((c: any) => c.direction_correct).length,
    total: closedAll.length,
    assets: allAssets ?? [],
    openPredsSummary,
    dailyModelParams: (dailyModelParamsRaw ?? []) as DailyModelParam[],
    backtestRuns: (backtestRuns ?? []) as BacktestRun[],
    horizonWeights: (horizonWeights ?? []) as HorizonWeight[],
    modelLRParams: (modelLRParamsRaw ?? []) as ModelLRParam[],
    backtestModelStats,
    changelog: (changelogRaw ?? []) as ChangelogEntry[],
    cedearPairs,
    ccl: latestCcl ? { venta: Number(latestCcl.venta), compra: latestCcl.compra != null ? Number(latestCcl.compra) : null, fecha: latestCcl.fecha as string } : null,
  }
}

export const revalidate = 600

export default async function Dashboard() {
  const {
    open, closed, closedIntraday, modelWeights, hits, total, assets,
    openPredsSummary, dailyModelParams,
    backtestRuns, horizonWeights,
    modelLRParams, backtestModelStats, changelog,
    scorecardBolsas, confidenceCalibration, cedearPairs, ccl,
  } = await getData()
  return (
    <DashboardClient
      open={open}
      closed={closed}
      closedIntraday={closedIntraday}
      modelWeights={modelWeights}
      hits={hits}
      total={total}
      assets={assets}
      openPredsSummary={openPredsSummary}
      dailyModelParams={dailyModelParams}
      backtestRuns={backtestRuns}
      horizonWeights={horizonWeights}
      modelLRParams={modelLRParams}
      backtestModelStats={backtestModelStats}
      changelog={changelog}
      scorecardBolsas={scorecardBolsas}
      confidenceCalibration={confidenceCalibration}
      cedearPairs={cedearPairs}
      ccl={ccl}
    />
  )
}
