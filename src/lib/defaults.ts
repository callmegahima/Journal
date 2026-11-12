import type {
  ChecklistItemDef,
  ChecklistTemplate,
  InstrumentSpec,
  PlaybookEntry,
  Settings,
  SetupDef,
} from '@/types'

export const SETTINGS_VERSION = 1
export const DEFAULT_TIMEZONE = 'Etc/GMT-2'

export const DEFAULT_SETS: Omit<SetupDef, 'builtin'>[] = [
  {
    id: 'support-bounce',
    name: 'Support bounce',
    description:
      'Price returns to a validated support zone and shows a bullish reaction. The level must be marked before price arrives.',
    entryCriteria:
      'Higher-timeframe direction checked, support zone marked, bullish rejection or PA confirmation closes, entry after confirmation — not while price is still falling into the level.',
    invalidation:
      'A decisive close below the support zone invalidates the idea. Stop loss sits beyond the invalidation point, not at the level itself.',
    active: true,
  },
  {
    id: 'resistance-rejection',
    name: 'Resistance rejection',
    description:
      'Price returns to a validated resistance zone and shows a bearish reaction. The level must be marked before price arrives.',
    entryCriteria:
      'Higher-timeframe direction checked, resistance zone marked, bearish rejection or PA confirmation closes, entry after confirmation — not while price is still rising into the level.',
    invalidation:
      'A decisive close above the resistance zone invalidates the idea. Stop loss sits beyond the invalidation point, not at the level itself.',
    active: true,
  },
  {
    id: 'breakout-retest',
    name: 'Breakout and retest',
    description:
      'A level breaks with momentum, then price returns to retest the broken level. The retest should hold for continuation.',
    entryCriteria:
      'Break has a clear close beyond the level, retest holds, PA confirmation appears at the retest, and risk is defined beyond the failed retest.',
    invalidation:
      'A close back through the broken level invalidates the retest. Avoid entering on the breakout candle itself unless your plan defines it.',
    active: true,
  },
  {
    id: 'false-breakout',
    name: 'False breakout',
    description:
      'Price sweeps a high or low, fails to hold beyond it, and returns inside the range — trapping breakout traders.',
    entryCriteria:
      'Liquidity sweep visible, price closes back inside the range, PA confirmation supports the reversal, and the stop is beyond the sweep wick.',
    invalidation:
      'Acceptance back outside the swept level invalidates the trap thesis.',
    active: true,
  },
  {
    id: 'sr-flip',
    name: 'Support/resistance flip',
    description:
      'A broken resistance becomes support, or a broken support becomes resistance. The flip must be confirmed by a retest.',
    entryCriteria:
      'Level broken and clearly retested from the other side, reaction candle closes, confluence checked, and stop is placed beyond the flipped zone.',
    invalidation:
      'Failure to hold the flipped level on a closing basis invalidates the setup.',
    active: true,
  },
  {
    id: 'trend-continuation',
    name: 'Trend continuation',
    description:
      'A pullback within an established trend reaches a support/resistance area and resumes in the trend direction.',
    entryCriteria:
      'Market structure is clearly trending (HH/HL or LH/LL), pullback reaches a marked level, continuation confirmation closes, and HTF direction agrees.',
    invalidation:
      'A structure break against the trend, or acceptance beyond the pullback level, invalidates continuation.',
    active: true,
  },
  {
    id: 'trend-reversal',
    name: 'Trend reversal',
    description:
      'A trend exhausts at a significant level and structure changes. Reversals need more confirmation than continuations.',
    entryCriteria:
      'Major level reached, liquidity sweep or exhaustion, CHoCH or BoS in the new direction, retest/confirmation, and HTF context supportive.',
    invalidation:
      'Resumption beyond the reversal extreme invalidates the thesis. Position size should respect the lower certainty of reversals.',
    active: true,
  },
  {
    id: 'pa-key-level',
    name: 'PA confirmation at key level',
    description:
      'A high-quality price action signal occurs directly at a pre-marked support or resistance level. Confluence is the edge.',
    entryCriteria:
      'Level is pre-marked and meaningful, price reacts at it, rejection/engulfing/pin bar or structure confirmation appears, and entry is taken after the confirmation closes.',
    invalidation:
      'A close through the level, or a failure to produce follow-through after the confirmation, invalidates the setup.',
    active: true,
  },
]

export function buildDefaultSetups(): SetupDef[] {
  return DEFAULT_SETS.map((s) => ({ ...s, builtin: true }))
}

export const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  // A — Market analysis
  { id: 'mk1', group: 'market', text: 'Identify the overall market trend.', builtin: true },
  { id: 'mk2', group: 'market', text: 'Identify market structure (HH, HL, LH, LL).', builtin: true },
  { id: 'mk3', group: 'market', text: 'Check higher timeframe direction (H4/H1).', builtin: true },
  { id: 'mk4', group: 'market', text: 'Identify important support levels.', builtin: true },
  { id: 'mk5', group: 'market', text: 'Identify important resistance levels.', builtin: true },
  { id: 'mk6', group: 'market', text: 'Mark previous day high and low.', builtin: true },
  { id: 'mk7', group: 'market', text: 'Mark previous week high and low.', builtin: true },
  { id: 'mk8', group: 'market', text: 'Identify whether the market is trending or ranging.', builtin: true },
  { id: 'mk9', group: 'market', text: 'Check for important upcoming economic news.', builtin: true },

  // B — Support & resistance
  { id: 'sr1', group: 'sr', text: 'Price is approaching an important support or resistance zone.', builtin: true },
  { id: 'sr2', group: 'sr', text: 'The level is clearly identified on the chart.', builtin: true },
  { id: 'sr3', group: 'sr', text: 'The level has meaningful historical reactions.', builtin: true },
  { id: 'sr4', group: 'sr', text: 'The zone is not excessively wide.', builtin: true },
  { id: 'sr5', group: 'sr', text: 'Check whether the level has already been broken.', builtin: true },
  { id: 'sr6', group: 'sr', text: 'Identify whether support/resistance has flipped.', builtin: true },
  { id: 'sr7', group: 'sr', text: 'Look for confluence with another important level.', builtin: true },

  // C — Price action confirmation
  { id: 'pa1', group: 'pa', text: 'Price reacts at the identified S&R zone.', builtin: true },
  { id: 'pa2', group: 'pa', text: 'Rejection candle appears.', builtin: true },
  { id: 'pa3', group: 'pa', text: 'Bullish or bearish engulfing candle (if applicable).', builtin: true },
  { id: 'pa4', group: 'pa', text: 'Pin bar or strong rejection wick (if applicable).', builtin: true },
  { id: 'pa5', group: 'pa', text: 'Break of Structure (BoS), if applicable.', builtin: true },
  { id: 'pa6', group: 'pa', text: 'Change of Character (CHoCH), if applicable.', builtin: true },
  { id: 'pa7', group: 'pa', text: 'Liquidity sweep, if applicable.', builtin: true },
  { id: 'pa8', group: 'pa', text: 'Breakout and retest, if applicable.', builtin: true },
  { id: 'pa9', group: 'pa', text: 'Entry confirmation candle closes.', builtin: true },

  // D — BUY setup
  { id: 'by1', group: 'buy', text: 'Price approaches a support zone.', direction: 'BUY', builtin: true },
  { id: 'by2', group: 'buy', text: 'Support holds or liquidity below support is swept.', direction: 'BUY', builtin: true },
  { id: 'by3', group: 'buy', text: 'Bullish rejection appears.', direction: 'BUY', builtin: true },
  { id: 'by4', group: 'buy', text: 'Bullish PA confirmation occurs.', direction: 'BUY', builtin: true },
  { id: 'by5', group: 'buy', text: 'Bullish structure confirmation (if required).', direction: 'BUY', builtin: true },
  { id: 'by6', group: 'buy', text: 'Entry is planned after confirmation.', direction: 'BUY', builtin: true },
  { id: 'by7', group: 'buy', text: 'Stop Loss is below the invalidation point.', direction: 'BUY', builtin: true },
  { id: 'by8', group: 'buy', text: 'Take Profit targets resistance or opposing liquidity.', direction: 'BUY', builtin: true },

  // E — SELL setup
  { id: 'se1', group: 'sell', text: 'Price approaches a resistance zone.', direction: 'SELL', builtin: true },
  { id: 'se2', group: 'sell', text: 'Resistance holds or liquidity above resistance is swept.', direction: 'SELL', builtin: true },
  { id: 'se3', group: 'sell', text: 'Bearish rejection appears.', direction: 'SELL', builtin: true },
  { id: 'se4', group: 'sell', text: 'Bearish PA confirmation occurs.', direction: 'SELL', builtin: true },
  { id: 'se5', group: 'sell', text: 'Bearish structure confirmation (if required).', direction: 'SELL', builtin: true },
  { id: 'se6', group: 'sell', text: 'Entry is planned after confirmation.', direction: 'SELL', builtin: true },
  { id: 'se7', group: 'sell', text: 'Stop Loss is above the invalidation point.', direction: 'SELL', builtin: true },
  { id: 'se8', group: 'sell', text: 'Take Profit targets support or opposing liquidity.', direction: 'SELL', builtin: true },

  // F — Risk management
  { id: 'rk1', group: 'risk', text: 'Entry price is defined.', builtin: true },
  { id: 'rk2', group: 'risk', text: 'Stop Loss is defined.', builtin: true },
  { id: 'rk3', group: 'risk', text: 'Take Profit is defined.', builtin: true },
  { id: 'rk4', group: 'risk', text: 'Risk percentage is within my limit.', builtin: true },
  { id: 'rk5', group: 'risk', text: 'Risk amount in USD is calculated.', builtin: true },
  { id: 'rk6', group: 'risk', text: 'Lot size is calculated correctly.', builtin: true },
  { id: 'rk7', group: 'risk', text: 'Risk-to-reward is at least 1:2 (configurable in Settings).', builtin: true },
  { id: 'rk8', group: 'risk', text: 'Daily loss limit has not been reached.', builtin: true },
  { id: 'rk9', group: 'risk', text: 'No unnecessary exposure or overlapping trades.', builtin: true },
]

/** Items that are mandatory in the standard templates. */
const MANDATORY_OVERRIDES: Record<string, boolean> = {
  mk3: true,
  mk4: true,
  mk5: true,
  sr1: true,
  sr2: true,
  pa1: true,
  pa9: true,
  by1: true,
  by2: true,
  by3: true,
  by4: true,
  by5: false,
  by6: true,
  by7: true,
  by8: false,
  se1: true,
  se2: true,
  se3: true,
  se4: true,
  se5: false,
  se6: true,
  se7: true,
  se8: false,
  rk1: true,
  rk2: true,
  rk3: true,
  rk4: true,
  rk5: true,
  rk6: true,
  rk7: true,
  rk8: true,
  rk9: true,
}

function templateItems(direction: 'BUY' | 'SELL', groups: string[]): ChecklistTemplate['items'] {
  return CHECKLIST_ITEMS.filter((item) => {
    if (!groups.includes(item.group)) return false
    if (item.group === 'buy' && direction !== 'BUY') return false
    if (item.group === 'sell' && direction !== 'SELL') return false
    return true
  }).map((item) => ({
    itemId: item.id,
    enabled: true,
    mandatory: MANDATORY_OVERRIDES[item.id] ?? true,
  }))
}

export function buildDefaultTemplates(): ChecklistTemplate[] {
  return [
    {
      id: 'tpl-standard-buy',
      name: 'Standard BUY — PA + S&R',
      direction: 'BUY',
      setupName: 'ALL',
      builtin: true,
      items: templateItems('BUY', ['market', 'sr', 'pa', 'buy', 'risk']),
    },
    {
      id: 'tpl-standard-sell',
      name: 'Standard SELL — PA + S&R',
      direction: 'SELL',
      setupName: 'ALL',
      builtin: true,
      items: templateItems('SELL', ['market', 'sr', 'pa', 'sell', 'risk']),
    },
    {
      id: 'tpl-risk-only',
      name: 'Quick risk check',
      direction: 'BOTH',
      setupName: 'ALL',
      builtin: true,
      items: CHECKLIST_ITEMS.filter((i) => i.group === 'risk').map((item) => ({
        itemId: item.id,
        enabled: true,
        mandatory: true,
      })),
    },
  ]
}

export function buildDefaultPlaybook(setups: SetupDef[]): PlaybookEntry[] {
  return setups.map((setup) => ({
    setupId: setup.id,
    notes: '',
    customCriteria: '',
  }))
}

export const XAUUSD_SPEC: InstrumentSpec = {
  id: 'xauusd',
  symbol: 'XAUUSD',
  name: 'Gold vs US Dollar',
  contractSize: 100,
  tickSize: 0.01,
  tickValue: 1,
  minLot: 0.01,
  lotStep: 0.01,
  maxLot: 100,
}

export function buildDefaultSettings(): Settings {
  const setups = buildDefaultSetups()
  return {
    version: SETTINGS_VERSION,
    displayName: 'Trader',
    startingBalance: 50,
    currency: 'USD',
    timezone: DEFAULT_TIMEZONE,
    defaultRiskPct: 1,
    dailyLossLimitPct: 3,
    weeklyLossLimitPct: 6,
    maxRiskPct: 2,
    minRR: 2,
    leverage: 100,
    instruments: [XAUUSD_SPEC],
    activeInstrumentId: XAUUSD_SPEC.id,
    setups,
    checklistItems: CHECKLIST_ITEMS.map((i) => ({ ...i })),
    templates: buildDefaultTemplates(),
    playbook: buildDefaultPlaybook(setups),
    lock: { enabled: false },
    autoLockMinutes: 15,
    onboardingDismissed: false,
  }
}

/** Merge a persisted settings object with current defaults so upgrades never lose data. */
export function hydrateSettings(raw: Partial<Settings> | undefined): Settings {
  const defaults = buildDefaultSettings()
  if (!raw) return defaults

  const savedItems = Array.isArray(raw.checklistItems) ? raw.checklistItems : []
  const mergedItems = [...savedItems]
  for (const item of defaults.checklistItems) {
    if (!mergedItems.some((i) => i.id === item.id)) mergedItems.push(item)
  }

  const savedSetups = Array.isArray(raw.setups) ? raw.setups : []
  const mergedSetups = [...savedSetups]
  for (const setup of defaults.setups) {
    if (!mergedSetups.some((s) => s.id === setup.id)) mergedSetups.push(setup)
  }

  const savedTemplates = Array.isArray(raw.templates) ? raw.templates : []
  const mergedTemplates = [...savedTemplates]
  for (const tpl of defaults.templates) {
    if (!mergedTemplates.some((t) => t.id === tpl.id)) mergedTemplates.push(tpl)
  }

  const savedPlaybook = Array.isArray(raw.playbook) ? raw.playbook : []
  const mergedPlaybook = [...savedPlaybook]
  for (const entry of defaults.playbook) {
    if (!mergedPlaybook.some((e) => e.setupId === entry.setupId)) mergedPlaybook.push(entry)
  }

  return {
    ...defaults,
    ...raw,
    version: SETTINGS_VERSION,
    leverage:
      typeof raw.leverage === 'number' && raw.leverage > 0 ? raw.leverage : defaults.leverage,
    instruments:
      Array.isArray(raw.instruments) && raw.instruments.length > 0
        ? raw.instruments.map((inst) =>
            inst.contractSize > 0 && inst.tickSize > 0
              ? { ...inst, tickValue: Math.round(inst.contractSize * inst.tickSize * 1e8) / 1e8 }
              : inst,
          )
        : defaults.instruments,
    checklistItems: mergedItems,
    setups: mergedSetups,
    templates: mergedTemplates,
    playbook: mergedPlaybook,
    lock: raw.lock ?? defaults.lock,
  }
}

export const COMMON_MISTAKES = [
  'FOMO entry',
  'Chased price',
  'Moved stop loss',
  'Cut winner early',
  'Revenge trade',
  'Overtrading',
  'No HTF confirmation',
  'Ignored news',
  'Risk above limit',
  'No checklist',
  'Entered before confirmation',
  'Traded outside plan',
]

export const EMOTIONAL_STATES = [
  'Calm',
  'Focused',
  'Confident',
  'Anxious',
  'Fearful',
  'Greedy',
  'Frustrated',
  'Tired',
  'Impatient',
  'Revengeful',
]

export const TRADE_REASONS = [
  'Following my plan',
  'Valid PA + S&R setup',
  'Boredom',
  'Revenge',
  'Fear of missing out',
  'Recovering losses',
  'Testing an idea',
]
