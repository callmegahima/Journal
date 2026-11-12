import type { Direction, InstrumentSpec, TradeResult } from '@/types'

/* ------------------------------------------------------------------ currency conversion
 * MT5 works out profit in the symbol's quote currency, then converts it to the account
 * currency (USD here):
 *   - quote = USD (XAUUSD, EURUSD, BTCUSD…): no conversion
 *   - base = USD (USDJPY, USDCHF, USDCAD): divide by the pair's own price
 *   - crosses (EURJPY, EURGBP…): convert through the USD pair of the quote currency,
 *     e.g. JPY profit ÷ USDJPY, GBP profit × GBPUSD
 */

/** The USD pair MT5 uses for each quote currency, and whether USD is its second currency. */
export const USD_PAIRS: Record<string, { symbol: string; usdIsQuote: boolean }> = {
  EUR: { symbol: 'EURUSD', usdIsQuote: true },
  GBP: { symbol: 'GBPUSD', usdIsQuote: true },
  AUD: { symbol: 'AUDUSD', usdIsQuote: true },
  NZD: { symbol: 'NZDUSD', usdIsQuote: true },
  JPY: { symbol: 'USDJPY', usdIsQuote: false },
  CHF: { symbol: 'USDCHF', usdIsQuote: false },
  CAD: { symbol: 'USDCAD', usdIsQuote: false },
}

export function quoteCurrencyOf(spec: Pick<InstrumentSpec, 'quoteCurrency'>): string {
  return (spec.quoteCurrency || 'USD').toUpperCase()
}

export type ConversionKind = 'usd' | 'inverse' | 'cross'

/** How a symbol's profit becomes USD. */
export function conversionKind(spec: Pick<InstrumentSpec, 'quoteCurrency' | 'baseCurrency'>): ConversionKind {
  if (quoteCurrencyOf(spec) === 'USD') return 'usd'
  if ((spec.baseCurrency || '').toUpperCase() === 'USD') return 'inverse'
  return 'cross'
}

/** For crosses: the USD pair whose rate the user enters (e.g. USDJPY). */
export function conversionPair(spec: Pick<InstrumentSpec, 'quoteCurrency' | 'baseCurrency'>) {
  if (conversionKind(spec) !== 'cross') return null
  return USD_PAIRS[quoteCurrencyOf(spec)] ?? null
}

/**
 * USD value of 1 unit of the quote currency.
 * @param price the symbol price at the moment being valued (exit for profit, SL for risk)
 * @param rate  for crosses, the USD pair rate (falls back to the instrument's saved rate)
 */
export function quoteToUsd(
  spec: InstrumentSpec,
  price?: number | null,
  rate?: number | null,
): number {
  const kind = conversionKind(spec)
  if (kind === 'usd') return 1
  if (kind === 'inverse') return price != null && price > 0 ? 1 / price : 0
  const pair = USD_PAIRS[quoteCurrencyOf(spec)]
  const r = rate != null && rate > 0 ? rate : spec.conversionRate
  if (!pair || r == null || !(r > 0)) return 0
  return pair.usdIsQuote ? r : 1 / r
}

/**
 * USD value of a 1.00 price move for 1.00 lot.
 *
 * For USD-quoted instruments such as XAUUSD this is simply the contract size:
 * 1 lot = 100 oz, so a $1 move = $100 per lot (0.01 lot = $1, 0.10 lot = $10).
 * For other quote currencies it is contract size × (quote → USD) at `price` / `rate`.
 */
export function valuePerPriceUnit(
  spec: InstrumentSpec,
  price?: number | null,
  rate?: number | null,
): number {
  let size = 0
  if (Number.isFinite(spec.contractSize) && spec.contractSize > 0) size = spec.contractSize
  else if (Number.isFinite(spec.tickSize) && spec.tickSize > 0) size = spec.tickValue / spec.tickSize
  if (!(size > 0)) return 0
  const kind = conversionKind(spec)
  if (kind === 'usd') return size
  // Base-USD pairs (USDJPY) need a price to convert; without one there is no value yet.
  if (kind === 'inverse' && !(price != null && price > 0)) return 0
  return size * quoteToUsd(spec, price, rate)
}

/** Value per tick per 1.00 lot in the quote currency (USD for USD-quoted symbols). */
export function tickValueFor(spec: Pick<InstrumentSpec, 'contractSize' | 'tickSize'>): number {
  if (!(spec.contractSize > 0) || !(spec.tickSize > 0)) return 0
  return roundTo(spec.contractSize * spec.tickSize, 8)
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
  /** For crosses: USD pair rate (e.g. USDJPY). */
  conversionRate?: number | null
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
  // Loss is converted at the stop price and profit at the target price, as MT5 does at close.
  const vpp = valuePerPriceUnit(spec, sl ?? entry, input.conversionRate)
  const tpVpp = valuePerPriceUnit(spec, tp ?? entry, input.conversionRate)
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

  if (vpp <= 0 && !incomplete) {
    errors.push(
      conversionKind(spec) === 'cross'
        ? `Enter the current ${conversionPair(spec)?.symbol ?? 'conversion'} rate to convert ${quoteCurrencyOf(spec)} to USD.`
        : 'Instrument contract specification is invalid. Check contract size and tick size.',
    )
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
  const rewardActual = tp != null && tpValid ? tpDistance * tpVpp * lots : null
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
  /** For crosses: USD pair rate at close (e.g. USDJPY when trading EURJPY). */
  conversionRate?: number | null
  /** Legacy single cost field — always treated as a cost (subtracted). */
  fees?: number
  /** MT5 "Commission" column — signed, normally negative. */
  commission?: number | null
  /** MT5 "Swap" column — signed, positive or negative. */
  swap?: number | null
}

export interface PnlResult {
  /** MT5 "Profit" column: price difference × contract size × lots, rounded to cents. */
  gross: number
  fees: number
  commission: number
  swap: number
  /** Net result = Profit + Commission + Swap − fees. */
  pnl: number
  result: TradeResult
  /** Signed price move in the trade's favour (exit − entry for BUY, entry − exit for SELL). */
  priceMove: number
  /** Signed move in points (price move ÷ tick size). */
  points: number
}

function finiteOr0(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? value : 0
}

/**
 * MT5 profit for CFD/Forex-style USD-quoted symbols (e.g. XAUUSD on a USD account):
 *   BUY  profit = (close − open) × contract size × lots
 *   SELL profit = (open − close) × contract size × lots
 * rounded to 2 decimals like the MT5 history tab, then commission and swap are added.
 */
export function calculatePnl(input: PnlInput): PnlResult {
  const { direction, entry, exit, lots, spec } = input
  const fees = Math.abs(finiteOr0(input.fees))
  const commission = roundTo(finiteOr0(input.commission), 2)
  const swap = roundTo(finiteOr0(input.swap), 2)
  if (entry == null || exit == null || !Number.isFinite(entry) || !Number.isFinite(exit)) {
    const pnl = roundTo(commission + swap - fees, 2)
    return { gross: 0, fees, commission, swap, pnl, result: resultFromPnl(pnl), priceMove: 0, points: 0 }
  }
  const vpp = valuePerPriceUnit(spec, exit, input.conversionRate)
  const diff = direction === 'BUY' ? exit - entry : entry - exit
  const priceMove = roundTo(diff, decimalsForStep(spec.tickSize))
  const gross = roundTo(priceMove * vpp * (Number.isFinite(lots) ? lots : 0), 2)
  const pnl = roundTo(gross + commission + swap - fees, 2)
  const points = spec.tickSize > 0 ? Math.round(priceMove / spec.tickSize) : 0
  return { gross, fees, commission, swap, pnl, result: resultFromPnl(pnl), priceMove, points }
}

/**
 * MT5 margin in USD:
 *   margin = lots × contract size × open price × (quote → USD) ÷ leverage
 * XAUUSD/EURUSD: lots × contract × price ÷ leverage. USDJPY: lots × contract ÷ leverage.
 */
export function calculateMargin(
  lots: number,
  openPrice: number | null,
  spec: InstrumentSpec,
  leverage: number,
  conversionRate?: number | null,
): number {
  if (openPrice == null || !(openPrice > 0) || !(lots > 0) || !(leverage > 0)) return 0
  const toUsd = quoteToUsd(spec, openPrice, conversionRate)
  return roundTo((lots * spec.contractSize * openPrice * toUsd) / leverage, 2)
}

export interface MarginCheck {
  /** USD margin for 1.00 lot at the entry price. */
  marginPerLot: number
  /** USD margin for the planned lots. */
  marginRequired: number
  /** Largest lot size the balance can open (floored to the lot step, capped at max lot). */
  maxLots: number
  /** Equity ÷ margin × 100 right after opening; null without a position. */
  marginLevel: number | null
  /** Price where equity ÷ margin hits the stop out level; null when it cannot be worked out. */
  stopOutPrice: number | null
  /** True when the stop out price comes before the stop loss. */
  stopOutBeforeSl: boolean
  /** True when the planned lots need more margin than the balance. */
  insufficient: boolean
}

/**
 * MT5 margin check for one new position, assuming no other trades are open
 * (free margin = balance).
 */
export function checkMargin(input: {
  direction: Direction
  entry: number | null
  sl: number | null
  lots: number
  balance: number
  spec: InstrumentSpec
  leverage: number
  stopOutPct: number
  conversionRate?: number | null
}): MarginCheck {
  const { direction, entry, sl, lots, balance, spec, leverage, stopOutPct, conversionRate } = input
  const empty: MarginCheck = {
    marginPerLot: 0,
    marginRequired: 0,
    maxLots: 0,
    marginLevel: null,
    stopOutPrice: null,
    stopOutBeforeSl: false,
    insufficient: false,
  }
  if (entry == null || !(entry > 0) || !(leverage > 0)) return empty
  const toUsd = quoteToUsd(spec, entry, conversionRate)
  const marginPerLot = (spec.contractSize * entry * toUsd) / leverage
  if (!(marginPerLot > 0)) return empty

  let maxLots = balance > 0 ? floorToStep(balance / marginPerLot, spec.lotStep) : 0
  if (maxLots > spec.maxLot) maxLots = spec.maxLot
  if (maxLots < spec.minLot) maxLots = 0

  const marginRequired = lots > 0 ? roundTo(marginPerLot * lots, 2) : 0
  const insufficient = lots > 0 && marginRequired > balance
  const marginLevel = marginRequired > 0 ? (balance / marginRequired) * 100 : null

  // Equity falls by (move × value per unit × lots); stop out when equity = stopOut% × margin.
  let stopOutPrice: number | null = null
  let stopOutBeforeSl = false
  const vpp = valuePerPriceUnit(spec, sl ?? entry, conversionRate)
  if (marginRequired > 0 && vpp > 0 && !insufficient) {
    const lossToStopOut = balance - (stopOutPct / 100) * marginRequired
    const distance = Math.max(0, lossToStopOut) / (vpp * lots)
    stopOutPrice = direction === 'BUY' ? entry - distance : entry + distance
    if (stopOutPrice <= 0) stopOutPrice = null
    if (stopOutPrice != null && sl != null && sl > 0) {
      stopOutBeforeSl = direction === 'BUY' ? stopOutPrice > sl : stopOutPrice < sl
    }
  }

  return {
    marginPerLot: roundTo(marginPerLot, 2),
    marginRequired,
    maxLots,
    marginLevel,
    stopOutPrice,
    stopOutBeforeSl,
    insufficient,
  }
}

export function calculateTradeRisk(
  entry: number | null,
  sl: number | null,
  lots: number,
  spec: InstrumentSpec,
  conversionRate?: number | null,
): number {
  return roundTo(priceDistance(entry, sl) * valuePerPriceUnit(spec, sl, conversionRate) * lots, 2)
}

export function riskPctOf(riskAmount: number, balance: number): number {
  if (balance <= 0) return 0
  return (riskAmount / balance) * 100
}
