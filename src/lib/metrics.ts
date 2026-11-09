import type {
  ChecklistRun,
  Direction,
  Session,
  Settings,
  Timeframe,
  Trade,
} from '@/types'
import { plannedRR, roundTo } from '@/lib/calc'
import { average } from '@/lib/format'
import {
  formatDateKey,
  lastNDays,
  lastNMonthsList,
  startOfWeekKey,
  endOfWeekKey,
  toDateKey,
  toMonthKey,
  todayKey,
} from '@/lib/dates'

export interface TradeFilters {
  from: string
  to: string
  instrumentId: string
  direction: Direction | 'ALL'
  timeframe: Timeframe | 'ALL'
  setup: string
  session: Session | 'ALL'
}

export const EMPTY_FILTERS: TradeFilters = {
  from: '',
  to: '',
  instrumentId: 'ALL',
  direction: 'ALL',
  timeframe: 'ALL',
  setup: 'ALL',
  session: 'ALL',
}

export function filterTrades(trades: Trade[], filters: TradeFilters, tz: string): Trade[] {
  return trades.filter((trade) => {
    const day = toDateKey(trade.date, tz)
    if (filters.from && day < filters.from) return false
    if (filters.to && day > filters.to) return false
    if (filters.instrumentId !== 'ALL' && trade.instrumentId !== filters.instrumentId) return false
    if (filters.direction !== 'ALL' && trade.direction !== filters.direction) return false
    if (filters.timeframe !== 'ALL' && trade.timeframe !== filters.timeframe) return false
    if (filters.setup !== 'ALL' && trade.setup !== filters.setup) return false
    if (filters.session !== 'ALL' && trade.session !== filters.session) return false
    return true
  })
}

export interface EquityPoint {
  key: string
  label: string
  fullLabel: string
  equity: number
  pnl: number
  trades: number
}

export interface Metrics {
  count: number
  wins: number
  losses: number
  breakeven: number
  decided: number
  winRate: number | null
  lossRate: number | null
  netPnl: number
  balance: number
  grossProfit: number
  grossLoss: number
  profitFactor: number | null
  avgWin: number | null
  avgLoss: number | null
  largestWin: number | null
  largestLoss: number | null
  avgPlannedRR: number | null
  avgR: number | null
  expectancy: number | null
  maxDrawdown: number
  maxDrawdownPct: number
  currentStreak: { type: 'Win' | 'Loss' | 'None'; count: number }
  bestTrade: Trade | null
  worstTrade: Trade | null
  equity: EquityPoint[]
}

export function sortTradesChronologically(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => a.date.localeCompare(b.date))
}

export function computeMetrics(trades: Trade[], startingBalance: number, tz: string): Metrics {
  const sorted = sortTradesChronologically(trades)
  const count = sorted.length
  const wins = sorted.filter((t) => t.result === 'Win').length
  const losses = sorted.filter((t) => t.result === 'Loss').length
  const breakeven = sorted.filter((t) => t.result === 'Breakeven').length
  const decided = wins + losses
  const netPnl = roundTo(
    sorted.reduce((sum, t) => sum + t.pnl, 0),
    2,
  )
  const grossProfit = roundTo(
    sorted.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0),
    2,
  )
  const grossLoss = roundTo(
    Math.abs(sorted.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0)),
    2,
  )

  let equity = startingBalance
  let peak = startingBalance
  let maxDrawdown = 0
  let maxDrawdownPct = 0
  let currentType: 'Win' | 'Loss' | 'None' = 'None'
  let currentCount = 0

  const dayMap = new Map<string, { pnl: number; trades: number; equity: number }>()
  for (const trade of sorted) {
    equity += trade.pnl
    peak = Math.max(peak, equity)
    const drawdown = peak - equity
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
      maxDrawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0
    }

    if (trade.result === 'Win') {
      if (currentType === 'Win') currentCount += 1
      else {
        currentType = 'Win'
        currentCount = 1
      }
    } else if (trade.result === 'Loss') {
      if (currentType === 'Loss') currentCount += 1
      else {
        currentType = 'Loss'
        currentCount = 1
      }
    } else {
      currentType = 'None'
      currentCount = 0
    }

    const day = toDateKey(trade.date, tz)
    const existing = dayMap.get(day)
    dayMap.set(day, {
      pnl: roundTo((existing?.pnl ?? 0) + trade.pnl, 2),
      trades: (existing?.trades ?? 0) + 1,
      equity: roundTo(equity, 2),
    })
  }

  const points = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      key,
      label: formatDateKey(key, 'dd MMM'),
      fullLabel: formatDateKey(key, 'dd MMM yyyy'),
      equity: value.equity,
      pnl: value.pnl,
      trades: value.trades,
    }))

  const winsList = sorted.filter((t) => t.pnl > 0)
  const lossesList = sorted.filter((t) => t.pnl < 0)
  const rrValues = sorted
    .map((t) => plannedRR(t.entry, t.sl, t.tp))
    .filter((rr) => rr > 0)

  const bestTrade = sorted.reduce<Trade | null>(
    (best, t) => (best == null || t.pnl > best.pnl ? t : best),
    null,
  )
  const worstTrade = sorted.reduce<Trade | null>(
    (worst, t) => (worst == null || t.pnl < worst.pnl ? t : worst),
    null,
  )

  return {
    count,
    wins,
    losses,
    breakeven,
    decided,
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    lossRate: decided > 0 ? (losses / decided) * 100 : null,
    netPnl,
    balance: roundTo(startingBalance + netPnl, 2),
    grossProfit,
    grossLoss,
    profitFactor:
      grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    avgWin: average(winsList.map((t) => t.pnl)),
    avgLoss: average(lossesList.map((t) => t.pnl)),
    largestWin: winsList.length > 0 ? Math.max(...winsList.map((t) => t.pnl)) : null,
    largestLoss: lossesList.length > 0 ? Math.min(...lossesList.map((t) => t.pnl)) : null,
    avgPlannedRR: average(rrValues),
    avgR: average(sorted.map((t) => t.rMultiple)),
    expectancy: count > 0 ? netPnl / count : null,
    maxDrawdown,
    maxDrawdownPct,
    currentStreak: { type: currentType, count: currentCount },
    bestTrade: bestTrade && bestTrade.pnl > 0 ? bestTrade : null,
    worstTrade: worstTrade && worstTrade.pnl < 0 ? worstTrade : null,
    equity: points,
  }
}

export interface GroupStat {
  key: string
  trades: number
  wins: number
  losses: number
  net: number
  winRate: number | null
  avgR: number | null
}

export function groupStats(trades: Trade[], keyFn: (trade: Trade) => string): GroupStat[] {
  const map = new Map<string, Trade[]>()
  for (const trade of trades) {
    const key = keyFn(trade)
    const existing = map.get(key)
    if (existing) existing.push(trade)
    else map.set(key, [trade])
  }
  return Array.from(map.entries())
    .map(([key, list]) => {
      const wins = list.filter((t) => t.result === 'Win').length
      const losses = list.filter((t) => t.result === 'Loss').length
      return {
        key,
        trades: list.length,
        wins,
        losses,
        net: roundTo(list.reduce((sum, t) => sum + t.pnl, 0), 2),
        winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
        avgR: average(list.map((t) => t.rMultiple)),
      }
    })
    .sort((a, b) => b.net - a.net)
}

export interface DailyPoint {
  date: string
  label: string
  pnl: number
  trades: number
}

export function dailySeries(trades: Trade[], tz: string, days: number): DailyPoint[] {
  const keys = lastNDays(tz, days)
  const map = new Map<string, { pnl: number; trades: number }>()
  for (const trade of trades) {
    const key = toDateKey(trade.date, tz)
    const existing = map.get(key)
    map.set(key, {
      pnl: roundTo((existing?.pnl ?? 0) + trade.pnl, 2),
      trades: (existing?.trades ?? 0) + 1,
    })
  }
  return keys.map((key) => ({
    date: key,
    label: formatDateKey(key, 'dd MMM'),
    pnl: map.get(key)?.pnl ?? 0,
    trades: map.get(key)?.trades ?? 0,
  }))
}

export interface MonthlyPoint {
  month: string
  label: string
  pnl: number
  trades: number
}

export function monthlySeries(trades: Trade[], tz: string, months: number): MonthlyPoint[] {
  const keys = lastNMonthsList(months, tz)
  const map = new Map<string, { pnl: number; trades: number }>()
  for (const trade of trades) {
    const key = toMonthKey(trade.date, tz)
    const existing = map.get(key)
    map.set(key, {
      pnl: roundTo((existing?.pnl ?? 0) + trade.pnl, 2),
      trades: (existing?.trades ?? 0) + 1,
    })
  }
  return keys.map((key) => ({
    month: key,
    label: formatDateKey(`${key}-01`, 'MMM yy'),
    pnl: map.get(key)?.pnl ?? 0,
    trades: map.get(key)?.trades ?? 0,
  }))
}

export interface RDistributionPoint {
  range: string
  count: number
}

export function rDistribution(trades: Trade[]): RDistributionPoint[] {
  const bins = [
    { range: '< -1R', test: (r: number) => r < -1 },
    { range: '-1R to 0', test: (r: number) => r >= -1 && r < -0.0001 },
    { range: 'Breakeven', test: (r: number) => Math.abs(r) <= 0.0001 },
    { range: '0 to 1R', test: (r: number) => r > 0.0001 && r < 1 },
    { range: '1R to 2R', test: (r: number) => r >= 1 && r < 2 },
    { range: '2R to 3R', test: (r: number) => r >= 2 && r < 3 },
    { range: '3R+', test: (r: number) => r >= 3 },
  ]
  return bins.map((bin) => ({
    range: bin.range,
    count: trades.filter((t) => bin.test(t.rMultiple)).length,
  }))
}

export function mistakeCounts(trades: Trade[]): { mistake: string; count: number }[] {
  const map = new Map<string, number>()
  for (const trade of trades) {
    for (const mistake of trade.mistakes) {
      const clean = mistake.trim()
      if (!clean) continue
      map.set(clean, (map.get(clean) ?? 0) + 1)
    }
  }
  return Array.from(map.entries())
    .map(([mistake, count]) => ({ mistake, count }))
    .sort((a, b) => b.count - a.count)
}

export interface RiskStatus {
  balance: number
  dayKey: string
  weekStart: string
  weekEnd: string
  dayPnl: number
  dayLimit: number
  dayLossUsed: number
  dayRemaining: number
  dayUsedPct: number
  weekPnl: number
  weekLimit: number
  weekLossUsed: number
  weekRemaining: number
  weekUsedPct: number
  dayBreached: boolean
  weekBreached: boolean
}

export function computeRiskStatus(
  trades: Trade[],
  settings: Settings,
  tz: string,
): RiskStatus {
  const day = todayKey(tz)
  const weekStart = startOfWeekKey(day)
  const weekEnd = endOfWeekKey(day)

  let dayStartBalance = settings.startingBalance
  let weekStartBalance = settings.startingBalance
  let dayPnl = 0
  let weekPnl = 0

  for (const trade of trades) {
    const tradeDay = toDateKey(trade.date, tz)
    if (tradeDay < day) dayStartBalance += trade.pnl
    if (tradeDay < weekStart) weekStartBalance += trade.pnl
    if (tradeDay === day) dayPnl += trade.pnl
    if (tradeDay >= weekStart && tradeDay <= weekEnd) weekPnl += trade.pnl
  }

  const dayLimit = roundTo((dayStartBalance * settings.dailyLossLimitPct) / 100, 2)
  const weekLimit = roundTo((weekStartBalance * settings.weeklyLossLimitPct) / 100, 2)
  const dayLossUsed = Math.max(0, roundTo(-dayPnl, 2))
  const weekLossUsed = Math.max(0, roundTo(-weekPnl, 2))
  const dayUsedPct = dayLimit > 0 ? Math.min(100, (dayLossUsed / dayLimit) * 100) : 0
  const weekUsedPct = weekLimit > 0 ? Math.min(100, (weekLossUsed / weekLimit) * 100) : 0

  return {
    balance: roundTo(dayStartBalance + dayPnl, 2),
    dayKey: day,
    weekStart,
    weekEnd,
    dayPnl: roundTo(dayPnl, 2),
    dayLimit,
    dayLossUsed,
    dayRemaining: Math.max(0, roundTo(dayLimit - dayLossUsed, 2)),
    dayUsedPct,
    weekPnl: roundTo(weekPnl, 2),
    weekLimit,
    weekLossUsed,
    weekRemaining: Math.max(0, roundTo(weekLimit - weekLossUsed, 2)),
    weekUsedPct,
    dayBreached: dayLimit > 0 && dayLossUsed >= dayLimit - 0.005,
    weekBreached: weekLimit > 0 && weekLossUsed >= weekLimit - 0.005,
  }
}

export function calculateDisciplineScore(entry: {
  patient: boolean | null
  followedPlan: boolean | null
  overtraded: boolean | null
  revenge: boolean | null
  movedSL: boolean | null
}): number | null {
  const answers: boolean[] = []
  if (entry.patient != null) answers.push(entry.patient)
  if (entry.followedPlan != null) answers.push(entry.followedPlan)
  if (entry.overtraded != null) answers.push(!entry.overtraded)
  if (entry.revenge != null) answers.push(!entry.revenge)
  if (entry.movedSL != null) answers.push(!entry.movedSL)
  if (answers.length === 0) return null
  const good = answers.filter(Boolean).length
  return Math.round((good / answers.length) * 100)
}

export function ruleBreaks(entry: {
  patient: boolean | null
  followedPlan: boolean | null
  overtraded: boolean | null
  revenge: boolean | null
  movedSL: boolean | null
}): number {
  let breaks = 0
  if (entry.patient === false) breaks += 1
  if (entry.followedPlan === false) breaks += 1
  if (entry.overtraded === true) breaks += 1
  if (entry.revenge === true) breaks += 1
  if (entry.movedSL === true) breaks += 1
  return breaks
}

export interface LinkedChecklist {
  run: ChecklistRun
  trade: Trade
}

export interface ChecklistQuality {
  linked: LinkedChecklist[]
  highScore: { count: number; avgPnl: number | null; winRate: number | null; avgR: number | null }
  lowScore: { count: number; avgPnl: number | null; winRate: number | null; avgR: number | null }
  ready: { count: number; avgPnl: number | null; winRate: number | null }
  notReady: { count: number; avgPnl: number | null; winRate: number | null }
}

function qualitySummary(list: LinkedChecklist[]) {
  const trades = list.map((l) => l.trade)
  const wins = trades.filter((t) => t.result === 'Win').length
  const losses = trades.filter((t) => t.result === 'Loss').length
  return {
    count: trades.length,
    avgPnl: average(trades.map((t) => t.pnl)),
    winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
    avgR: average(trades.map((t) => t.rMultiple)),
  }
}

export function checklistQuality(
  trades: Trade[],
  checklists: ChecklistRun[],
): ChecklistQuality {
  const tradeMap = new Map(trades.map((t) => [t.id, t]))
  const linked: LinkedChecklist[] = []
  for (const run of checklists) {
    if (!run.tradeId) continue
    const trade = tradeMap.get(run.tradeId)
    if (trade) linked.push({ run, trade })
  }
  const high = linked.filter((l) => l.run.overallPct >= 90)
  const low = linked.filter((l) => l.run.overallPct < 90)
  const ready = linked.filter((l) => l.run.decision === 'READY')
  const notReady = linked.filter((l) => l.run.decision !== 'READY')
  return {
    linked,
    highScore: qualitySummary(high),
    lowScore: qualitySummary(low),
    ready: {
      count: ready.length,
      avgPnl: qualitySummary(ready).avgPnl,
      winRate: qualitySummary(ready).winRate,
    },
    notReady: {
      count: notReady.length,
      avgPnl: qualitySummary(notReady).avgPnl,
      winRate: qualitySummary(notReady).winRate,
    },
  }
}

export function weeklyTrades(trades: Trade[], weekStart: string, tz: string): Trade[] {
  const weekEnd = endOfWeekKey(weekStart)
  return trades.filter((trade) => {
    const day = toDateKey(trade.date, tz)
    return day >= weekStart && day <= weekEnd
  })
}
