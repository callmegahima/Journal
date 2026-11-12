import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  Calculator,
  Check,
  Info,
  Link2,
  Plus,
  RotateCcw,
  Save,
  X,
} from 'lucide-react'
import type {
  Direction,
  Plan,
  Session,
  Timeframe,
  Trade,
  TradeResult,
} from '@/types'
import { SESSIONS, TIMEFRAMES } from '@/types'
import { useData } from '@/store/DataContext'
import { useToast } from '@/store/ToastContext'
import { Modal } from '@/components/ui/Modal'
import { Button, Badge, InfoNote } from '@/components/ui/primitives'
import { NumberField } from '@/components/ui/form'
import { ImageUpload } from '@/components/ui/ImageUpload'
import {
  calculatePnl,
  calculateTradeRisk,
  decimalsForStep,
  plannedRR,
  resultFromPnl,
  valuePerPriceUnit,
} from '@/lib/calc'
import { COMMON_MISTAKES } from '@/lib/defaults'
import { isoToLocalInput, localInputToIso, nowIso, timezoneShort } from '@/lib/dates'
import { formatDuration, sessionForInstant } from '@/lib/metrics'
import { cn, uid } from '@/lib/utils'
import { lots as formatLots, money, num, pct, price, rMultiple } from '@/lib/format'

interface TradeDraftState {
  dateTime: string
  closeDateTime: string
  instrumentId: string
  direction: Direction
  entry: number | null
  exit: number | null
  sl: number | null
  tp: number | null
  lots: number | null
  commission: number | null
  swap: number | null
  riskAmount: number | null
  pnl: number | null
  setup: string
  timeframe: Timeframe
  session: Session
  reasonEntry: string
  reasonExit: string
  mistakes: string[]
  lessons: string
  screenshotBefore?: string
  screenshotAfter?: string
  planId?: string
  checklistId?: string
}

function suggestedSession(iso: string): Session {
  return sessionForInstant(iso)
}

function makeDraft(
  trade: Trade | undefined,
  plan: Plan | undefined,
  settings: ReturnType<typeof useData>['data']['settings'],
): TradeDraftState {
  const tz = settings.timezone
  if (trade) {
    return {
      dateTime: isoToLocalInput(trade.date, tz),
      closeDateTime: trade.closeDate ? isoToLocalInput(trade.closeDate, tz) : '',
      instrumentId: trade.instrumentId,
      direction: trade.direction,
      entry: trade.entry,
      exit: trade.exit,
      sl: trade.sl,
      tp: trade.tp,
      lots: trade.lots,
      commission: trade.commission ?? null,
      swap: trade.swap ?? null,
      riskAmount: trade.riskAmount,
      pnl: trade.pnl,
      setup: trade.setup,
      timeframe: trade.timeframe,
      session: trade.session,
      reasonEntry: trade.reasonEntry,
      reasonExit: trade.reasonExit,
      mistakes: trade.mistakes,
      lessons: trade.lessons,
      screenshotBefore: trade.screenshotBefore,
      screenshotAfter: trade.screenshotAfter,
      planId: trade.planId,
      checklistId: trade.checklistId,
    }
  }

  const activeSetups = settings.setups.filter((setup) => setup.active)
  return {
    dateTime: isoToLocalInput(plan?.dateTime ?? nowIso(), tz),
    closeDateTime: '',
    instrumentId:
      plan?.instrumentId ?? settings.activeInstrumentId ?? settings.instruments[0]?.id ?? '',
    direction: plan?.direction === 'SELL' ? 'SELL' : 'BUY',
    entry: plan?.entry ?? null,
    exit: null,
    sl: plan?.sl ?? null,
    tp: plan?.tp ?? null,
    lots: plan?.lots && plan.lots > 0 ? plan.lots : null,
    commission: null,
    swap: null,
    riskAmount: plan?.riskAmount && plan.riskAmount > 0 ? plan.riskAmount : null,
    pnl: null,
    setup: plan?.setup ?? activeSetups[0]?.name ?? settings.setups[0]?.name ?? '',
    timeframe: plan?.timeframe ?? 'M15',
    session: plan?.session ?? suggestedSession(plan?.dateTime ?? nowIso()),
    reasonEntry: plan?.reasoning ?? '',
    reasonExit: '',
    mistakes: [],
    lessons: '',
    screenshotBefore: plan?.screenshot,
    screenshotAfter: undefined,
    planId: plan?.id,
    checklistId: plan?.checklistId,
  }
}

export function TradeForm({
  trade,
  plan,
  onClose,
}: {
  trade?: Trade
  plan?: Plan
  onClose: () => void
}) {
  const { data, saveTrade, savePlan, saveChecklist } = useData()
  const { toast } = useToast()
  const settings = data.settings
  const tz = settings.timezone
  const [draft, setDraft] = useState<TradeDraftState>(() => makeDraft(trade, plan, settings))
  // An existing trade only counts as "manual" when its stored numbers differ from the
  // MT5 formula, so editing entry/exit/lots keeps updating P/L automatically.
  const [riskTouched, setRiskTouched] = useState(() => {
    if (!trade) return false
    const spec = settings.instruments.find((item) => item.id === trade.instrumentId)
    if (!spec) return true
    return Math.abs(calculateTradeRisk(trade.entry, trade.sl, trade.lots, spec) - trade.riskAmount) > 0.01
  })
  const [pnlTouched, setPnlTouched] = useState(() => {
    if (!trade) return false
    const spec = settings.instruments.find((item) => item.id === trade.instrumentId)
    if (!spec) return true
    const calc = calculatePnl({
      direction: trade.direction,
      entry: trade.entry,
      exit: trade.exit,
      lots: trade.lots,
      spec,
      commission: trade.commission,
      swap: trade.swap,
    })
    return Math.abs(calc.pnl - trade.pnl) > 0.01
  })
  const [sessionTouched, setSessionTouched] = useState(Boolean(trade || plan?.session))
  const [customMistake, setCustomMistake] = useState('')
  const [busy, setBusy] = useState(false)

  const instrument =
    settings.instruments.find((item) => item.id === draft.instrumentId) ??
    settings.instruments[0]
  const decimals = instrument ? decimalsForStep(instrument.tickSize) : 2

  const linkedPlan = useMemo(
    () => (draft.planId ? data.plans.find((item) => item.id === draft.planId) : plan),
    [draft.planId, data.plans, plan],
  )
  const linkedChecklist = useMemo(
    () =>
      draft.checklistId
        ? data.checklists.find((item) => item.id === draft.checklistId)
        : linkedPlan?.checklistId
          ? data.checklists.find((item) => item.id === linkedPlan.checklistId)
          : undefined,
    [draft.checklistId, linkedPlan, data.checklists],
  )

  const calculatedRisk = useMemo(
    () => (instrument ? calculateTradeRisk(draft.entry, draft.sl, draft.lots ?? 0, instrument) : 0),
    [instrument, draft.entry, draft.sl, draft.lots],
  )
  const riskValue = riskTouched ? draft.riskAmount : calculatedRisk
  const effectiveRisk = riskValue ?? 0

  const calculatedPnl = useMemo(
    () =>
      instrument
        ? calculatePnl({
            direction: draft.direction,
            entry: draft.entry,
            exit: draft.exit,
            lots: draft.lots ?? 0,
            spec: instrument,
            commission: draft.commission,
            swap: draft.swap,
          })
        : {
            gross: 0,
            fees: 0,
            commission: 0,
            swap: 0,
            pnl: 0,
            result: 'Breakeven' as TradeResult,
            priceMove: 0,
            points: 0,
          },
    [instrument, draft.direction, draft.entry, draft.exit, draft.lots, draft.commission, draft.swap],
  )
  const pnlValue = pnlTouched ? draft.pnl : calculatedPnl.pnl
  const effectivePnl = pnlValue ?? 0
  const result: TradeResult = resultFromPnl(effectivePnl)
  const rValue = effectiveRisk > 0 ? effectivePnl / effectiveRisk : 0
  const hasPriceResult = draft.entry != null && draft.exit != null

  const balance = useMemo(
    () =>
      settings.startingBalance + data.trades.reduce((sum, item) => sum + item.pnl, 0),
    [settings.startingBalance, data.trades],
  )

  const lotIssue = useMemo(() => {
    if (!instrument || draft.lots == null || !(draft.lots > 0)) return null
    if (draft.lots < instrument.minLot - 1e-9)
      return `Lot size must be at least ${formatLots(instrument.minLot)} (MT5 minimum volume).`
    if (draft.lots > instrument.maxLot + 1e-9)
      return `Lot size cannot exceed ${formatLots(instrument.maxLot)} (MT5 maximum volume).`
    const steps = draft.lots / instrument.lotStep
    if (Math.abs(steps - Math.round(steps)) > 1e-6)
      return `Lot size must be a multiple of ${formatLots(instrument.lotStep)} (MT5 volume step).`
    return null
  }, [instrument, draft.lots])

  const holdMinutes = useMemo(() => {
    if (!draft.dateTime || !draft.closeDateTime) return null
    const open = Date.parse(localInputToIso(draft.dateTime, tz))
    const close = Date.parse(localInputToIso(draft.closeDateTime, tz))
    return Number.isFinite(open) && Number.isFinite(close) ? (close - open) / 60000 : null
  }, [draft.dateTime, draft.closeDateTime, tz])

  const patch = (partial: Partial<TradeDraftState>) =>
    setDraft((current) => ({ ...current, ...partial }))

  const toggleMistake = (mistake: string) => {
    patch({
      mistakes: draft.mistakes.includes(mistake)
        ? draft.mistakes.filter((item) => item !== mistake)
        : [...draft.mistakes, mistake],
    })
  }

  const addCustomMistake = () => {
    const clean = customMistake.trim()
    if (!clean) return
    if (!draft.mistakes.includes(clean)) {
      patch({ mistakes: [...draft.mistakes, clean] })
    }
    setCustomMistake('')
  }

  const save = async () => {
    const missing: string[] = []
    if (!draft.instrumentId) missing.push('instrument')
    if (!draft.setup) missing.push('setup')
    if (draft.entry == null || draft.entry <= 0) missing.push('entry price')
    if (draft.exit == null || draft.exit <= 0) missing.push('exit price')
    if (draft.sl == null || draft.sl <= 0) missing.push('stop loss')
    if (draft.lots == null || draft.lots <= 0) missing.push('lot size')
    if (effectiveRisk <= 0) missing.push('risk amount')
    if (missing.length > 0) {
      toast(`Complete these fields first: ${missing.join(', ')}.`, 'error')
      return
    }
    if (lotIssue) {
      toast(lotIssue, 'error')
      return
    }
    if (holdMinutes != null && holdMinutes < 0) {
      toast('The close time is before the open time.', 'error')
      return
    }

    const seq = trade?.seq ?? data.trades.reduce((max, item) => Math.max(max, item.seq), 0) + 1
    const nextTrade: Trade = {
      id: trade?.id ?? uid('trade'),
      seq,
      createdAt: trade?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      planId: draft.planId,
      checklistId: draft.checklistId,
      date: localInputToIso(draft.dateTime, tz),
      closeDate: draft.closeDateTime ? localInputToIso(draft.closeDateTime, tz) : undefined,
      instrumentId: draft.instrumentId,
      direction: draft.direction,
      entry: draft.entry ?? 0,
      exit: draft.exit ?? 0,
      sl: draft.sl ?? 0,
      tp: draft.tp,
      lots: draft.lots ?? 0,
      riskAmount: effectiveRisk,
      grossPnl: calculatedPnl.gross,
      commission: draft.commission ?? 0,
      swap: draft.swap ?? 0,
      pnl: effectivePnl,
      result,
      rMultiple: rValue,
      setup: draft.setup,
      timeframe: draft.timeframe,
      session: draft.session,
      screenshotBefore: draft.screenshotBefore,
      screenshotAfter: draft.screenshotAfter,
      reasonEntry: draft.reasonEntry,
      reasonExit: draft.reasonExit,
      mistakes: draft.mistakes,
      lessons: draft.lessons,
    }

    setBusy(true)
    try {
      await saveTrade(nextTrade)

      if (draft.planId) {
        const relatedPlan = data.plans.find((item) => item.id === draft.planId)
        if (relatedPlan) {
          await savePlan({
            ...relatedPlan,
            status: 'Executed',
            tradeId: nextTrade.id,
          })
        }
      }

      if (linkedChecklist) {
        await saveChecklist({
          ...linkedChecklist,
          tradeId: nextTrade.id,
          finalized: true,
        })
      }

      toast(
        `Trade T-${String(seq).padStart(4, '0')} saved · ${result} ${effectivePnl >= 0 ? '+' : ''}${money(effectivePnl)}.`,
        result === 'Loss' ? 'info' : 'success',
      )
      onClose()
    } catch {
      toast('Could not save the trade. Check browser storage.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="editor"
      title={
        trade
          ? `Edit trade · T-${String(trade.seq).padStart(4, '0')}`
          : 'Log a completed trade'
      }
      description={`Times shown in ${timezoneShort(tz)}. Enter your actual MT5 execution data — nothing is fetched from a broker.`}
      footer={
        <>
          <div className="mr-auto hidden items-center gap-2 sm:flex">
            {hasPriceResult ? (
              <>
                <Badge variant={result === 'Win' ? 'green' : result === 'Loss' ? 'red' : 'slate'}>
                  {result}
                </Badge>
                <span
                  className={cn(
                    'font-mono text-[12px] font-semibold',
                    effectivePnl > 0
                      ? 'text-profit'
                      : effectivePnl < 0
                        ? 'text-loss'
                        : 'text-muted',
                  )}
                >
                  {effectivePnl >= 0 ? '+' : ''}
                  {money(effectivePnl)}
                </span>
                <span className="font-mono text-[10px] text-dim">{rMultiple(rValue)}</span>
              </>
            ) : (
              <span className="text-[10px] text-dim">Enter entry & exit to calculate P/L</span>
            )}
          </div>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy}>
            <Save size={14} /> {trade ? 'Save changes' : 'Save trade'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {linkedPlan ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/20 bg-accent/[0.05] px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-[11px] text-accent-2">
                <Link2 size={13} className="text-accent-2" />
                Linked plan: <span className="font-medium text-fg">{linkedPlan.setup}</span>
                <span className="text-dim">· {linkedPlan.direction}</span>
              </div>
              {linkedChecklist ? (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-dim">Checklist</span>
                  <span
                    className={cn(
                      'font-semibold',
                      linkedChecklist.decision === 'READY'
                        ? 'text-profit'
                        : linkedChecklist.decision === 'WAIT'
                          ? 'text-warn'
                          : 'text-loss',
                    )}
                  >
                    {linkedChecklist.decision}
                  </span>
                  <span className="font-mono text-dim">{linkedChecklist.overallPct}%</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <section className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <ArrowRightLeft size={15} className="text-accent-2" />
              <h3 className="text-[13px] font-semibold">Trade execution</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="label">Open time ({timezoneShort(tz)})</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={draft.dateTime}
                  onChange={(event) => {
                    const value = event.target.value
                    patch(
                      sessionTouched || !value
                        ? { dateTime: value }
                        : { dateTime: value, session: suggestedSession(localInputToIso(value, tz)) },
                    )
                  }}
                />
              </div>
              <div>
                <label className="label">Close time ({timezoneShort(tz)})</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={draft.closeDateTime}
                  min={draft.dateTime || undefined}
                  onChange={(event) => patch({ closeDateTime: event.target.value })}
                />
                <p
                  className={cn(
                    'mt-1 text-[10px]',
                    holdMinutes != null && holdMinutes < 0 ? 'text-loss' : 'text-dim',
                  )}
                >
                  {holdMinutes == null
                    ? 'Optional — used for holding-time stats.'
                    : holdMinutes < 0
                      ? 'Close time is before the open time.'
                      : `Held ${formatDuration(holdMinutes)}`}
                </p>
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
                <span className="label">Direction</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['BUY', 'SELL'] as Direction[]).map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      onClick={() => patch({ direction })}
                      className={cn(
                        'h-10 rounded-lg border text-[12px] font-semibold transition',
                        draft.direction === direction
                          ? direction === 'BUY'
                            ? 'border-profit/50 bg-profit/15 text-profit'
                            : 'border-loss/50 bg-loss/15 text-loss'
                          : 'border-line bg-ink/50 text-muted hover:border-line-2 hover:text-fg',
                      )}
                    >
                      {direction === 'BUY' ? '▲ BUY' : '▼ SELL'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Setup</label>
                <select
                  className="input"
                  value={draft.setup}
                  onChange={(event) => patch({ setup: event.target.value })}
                >
                  {settings.setups.map((setup) => (
                    <option key={setup.id} value={setup.name}>
                      {setup.name}
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
                <label className="label">Session</label>
                <select
                  className="input"
                  value={draft.session}
                  onChange={(event) => {
                    setSessionTouched(true)
                    patch({ session: event.target.value as Session })
                  }}
                >
                  {SESSIONS.map((session) => (
                    <option key={session} value={session}>
                      {session}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Calculator size={15} className="text-accent-2" />
              <h3 className="text-[13px] font-semibold">Prices, size & result</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <NumberField
                label="Entry price"
                value={draft.entry}
                onChange={(value) => patch({ entry: value })}
                suffix="USD"
              />
              <NumberField
                label="Exit price"
                value={draft.exit}
                onChange={(value) => patch({ exit: value })}
                suffix="USD"
              />
              <NumberField
                label="Stop Loss"
                value={draft.sl}
                onChange={(value) => patch({ sl: value })}
                suffix="USD"
              />
              <NumberField
                label="Take Profit"
                value={draft.tp}
                onChange={(value) => patch({ tp: value })}
                suffix="USD"
              />
              <NumberField
                label="Lot size (volume)"
                value={draft.lots}
                onChange={(value) => patch({ lots: value })}
                suffix="lots"
                min={instrument?.minLot ?? 0.01}
                step={instrument?.lotStep ?? 0.01}
                error={lotIssue}
                hint={
                  instrument && draft.lots && draft.lots > 0 && !lotIssue
                    ? `${num(draft.lots * instrument.contractSize, 2)} oz · ${money(valuePerPriceUnit(instrument) * draft.lots)} per $1 move`
                    : `Min ${formatLots(instrument?.minLot ?? 0.01)} · step ${formatLots(instrument?.lotStep ?? 0.01)}`
                }
              />
              <NumberField
                label="Risk amount"
                value={riskValue}
                onChange={(value) => {
                  setRiskTouched(true)
                  patch({ riskAmount: value })
                }}
                suffix="USD"
                hint={
                  riskTouched
                    ? 'Manual risk amount — used for the R multiple.'
                    : `Auto: SL distance × ${instrument ? valuePerPriceUnit(instrument) : '—'} (contract size) × lots.`
                }
              />
              <NumberField
                label="Commission"
                value={draft.commission}
                onChange={(value) => patch({ commission: value })}
                suffix="USD"
                placeholder="-0.00"
                hint="As shown in MT5 history (usually negative)."
              />
              <NumberField
                label="Swap"
                value={draft.swap}
                onChange={(value) => patch({ swap: value })}
                suffix="USD"
                placeholder="0.00"
                hint="Overnight swap from MT5 (+ or -)."
              />
              <NumberField
                label="Net profit / loss"
                value={pnlValue}
                onChange={(value) => {
                  setPnlTouched(true)
                  patch({ pnl: value })
                }}
                suffix="USD"
                inputClassName={
                  effectivePnl > 0
                    ? 'text-profit'
                    : effectivePnl < 0
                      ? 'text-loss'
                      : undefined
                }
                hint={
                  pnlTouched
                    ? 'Manual P/L. Click "Use calculated values" to return to the MT5 formula.'
                    : 'Auto: MT5 profit + commission + swap.'
                }
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPnlTouched(false)
                  setRiskTouched(false)
                }}
              >
                <RotateCcw size={12} /> Use calculated values
              </Button>
              <span className="text-[10px] text-dim">
                Balance {money(balance)} · planned R:R{' '}
                {plannedRR(draft.entry, draft.sl, draft.tp) > 0
                  ? `1:${plannedRR(draft.entry, draft.sl, draft.tp).toFixed(2)}`
                  : '—'}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-line/80 bg-ink/40 px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-wide text-dim">Price move</div>
                <div
                  className={cn(
                    'mt-0.5 font-mono text-[13px] font-semibold',
                    calculatedPnl.priceMove > 0
                      ? 'text-profit'
                      : calculatedPnl.priceMove < 0
                        ? 'text-loss'
                        : 'text-fg',
                  )}
                >
                  {hasPriceResult
                    ? `${calculatedPnl.priceMove >= 0 ? '+' : ''}${calculatedPnl.priceMove.toFixed(decimals)}`
                    : '—'}
                </div>
                <div className="font-mono text-[9px] text-dim">
                  {hasPriceResult
                    ? `${calculatedPnl.points >= 0 ? '+' : ''}${calculatedPnl.points} points`
                    : 'points'}
                </div>
              </div>
              <div className="rounded-lg border border-line/80 bg-ink/40 px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-wide text-dim">MT5 profit</div>
                <div
                  className={cn(
                    'mt-0.5 font-mono text-[13px] font-semibold',
                    calculatedPnl.gross > 0
                      ? 'text-profit'
                      : calculatedPnl.gross < 0
                        ? 'text-loss'
                        : 'text-fg',
                  )}
                >
                  {hasPriceResult
                    ? `${calculatedPnl.gross >= 0 ? '+' : ''}${money(calculatedPnl.gross)}`
                    : '—'}
                </div>
                <div className="font-mono text-[9px] text-dim">before commission & swap</div>
              </div>
              <div className="rounded-lg border border-line/80 bg-ink/40 px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-wide text-dim">Result</div>
                <div className="mt-1">
                  {hasPriceResult ? (
                    <Badge
                      variant={result === 'Win' ? 'green' : result === 'Loss' ? 'red' : 'slate'}
                    >
                      {result}
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-dim">—</span>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-line/80 bg-ink/40 px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-wide text-dim">Net P/L</div>
                <div
                  className={cn(
                    'mt-0.5 font-mono text-[13px] font-semibold',
                    effectivePnl > 0
                      ? 'text-profit'
                      : effectivePnl < 0
                        ? 'text-loss'
                        : 'text-fg',
                  )}
                >
                  {effectivePnl >= 0 ? '+' : ''}
                  {money(effectivePnl)}
                </div>
              </div>
              <div className="rounded-lg border border-line/80 bg-ink/40 px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-wide text-dim">R multiple</div>
                <div
                  className={cn(
                    'mt-0.5 font-mono text-[13px] font-semibold',
                    rValue > 0 ? 'text-profit' : rValue < 0 ? 'text-loss' : 'text-fg',
                  )}
                >
                  {rMultiple(rValue)}
                </div>
              </div>
              <div className="rounded-lg border border-line/80 bg-ink/40 px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-wide text-dim">Risk of balance</div>
                <div className="mt-0.5 font-mono text-[13px] font-semibold text-fg">
                  {pct(balance > 0 ? (effectiveRisk / balance) * 100 : 0, 2)}
                </div>
              </div>
            </div>

            <div className="mt-2 text-[10px] leading-relaxed text-dim">
              MT5 formula for {instrument?.symbol ?? 'the instrument'}: BUY = (exit − entry), SELL =
              (entry − exit), × {instrument ? valuePerPriceUnit(instrument) : '—'} (contract size) × lots,
              rounded to cents. A $1 move is $1 at 0.01 lot, $10 at 0.10 lot and $100 at 1.00 lot.
              Net P/L = profit + commission + swap, so it should match the MT5 history tab.
            </div>
          </section>

          <section className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Info size={15} className="text-accent-2" />
              <h3 className="text-[13px] font-semibold">Review & lessons</h3>
            </div>
            <div className="grid gap-3">
              <div>
                <label className="label" htmlFor="reason-entry">
                  Reason for entering
                </label>
                <textarea
                  id="reason-entry"
                  className="input min-h-[76px]"
                  value={draft.reasonEntry}
                  onChange={(event) => patch({ reasonEntry: event.target.value })}
                  placeholder="What made this trade valid at entry?"
                />
              </div>
              <div>
                <label className="label" htmlFor="reason-exit">
                  Reason for exiting
                </label>
                <textarea
                  id="reason-exit"
                  className="input min-h-[76px]"
                  value={draft.reasonExit}
                  onChange={(event) => patch({ reasonExit: event.target.value })}
                  placeholder="Target hit, invalidation, trailed out, emotional exit…"
                />
              </div>
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          <section className="card p-4">
            <h3 className="mb-2.5 text-[13px] font-semibold">Mistakes made</h3>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(new Set([...COMMON_MISTAKES, ...draft.mistakes])).map((mistake) => {
                const active = draft.mistakes.includes(mistake)
                return (
                  <button
                    key={mistake}
                    type="button"
                    onClick={() => toggleMistake(mistake)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition',
                      active
                        ? 'border-loss/40 bg-loss/10 text-loss'
                        : 'border-line bg-ink/40 text-muted hover:border-line-2 hover:text-fg',
                    )}
                  >
                    {active ? <Check size={10} /> : null}
                    {mistake}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex gap-1.5">
              <input
                className="input input-sm"
                value={customMistake}
                onChange={(event) => setCustomMistake(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addCustomMistake()
                  }
                }}
                placeholder="Add your own mistake…"
              />
              <Button type="button" size="sm" variant="soft" onClick={addCustomMistake}>
                <Plus size={13} />
              </Button>
            </div>
            {draft.mistakes.length > 0 ? (
              <div className="mt-2 space-y-1">
                {draft.mistakes.map((mistake) => (
                  <div
                    key={mistake}
                    className="flex items-center justify-between rounded-md bg-loss/[0.06] px-2 py-1 text-[10px] text-loss/90"
                  >
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={10} />
                      {mistake}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleMistake(mistake)}
                      className="text-dim hover:text-fg"
                      aria-label={`Remove ${mistake}`}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[10px] text-dim">
                No mistakes selected. Honest tagging makes your analytics more useful.
              </p>
            )}
          </section>

          <section className="card p-4">
            <h3 className="mb-2.5 text-[13px] font-semibold">Lessons learned</h3>
            <textarea
              className="input min-h-[110px]"
              value={draft.lessons}
              onChange={(event) => patch({ lessons: event.target.value })}
              placeholder="What will you repeat, and what will you do differently next time?"
            />
          </section>

          <section className="card space-y-3 p-4">
            <h3 className="text-[13px] font-semibold">Chart screenshots</h3>
            <ImageUpload
              label="Before entry"
              value={draft.screenshotBefore}
              onChange={(value) => patch({ screenshotBefore: value })}
            />
            <ImageUpload
              label="After exit"
              value={draft.screenshotAfter}
              onChange={(value) => patch({ screenshotAfter: value })}
            />
          </section>

          {linkedPlan ? (
            <InfoNote tone="blue" icon={<Link2 size={12} />}>
              Saving this trade marks the linked plan as executed and links the checklist for
              quality-vs-result comparison.
            </InfoNote>
          ) : (
            <InfoNote tone="slate" icon={<Info size={12} />}>
              You can log a trade without a plan, but planned trades produce cleaner analytics.
              Use <span className="font-medium text-fg">Trading Plan → New plan</span> first when
              possible.
            </InfoNote>
          )}
          <div className="text-[10px] text-dim">
            Lot size entered:{' '}
            <span className="font-mono text-muted">{formatLots(draft.lots)}</span> · risk{' '}
            <span className="font-mono text-muted">{money(effectiveRisk)}</span> · SL distance{' '}
            <span className="font-mono text-muted">
              {price(
                draft.entry != null && draft.sl != null
                  ? Math.abs(draft.entry - draft.sl)
                  : null,
                decimals,
              )}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
