'use client'
import { useState } from 'react'
import { ThemeToggle } from './ThemeToggle'
import { LogoutButton } from './LogoutButton'
import { ScorecardSection } from './Scorecard'
import { OpenPredictionsSection } from './OpenPredictions'
import { ClosedPredictionsSection } from './ClosedPredictions'
import { SettingsSection } from './Settings'
import { ModelAnalysisSection } from './ModelAnalysis'
import { NewsSectionClient } from './NewsSection'
import { ArgentinaSectionClient } from './ArgentinaSection'
import { CedearDualSection } from './CedearDualSection'
import { IntradaySectionClient } from './IntradaySection'
import { EntrenamientoSection } from './EntrenamientoSection'
import { ModelosSection } from './ModelsSection'
import type { ChangelogEntry, XgbHistoryEntry, DailyModelParam, ClosedIntradayPred, CedearPair, CclInfo } from '@/app/page'
import type { BacktestRun, HorizonWeight } from './EntrenamientoSection'
import type { ModelLRParam, BacktestModelStat } from './ModelsSection'
import type { ScorecardBolsa, CalibrationBin } from '@/lib/scorecard'

type Tab = 'scorecard' | 'open' | 'closed' | 'analysis' | 'settings' | 'news' | 'argentina' | 'intraday' | 'entrenamiento' | 'modelos'

type Props = {
  open: any[]
  closed: any[]
  closedIntraday: ClosedIntradayPred[]
  modelWeights: any[]
  hits: number
  total: number
  assets: any[]
  openPredsSummary: any[]
  dailyModelParams: DailyModelParam[]
  backtestRuns: BacktestRun[]
  horizonWeights: HorizonWeight[]
  modelLRParams: ModelLRParam[]
  backtestModelStats: BacktestModelStat[]
  changelog: ChangelogEntry[]
  xgbHistory: XgbHistoryEntry[]
  scorecardBolsas: Record<string, ScorecardBolsa>
  confidenceCalibration: Record<string, CalibrationBin[]>
  cedearPairs: CedearPair[]
  ccl: CclInfo
}

export function DashboardClient({
  open, closed, closedIntraday, modelWeights, hits, total, assets, openPredsSummary,
  dailyModelParams, backtestRuns, horizonWeights, modelLRParams, backtestModelStats, changelog, xgbHistory,
  scorecardBolsas, confidenceCalibration, cedearPairs, ccl,
}: Props) {
  const [active, setActive] = useState<Tab>('scorecard')

  function tabStyle(on: boolean): React.CSSProperties {
    return {
      appearance: 'none',
      background: 'none',
      border: 'none',
      borderBottom: on ? '2px solid var(--text)' : '2px solid transparent',
      color: on ? 'var(--text)' : 'var(--text-muted)',
      fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
      fontSize: 13,
      fontWeight: on ? 600 : 400,
      padding: '12px 16px',
      cursor: 'pointer',
      marginBottom: -1,
      whiteSpace: 'nowrap',
      transition: 'color 0.15s ease',
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px 96px' }}>

        <header style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 24, flexWrap: 'wrap', paddingBottom: 36, marginBottom: 44,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ maxWidth: 600 }}>
            <div style={{
              fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--text-hint)', marginBottom: 14,
            }}>
              Motor de Predicciones Auditadas · 16 modelos diarios + 13 intradiarios · Tiempo real
            </div>
            <h1 style={{ fontSize: 30, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
              ¿Puede la IA predecir el mercado?
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-muted)', margin: 0 }}>
              Diez modelos independientes votan cada día. Las predicciones se congelan al emitirse y se auditan contra la realidad, sin retoques.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>

        <nav style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginBottom: 40, borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => setActive('scorecard')}     style={tabStyle(active === 'scorecard')}>01 · ¿Funciona?</button>
          <button onClick={() => setActive('open')}          style={tabStyle(active === 'open')}>
            02 · Activas{open.length > 0 ? ` (${open.length})` : ''}
          </button>
          <button onClick={() => setActive('intraday')}      style={tabStyle(active === 'intraday')}>03 · Intradiario</button>
          <button onClick={() => setActive('news')}          style={tabStyle(active === 'news')}>04 · Noticias</button>
          <button onClick={() => setActive('argentina')}     style={tabStyle(active === 'argentina')}>05 · Argentina</button>
          <button onClick={() => setActive('analysis')}      style={tabStyle(active === 'analysis')}>06 · Análisis</button>
          <button onClick={() => setActive('closed')}        style={tabStyle(active === 'closed')}>07 · Historial</button>
          <button onClick={() => setActive('settings')}      style={tabStyle(active === 'settings')}>08 · Configurar</button>
          <button onClick={() => setActive('entrenamiento')} style={tabStyle(active === 'entrenamiento')}>09 · Entrenamiento</button>
          <button onClick={() => setActive('modelos')}       style={tabStyle(active === 'modelos')}>10 · Modelos</button>
        </nav>

        {active === 'scorecard'     && <ScorecardSection modelWeights={modelWeights} hits={hits} total={total} closedPreds={closed} closedIntradayPreds={closedIntraday} scorecardBolsas={scorecardBolsas} />}
        {active === 'open'          && <OpenPredictionsSection predictions={open} dailyModelParams={dailyModelParams} scorecardBolsas={scorecardBolsas} confidenceCalibration={confidenceCalibration} />}
        {active === 'intraday'      && <IntradaySectionClient />}
        {active === 'closed'        && <ClosedPredictionsSection results={closed} scorecardBolsas={scorecardBolsas} />}
        {active === 'settings'      && <SettingsSection initialAssets={assets} initialOpenPreds={openPredsSummary} />}
        {active === 'analysis'      && <ModelAnalysisSection closedPreds={closed} />}
        {active === 'news'          && <NewsSectionClient />}
        {active === 'argentina'     && (
          <>
            <CedearDualSection pairs={cedearPairs} ccl={ccl} openPredictions={open} scorecardBolsas={scorecardBolsas} />
            <ArgentinaSectionClient />
          </>
        )}
        {active === 'entrenamiento' && (
          <EntrenamientoSection
            runs={backtestRuns}
            horizonWeights={horizonWeights}
            globalWeights={modelWeights}
            backtestModelStats={backtestModelStats}
            changelog={changelog}
            xgbHistory={xgbHistory}
            dailyModelParams={dailyModelParams}
          />
        )}
        {active === 'modelos' && (
          <ModelosSection
            modelLRParams={modelLRParams}
            backtestModelStats={backtestModelStats}
            dailyModelParams={dailyModelParams}
          />
        )}

      </div>
    </div>
  )
}
