'use client'
import { useState } from 'react'

export type ModelLRParam = {
  model_name: string
  horizon_bucket: number
  train_samples: number
  train_accuracy: number
  bias: number
  feature_names: string[]
  coefficients: number[]
  last_updated: string
}

export type BacktestModelStat = {
  model_name: string
  horizon_bucket: number
  correct: number
  total: number
  pct: number
  brier_avg: number
  mae_avg: number
}

type ModelMeta = {
  name: string
  label: string
  category: string
  catColor: string
  decay: 'fast' | 'trend' | 'slow' | 'seasonal' | 'inverse'
  description: string
  whatItDoes: string
  features: string[]
  horizonNote: string
  dailyOnly?: boolean
  intradayOnly?: boolean
}

const FEATURE_INFO: Record<string, { label: string; desc: string }> = {
  vs20:       { label: 'Precio/SMA20',    desc: 'Cuánto está el precio por encima (+) o debajo (−) de la media de 20 días' },
  vs50:       { label: 'Precio/SMA50',    desc: 'Posición del precio relativa a la media de 50 días' },
  vs200:      { label: 'Precio/SMA200',   desc: 'Posición del precio relativa a la media de 200 días (tendencia de largo plazo)' },
  adx_norm:   { label: 'ADX (fuerza)',    desc: 'Fuerza de la tendencia normalizada: 0=sin tendencia, 1=tendencia fuerte' },
  adx_dir:    { label: 'ADX (dirección)', desc: '+1 si DI+ > DI− (alcista), −1 si DI− > DI+ (bajista)' },
  ichimoku:   { label: 'Ichimoku',        desc: '+1=precio sobre el cloud (alcista), −1=debajo (bajista), 0=dentro' },
  sar:        { label: 'Parabolic SAR',   desc: '+1 si precio > SAR (tendencia alcista), −1 si precio < SAR (bajista)' },
  rsi_norm:   { label: 'RSI(14) norm.',   desc: 'RSI normalizado a [−1,+1]: +1=sobrecomprado, −1=sobrevendido' },
  macd_norm:  { label: 'MACD hist.',      desc: 'Histograma MACD normalizado: positivo=impulso alcista, negativo=bajista' },
  roc5:       { label: 'ROC 5 días',      desc: 'Retorno acumulado de los últimos 5 días de trading' },
  roc10:      { label: 'ROC 10 días',     desc: 'Retorno acumulado de los últimos 10 días de trading' },
  roc20:      { label: 'ROC 20 días',     desc: 'Retorno acumulado de los últimos 20 días de trading' },
  bb_pos:     { label: 'Bollinger %B',    desc: 'Posición del precio dentro de las Bandas de Bollinger: 0=banda inferior, 1=superior' },
  bb_squeeze: { label: 'BB Squeeze',      desc: 'Compresión de Bollinger: valor alto = volatilidad muy comprimida (pre-explosión)' },
  atr_norm:   { label: 'ATR norm.',       desc: 'Average True Range normalizado: indica la magnitud de volatilidad intradiaria reciente' },
  hv_norm:    { label: 'Vol. Hist. 20d',  desc: 'Volatilidad histórica a 20 días: dispersión de retornos diarios normalizada' },
  obv_dir:    { label: 'OBV dirección',   desc: '+1 si On-Balance Volume está subiendo (volumen acompañando alza), −1 si bajando' },
  candle:     { label: 'Patrón velas',    desc: 'Señal del patrón de vela japonesa: +1=alcista, −1=bajista, 0=neutral' },
  neg_vs20:   { label: '−Precio/SMA20',   desc: 'Precio por DEBAJO de SMA20 → mayor valor = más sobrevendido → potencial rebote' },
  neg_bb:     { label: '−Bollinger %B',   desc: 'BB %B invertido: precio cerca de banda inferior → señal de soporte/rebote' },
  neg_rsi:    { label: '−RSI norm.',      desc: 'RSI invertido: sobrevendido extremo se vuelve señal positiva de reversal' },
  neg_vs50:   { label: '−Precio/SMA50',   desc: 'Precio por DEBAJO de SMA50 → zona de soporte estructural, potencial rebote' },
  sin_month:  { label: 'sin(mes)',         desc: 'Componente seno del ciclo anual: captura estacionalidad mensual' },
  cos_month:  { label: 'cos(mes)',         desc: 'Componente coseno del ciclo anual: complementa sin_month para codificación cíclica' },
  sin_dow:    { label: 'sin(día semana)', desc: 'Componente seno del ciclo semanal: captura efecto lunes/viernes' },
  cos_dow:    { label: 'cos(día semana)', desc: 'Componente coseno del ciclo semanal: completa la codificación del día' },
}

const DECAY_LABEL: Record<string, string> = {
  fast:     'Señales rápidas — relevancia cae con horizonte',
  trend:    'Seguidor de tendencia — relevancia crece con horizonte',
  slow:     'Señales lentas — más útil en horizontes largos',
  seasonal: 'Estacional cíclico — no decae, varía con el ciclo',
  inverse:  'Contra-tendencia — mejor en correcciones de corto plazo',
}
const DECAY_COLOR: Record<string, string> = {
  fast: '#f59e0b', trend: '#3b82f6', slow: '#8b5cf6', seasonal: '#06b6d4', inverse: '#ec4899',
}

const DAILY_MODELS: ModelMeta[] = [
  {
    name: 'tendencia', label: 'Tendencia', category: 'Trend Following', catColor: '#3b82f6', decay: 'trend',
    description: 'Detecta y sigue la dirección dominante del mercado usando medias móviles de corto, medio y largo plazo, reforzadas por la fuerza de la tendencia (ADX) y estructuras de mercado (Ichimoku, SAR).',
    whatItDoes: 'Cuando el precio está por encima de sus SMAs 20/50/200, el ADX es elevado (tendencia fuerte) y el Ichimoku Cloud es alcista, el modelo asigna alta probabilidad de alza. Premia la confluencia triple: dirección + fuerza + estructura. Mejora con el horizonte porque las tendencias toman tiempo en desplegarse.',
    features: ['vs20','vs50','vs200','adx_norm','ichimoku','sar'],
    horizonNote: 'Más efectivo en 14–60d. En 7d hay demasiado ruido; en 90d las tendencias ya empiezan a revertirse.',
    intradayOnly: false,
  },
  {
    name: 'momentum', label: 'Momentum', category: 'Momentum / Osciladores', catColor: '#f59e0b', decay: 'fast',
    description: 'Mide la velocidad y aceleración del precio usando osciladores clásicos. Captura impulsos de corto-medio plazo antes de que se agoten.',
    whatItDoes: 'RSI elevado + MACD en positivo + ROC creciente en múltiples períodos = momentum alcista confirmado. El modelo aprende que el momentum se diluye con el tiempo: señales de 5d son más predictivas para 7–14d que para 90d.',
    features: ['rsi_norm','macd_norm','roc5','roc10','roc20'],
    horizonNote: 'Señales se disipan rápidamente. Mayor utilidad en 7–14d; en 90d el coeficiente de roc5 colapsa.',
    intradayOnly: false,
  },
  {
    name: 'volatilidad', label: 'Volatilidad', category: 'Volatilidad / Expansión', catColor: '#8b5cf6', decay: 'slow',
    description: 'Analiza el régimen de volatilidad del activo para predecir la dirección del movimiento siguiente. El patrón compresión → expansión es el núcleo del modelo.',
    whatItDoes: 'BB Squeeze alto (bandas muy apretadas) + ATR bajo = coil comprimido. El modelo aprende que tras compresión extrema el próximo movimiento suele ser alcista cuando el contexto general es positivo. ATR y HV confirman el régimen de volatilidad actual.',
    features: ['bb_pos','bb_squeeze','atr_norm','hv_norm'],
    horizonNote: 'Funciona mejor en horizontes medios (14–30d) donde el breakout de volatilidad aún no se disipó.',
    intradayOnly: false,
  },
  {
    name: 'volumen', label: 'Volumen', category: 'Volumen / Confirmación', catColor: '#10b981', decay: 'fast',
    description: 'El volumen es la "convicción" detrás del precio. OBV creciente con precio al alza confirma acumulación institucional; OBV decreciente con precio al alza señala distribución.',
    whatItDoes: 'OBV al alza + ROC positivo + patrón de vela alcista + precio sobre SMA20 = confluencia de confirmación volumétrica. El modelo aprende que las subidas sin volumen son menos sostenibles que las confirmadas por OBV.',
    features: ['obv_dir','roc5','candle','vs20'],
    horizonNote: 'Señales de volumen son más relevantes en 7–14d. El OBV pierde poder predictivo en horizontes de 60–90d.',
    intradayOnly: false,
  },
  {
    name: 'estructura', label: 'Estructura', category: 'Estructura de Mercado', catColor: '#06b6d4', decay: 'trend',
    description: 'Evalúa si el precio está en una posición estructuralmente alcista o bajista basándose en niveles clave de largo plazo y la dirección dominante de la fuerza del mercado.',
    whatItDoes: 'Precio sobre SMA200 + Ichimoku alcista + ADX direccional positivo = estructura de mercado sólida. El modelo distingue si estamos en un mercado alcista (estructura intacta) o bajista (estructura rota). Excluye deliberadamente señales de corto plazo.',
    features: ['vs50','vs200','ichimoku','adx_dir'],
    horizonNote: 'Señal de largo plazo: crece en relevancia con el horizonte. En 7d puede generar señales "tardías".',
    intradayOnly: false,
  },
  {
    name: 'elliott', label: 'Elliott', category: 'Análisis de Ondas', catColor: '#f97316', decay: 'trend',
    description: 'Aproxima la posición del precio dentro de ciclos de ondas de Elliott usando indicadores técnicos como proxy. No implementa el conteo manual de ondas sino sus correlatos estadísticos.',
    whatItDoes: 'vs20 (posición relativa), ROC de 10 y 20 días (aceleración del ciclo) y Bollinger %B (extensión del movimiento) son features proxy para detectar si el precio está en una onda impulsiva (3/5) o correctiva (A/B/C). La LR aprende qué combinaciones históricamente predicen continuación vs corrección.',
    features: ['vs20','roc10','roc20','bb_pos'],
    horizonNote: 'Más relevante en 14–60d, horizonte típico de ondas intermedias. En 7d hay demasiado ruido de sub-ondas.',
    intradayOnly: false,
  },
  {
    name: 'velas', label: 'Velas', category: 'Price Action / Velas', catColor: '#ef4444', decay: 'fast',
    description: 'Interpreta patrones de velas japonesas en contexto de tendencia y niveles técnicos. Un doji alcista sobre soporte vale más que el mismo doji en zona neutra.',
    whatItDoes: 'La señal de vela (+1/-1/0) se pondera por el contexto: precio vs SMA20 (¿en tendencia o contra-tendencia?), RSI (¿zona de sobrecompra/sobreventa?) y Bollinger %B (¿en extremo de banda?). El modelo aprende que los patrones de vela en zona extrema + contexto favorable son más predictivos.',
    features: ['candle','vs20','rsi_norm','bb_pos'],
    horizonNote: 'Señales de precio puro de muy corto plazo. Útil principalmente en 7–14d. Se diluyen rápido.',
    intradayOnly: false,
  },
  {
    name: 'macro', label: 'Macro', category: 'Macro / Largo Plazo', catColor: '#64748b', decay: 'slow',
    description: 'Evalúa el contexto macro del activo: posición estructural de largo plazo (SMA200, Ichimoku) combinada con el pulso de momentum macroeconómico (ROC20, RSI).',
    whatItDoes: 'ROC a 20 días (tendencia de un mes completo) + posición vs SMA200 (contexto macro) + Ichimoku (estructura de largo plazo) + RSI (momento macro). El modelo evalúa si el activo está en un régimen macro favorable para la inversión de medio plazo.',
    features: ['roc20','vs200','ichimoku','rsi_norm'],
    horizonNote: 'Diseñado para 30–90d. Las señales macro necesitan tiempo para manifestarse en precio.',
    intradayOnly: false,
  },
  {
    name: 'fundamental', label: 'Fundamental', category: 'Fundamental (proxy técnico)', catColor: '#84cc16', decay: 'slow',
    description: 'Proxy técnico de análisis fundamental: usa la posición del precio respecto a medias de largo plazo y momentum de medio plazo como aproximación al valor intrínseco relativo.',
    whatItDoes: 'Sin acceso a balances, el modelo usa ROC20 (cambio en valor de mercado mensual), posición vs SMA50/200 (valoración relativa histórica) y RSI (sentimiento de valoración) como proxies cuantitativos de fundamentals. Aprende cuándo el mercado considera el activo "barato" o "caro" técnicamente.',
    features: ['roc20','vs200','rsi_norm','vs50'],
    horizonNote: 'Más relevante en 30–90d, horizonte donde los fundamentales impactan precio.',
    dailyOnly: true,
    intradayOnly: false,
  },
  {
    name: 'sentimiento', label: 'Sentimiento', category: 'Sentimiento / Psicología', catColor: '#ec4899', decay: 'fast',
    description: 'Mide el estado emocional del mercado a través de osciladores e indicadores de precio que reflejan la psicología colectiva de compradores y vendedores.',
    whatItDoes: 'RSI (miedo/codicia), Bollinger %B (¿cerca del límite extremo?), ROC5 (impulso psicológico inmediato) y patrones de vela (decisión del día) forman un "termómetro de sentimiento". El modelo aprende cuándo el exceso emocional en una dirección predice continuación vs agotamiento.',
    features: ['rsi_norm','bb_pos','roc5','candle'],
    horizonNote: 'El sentimiento es volátil. Útil en 7–14d. En horizontes más largos el "ruido emocional" se cancela.',
    intradayOnly: false,
  },
  {
    name: 'regresion', label: 'Regresión', category: 'Regresión a la Media', catColor: '#a78bfa', decay: 'fast',
    description: 'Busca desviaciones estadísticas del precio respecto a su media de corto plazo. Los precios tienden a regresar a su media; este modelo cuantifica cuándo esa reversión es más probable.',
    whatItDoes: 'vs20 mide la desviación actual. ROC en distintas ventanas detecta si la tendencia de la desviación es nueva o antigua. Una desviación positiva grande + ROC decelerando = señal de que el precio ya "corrió demasiado" y puede regresar. Nótese que usa vs20 como distancia a la media, no como señal de tendencia.',
    features: ['roc5','roc10','roc20','vs20'],
    horizonNote: 'La regresión estadística opera principalmente en 7–14d. En 60–90d dominan las tendencias sobre la reversión.',
    intradayOnly: false,
  },
  {
    name: 'reversion', label: 'Reversión', category: 'Contra-Tendencia', catColor: '#f43f5e', decay: 'inverse',
    description: 'Opera deliberadamente contra la tendencia buscando puntos de agotamiento y rebote. Detecta activos sobrevendidos con alta probabilidad de reversión alcista.',
    whatItDoes: 'Usa features NEGADOS: neg_vs20 (precio muy por debajo de SMA20), neg_bb (precio cerca de banda inferior de Bollinger), neg_rsi (RSI en zona de sobreventa extrema), neg_vs50 (precio bajo SMA50 = soporte potencial). A mayor valor de cada feature negado, mayor presión alcista esperada por reversión. La LR aprende el umbral de sobreventa que históricamente produce rebounds.',
    features: ['neg_vs20','neg_bb','neg_rsi','neg_vs50'],
    horizonNote: 'Rebotes de sobreventa típicamente duran 7–30d. En 90d la "reversión" puede ya haberse cumplido o transformado en nueva tendencia.',
    intradayOnly: false,
  },
  {
    name: 'divergencias', label: 'Divergencias', category: 'Divergencias Técnicas', catColor: '#0ea5e9', decay: 'trend',
    description: 'Detecta discrepancias entre el movimiento del precio y el de sus indicadores internos (momentum, volumen). Las divergencias anticipan cambios de tendencia antes que el precio los confirme.',
    whatItDoes: 'RSI + MACD en relación con ROC5 (precio reciente) + OBV (volumen): si el precio baja pero el MACD/RSI no cae tanto = divergencia alcista. El modelo aprende las combinaciones de estas 4 variables que históricamente anticiparon reversales o aceleraciones.',
    features: ['rsi_norm','macd_norm','roc5','obv_dir'],
    horizonNote: 'Las divergencias se resuelven típicamente en 14–60d. En 7d el mercado puede "ignorarlas" temporalmente.',
    intradayOnly: false,
  },
  {
    name: 'estacionalidad', label: 'Estacionalidad', category: 'Patrones Estacionales', catColor: '#06b6d4', decay: 'seasonal',
    description: 'Captura patrones temporales recurrentes: efectos de mes del año y día de la semana que históricamente producen sesgos estadísticos en los retornos.',
    whatItDoes: 'Usa encoding cíclico seno/coseno (no variables dummy) para mes y día de semana, permitiendo capturar la naturaleza circular del tiempo sin romper continuidad (enero está "cerca" de diciembre). ROC20 ancla el contexto de mercado actual. El modelo aprende: ¿en qué meses/días este activo tiende a subir?',
    features: ['sin_month','cos_month','sin_dow','cos_dow','roc20'],
    horizonNote: 'Patrones estacionales anuales son más visibles en 30–90d. El efecto día-de-semana es visible en 7–14d.',
    dailyOnly: true,
    intradayOnly: false,
  },
  {
    name: 'beta_mercado', label: 'Beta de Mercado', category: 'Beta / Co-movimiento', catColor: '#7c3aed', decay: 'trend',
    description: 'Evalúa si el activo tiene beta positivo con el mercado usando momentum comparado y posición estructural. Activos con alta beta amplifican los movimientos del mercado general.',
    whatItDoes: 'ROC en múltiples ventanas (5/10/20d) captura el momentum reciente del activo. vs200 determina si está en régimen de mercado alcista o bajista. Ichimoku señala la estructura de largo plazo. El modelo aprende cuándo el activo está "sincronizado" con el ciclo de mercado amplio.',
    features: ['roc5','roc10','roc20','vs200','ichimoku'],
    horizonNote: 'Beta de mercado opera mejor en 14–60d, horizonte donde los ciclos de mercado son más claros.',
    intradayOnly: false,
  },
  {
    name: 'fuerza_relativa', label: 'Fuerza Relativa', category: 'Fuerza Relativa', catColor: '#65a30d', decay: 'trend',
    description: 'Mide si el activo está mostrando fuerza o debilidad relativa usando su propio momentum en múltiples temporalidades y su posición respecto a la media de 50 días.',
    whatItDoes: 'ROC a 5/10/20d (momentum de corto, medio y largo plazo) + vs50 (posición relativa a media clave). Si todas las temporalidades de momentum son positivas + precio sobre SMA50 = activo líder. El modelo distingue entre rotación sectorial (líderes vs rezagados) cuantitativamente.',
    features: ['roc5','roc10','roc20','vs50'],
    horizonNote: 'La fuerza relativa tiende a persistir 14–60d antes de revertirse (rotación). En 90d puede haber catch-up de rezagados.',
    dailyOnly: true,
    intradayOnly: false,
  },
]

const INTRADAY_ONLY: ModelMeta[] = [
  {
    name: 'apertura', label: 'Apertura', category: 'Gap / Apertura', catColor: '#f59e0b', decay: 'fast',
    description: 'Analiza el gap de apertura respecto al cierre del día anterior y el contexto de la sesión nocturna para predecir el sesgo de la jornada.',
    whatItDoes: 'Gap positivo en apertura = presión compradora acumulada en after-hours. El modelo combina el tamaño del gap, la dirección previa y el contexto horario para estimar si el gap se va a "llenar" (reversión) o "acelerar" (continuación). Lógica basada en reglas del sistema intradiario.',
    features: ['gap_pct','direction_prior','hora'],
    horizonNote: 'Solo aplica en 0–2 horas post-apertura. No tiene LR params (sistema de reglas intradiario).',
    intradayOnly: true,
  },
  {
    name: 'horario', label: 'Horario', category: 'Efecto Horario', catColor: '#06b6d4', decay: 'seasonal',
    description: 'Detecta patrones intradiarios por hora del día. Los mercados tienen comportamientos estadísticamente distintos en apertura (9:30), mediodía y cierre (16:00).',
    whatItDoes: 'La primera y última hora son las de mayor volatilidad y volumen. El mediodía suele ser de baja actividad. El modelo aprende el sesgo direccional estadístico de cada franja horaria para el activo específico. Codificación cíclica igual que estacionalidad pero en horas del día.',
    features: ['hora_dia','dia_semana'],
    horizonNote: 'Aplica solo a intraday (1–6 horas). No tiene LR params (sistema de reglas intradiario).',
    intradayOnly: true,
  },
  {
    name: 'vwap', label: 'VWAP', category: 'VWAP / Flujo', catColor: '#10b981', decay: 'fast',
    description: 'El VWAP (Volume Weighted Average Price) es el precio promedio ponderado por volumen durante la sesión. Institucionales suelen usar el VWAP como referencia de "precio justo".',
    whatItDoes: 'Precio por encima del VWAP = sesión alcista, compradores dominando. Por debajo = sesión bajista. La distancia al VWAP mide el "sobrecalentamiento" intradiario. El modelo predice si el precio va a regresar al VWAP o continuar divergiendo, en función del contexto del día.',
    features: ['precio_vs_vwap','distancia_vwap','momentum_vwap'],
    horizonNote: 'El VWAP se resetea cada sesión. Solo aplica a predicciones intradiarias (2–6 horas).',
    intradayOnly: true,
  },
]

const INTRADAY_SHARED = DAILY_MODELS.filter(m =>
  ['tendencia','momentum','volatilidad','volumen','estructura','regresion','reversion','divergencias','beta_mercado','velas'].includes(m.name)
)

const BUCKETS = [7, 14, 30, 60, 90]

function accColor(pct: number): string {
  if (pct >= 0.65) return '#16a34a'
  if (pct >= 0.58) return '#22c55e'
  if (pct >= 0.53) return '#84cc16'
  if (pct >= 0.50) return '#ca8a04'
  if (pct >= 0.46) return '#f97316'
  return '#dc2626'
}
function accBg(pct: number): string {
  if (pct >= 0.65) return '#14532d22'
  if (pct >= 0.58) return '#16a34a18'
  if (pct >= 0.53) return '#84cc1614'
  if (pct >= 0.50) return '#ca8a0414'
  if (pct >= 0.46) return '#f9731614'
  return '#dc262614'
}

function ModelCard({
  meta, lrByBucket, bsByBucket,
}: {
  meta: ModelMeta
  lrByBucket: Record<number, ModelLRParam>
  bsByBucket: Record<number, BacktestModelStat>
}) {
  const [expanded, setExpanded] = useState(false)
  const hasLR = Object.keys(lrByBucket).length > 0

  const lastUpdated = hasLR
    ? Object.values(lrByBucket).sort((a, b) =>
        new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime()
      )[0]?.last_updated
    : null

  // Compute max |coeff| across all buckets for normalization
  let maxCoeff = 0.01
  for (const lr of Object.values(lrByBucket)) {
    for (const c of lr.coefficients) {
      if (Math.abs(c) > maxCoeff) maxCoeff = Math.abs(c)
    }
  }

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>
              {meta.label}
            </h3>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: meta.catColor + '22', color: meta.catColor,
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              {meta.category}
            </span>
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 20,
              background: DECAY_COLOR[meta.decay] + '18', color: DECAY_COLOR[meta.decay],
              fontWeight: 600, letterSpacing: '0.05em',
            }}>
              {meta.decay}
            </span>
          </div>
          {lastUpdated && (
            <span style={{ fontSize: 10, color: 'var(--text-hint)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              LR actualizado {new Date(lastUpdated).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px', lineHeight: 1.6 }}>
          {meta.description}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-hint)', margin: 0, fontStyle: 'italic' }}>
          {meta.horizonNote}
        </p>
      </div>

      {/* Backtest accuracy by horizon */}
      {Object.keys(bsByBucket).length > 0 && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 8 }}>
            Backtest direccional por horizonte
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {BUCKETS.map(b => {
              const bs = bsByBucket[b]
              if (!bs) return null
              const pct = bs.pct
              return (
                <div key={b} style={{
                  background: accBg(pct), border: `1px solid ${accColor(pct)}44`,
                  borderRadius: 8, padding: '6px 10px', textAlign: 'center', minWidth: 52,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: accColor(pct), fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>
                    {(pct * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 1 }}>{b}d</div>
                  <div style={{ fontSize: 9, color: 'var(--text-hint)' }}>
                    MAE {(bs.mae_avg * 100).toFixed(1)}%
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Feature list */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 8 }}>
          Variables de entrada ({meta.features.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {meta.features.map(f => {
            const info = FEATURE_INFO[f]
            return (
              <div key={f} title={info?.desc} style={{
                fontSize: 11, padding: '3px 9px', borderRadius: 6,
                background: 'var(--bg)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', cursor: 'help', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              }}>
                {info?.label ?? f}
              </div>
            )
          })}
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', padding: '10px 20px', background: 'none', border: 'none',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{ fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
        {expanded ? 'Ocultar parámetros LR y lógica interna' : 'Ver parámetros LR, esqueleto y variables por horizonte'}
      </button>

      {expanded && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Formula skeleton */}
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 8 }}>
              Esqueleto del modelo (Regresión Logística)
            </div>
            <div style={{
              background: 'var(--bg)', borderRadius: 8, padding: '12px 14px',
              fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 11, color: 'var(--text-muted)',
              lineHeight: 1.8,
            }}>
              <div>P(alza) = σ(bias + Σᵢ coeff_i × feature_i)</div>
              <div style={{ color: 'var(--text-hint)', fontSize: 10 }}>σ(x) = 1 / (1 + e⁻ˣ)   ← función sigmoide</div>
              {hasLR && (
                <div style={{ marginTop: 8, color: 'var(--text-hint)', fontSize: 10 }}>
                  {meta.whatItDoes}
                </div>
              )}
            </div>
          </div>

          {/* LR parameters per horizon */}
          {hasLR ? (
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>
                Coeficientes aprendidos por horizonte — anchura de barra = impacto relativo
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-hint)', fontWeight: 500, minWidth: 110 }}>Variable</th>
                      {BUCKETS.map(b => lrByBucket[b] ? (
                        <th key={b} style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-hint)', fontWeight: 500, minWidth: 90 }}>{b}d</th>
                      ) : null)}
                    </tr>
                  </thead>
                  <tbody>
                    {/* bias row */}
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <td style={{ padding: '5px 8px', color: 'var(--text-hint)', fontStyle: 'italic' }}>bias (intercept)</td>
                      {BUCKETS.map(b => {
                        const lr = lrByBucket[b]
                        if (!lr) return null
                        return (
                          <td key={b} style={{ padding: '5px 8px', textAlign: 'center', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", color: lr.bias >= 0 ? '#22c55e' : '#ef4444' }}>
                            {lr.bias > 0 ? '+' : ''}{lr.bias.toFixed(3)}
                          </td>
                        )
                      })}
                    </tr>
                    {/* feature coefficient rows */}
                    {meta.features.map((f, fi) => {
                      const info = FEATURE_INFO[f]
                      return (
                        <tr key={f} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>
                            <div style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>{info?.label ?? f}</div>
                            {info?.desc && <div style={{ fontSize: 9, color: 'var(--text-hint)', marginTop: 1 }}>{info.desc}</div>}
                          </td>
                          {BUCKETS.map(b => {
                            const lr = lrByBucket[b]
                            if (!lr) return null
                            const c = lr.coefficients[fi] ?? 0
                            const pct = Math.min(100, Math.abs(c) / maxCoeff * 100)
                            const isPos = c >= 0
                            return (
                              <td key={b} style={{ padding: '5px 8px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                                  <span style={{
                                    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                                    fontSize: 10, fontWeight: 600,
                                    color: isPos ? '#22c55e' : '#f87171',
                                  }}>
                                    {c > 0 ? '+' : ''}{c.toFixed(3)}
                                  </span>
                                  <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                                    <div style={{
                                      height: '100%', width: `${pct}%`,
                                      background: isPos ? '#22c55e' : '#ef4444',
                                      borderRadius: 2,
                                    }} />
                                  </div>
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    {/* training stats */}
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <td style={{ padding: '5px 8px', color: 'var(--text-hint)', fontSize: 10 }}>Muestras LR</td>
                      {BUCKETS.map(b => {
                        const lr = lrByBucket[b]
                        if (!lr) return null
                        return (
                          <td key={b} style={{ padding: '5px 8px', textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
                            {lr.train_samples.toLocaleString()}
                          </td>
                        )
                      })}
                    </tr>
                    <tr>
                      <td style={{ padding: '5px 8px', color: 'var(--text-hint)', fontSize: 10 }}>Acc. LR (train)</td>
                      {BUCKETS.map(b => {
                        const lr = lrByBucket[b]
                        if (!lr) return null
                        const bs = bsByBucket[b]
                        const trainAcc = lr.train_accuracy
                        return (
                          <td key={b} style={{ padding: '5px 8px', textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: accColor(trainAcc), fontWeight: 600, fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" }}>
                              {(trainAcc * 100).toFixed(1)}%
                            </div>
                            {bs && (
                              <div style={{ fontSize: 9, color: 'var(--text-hint)' }}>
                                BT: {(bs.pct * 100).toFixed(1)}%
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 8 }}>
                LR (train) = precisión sobre datos de entrenamiento walk-forward · BT = backtest out-of-sample histórico · Diferencia alta → sobreajuste potencial
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-hint)', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>
              {meta.intradayOnly
                ? 'Modelo intradiario con lógica de reglas — no usa parámetros LR del sistema diario'
                : 'Sin parámetros LR disponibles — el modelo aún no fue entrenado o usa lógica de reglas'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type Props = {
  modelLRParams: ModelLRParam[]
  backtestModelStats: BacktestModelStat[]
}

export function ModelosSection({ modelLRParams, backtestModelStats }: Props) {
  const [subTab, setSubTab] = useState<'diarios' | 'intradiarios'>('diarios')

  // Build maps
  const lrMap: Record<string, Record<number, ModelLRParam>> = {}
  for (const p of modelLRParams) {
    if (!lrMap[p.model_name]) lrMap[p.model_name] = {}
    lrMap[p.model_name][p.horizon_bucket] = p
  }
  const bsMap: Record<string, Record<number, BacktestModelStat>> = {}
  for (const s of backtestModelStats) {
    if (!bsMap[s.model_name]) bsMap[s.model_name] = {}
    bsMap[s.model_name][s.horizon_bucket] = s
  }

  function subTabStyle(on: boolean): React.CSSProperties {
    return {
      padding: '8px 20px', fontSize: 13, fontWeight: on ? 700 : 400,
      background: on ? 'var(--text)' : 'var(--card)',
      color: on ? 'var(--bg)' : 'var(--text-muted)',
      border: '1px solid var(--border)', borderRadius: 8,
      cursor: 'pointer', transition: 'all 0.15s',
      fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    }
  }

  const modelsToShow = subTab === 'diarios'
    ? DAILY_MODELS
    : [...INTRADAY_SHARED, ...INTRADAY_ONLY].sort((a, b) => a.name.localeCompare(b.name))

  const trainedCount = subTab === 'diarios'
    ? DAILY_MODELS.filter(m => lrMap[m.name]).length
    : INTRADAY_SHARED.filter(m => lrMap[m.name]).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Modelos del Sistema</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Arquitectura, variables, parámetros aprendidos y rendimiento histórico de cada modelo
        </p>
      </div>

      {/* Sub-tab selector */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setSubTab('diarios')} style={subTabStyle(subTab === 'diarios')}>
          Diarios ({DAILY_MODELS.length} modelos · {trainedCount} entrenados con LR)
        </button>
        <button onClick={() => setSubTab('intradiarios')} style={subTabStyle(subTab === 'intradiarios')}>
          Intradiarios ({INTRADAY_SHARED.length + INTRADAY_ONLY.length} modelos)
        </button>
      </div>

      {/* Decay legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {Object.entries(DECAY_LABEL).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-hint)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: DECAY_COLOR[k], display: 'inline-block', flexShrink: 0 }} />
            <span><b style={{ color: DECAY_COLOR[k] }}>{k}</b> — {v}</span>
          </div>
        ))}
      </div>

      {/* Intraday note */}
      {subTab === 'intradiarios' && (
        <div style={{
          background: '#3b82f611', border: '1px solid #3b82f622',
          borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)',
        }}>
          Los modelos intradiarios son un subconjunto de los diarios (misma arquitectura LR, mismos features) más 3 modelos exclusivos del sistema de tiempo real (apertura, horario, VWAP).
          Los parámetros LR que se muestran son los del sistema <b>diario</b> — el sistema intradiario usa pesos separados almacenados en <code>model_weights_intraday</code>.
        </div>
      )}

      {/* Model cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: 16 }}>
        {modelsToShow.map(meta => (
          <ModelCard
            key={meta.name}
            meta={meta}
            lrByBucket={lrMap[meta.name] ?? {}}
            bsByBucket={bsMap[meta.name] ?? {}}
          />
        ))}
      </div>
    </div>
  )
}
