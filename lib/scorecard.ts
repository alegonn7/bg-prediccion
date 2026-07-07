// Etapa 3 — semáforo de bolsas y calibración de confianza.
// Una "bolsa" es (asset_id, currency, horizon_bucket, horizon_unit): nunca se mezclan
// monedas ni horizontes distintos en la misma cuenta de aciertos.

export type Estado = 'insuficiente' | 'acumulando' | 'validado' | 'sin_edge'

export type ScorecardBolsa = {
  asset_id: string
  currency: string
  horizon_bucket: number
  horizon_unit: string
  n_closed: number
  n_correct: number
  baseline_rate: number | null
  baseline_n: number | null
  mcnemar_n10: number | null
  mcnemar_n01: number | null
  p_value: number | null
  estado: Estado
  last_updated: string
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
  insuficiente: { label: 'Insuficiente',          color: '#94a3b8', bg: 'rgba(148,163,184,0.14)', dot: '#94a3b8' },
  acumulando:   { label: 'Acumulando evidencia',  color: '#d97706', bg: 'rgba(217,119,6,0.14)',   dot: '#d97706' },
  validado:     { label: 'Validado',              color: '#22c55e', bg: 'rgba(34,197,94,0.14)',   dot: '#22c55e' },
  sin_edge:     { label: 'Sin edge confirmado',   color: '#ef4444', bg: 'rgba(239,68,68,0.14)',   dot: '#ef4444' },
}

export function estadoTip(bolsa: ScorecardBolsa | null): string {
  if (!bolsa) {
    return 'Todavía no hay predicciones cerradas para este activo, moneda y horizonte — sin datos de scorecard.'
  }
  const base = `${bolsa.n_closed} predicciones cerradas. Baseline empírico ("siempre sube" a este horizonte, medido en el histórico de precios): ${bolsa.baseline_rate != null ? (bolsa.baseline_rate * 100).toFixed(1) + '%' : 'sin dato'}.`
  const pv = bolsa.p_value != null ? ` p-valor (test de McNemar, modelo vs. baseline): ${bolsa.p_value.toFixed(3)}.` : ''
  switch (bolsa.estado) {
    case 'insuficiente':
      return `${base} Hacen falta al menos 30 cierres para empezar a evaluar esta bolsa — todavía no se puede decir nada.`
    case 'acumulando':
      return `${base}${pv} Hay evidencia acumulándose pero hacen falta 400 cierres para un veredicto confiable.`
    case 'validado':
      return `${base}${pv} El modelo supera al baseline de forma estadísticamente significativa (p<0.05) en esta bolsa específica.`
    case 'sin_edge':
      return `${base}${pv} El modelo NO supera al baseline en esta bolsa específica — es un resultado válido, no un error: significa que acá no hay ventaja confirmada.`
  }
}
