// Etapa 3 — semáforo de bolsas y calibración de confianza.
// Una "bolsa" es (asset_id, currency, horizon_bucket, horizon_unit): nunca se mezclan
// monedas ni horizontes distintos en la misma cuenta de aciertos.

// Etapa 27.3: 'contraproducente' es un estado NUEVO, no un error a esconder — marca las bolsas
// donde el baseline le gana al modelo de forma estadísticamente significativa. Antes esos casos
// se marcaban 'validado' por dos bugs: se comparaba contra la tasa de subas en vez de contra el
// acierto de la mejor estrategia constante, y el p-valor de McNemar es de DOS colas, así que
// "significativo" incluía "significativamente peor". 39 bolsas estaban mal marcadas.
export type Estado = 'insuficiente' | 'acumulando' | 'validado' | 'sin_edge' | 'contraproducente'

export type ScorecardBolsa = {
  asset_id: string
  currency: string
  horizon_bucket: number
  horizon_unit: string
  n_closed: number
  n_correct: number
  baseline_rate: number | null
  baseline_n: number | null
  /** Etapa 27.3 — acierto de la MEJOR estrategia constante, `max(tasa_subas, 1-tasa_subas)`,
   *  medido sobre la misma muestra cerrada. Es el número al que hay que ganarle.
   *  `baseline_rate` (tasa de subas cruda, estimada aparte) se conserva sólo como referencia. */
  baseline_acc: number | null
  mcnemar_n10: number | null
  mcnemar_n01: number | null
  p_value: number | null
  estado: Estado
  // Etapa 27.5 — la métrica que decide si conviene operar una bolsa. El acierto direccional es
  // la métrica equivocada para un sistema operado con stop-loss: el diario a 1 día acierta ~32%
  // y tiene esperanza bruta POSITIVA porque gana +2,39% y pierde -1,01% (payoff 2,37:1).
  avg_win_pct: number | null
  avg_loss_pct: number | null
  payoff_ratio: number | null
  expectancy_gross_pct: number | null
  /** Esperanza por operación neta del costo de ida y vuelta (Etapa 21). */
  expectancy_net_pct: number | null
  /** Retorno realizado / excursión favorable máxima. Cuánto del movimiento disponible queda en
   *  el bolsillo al sostener hasta el target. Null en diario hasta la Etapa 28.1. */
  capture_pct: number | null
  capture_n: number | null
  last_updated: string
}

/** Columnas de scorecard_bolsas que consume el dashboard. Centralizado acá para que agregar una
 *  métrica no requiera tocar el select de page.tsx y el tipo por separado (fue lo que pasó al
 *  agregar las de la Etapa 27.5). */
export const SCORECARD_BOLSA_SELECT =
  'asset_id, currency, horizon_bucket, horizon_unit, n_closed, n_correct, baseline_rate, ' +
  'baseline_n, baseline_acc, mcnemar_n10, mcnemar_n01, p_value, estado, avg_win_pct, ' +
  'avg_loss_pct, payoff_ratio, expectancy_gross_pct, expectancy_net_pct, capture_pct, ' +
  'capture_n, last_updated'

/** Formatea una esperanza por operación con signo explícito. */
export function fmtPct(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

export type CalibrationBin = {
  currency: string
  horizon_bucket: number
  horizon_unit: string
  bin_label: string
  bin_lo: number
  bin_hi: number
  n: number
  n_correct: number
  calibrated_rate: number | null
}

export function bolsaKey(asset_id: string, currency: string, horizon_bucket: number, horizon_unit = 'days') {
  return `${asset_id}|${currency}|${horizon_bucket}|${horizon_unit}`
}

export function calibKey(currency: string, horizon_bucket: number, horizon_unit = 'days') {
  return `${currency}|${horizon_bucket}|${horizon_unit}`
}

// Confianza calibrada para un valor crudo: busca el bin al que pertenece dentro de
// la curva de esa (currency, horizon_bucket) y devuelve la tasa real medida — o null
// si el bin no junta muestra suficiente todavía (CALIB_MIN_SAMPLES en juez-v2).
export function findCalibratedConfidence(rawConfidence: number, bins: CalibrationBin[] | undefined): number | null {
  if (!bins?.length) return null
  const bin = bins.find(b => rawConfidence >= b.bin_lo && rawConfidence < b.bin_hi)
  if (!bin || bin.calibrated_rate == null) return null
  return bin.calibrated_rate
}

export const ESTADO_META: Record<Estado, { label: string; color: string; bg: string; dot: string }> = {
  insuficiente:     { label: 'Insuficiente',         color: '#94a3b8', bg: 'rgba(148,163,184,0.14)', dot: '#94a3b8' },
  acumulando:       { label: 'Acumulando evidencia', color: '#d97706', bg: 'rgba(217,119,6,0.14)',   dot: '#d97706' },
  validado:         { label: 'Validado',             color: '#22c55e', bg: 'rgba(34,197,94,0.14)',   dot: '#22c55e' },
  sin_edge:         { label: 'Sin edge confirmado',  color: '#ef4444', bg: 'rgba(239,68,68,0.14)',   dot: '#ef4444' },
  // Etapa 27.3: peor que 'sin_edge' y hay que verlo distinto — no es "no se confirmó ventaja",
  // es "el baseline le gana con significancia estadística".
  contraproducente: { label: 'Contraproducente',     color: '#9f1239', bg: 'rgba(159,18,57,0.16)',   dot: '#9f1239' },
}

export function estadoTip(bolsa: ScorecardBolsa | null): string {
  if (!bolsa) {
    return 'Todavía no hay predicciones cerradas para este activo, moneda y horizonte — sin datos de scorecard.'
  }
  // Etapa 27.3: el baseline que importa es el acierto de la MEJOR estrategia constante sobre la
  // misma muestra, no la tasa de subas. Si un activo sube el 20% de las veces, "siempre bajista"
  // acierta 80% — ese es el número a vencer, y comparar contra el 20% era el bug.
  const bl = bolsa.baseline_acc ?? bolsa.baseline_rate
  const base = `${bolsa.n_closed} predicciones cerradas. Baseline: la mejor estrategia constante `
    + `(apostar siempre a lo mismo) acierta ${bl != null ? (bl * 100).toFixed(1) + '%' : 'sin dato'} `
    + `en esta bolsa. Ese es el número a superar.`
  const pv = bolsa.p_value != null ? ` p-valor (McNemar pareado, modelo vs. baseline): ${bolsa.p_value.toFixed(3)}.` : ''
  const esp = bolsa.expectancy_net_pct != null
    ? ` Esperanza por operación, ya descontado el costo de operar: ${fmtPct(bolsa.expectancy_net_pct)}`
      + (bolsa.payoff_ratio != null ? ` (payoff ${bolsa.payoff_ratio.toFixed(2)}:1).` : '.')
    : ''
  switch (bolsa.estado) {
    case 'insuficiente':
      return `${base} Hacen falta al menos 30 cierres para empezar a evaluar esta bolsa — todavía no se puede decir nada.${esp}`
    case 'acumulando':
      return `${base}${pv} Hay evidencia acumulándose pero hacen falta 400 cierres para un veredicto confiable.${esp}`
    case 'validado':
      return `${base}${pv} El modelo supera al baseline de forma estadísticamente significativa (p<0.05) en esta bolsa específica.${esp}`
    case 'sin_edge':
      return `${base}${pv} El modelo NO supera al baseline en esta bolsa específica — es un resultado válido, no un error: significa que acá no hay ventaja confirmada.${esp}`
    case 'contraproducente':
      return `${base}${pv} El baseline le GANA al modelo de forma estadísticamente significativa: seguir la señal en esta bolsa da peor resultado que apostar siempre a lo mismo.${esp}`
  }
}
