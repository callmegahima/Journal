import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  ChartCandlestick,
  ClipboardCheck,
  Info,
  Save,
  Shield,
  Sparkles,
} from 'lucide-react'
import type {
  ChecklistRun,
  ChecklistSnapshotItem,
  Direction,
  MarketDirection,
  Plan,
  PlanStatus,
  Session,
  Settings,
  Timeframe,
} from '@/types'
import {
  LEVEL_TYPES,
  MARKET_DIRECTIONS,
  SESSIONS,
  TIMEFRAMES,
} from '@/types'
import { useData } from '@/store/DataContext'
import { useToast } from '@/store/ToastContext'
import { Modal } from '@/components/ui/Modal'
import { Button, Badge, InfoNote, ProgressBar } from '@/components/ui/primitives'
import { NumberField } from '@/components/ui/form'
import { ImageUpload, ImageLightbox } from '@/components/ui/ImageUpload'
import { ChecklistPanel } from '@/components/checklist/ChecklistPanel'
import { calculatePosition, decimalsForStep } from '@/lib/calc'
import type { PositionResult } from '@/lib/calc'
import { computeRiskStatus, sessionForInstant } from '@/lib/metrics'
import {
  createRiskSnapshot,
  evaluateDecision,
  mergeSnapshotItems,
  pickTemplate,
  scoreChecklist,
  templateItemsForDirection,
} from '@/lib/checklist'
import {
  isoToLocalInput,
  localInputToIso,
  nowIso,
  timezoneLabel,
  timezoneShort,
} from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { lots as formatLots, money, pct, price } from '@/lib/format'

interface DraftState {
  id: string
  createdAt: string
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
  reasoning: string
  screenshot?: string
  templateId: string
  items: ChecklistSnapshotItem[]
  checklistNotes: string
  checklistRunId: string
  checklistCreatedAt: string
  checklistFinalized: boolean
}

function suggestedSession(_tz: string): Session {
  return sessionForInstant(new Date().toISOString())
}

function makeInitialDraft(
  plan: Plan | undefined,
  settings: Settings,
  run: ChecklistRun | undefined,
): DraftState {
  const tz = settings.timezone
  const activeSetups = settings.setups.filter((setup) => setup.active)
  const setup = plan?.setup ?? activeSetups[0]?.name ?? settings.setups[0]?.name ?? ''
  const direction: Direction = plan?.direction ?? 'BUY'
  const template =
    (run?.templateId
      ? settings.templates.find((entry) => entry.id === run.templateId)
      : undefined) ?? pickTemplate(settings.templates, direction, setup)
  const items =
    run?.items ??
    (template ? templateItemsForDirection(template, settings.checklistItems, direction) : [])
  const createdAt = plan?.createdAt ?? nowIso()

  return {
    id: plan?.id ?? uid('plan'),
    createdAt,
    dateTime: isoToLocalInput(plan?.dateTime ?? nowIso(), tz),
    session: plan?.session ?? suggestedSession(tz),
    instrumentId:
      plan?.instrumentId ??
      settings.activeInstrumentId ??
      settings.instruments[0]?.id ??
      '',
    timeframe: plan?.timeframe ?? 'M15',
    marketDirection: plan?.marketDirection ?? 'Bullish',
    direction,
    levelType: plan?.levelType ?? (direction === 'BUY' ? 'Major support' : 'Major resistance'),
    levelPrice: plan?.levelPrice ?? null,
    levelNotes: plan?.levelNotes ?? '',
    setup,
    entry: plan?.entry ?? null,
    sl: plan?.sl ?? null,
    tp: plan?.tp ?? null,
    riskPct: plan?.riskPct ?? settings.defaultRiskPct,
    reasoning: plan?.reasoning ?? '',
    screenshot: plan?.screenshot,
    templateId: template?.id ?? '',
    items,
    checklistNotes: run?.notes ?? '',
    checklistRunId: run?.id ?? uid('chk'),
    checklistCreatedAt: run?.createdAt ?? createdAt,
    checklistFinalized: run?.finalized ?? false,
  }
}

function CalcStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone?: 'profit' | 'loss' | 'default'
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-line/80 bg-ink/40 px-2.5 py-2">
      <div className="text-[9px] font-medium uppercase tracking-[0.07em] text-dim">{label}</div>
      <div
        className={cn(
          'mt-0.5 font-mono text-[13px] font-semibold tabular-nums',
          tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-fg',
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[9px] leading-tight text-dim">{hint}</div> : null}
    </div>
  )
}

export function PlanEditor({
  plan,
  onClose,
}: {
  plan?: Plan
  onClose: () => void
}) {
  const { data, savePlan, saveChecklist } = useData()
  const { toast } = useToast()
  const settings = data.settings
  const tz = settings.timezone
  const existingRun = plan?.checklistId
    ? data.checklists.find((run) => run.id === plan.checklistId)
    : undefined
  const [draft, setDraft] = useState<DraftState>(() =>
    makeInitialDraft(plan, settings, existingRun),
  )
  const [changeTick, setChangeTick] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [viewerOpen, setViewerOpen] = useState(false)
  const persistRef = useRef<() => Promise<void>>(async () => {})

  const patch = (partial: Partial<DraftState>) => {
    setDraft((current) => ({ ...current, ...partial }))
    setChangeTick((tick) => tick + 1)
  }

  const instrument =
    settings.instruments.find((item) => item.id === draft.instrumentId) ??
    settings.instruments[0]

  const decimals = instrument ? decimalsForStep(instrument.tickSize) : 2
  const balance = useMemo(
    () =>
      settings.startingBalance +
      data.trades.reduce((sum, trade) => sum + trade.pnl, 0),
    [settings.startingBalance, data.trades],
  )
  const riskStatus = useMemo(
    () => computeRiskStatus(data.trades, settings, tz),
    [data.trades, settings, tz],
  )

  const position: PositionResult = useMemo(() => {
    if (!instrument) {
      return {
        incomplete: true,
        directionValid: false,
        tpValid: null,
        riskTarget: 0,
        slDistance: 0,
        tpDistance: 0,
        valuePerUnit: 0,
        rawLots: 0,
        lots: 0,
        minLotRisk: 0,
        riskActual: 0,
        riskPctActual: 0,
        rewardActual: null,
        rr: null,
        balanceAfterLoss: balance,
        balanceAfterWin: null,
        breakEvenWinRate: null,
        errors: ['No instrument specification configured.'],
        warnings: [],
      }
    }
    return calculatePosition({
      direction: draft.direction,
      entry: draft.entry,
      sl: draft.sl,
      tp: draft.tp,
      balance,
      riskPct: draft.riskPct,
      spec: instrument,
      minRR: settings.minRR,
      maxRiskPct: settings.maxRiskPct,
    })
  }, [draft.direction, draft.entry, draft.sl, draft.tp, draft.riskPct, balance, instrument, settings.minRR, settings.maxRiskPct])

  const { scores, overallPct } = useMemo(
    () => scoreChecklist(draft.items),
    [draft.items],
  )
  const decisionEval = useMemo(
    () =>
      evaluateDecision({
        items: draft.items,
        entry: draft.entry,
        sl: draft.sl,
        tp: draft.tp,
        direction: draft.direction,
        riskPct: draft.riskPct,
        riskAmount: position.riskActual,
        position,
        settings,
        riskStatus,
      }),
    [draft.items, draft.entry, draft.sl, draft.tp, draft.direction, draft.riskPct, position, settings, riskStatus],
  )

  const relevantTemplates = useMemo(
    () =>
      settings.templates.filter(
        (template) =>
          template.direction === draft.direction || template.direction === 'BOTH',
      ),
    [settings.templates, draft.direction],
  )

  const activeTemplateName =
    settings.templates.find((template) => template.id === draft.templateId)?.name ??
    'Custom checklist'

  const buildPlan = (status: PlanStatus): Plan => ({
    id: draft.id,
    createdAt: draft.createdAt,
    updatedAt: nowIso(),
    dateTime: localInputToIso(draft.dateTime, tz),
    session: draft.session,
    instrumentId: draft.instrumentId,
    timeframe: draft.timeframe,
    marketDirection: draft.marketDirection,
    direction: draft.direction,
    levelType: draft.levelType,
    levelPrice: draft.levelPrice,
    levelNotes: draft.levelNotes,
    setup: draft.setup,
    entry: draft.entry,
    sl: draft.sl,
    tp: draft.tp,
    riskPct: draft.riskPct,
    riskAmount: position.riskActual,
    lots: position.lots,
    rr: position.rr ?? 0,
    reasoning: draft.reasoning,
    checklistId: draft.checklistRunId,
    screenshot: draft.screenshot,
    status,
    tradeId: plan?.tradeId,
  })

  const buildRun = (planId: string, finalized: boolean): ChecklistRun => ({
    id: draft.checklistRunId,
    createdAt: draft.checklistCreatedAt,
    updatedAt: nowIso(),
    planId,
    tradeId: existingRun?.tradeId,
    instrumentId: draft.instrumentId,
    direction: draft.direction,
    setup: draft.setup,
    timeframe: draft.timeframe,
    levelType: draft.levelType,
    levelPrice: draft.levelPrice,
    templateId: draft.templateId,
    templateName: activeTemplateName,
    items: draft.items,
    decision: decisionEval.decision,
    notes: draft.checklistNotes,
    screenshot: draft.screenshot,
    scores,
    overallPct,
    risk: createRiskSnapshot({
      entry: draft.entry,
      sl: draft.sl,
      tp: draft.tp,
      lots: position.lots,
      riskPct: draft.riskPct,
      riskAmount: position.riskActual,
      rr: position.rr ?? 0,
    }),
    finalized,
  })

  const persistDraft = async (statusOverride?: PlanStatus) => {
    const status = statusOverride ?? plan?.status ?? 'Draft'
    const nextPlan = buildPlan(status)
    const run = buildRun(nextPlan.id, status !== 'Draft' ? true : draft.checklistFinalized)
    await saveChecklist(run)
    await savePlan(nextPlan)
  }

  persistRef.current = async () => {
    await persistDraft()
  }

  useEffect(() => {
    if (changeTick === 0) return
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      void persistRef
        .current()
        .then(() => setSaveState('saved'))
        .catch(() => {
          setSaveState('error')
          toast('Could not autosave the plan. Check browser storage.', 'error')
        })
    }, 900)
    return () => window.clearTimeout(timer)
  }, [changeTick, toast])

  const applyTemplate = (templateId: string) => {
    const template = settings.templates.find((entry) => entry.id === templateId)
    if (!template) return
    const nextItems = mergeSnapshotItems(
      draft.items,
      templateItemsForDirection(template, settings.checklistItems, draft.direction),
    )
    patch({ templateId, items: nextItems })
  }

  const changeDirection = (direction: Direction) => {
    if (direction === draft.direction) return
    let levelType = draft.levelType
    if (levelType === 'Major support' || levelType === 'Major resistance') {
      levelType = direction === 'BUY' ? 'Major support' : 'Major resistance'
    }
    const currentTemplate = settings.templates.find((t) => t.id === draft.templateId)
    const supports =
      currentTemplate &&
      (currentTemplate.direction === direction || currentTemplate.direction === 'BOTH')
    const template = supports
      ? currentTemplate
      : pickTemplate(settings.templates, direction, draft.setup)
    const nextItems = template
      ? mergeSnapshotItems(
          draft.items,
          templateItemsForDirection(template, settings.checklistItems, direction),
        )
      : draft.items
    patch({
      direction,
      levelType,
      templateId: template?.id ?? draft.templateId,
      items: nextItems,
    })
  }

  const changeSetup = (setupName: string) => {
    const specific = settings.templates.find(
      (template) =>
        template.setupName === setupName &&
        (template.direction === draft.direction || template.direction === 'BOTH'),
    )
    if (specific) {
      const nextItems = mergeSnapshotItems(
        draft.items,
        templateItemsForDirection(specific, settings.checklistItems, draft.direction),
      )
      patch({ setup: setupName, templateId: specific.id, items: nextItems })
    } else {
      patch({ setup: setupName })
    }
  }

  const save = async () => {
    const missing: string[] = []
    if (!draft.instrumentId) missing.push('instrument')
    if (!draft.setup) missing.push('setup')
    if (!draft.entry || draft.entry <= 0) missing.push('entry price')
    if (!draft.sl || draft.sl <= 0) missing.push('stop loss')
    if (!draft.tp || draft.tp <= 0) missing.push('take profit')
    if (!draft.riskPct || draft.riskPct <= 0) missing.push('risk percentage')
    if (missing.length > 0) {
      toast(`Complete these fields first: ${missing.join(', ')}.`, 'error')
      return
    }
    if (!position.directionValid) {
      toast(position.errors[0] ?? 'Check the stop loss and take profit sides.', 'error')
      return
    }
    const nextStatus: PlanStatus =
      plan?.status && plan.status !== 'Draft' ? plan.status : 'Planned'
    setSaveState('saving')
    try {
      await persistDraft(nextStatus)
      setSaveState('saved')
      toast(
        decisionEval.decision === 'READY'
          ? 'Plan saved. Checklist status: READY.'
          : `Plan saved. Checklist status: ${decisionEval.decision}.`,
        decisionEval.decision === 'NO TRADE' ? 'info' : 'success',
      )
      onClose()
    } catch {
      setSaveState('error')
      toast('Could not save the plan. Check browser storage.', 'error')
    }
  }

  const presetRisks = [0.5, 1, 2]

  return (
    <Modal
      open
      onClose={onClose}
      size="editor"
      title={plan ? `Edit trade plan · ${draft.setup}` : 'New trade plan'}
      description={`Times are shown in ${timezoneLabel(tz)} · ${timezoneShort(tz)}. Nothing is sent to a broker.`}
      footer={
        <>
          <div className="mr-auto flex items-center gap-2 text-[10px] text-dim">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                saveState === 'saving'
                  ? 'bg-warn'
                  : saveState === 'error'
                    ? 'bg-loss'
                    : saveState === 'saved'
                      ? 'bg-profit'
                      : 'bg-dim',
              )}
            />
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'saved'
                ? 'Saved to this device'
                : saveState === 'error'
                  ? 'Autosave failed'
                  : 'Changes autosave as a draft'}
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            <Save size={14} /> Save plan
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0 space-y-4">
          <section className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles size={15} className="text-accent-2" />
              <h3 className="text-[13px] font-semibold">Trade context</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="label" htmlFor="plan-datetime">
                  Date & time ({timezoneShort(tz)})
                </label>
                <input
                  id="plan-datetime"
                  type="datetime-local"
                  className="input"
                  value={draft.dateTime}
                  onChange={(event) => patch({ dateTime: event.target.value })}
                />
              </div>
              <div>
                <label className="label">Trading session</label>
                <select
                  className="input"
                  value={draft.session}
                  onChange={(event) => patch({ session: event.target.value as Session })}
                >
                  {SESSIONS.map((session) => (
                    <option key={session} value={session}>
                      {session}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Instrument</label>
                <select
                  className="input"
                  value={draft.instrumentId}
                  onChange={(event) => patch({ instrumentId: event.target.value })}
                >
                  {settings.instruments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.symbol} — {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Timeframe</label>
                <select
                  className="input"
                  value={draft.timeframe}
                  onChange={(event) => patch({ timeframe: event.target.value as Timeframe })}
                >
                  {TIMEFRAMES.map((timeframe) => (
                    <option key={timeframe} value={timeframe}>
                      {timeframe}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Market direction</label>
                <select
                  className="input"
                  value={draft.marketDirection}
                  onChange={(event) =>
                    patch({ marketDirection: event.target.value as MarketDirection })
                  }
                >
                  {MARKET_DIRECTIONS.map((direction) => (
                    <option key={direction} value={direction}>
                      {direction}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label">Trade direction</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => changeDirection('BUY')}
                    className={cn(
                      'h-10 rounded-lg border text-[12px] font-semibold transition',
                      draft.direction === 'BUY'
                        ? 'border-profit/50 bg-profit/15 text-profit'
                        : 'border-line bg-ink/50 text-muted hover:border-line-2 hover:text-fg',
                    )}
                  >
                    ▲ BUY
                  </button>
                  <button
                    type="button"
                    onClick={() => changeDirection('SELL')}
                    className={cn(
                      'h-10 rounded-lg border text-[12px] font-semibold transition',
                      draft.direction === 'SELL'
                        ? 'border-loss/50 bg-loss/15 text-loss'
                        : 'border-line bg-ink/50 text-muted hover:border-line-2 hover:text-fg',
                    )}
                  >
                    ▼ SELL
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <ChartCandlestick size={15} className="text-accent-2" />
              <h3 className="text-[13px] font-semibold">Level, setup & reasoning</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Setup</label>
                <select
                  className="input"
                  value={draft.setup}
                  onChange={(event) => changeSetup(event.target.value)}
                >
                  {settings.setups.map((setup) => (
                    <option key={setup.id} value={setup.name}>
                      {setup.name}
                      {setup.active ? '' : ' (inactive)'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Support / resistance level</label>
                <select
                  className="input"
                  value={draft.levelType}
                  onChange={(event) => patch({ levelType: event.target.value })}
                >
                  {LEVEL_TYPES.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>
              <NumberField
                label="Level price"
                value={draft.levelPrice}
                onChange={(value) => patch({ levelPrice: value })}
                placeholder={price(draft.entry, decimals)}
                suffix="price"
              />
              <div>
                <label className="label" htmlFor="level-notes">
                  Level notes
                </label>
                <input
                  id="level-notes"
                  className="input"
                  value={draft.levelNotes}
                  onChange={(event) => patch({ levelNotes: event.target.value })}
                  placeholder="Why does this level matter?"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="plan-reasoning">
                  Trade reasoning
                </label>
                <textarea
                  id="plan-reasoning"
                  className="input min-h-[96px]"
                  value={draft.reasoning}
                  onChange={(event) => patch({ reasoning: event.target.value })}
                  placeholder="HTF context, the level, the PA confirmation, invalidation and target. Be specific enough to review later."
                />
              </div>
            </div>
          </section>

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calculator size={15} className="text-accent-2" />
                <h3 className="text-[13px] font-semibold">Execution & position sizing</h3>
              </div>
              <Badge variant="slate">Balance {money(balance)}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                label="Entry price"
                value={draft.entry}
                onChange={(value) => patch({ entry: value })}
                placeholder="0.00"
                suffix="USD"
              />
              <NumberField
                label="Stop Loss"
                value={draft.sl}
                onChange={(value) => patch({ sl: value })}
                placeholder="0.00"
                suffix="USD"
                error={
                  draft.entry != null && draft.sl != null && !position.directionValid
                    ? `SL must be ${draft.direction === 'BUY' ? 'below' : 'above'} entry`
                    : null
                }
              />
              <NumberField
                label="Take Profit"
                value={draft.tp}
                onChange={(value) => patch({ tp: value })}
                placeholder="0.00"
                suffix="USD"
                error={
                  draft.tp != null && draft.entry != null && position.tpValid === false
                    ? `TP must be ${draft.direction === 'BUY' ? 'above' : 'below'} entry`
                    : null
                }
              />
            </div>

            <div className="mt-4">
              <span className="label">Risk per trade</span>
              <div className="flex flex-wrap items-center gap-2">
                {presetRisks.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => patch({ riskPct: preset })}
                    className={cn(
                      'h-9 rounded-lg border px-3 font-mono text-[12px] font-semibold transition',
                      draft.riskPct === preset
                        ? 'border-accent/50 bg-accent/10 text-accent-2'
                        : 'border-line bg-ink/50 text-muted hover:border-line-2 hover:text-fg',
                    )}
                  >
                    {preset.toFixed(1)}%
                  </button>
                ))}
                <NumberField
                  value={draft.riskPct}
                  onChange={(value) => patch({ riskPct: value ?? 0 })}
                  suffix="%"
                  className="w-28"
                  inputClassName="h-9"
                  min={0}
                  max={100}
                />
                <span className="text-[10px] text-dim">
                  {money(position.riskTarget)} planned risk of current balance
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-dim">
                <span>
                  Max allowed: <span className="font-mono text-muted">{pct(settings.maxRiskPct, 2)}</span>
                </span>
                <span>
                  Daily loss allowance left:{' '}
                  <span
                    className={cn(
                      'font-mono',
                      riskStatus.dayRemaining <= 0 ? 'text-loss' : 'text-muted',
                    )}
                  >
                    {money(riskStatus.dayRemaining)}
                  </span>
                </span>
                <span>
                  Minimum R:R: <span className="font-mono text-muted">1:{settings.minRR}</span>
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <CalcStat
                label="Position size"
                value={position.lots > 0 ? `${formatLots(position.lots)} lots` : '—'}
                hint={
                  position.rawLots > 0 && position.lots === 0
                    ? 'Below broker minimum'
                    : `${instrument?.symbol ?? ''} · ${formatLots(position.rawLots)} raw`
                }
              />
              <CalcStat
                label="Actual risk"
                value={money(position.riskActual)}
                tone="loss"
                hint={pct(position.riskPctActual, 2)}
              />
              <CalcStat
                label="Risk-to-reward"
                value={position.rr == null ? '—' : `1:${position.rr.toFixed(2)}`}
                tone={
                  position.rr == null
                    ? 'default'
                    : position.rr >= settings.minRR
                      ? 'profit'
                      : 'loss'
                }
              />
              <CalcStat
                label="SL distance"
                value={`${price(position.slDistance, decimals)}`}
                hint={`${position.slDistance > 0 && instrument ? (position.slDistance / instrument.tickSize).toFixed(0) : 0} points`}
              />
              <CalcStat
                label="Potential profit"
                value={position.rewardActual == null ? '—' : money(position.rewardActual)}
                tone="profit"
              />
              <CalcStat
                label="If stopped out"
                value={money(position.balanceAfterLoss)}
                hint={`Balance after loss`}
              />
            </div>

            {position.errors.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {position.errors.map((error) => (
                  <InfoNote key={error} tone="red" icon={<AlertTriangle size={12} />}>
                    {error}
                  </InfoNote>
                ))}
              </div>
            ) : null}

            {position.warnings.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {position.warnings.map((warning) => (
                  <InfoNote key={warning} tone="amber" icon={<AlertTriangle size={12} />}>
                    {warning}
                  </InfoNote>
                ))}
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between rounded-lg border border-line/80 bg-ink/40 px-3 py-2">
              <span className="flex items-center gap-1.5 text-[10px] text-dim">
                <Shield size={12} /> Daily loss limit
              </span>
              <div className="flex items-center gap-2">
                <ProgressBar
                  value={riskStatus.dayUsedPct}
                  tone={riskStatus.dayBreached ? 'red' : riskStatus.dayUsedPct > 60 ? 'amber' : 'green'}
                  className="w-20"
                  height="h-1"
                />
                <span className="font-mono text-[10px] text-muted">
                  {money(riskStatus.dayLossUsed)} / {money(riskStatus.dayLimit)}
                </span>
              </div>
            </div>
          </section>

          <section className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Info size={15} className="text-accent-2" />
              <h3 className="text-[13px] font-semibold">Chart screenshot</h3>
            </div>
            <ImageUpload
              label="Screenshot before entry"
              value={draft.screenshot}
              onChange={(value) => patch({ screenshot: value })}
              hint="Saved locally with the plan and linked checklist. Images are compressed before storage."
            />
          </section>
        </div>

        <div className="min-w-0 space-y-3 lg:sticky lg:top-0 lg:self-start">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <ClipboardCheck size={14} className="text-accent-2" />
              {activeTemplateName}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-dim">
                {draft.items.filter((item) => item.checked).length}/{draft.items.length}
              </span>
              <ArrowRight size={12} className="text-dim" />
              <span
                className={cn(
                  'text-[10px] font-semibold',
                  decisionEval.decision === 'READY'
                    ? 'text-profit'
                    : decisionEval.decision === 'WAIT'
                      ? 'text-warn'
                      : 'text-loss',
                )}
              >
                {decisionEval.decision}
              </span>
            </div>
          </div>

          <ChecklistPanel
            items={draft.items}
            onItemsChange={(items) => patch({ items })}
            scores={scores}
            overallPct={overallPct}
            decision={decisionEval.decision}
            blockers={decisionEval.blockers}
            missingMandatory={decisionEval.missingMandatory}
            notes={draft.checklistNotes}
            onNotesChange={(notes) => patch({ checklistNotes: notes })}
            templates={relevantTemplates}
            templateId={draft.templateId}
            onTemplateChange={applyTemplate}
            direction={draft.direction}
            chartScreenshot={draft.screenshot}
            onOpenScreenshot={() => setViewerOpen(true)}
          />
          <ImageLightbox
            src={draft.screenshot}
            alt="Plan chart screenshot"
            open={viewerOpen}
            onClose={() => setViewerOpen(false)}
          />
          <InfoNote tone="blue" icon={<Info size={12} />}>
            Checklist notes and progress autosave with this plan. The decision is computed from
            your checklist template and numerical risk rules — never from a broker connection.
          </InfoNote>
        </div>
      </div>
    </Modal>
  )
}
