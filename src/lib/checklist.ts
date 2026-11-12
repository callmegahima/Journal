import type {
  ChecklistItemDef,
  ChecklistRun,
  ChecklistSnapshotItem,
  ChecklistTemplate,
  Decision,
  Direction,
  GroupScore,
  RiskSnapshot,
  Settings,
} from '@/types'
import { CHECKLIST_GROUP_LABELS, CHECKLIST_GROUP_ORDER } from '@/types'
import type { PositionResult } from '@/lib/calc'
import type { RiskStatus } from '@/lib/metrics'
import { roundTo } from '@/lib/calc'

export function pickTemplate(
  templates: ChecklistTemplate[],
  direction: Direction,
  setup: string,
): ChecklistTemplate | undefined {
  const exactDirection = templates.filter(
    (tpl) => tpl.direction === direction || tpl.direction === 'BOTH',
  )
  const sameSetup = exactDirection.find((tpl) => tpl.setupName === setup)
  if (sameSetup) return sameSetup
  const directionOnly = exactDirection.filter((tpl) => tpl.direction === direction)
  if (directionOnly.length > 0) return directionOnly[0]
  return templates.find((tpl) => tpl.direction === 'BOTH')
}

export function templateItemsForDirection(
  template: ChecklistTemplate,
  defs: ChecklistItemDef[],
  direction: Direction,
): ChecklistSnapshotItem[] {
  const defMap = new Map(defs.map((item) => [item.id, item]))
  const items: ChecklistSnapshotItem[] = []
  for (const entry of template.items) {
    if (!entry.enabled) continue
    const def = defMap.get(entry.itemId)
    if (!def) continue
    if (def.group === 'buy' && direction !== 'BUY') continue
    if (def.group === 'sell' && direction !== 'SELL') continue
    if (def.direction && def.direction !== direction) continue
    items.push({
      id: def.id,
      group: def.group,
      text: def.text,
      hint: def.hint,
      mandatory: entry.mandatory,
      checked: false,
      custom: !def.builtin,
    })
  }
  return items
}

/** Preserve existing answers when the template/direction changes. */
export function mergeSnapshotItems(
  current: ChecklistSnapshotItem[],
  next: ChecklistSnapshotItem[],
): ChecklistSnapshotItem[] {
  const currentMap = new Map(current.map((item) => [item.id, item]))
  return next.map((item) => {
    const existing = currentMap.get(item.id)
    return existing ? { ...item, checked: existing.checked } : item
  })
}

export function scoreChecklist(items: ChecklistSnapshotItem[]): {
  scores: GroupScore[]
  overallPct: number
} {
  const presentGroups = CHECKLIST_GROUP_ORDER.filter((group) =>
    items.some((item) => item.group === group),
  )
  const scores = presentGroups.map((group) => {
    const groupItems = items.filter((item) => item.group === group)
    const done = groupItems.filter((item) => item.checked).length
    return {
      group,
      done,
      total: groupItems.length,
      pct: groupItems.length > 0 ? Math.round((done / groupItems.length) * 100) : 0,
    }
  })
  const done = items.filter((item) => item.checked).length
  return {
    scores,
    overallPct: items.length > 0 ? Math.round((done / items.length) * 100) : 0,
  }
}

export interface DecisionEvaluation {
  decision: Decision
  blockers: string[]
  missingMandatory: string[]
}

export interface DecisionInput {
  items: ChecklistSnapshotItem[]
  entry: number | null
  sl: number | null
  tp: number | null
  direction: Direction
  riskPct: number
  riskAmount: number
  position: PositionResult | null
  settings: Settings
  riskStatus: RiskStatus
}

export function evaluateDecision(input: DecisionInput): DecisionEvaluation {
  const { items, entry, sl, tp, riskPct, riskAmount, position, settings, riskStatus } =
    input
  const blockers: string[] = []

  if (entry == null || sl == null || tp == null) {
    blockers.push('Entry, stop loss and take profit must all be defined.')
  }

  if (position) {
    if (position.errors.length > 0) blockers.push(...position.errors)
    if (entry != null && sl != null && position.directionValid && position.lots <= 0) {
      blockers.push(
        'Calculated position size is zero — the risk is too small for the broker minimum lot.',
      )
    }
    if (position.rr != null && position.rr < settings.minRR) {
      blockers.push(
        `Risk-to-reward is 1:${position.rr.toFixed(2)}, below the required 1:${settings.minRR.toFixed(2)}.`,
      )
    }
  }

  if (riskPct <= 0) {
    blockers.push('Risk percentage must be greater than zero.')
  } else if (riskPct > settings.maxRiskPct) {
    blockers.push(
      `Planned risk of ${riskPct.toFixed(2)}% exceeds the configured maximum of ${settings.maxRiskPct.toFixed(2)}%.`,
    )
  }

  if (riskAmount <= 0) {
    blockers.push('Risk amount in USD must be greater than zero.')
  }

  if (riskAmount > 0 && riskStatus.balance > 0 && riskAmount >= riskStatus.balance) {
    blockers.push('A single loss at this size would wipe out the account.')
  }

  if (riskStatus.dayBreached) {
    blockers.push('Daily loss limit has been reached. No new trades today.')
  } else if (
    riskStatus.dayLimit > 0 &&
    riskAmount > 0 &&
    riskAmount > riskStatus.dayRemaining + 0.005
  ) {
    blockers.push(
      `This trade's risk (${riskAmount.toFixed(2)} USD) exceeds the remaining daily loss allowance (${riskStatus.dayRemaining.toFixed(
        2,
      )} USD).`,
    )
  }

  if (riskStatus.weekBreached) {
    blockers.push('Weekly loss limit has been reached. Stop trading for this week.')
  } else if (
    riskStatus.weekLimit > 0 &&
    riskAmount > 0 &&
    riskAmount > riskStatus.weekRemaining + 0.005
  ) {
    blockers.push(
      `This trade's risk (${riskAmount.toFixed(2)} USD) exceeds the remaining weekly loss allowance (${riskStatus.weekRemaining.toFixed(
        2,
      )} USD).`,
    )
  }

  const uniqueBlockers = Array.from(new Set(blockers))
  const missingMandatory = items
    .filter((item) => item.mandatory && !item.checked)
    .map((item) => item.text)

  const decision: Decision =
    uniqueBlockers.length > 0 ? 'NO TRADE' : missingMandatory.length > 0 ? 'WAIT' : 'READY'

  return { decision, blockers: uniqueBlockers, missingMandatory }
}

export function createRiskSnapshot(input: {
  entry: number | null
  sl: number | null
  tp: number | null
  lots: number
  riskPct: number
  riskAmount: number
  rr: number
}): RiskSnapshot {
  return {
    entry: input.entry,
    sl: input.sl,
    tp: input.tp,
    lots: roundTo(input.lots, 2),
    riskPct: roundTo(input.riskPct, 2),
    riskAmount: roundTo(input.riskAmount, 2),
    rr: roundTo(input.rr, 2),
  }
}

export function groupLabel(group: GroupScore['group']): string {
  return CHECKLIST_GROUP_LABELS[group]
}

export interface ChecklistSummary {
  done: number
  total: number
  mandatoryDone: number
  mandatoryTotal: number
  overallPct: number
}

export function summarizeChecklist(run: ChecklistRun): ChecklistSummary {
  const total = run.items.length
  const done = run.items.filter((item) => item.checked).length
  const mandatoryItems = run.items.filter((item) => item.mandatory)
  return {
    done,
    total,
    mandatoryDone: mandatoryItems.filter((item) => item.checked).length,
    mandatoryTotal: mandatoryItems.length,
    overallPct: total > 0 ? Math.round((done / total) * 100) : 0,
  }
}

/** Section name, using the trader's own name when they renamed it. */
export function groupLabelFor(
  group: GroupScore['group'],
  labels: Settings['groupLabels'] | undefined,
): string {
  return labels?.[group]?.trim() || CHECKLIST_GROUP_LABELS[group]
}

/** Shown when a plan or trade has no setup because the trader has none. */
export const NO_SETUP = 'No setup'

/** Setup names for a dropdown, keeping the current one even if it was deleted. */
export function setupChoices(setups: Settings['setups'], current: string): string[] {
  const names = setups.map((setup) => setup.name)
  if (current && !names.includes(current)) names.unshift(current)
  if (names.length === 0) names.push(NO_SETUP)
  return names
}
