import { createClient } from '@/lib/supabase-server'
import { DashboardClient } from '@/components/DashboardClient'
import type { BacktestRun, HorizonWeight } from '@/components/EntrenamientoSection'
import type { ModelLRParam, BacktestModelStat } from '@/components/ModelsSection'

export type { ModelLRParam, BacktestModelStat }

export type XgbHistoryEntry = {
  id: string
  model_name: string
  horizon_bucket: number
  old_accuracy: number | null
  new_accuracy: number
  old_samples: number | null
  new_samples: number
  trained_at: string
}

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
    { data: xgbHistoryRaw },
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
        final_pct_predicted, agreement_pct, target_date, horizon_days, created_at,
        asset_id, assets(ticker, name)`)
      .eq('status', 'closed')
      .order('target_date', { ascending: false })
      .limit(2000),

    supabase
      .from('consensus_predictions_intraday')
      .select('id, direction, direction_correct, actual_pct, final_pct_predicted, agreement_pct, horizon_minutes, closed_at, created_at, asset_id, assets(ticker, name)')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(2000),

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
      .limit(2000),

    supabase
      .from('model_changelog')
      .select('id, snapshot_at, model_name, horizon_bucket, change_type, trigger, old_samples, new_samples, old_accuracy, new_accuracy, old_weight, new_weight, old_dir_accuracy, new_dir_accuracy, max_coeff_delta, top_changed_feature, feature_names, summary')
      .order('snapshot_at', { ascending: false })
      .limit(200),

    supabase
      .from('xgb_training_history')
      .select('id, model_name, horizon_bucket, old_accuracy, new_accuracy, old_samples, new_samples, trained_at')
      .order('trained_at', { ascending: false })
      .limit(300),
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

  return {
    open: openWithPrices,
    closed: closedAll,
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
    xgbHistory: (xgbHistoryRaw ?? []) as XgbHistoryEntry[],
  }
}

export const revalidate = 300

export default async function Dashboard() {
  const {
    open, closed, closedIntraday, modelWeights, hits, total, assets,
    openPredsSummary, dailyModelParams,
    backtestRuns, horizonWeights,
    modelLRParams, backtestModelStats, changelog, xgbHistory,
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
      xgbHistory={xgbHistory}
    />
  )
}
