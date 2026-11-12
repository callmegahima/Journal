export type Direction = 'BUY' | 'SELL'
export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1'
export type Session = 'Asian' | 'London' | 'New York'
export type MarketDirection = 'Bullish' | 'Bearish' | 'Ranging'
export type TradeResult = 'Win' | 'Loss' | 'Breakeven'
export type PlanStatus = 'Draft' | 'Planned' | 'Executed' | 'Cancelled'
export type Decision = 'READY' | 'WAIT' | 'NO TRADE'
export type ChecklistGroup = 'market' | 'sr' | 'pa' | 'buy' | 'sell' | 'risk'

export const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1']
export const SESSIONS: Session[] = ['Asian', 'London', 'New York']
export const DIRECTIONS: Direction[] = ['BUY', 'SELL']
export const MARKET_DIRECTIONS: MarketDirection[] = ['Bullish', 'Bearish', 'Ranging']
export const LEVEL_TYPES = [
  'Major support',
  'Major resistance',
  'Minor support',
  'Minor resistance',
  'Horizontal level',
  'Previous day high',
  'Previous day low',
  'Previous week high',
  'Previous week low',
  'Supply zone',
  'Demand zone',
  'Break & retest level',
  'Support/resistance flip',
] as const

export const CHECKLIST_GROUP_LABELS: Record<ChecklistGroup, string> = {
  market: 'Market analysis',
  sr: 'Support & resistance',
  pa: 'Price action confirmation',
  buy: 'BUY setup',
  sell: 'SELL setup',
  risk: 'Risk management',
}

export const CHECKLIST_GROUP_ORDER: ChecklistGroup[] = [
  'market',
  'sr',
  'pa',
  'buy',
  'sell',
  'risk',
]

export interface InstrumentSpec {
  id: string
  symbol: string
  name: string
  contractSize: number
  tickSize: number
  tickValue: number
  minLot: number
  lotStep: number
  maxLot: number
  /** Currency the price is quoted in (second currency of a pair). Missing = USD. */
  quoteCurrency?: string
  /** First currency of a forex pair, e.g. EUR in EURUSD. Used for margin. */
  baseCurrency?: string
  /**
   * For crosses whose quote currency is not USD (EURJPY, EURGBP…): the latest price of the
   * USD pair MT5 uses to convert profit, e.g. USDJPY for JPY, GBPUSD for GBP.
   */
  conversionRate?: number
}

export interface SetupDef {
  id: string
  name: string
  description: string
  entryCriteria: string
  invalidation: string
  active: boolean
  builtin: boolean
}

export interface ChecklistItemDef {
  id: string
  group: ChecklistGroup
  text: string
  hint?: string
  direction?: Direction
  builtin: boolean
}

export interface TemplateItem {
  itemId: string
  mandatory: boolean
  enabled: boolean
}

export interface ChecklistTemplate {
  id: string
  name: string
  direction: Direction | 'BOTH'
  setupName: string
  items: TemplateItem[]
  builtin: boolean
}

export interface PlaybookEntry {
  setupId: string
  notes: string
  customCriteria: string
}

export interface LockConfig {
  enabled: boolean
  salt?: string
  hash?: string
  iterations?: number
}

export interface Settings {
  version: number
  displayName: string
  startingBalance: number
  currency: 'USD'
  timezone: string
  defaultRiskPct: number
  dailyLossLimitPct: number
  weeklyLossLimitPct: number
  maxRiskPct: number
  minRR: number
  /** Account leverage, e.g. 100 for 1:100. Used for MT5 margin. */
  leverage: number
  instruments: InstrumentSpec[]
  activeInstrumentId: string
  /** Which batch of built-in markets has been added to `instruments` (so deleted ones stay deleted). */
  instrumentPresetsVersion?: number
  setups: SetupDef[]
  checklistItems: ChecklistItemDef[]
  templates: ChecklistTemplate[]
  playbook: PlaybookEntry[]
  lock: LockConfig
  autoLockMinutes: number
  onboardingDismissed: boolean
}

export interface Plan {
  id: string
  createdAt: string
  updatedAt: string
  dateTime: string
  session: Session
  instrumentId: string
  timeframe: Timeframe
  marketDirection: MarketDirection
  direction: Direction
  levelType: string
  levelPrice: number | null
  levelNotes: string
  setup: string
  entry: number | null
  sl: number | null
  tp: number | null
  riskPct: number
  riskAmount: number
  lots: number
  rr: number
  reasoning: string
  checklistId?: string
  screenshot?: string
  status: PlanStatus
  tradeId?: string
}

export interface Trade {
  id: string
  seq: number
  createdAt: string
  updatedAt: string
  planId?: string
  checklistId?: string
  /** Open time (UTC ISO). */
  date: string
  /** Close time (UTC ISO), optional. */
  closeDate?: string
  instrumentId: string
  direction: Direction
  entry: number
  exit: number
  /** Stop loss — optional; null when the trade had no stop. */
  sl: number | null
  tp: number | null
  lots: number
  /** Rate of the USD conversion pair at close, for crosses such as EURJPY (see InstrumentSpec). */
  conversionRate?: number
  /** 0 when the trade had no stop loss and no manual risk — R stats skip it. */
  riskAmount: number
  /** MT5 "Profit" column (price result before costs). */
  grossPnl?: number
  /** MT5 "Commission" column, signed (normally negative). */
  commission?: number
  /** MT5 "Swap" column, signed. */
  swap?: number
  /** Net result: profit + commission + swap. */
  pnl: number
  result: TradeResult
  rMultiple: number
  setup: string
  timeframe: Timeframe
  session: Session
  screenshotBefore?: string
  screenshotAfter?: string
  reasonEntry: string
  reasonExit: string
  mistakes: string[]
  lessons: string
}

export interface ChecklistSnapshotItem {
  id: string
  group: ChecklistGroup
  text: string
  hint?: string
  mandatory: boolean
  checked: boolean
  custom?: boolean
}

export interface GroupScore {
  group: ChecklistGroup
  done: number
  total: number
  pct: number
}

export interface RiskSnapshot {
  entry: number | null
  sl: number | null
  tp: number | null
  lots: number
  riskPct: number
  riskAmount: number
  rr: number
}

export interface ChecklistRun {
  id: string
  createdAt: string
  updatedAt: string
  planId?: string
  tradeId?: string
  instrumentId: string
  direction: Direction
  setup: string
  timeframe: Timeframe
  levelType: string
  levelPrice: number | null
  templateId?: string
  templateName: string
  items: ChecklistSnapshotItem[]
  decision: Decision
  notes: string
  screenshot?: string
  scores: GroupScore[]
  overallPct: number
  risk: RiskSnapshot
  finalized: boolean
}

export type PlanFollowed = 'Yes' | 'No' | 'Not yet'

export interface PsychEntry {
  id: string
  date: string
  createdAt: string
  updatedAt: string
  preState: string
  confidence: number
  reasons: string[]
  preNotes: string
  planFollowed: PlanFollowed
  patient: boolean | null
  followedPlan: boolean | null
  overtraded: boolean | null
  revenge: boolean | null
  movedSL: boolean | null
  improvement: string
  postNotes: string
  disciplineScore: number | null
}

export type EventImpact = 'Low' | 'Medium' | 'High'

export interface CalendarEvent {
  id: string
  date: string
  title: string
  impact: EventImpact
  notes: string
  createdAt: string
  updatedAt: string
}

export interface WeeklyReflection {
  id: string
  weekStart: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface AppData {
  settings: Settings
  plans: Plan[]
  trades: Trade[]
  checklists: ChecklistRun[]
  psych: PsychEntry[]
  events: CalendarEvent[]
  reflections: WeeklyReflection[]
}
