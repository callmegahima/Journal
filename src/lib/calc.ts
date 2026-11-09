import type { Direction, InstrumentSpec, TradeResult } from '@/types'

export function valuePerPriceUnit(spec: InstrumentSpec): number {
  if (!Number.isFinite(spec.tickSize) || spec.tickSize <= 0) return 0
  return spec.tickValue / spec.tickSize
}

export function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2
  const str = step.toString()
  const dot = str.indexOf('.')
  return dot === -1 ? 0 : Math.min(8, str.length - dot - 1)
}

export function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function floorToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return roundTo(value, 2)
  const digits = decimalsForStep(step)
  return roundTo(Math.floor(value / step + 1e-9) * step, digits)
}

export function priceDistance(a: number | null, b: number | null): number {
  if (a == null || b == null) return 0
  return Math.abs(a - b)
}

export function pointsFromPrice(distance: number, spec: InstrumentSpec): number {
  if (!Number.isFinite(spec.tickSize) || spec.tickSize <= 0) return 0
  return distance / spec.tickSize
}

export function plannedRR(
  entry: number | null,
  sl: number | null,
  tp: number | null,
): number {
  if (entry == null || sl == null || tp == null) return 0
  const risk = Math.abs(entry - sl)
  const reward = Math.abs(tp - entry)
  if (risk <= 0) return 0
  return reward / risk
}

export interface PositionInput {
  direction: Direction
  entry: number | null
  sl: number | null
  tp: number | null
  balance: number
  riskPct: number
  spec: InstrumentSpec
  minRR: number
  maxRiskPct: number
  lotsOverride?: number | null
}

export interface PositionResult {
  incomplete: boolean
  directionValid: boolean
  tpValid: boolean | null
  riskTarget: number
  slDistance: number
  tpDistance: number
  valuePerUnit: number
  rawLots: number
  lots: number
  autoLots?: number
  lotsOverridden?: boolean
  minLotRisk: number
  riskActual: number
  riskPctActual: number
  rewardActual: number | null
  rr: number | null
  balanceAfterLoss: number
  balanceAfterWin: number | null
  breakEvenWinRate: number | null
  errors: string[]
  warnings: string[]
}

export function calculatePosition(input: PositionInput): PositionResult {
  const { direction, entry, sl, tp, balance, riskPct, spec, minRR, maxRiskPct, lotsOverride } =
    input
  const riskTarget = Math.max(0, (balance * riskPct) / 100)
  const slDistance = priceDistance(entry, sl)
  const tpDistance = priceDistance(entry, tp)
  const vpp = valuePerPriceUnit(spec)
  const incomplete = entry == null || sl == null
  const errors: string[] = []
  const warnings: string[] = []

  const directionValid =
    entry != null &&
    sl != null &&
    entry > 0 &&
    sl > 0 &&
    (direction === 'BUY' ? sl < entry : sl > entry)

  if (!incomplete && !directionValid) {
    errors.push(
      direction === 'BUY'
        ? 'For a BUY, the stop loss must be below the entry price.'
        : 'For a SELL, the stop loss must be above the entry price.',
    )
  }

  let tpValid: boolean | null = null
  if (tp != null && entry != null) {
    tpValid = direction === 'BUY' ? tp > entry : tp < entry
    if (!tpValid) {
      errors.push(
        direction === 'BUY'
          ? 'For a BUY, the take profit must be above the entry price.'
          : 'For a SELL, the take profit must be below the entry price.',
      )
    }
  }

  if (vpp <= 0) {
    errors.push('Instrument contract specification is invalid. Check tick size and tick value.')
  }

  const usable = directionValid && vpp > 0 && slDistance > 0
  const rawLots = usable ? riskTarget / (slDistance * vpp) : 0
  let autoLots = 0
  if (usable) {
    autoLots = floorToStep(rawLots, spec.lotStep)
    if (autoLots > spec.maxLot) {
      autoLots = spec.maxLot
      warnings.push(
        `Position size was capped at the broker maximum of ${spec.maxLot} lots.`,
      )
    }
    if (rawLots < spec.minLot) {
      autoLots = 0
    }
  }

  const manual =
    usable && lotsOverride != null && Number.isFinite(lotsOverride) && lotsOverride > 0
  let lots = autoLots
  if (manual) {
    lots = floorToStep(lotsOverride, spec.lotStep)
    if (lots > spec.maxLot) {
      lots = spec.maxLot
      warnings.push(
        `Manual lot size was capped at the broker maximum of ${spec.maxLot} lots.`,
      )
    }
    if (lots < spec.minLot) {
      warnings.push(`Manual lot size is below the ${spec.minLot} lot minimum.`)
      lots = 0
    }
    if (lots > 0) {
      warnings.push(
        `Manual lot size in use — auto sizing would produce ${
          autoLots > 0 ? `${autoLots} lots` : 'a size below the broker minimum'
        }.`,
      )
    }
  }

  const riskActual = slDistance * vpp * lots
  const riskPctActual = balance > 0 ? (riskActual / balance) * 100 : 0
  const minLotRisk = slDistance * vpp * spec.minLot
  const rewardActual = tp != null && tpValid ? tpDistance * vpp * lots : null
  const rr = slDistance > 0 && tp != null && tpValid ? tpDistance / slDistance : null

  if (usable && !manual && rawLots < spec.minLot) {
    warnings.push(
      `The calculated size is below the ${spec.minLot} lot minimum. The smallest possible position would risk ${minLotRisk.toFixed(
        2,
      )} USD (${balance > 0 ? ((minLotRisk / balance) * 100).toFixed(2) : '0.00'}%) — either skip the trade or accept a risk above your target.`,
    )
  }

  if (riskPct > maxRiskPct + 1e-9) {
    warnings.push(
      `Planned risk of ${riskPct.toFixed(2)}% exceeds your configured maximum of ${maxRiskPct.toFixed(2)}%.`,
    )
  }

  if (!incomplete && tp == null) {
    warnings.push('No take profit set — the risk-to-reward ratio cannot be validated.')
  }

  if (rr != null && rr < minRR) {
    warnings.push(
      `Risk-to-reward is 1:${rr.toFixed(2)}, below your minimum of 1:${minRR.toFixed(2)}.`,
    )
  }

  if (usable && lots > 0 && riskActual > riskTarget * 1.01) {
    warnings.push(
      manual
        ? `Actual risk at this lot size (${riskActual.toFixed(2)} USD) is above your ${riskTarget.toFixed(2)} USD risk target.`
        : `Actual risk at this lot size (${riskActual.toFixed(2)} USD) is above the risk target because of lot-step rounding.`,
    )
  }

  const balanceAfterLoss = balance - riskActual
  const balanceAfterWin = rewardActual != null ? balance + rewardActual : null

  return {
    incomplete,
    directionValid,
    tpValid,
    riskTarget,
    slDistance,
    tpDistance,
    valuePerUnit: vpp,
    rawLots,
    lots,
    autoLots,
    lotsOverridden: manual,
    minLotRisk,
    riskActual,
    riskPctActual,
    rewardActual,
    rr,
    balanceAfterLoss,
    balanceAfterWin,
    breakEvenWinRate: rr != null && rr > 0 ? (1 / (1 + rr)) * 100 : null,
    errors,
    warnings,
  }
}

export function resultFromPnl(pnl: number): TradeResult {
  const rounded = roundTo(pnl, 2)
  if (rounded > 0) return 'Win'
  if (rounded < 0) return 'Loss'
  return 'Breakeven'
}

export interface PnlInput {
  direction: Direction
  entry: number | null
  exit: number | null
  lots: number
  spec: InstrumentSpec
  fees?: number
}

export interface PnlResult {
  gross: number
  fees: number
  pnl: number
  result: TradeResult
}

export function calculatePnl(input: PnlInput): PnlResult {
  const { direction, entry, exit, lots, spec, fees = 0 } = input
  if (entry == null || exit == null || !Number.isFinite(entry) || !Number.isFinite(exit)) {
    return { gross: 0, fees: 0, pnl: 0, result: 'Breakeven' }
  }
  const vpp = valuePerPriceUnit(spec)
  const diff = direction === 'BUY' ? exit - entry : entry - exit
  const gross = roundTo(diff * vpp * lots, 2)
  const safeFees = Number.isFinite(fees) ? fees : 0
  const pnl = roundTo(gross - Math.abs(safeFees), 2)
  return { gross, fees: Math.abs(safeFees), pnl, result: resultFromPnl(pnl) }
}

export function calculateTradeRisk(
  entry: number | null,
  sl: number | null,
  lots: number,
  spec: InstrumentSpec,
): number {
  return roundTo(priceDistance(entry, sl) * valuePerPriceUnit(spec) * lots, 2)
}

export function riskPctOf(riskAmount: number, balance: number): number {
  if (balance <= 0) return 0
  return (riskAmount / balance) * 100
}
