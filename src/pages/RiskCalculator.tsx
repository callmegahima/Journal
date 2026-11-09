import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Info,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { Direction } from '@/types'
import { DIRECTIONS } from '@/types'
import { useData } from '@/store/DataContext'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Divider,
  InfoNote,
  ProgressBar,
} from '@/components/ui/primitives'
import { NumberField } from '@/components/ui/form'
import { StatCard } from '@/components/ui/StatCard'
import {
  calculatePosition,
  pointsFromPrice,
  type PositionResult,
} from '@/lib/calc'
import { computeRiskStatus } from '@/lib/metrics'
import {
  lots as formatLots,
  money,
  moneySigned,
  pct,
  price,
  rMultiple,
  decimalsForTick,
} from '@/lib/format'
import { timezoneShort } from '@/lib/dates'
import { cn } from '@/lib/utils'

function ResultRow({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string
  value: string
  tone?: 'default' | 'profit' | 'loss' | 'warn'
  hint?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <div className="text-[11px] text-muted">{label}</div>
        {hint ? <div className="mt-0.5 text-[9px] leading-relaxed text-dim">{hint}</div> : null}
      </div>
      <div
        className={cn(
          'shrink-0 font-mono text-[12px] font-semibold tabular-nums',
          tone === 'profit'
            ? 'text-profit'
            : tone === 'loss'
              ? 'text-loss'
              : tone === 'warn'
                ? 'text-warn'
                : 'text-fg',
        )}
      >
        {value}
      </div>
    </div>
  )
}

function riskTone(pnl: number): 'profit' | 'loss' | 'default' {
  if (pnl > 0) return 'profit'
  if (pnl < 0) return 'loss'
  return 'default'
}

function scenarioLabel(value: number): string {
  return `${value}%`
}

export function RiskCalculatorPage() {
  const { data } = useData()
  const navigate = useNavigate()
  const { settings, trades } = data
  const tz = settings.timezone

  const instruments = settings.instruments
  const equity = useMemo(
    () => settings.startingBalance + trades.reduce((sum, trade) => sum + trade.pnl, 0),
    [settings.startingBalance, trades],
  )

  const [instrumentId, setInstrumentId] = useState(
    settings.activeInstrumentId || instruments[0]?.id || '',
  )
  const spec = instruments.find((instrument) => instrument.id === instrumentId) ?? instruments[0]
  const [direction, setDirection] = useState<Direction>('BUY')
  const [balance, setBalance] = useState<number>(equity)
  const [riskPct, setRiskPct] = useState<number>(settings.defaultRiskPct)
  const [entry, setEntry] = useState<number | null>(null)
  const [sl, setSl] = useState<number | null>(null)
  const [tp, setTp] = useState<number | null>(null)
  const [manualLots, setManualLots] = useState<number | null>(null)

  const riskStatus = useMemo(
    () => computeRiskStatus(trades, settings, tz),
    [trades, settings, tz],
  )

  const position = useMemo<PositionResult | null>(() => {
    if (!spec) return null
    return calculatePosition({
      direction,
      entry,
      sl,
      tp,
      balance: Math.max(0, balance),
      riskPct: Math.max(0, riskPct),
      spec,
      minRR: settings.minRR,
      maxRiskPct: settings.maxRiskPct,
      lotsOverride: manualLots,
    })
  }, [
    spec,
    direction,
    entry,
    sl,
    tp,
    balance,
    riskPct,
    settings.minRR,
    settings.maxRiskPct,
    manualLots,
  ])

  const digits = spec ? decimalsForTick(spec.tickSize) : 2
  const blockers = useMemo(() => {
    const list: string[] = []
    if (!position) {
      list.push('No instrument is configured. Add one in Settings before sizing a trade.')
      return list
    }
    if (position.incomplete) {
      list.push('Define the entry price and stop loss to calculate position size.')
    } else {
      list.push(...position.errors)
      if (
        position.directionValid &&
        position.lots <= 0 &&
        position.rawLots > 0 &&
        !position.lotsOverridden
      ) {
        list.push(
          'Calculated size rounds below the broker minimum lot. Risking the minimum lot would exceed your target — skip the trade or revise the stop.',
        )
      }
      if (position.lotsOverridden && position.lots <= 0) {
        list.push(
          `The manual lot size is below the broker minimum of ${spec ? formatLots(spec.minLot) : '0.01'} lots.`,
        )
      }
      if (
        position.lotsOverridden &&
        position.lots > 0 &&
        position.riskPctActual > settings.maxRiskPct + 1e-9
      ) {
        list.push(
          `The manual lot size risks ${position.riskPctActual.toFixed(2)}% of balance, above your ${settings.maxRiskPct.toFixed(2)}% maximum.`,
        )
      }
      if (position.rr == null) {
        list.push(
          `Define a valid take profit so the reward-to-risk ratio can be checked against your 1:${settings.minRR.toFixed(2)} minimum.`,
        )
      } else if (position.rr < settings.minRR) {
        list.push(
          `Reward-to-risk is 1:${position.rr.toFixed(2)}, below your configured minimum of 1:${settings.minRR.toFixed(2)}.`,
        )
      }
    }
    if (riskPct > settings.maxRiskPct) {
      list.push(
        `Planned risk of ${riskPct.toFixed(2)}% exceeds your maximum of ${settings.maxRiskPct.toFixed(2)}%.`,
      )
    }
    if (position && balance > 0 && position.riskActual >= balance) {
      list.push('A single loss at this size would wipe out the account.')
    }
    if (riskStatus.dayBreached) {
      list.push('Daily loss limit has been reached. No new trades today.')
    } else if (
      position &&
      position.riskActual > 0 &&
      position.riskActual > riskStatus.dayRemaining + 0.005
    ) {
      list.push(
        `This trade's risk (${money(position.riskActual)}) exceeds the remaining daily allowance (${money(riskStatus.dayRemaining)}).`,
      )
    }
    if (riskStatus.weekBreached) {
      list.push('Weekly loss limit has been reached. Stop trading for this week.')
    } else if (
      position &&
      position.riskActual > 0 &&
      position.riskActual > riskStatus.weekRemaining + 0.005
    ) {
      list.push(
        `This trade's risk (${money(position.riskActual)}) exceeds the remaining weekly allowance (${money(riskStatus.weekRemaining)}).`,
      )
    }
    return Array.from(new Set(list))
  }, [position, riskPct, settings.maxRiskPct, settings.minRR, balance, riskStatus, spec])

  const clear = blockers.length === 0
  const scenarioPcts = useMemo(() => {
    const values = new Set([0.25, 0.5, 1, 1.5, 2, riskPct])
    return Array.from(values)
      .filter((value) => Number.isFinite(value) && value > 0 && value <= 100)
      .sort((a, b) => a - b)
  }, [riskPct])

  const reset = () => {
    setDirection('BUY')
    setBalance(equity)
    setRiskPct(settings.defaultRiskPct)
    setEntry(null)
    setSl(null)
    setTp(null)
    setManualLots(null)
  }

  const useEquity = () => setBalance(Math.round(equity * 100) / 100)

  const slPoints = spec ? pointsFromPrice(position?.slDistance ?? 0, spec) : 0
  const tpPoints = spec ? pointsFromPrice(position?.tpDistance ?? 0, spec) : 0

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Risk Calculator"
        title="Size the trade before you take it"
        description="Manual position sizing for XAUUSD. Every number comes from the contract specification and prices you enter. This tool never places an order and never contacts a broker."
        actions={
          <>
            <Button variant="ghost" onClick={reset}>
              <RotateCcw size={14} /> Reset
            </Button>
            <Button variant="primary" onClick={() => navigate('/plan?new=1')}>
              <ClipboardCheck size={14} /> Run the checklist
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label="Account equity"
          value={money(equity)}
          sub={`Starting balance ${money(settings.startingBalance)}`}
          icon={<Calculator size={14} />}
        />
        <StatCard
          label="Risk target"
          value={money(position?.riskTarget ?? 0)}
          sub={`${riskPct.toFixed(2)}% of ${money(balance)}`}
          icon={<Target size={14} />}
        />
        <StatCard
          label="Position size"
          value={
            position && position.lots > 0
              ? `${formatLots(position.lots)} lots`
              : position && !position.incomplete && position.directionValid && position.rawLots > 0
                ? 'Below min'
                : '—'
          }
          tone={
            position && position.lots > 0
              ? 'accent'
              : position && !position.incomplete && position.rawLots > 0
                ? 'warn'
                : 'default'
          }
          sub={
            position?.lotsOverridden
              ? `Manual · auto ${
                  position.autoLots && position.autoLots > 0
                    ? `${formatLots(position.autoLots)} lots`
                    : 'below minimum'
                }`
              : position && position.rawLots > 0
                ? `Raw ${formatLots(position.rawLots)} · step ${spec ? formatLots(spec.lotStep) : '—'}`
                : 'Waiting for valid prices'
          }
          icon={<TrendingUp size={14} />}
        />
        <StatCard
          label="Reward at target"
          value={position?.rewardActual != null ? money(position.rewardActual) : '—'}
          tone="profit"
          sub={
            position?.rr != null
              ? `1:${position.rr.toFixed(2)} reward-to-risk`
              : 'Define take profit to see reward'
          }
          icon={<TrendingDown size={14} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Risk guard — today and this week"
              subtitle={`Based on your recorded trades, ${timezoneShort(tz)} day boundaries and your configured loss limits.`}
              icon={<ShieldAlert size={14} />}
              action={
                <Badge
                  variant={
                    riskStatus.dayBreached || riskStatus.weekBreached
                      ? 'red'
                      : riskStatus.dayUsedPct > 60 || riskStatus.weekUsedPct > 60
                        ? 'amber'
                        : 'green'
                  }
                >
                  {riskStatus.dayBreached || riskStatus.weekBreached
                    ? 'Limit reached'
                    : 'Within limits'}
                </Badge>
              }
            />
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-muted">Daily loss limit</span>
                  <span
                    className={cn(
                      'font-mono text-[11px] font-semibold',
                      riskStatus.dayPnl < 0 ? 'text-loss' : 'text-fg',
                    )}
                  >
                    {riskStatus.dayPnl === 0 ? '—' : moneySigned(riskStatus.dayPnl)}
                  </span>
                </div>
                <ProgressBar
                  value={riskStatus.dayUsedPct}
                  tone={
                    riskStatus.dayBreached
                      ? 'red'
                      : riskStatus.dayUsedPct > 60
                        ? 'amber'
                        : 'green'
                  }
                  className="mt-2"
                />
                <div className="mt-1.5 flex justify-between text-[10px] text-dim">
                  <span>{money(riskStatus.dayLossUsed)} used</span>
                  <span>{money(riskStatus.dayRemaining)} remaining</span>
                </div>
                <p className="mt-1 text-[9px] leading-relaxed text-dim">
                  Allowance {money(riskStatus.dayLimit)} ({settings.dailyLossLimitPct}% of the
                  day-start balance).
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-muted">Weekly loss limit</span>
                  <span
                    className={cn(
                      'font-mono text-[11px] font-semibold',
                      riskStatus.weekPnl < 0 ? 'text-loss' : 'text-fg',
                    )}
                  >
                    {riskStatus.weekPnl === 0 ? '—' : moneySigned(riskStatus.weekPnl)}
                  </span>
                </div>
                <ProgressBar
                  value={riskStatus.weekUsedPct}
                  tone={
                    riskStatus.weekBreached
                      ? 'red'
                      : riskStatus.weekUsedPct > 60
                        ? 'amber'
                        : 'green'
                  }
                  className="mt-2"
                />
                <div className="mt-1.5 flex justify-between text-[10px] text-dim">
                  <span>{money(riskStatus.weekLossUsed)} used</span>
                  <span>{money(riskStatus.weekRemaining)} remaining</span>
                </div>
                <p className="mt-1 text-[9px] leading-relaxed text-dim">
                  Allowance {money(riskStatus.weekLimit)} ({settings.weeklyLossLimitPct}% of the
                  week-start balance).
                </p>
              </div>
            </div>
            {riskStatus.dayBreached || riskStatus.weekBreached ? (
              <div className="px-4 pb-4">
                <InfoNote tone="red" icon={<AlertTriangle size={12} />}>
                  {riskStatus.dayBreached
                    ? 'Your daily loss limit is used up. Stand down for the rest of the day.'
                    : 'Your weekly loss limit is used up. Stop trading for this week.'}{' '}
                  The calculator can still size a hypothetical trade, but it will not be marked as
                  cleared.
                </InfoNote>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Trade parameters"
              subtitle="Use the prices from your own chart and the contract specification verified with your broker."
              icon={<Calculator size={14} />}
            />
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <label className="label" htmlFor="risk-instrument">
                    Instrument
                  </label>
                  <select
                    id="risk-instrument"
                    className="input"
                    value={instrumentId}
                    onChange={(event) => setInstrumentId(event.target.value)}
                  >
                    {instruments.map((instrument) => (
                      <option key={instrument.id} value={instrument.id}>
                        {instrument.symbol} — {instrument.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="label">Direction</span>
                  <div className="segmented h-10">
                    {DIRECTIONS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        data-active={direction === item}
                        onClick={() => setDirection(item)}
                        className={cn(
                          'h-full px-4',
                          direction === item && item === 'BUY'
                            ? 'text-profit'
                            : direction === item && item === 'SELL'
                              ? 'text-loss'
                              : '',
                        )}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <NumberField
                    label="Account balance (USD)"
                    value={balance}
                    onChange={(value) => setBalance(value ?? 0)}
                    min={0}
                    prefix="$"
                    hint={
                      <span className="flex items-center gap-2">
                        Risk amounts are based on this balance.
                        <button
                          type="button"
                          className="font-medium text-accent-2 underline-offset-2 hover:underline"
                          onClick={useEquity}
                        >
                          Use current equity ({money(equity)})
                        </button>
                      </span>
                    }
                  />
                </div>
                <div>
                  <NumberField
                    label="Risk per trade"
                    value={riskPct}
                    onChange={(value) => setRiskPct(value ?? 0)}
                    min={0}
                    max={100}
                    step={0.1}
                    suffix="%"
                    hint={`Configured maximum ${settings.maxRiskPct.toFixed(2)}% · default ${settings.defaultRiskPct.toFixed(2)}%`}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[0.5, 1, 1.5, 2].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRiskPct(value)}
                        className={cn(
                          'rounded-md border px-2 py-1 font-mono text-[10px] transition',
                          riskPct === value
                            ? 'border-accent/40 bg-accent/10 text-accent-2'
                            : 'border-line bg-panel-2/60 text-muted hover:text-fg',
                        )}
                      >
                        {value}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Divider />

              <div className="grid gap-3 sm:grid-cols-3">
                <NumberField
                  label="Entry price"
                  value={entry}
                  onChange={setEntry}
                  min={0}
                  placeholder={direction === 'BUY' ? 'e.g. 2350.00' : 'e.g. 2350.00'}
                  hint="Your planned fill, not a broker quote."
                />
                <NumberField
                  label="Stop loss"
                  value={sl}
                  onChange={setSl}
                  min={0}
                  placeholder={direction === 'BUY' ? 'Below entry' : 'Above entry'}
                  error={
                    position && !position.incomplete && !position.directionValid
                      ? position.errors[0]
                      : null
                  }
                />
                <NumberField
                  label="Take profit"
                  value={tp}
                  onChange={setTp}
                  min={0}
                  placeholder={direction === 'BUY' ? 'Above entry' : 'Below entry'}
                  hint={`Minimum 1:${settings.minRR.toFixed(2)}`}
                />
              </div>

              <Divider />

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <NumberField
                    label="Lot size (optional override)"
                    value={
                      manualLots ??
                      (position?.autoLots && position.autoLots > 0 ? position.autoLots : null)
                    }
                    onChange={setManualLots}
                    min={0}
                    step={spec?.lotStep ?? 0.01}
                    suffix="lots"
                    placeholder={
                      position?.autoLots && position.autoLots > 0
                        ? formatLots(position.autoLots)
                        : 'Auto'
                    }
                    hint={
                      manualLots != null
                        ? `Manual override in use. Auto sizing would be ${
                            position?.autoLots && position.autoLots > 0
                              ? `${formatLots(position.autoLots)} lots`
                              : 'below the broker minimum'
                          }.`
                        : position?.autoLots && position.autoLots > 0
                          ? 'Auto-calculated from your risk. Type a lot size to see the real risk at that size.'
                          : position && position.rawLots > 0
                            ? `Auto sizing is below the ${spec ? formatLots(spec.minLot) : '0.01'} lot minimum. Enter the minimum lot to see the risk it would take.`
                            : 'Leave empty to size from your risk percentage. Enter a lot size to see the real risk at that size.'
                    }
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {manualLots != null ? (
                      <button
                        type="button"
                        onClick={() => setManualLots(null)}
                        className="rounded-md border border-line bg-panel-2/60 px-2 py-1 font-mono text-[10px] text-muted transition hover:text-fg"
                      >
                        Use auto size
                      </button>
                    ) : spec && position && position.rawLots > 0 && (position.autoLots ?? 0) <= 0 ? (
                      <button
                        type="button"
                        onClick={() => setManualLots(spec.minLot)}
                        className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 font-mono text-[10px] text-accent-2 transition hover:bg-accent/15"
                      >
                        Use minimum {formatLots(spec.minLot)} lots
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-ink/40 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-[10px] text-muted">Auto size</span>
                    <span className="font-mono text-[11px] font-semibold text-fg">
                      {position && (position.autoLots ?? 0) > 0
                        ? `${formatLots(position.autoLots ?? 0)} lots`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-[10px] text-muted">Risk at entered size</span>
                    <span
                      className={cn(
                        'font-mono text-[11px] font-semibold',
                        position && position.lots > 0
                          ? position.riskPctActual > settings.maxRiskPct
                            ? 'text-warn'
                            : 'text-fg'
                          : 'text-dim',
                      )}
                    >
                      {position && position.lots > 0
                        ? `${money(position.riskActual)} · ${pct(position.riskPctActual, 2)}`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-[10px] text-muted">Risk at minimum lot</span>
                    <span className="font-mono text-[11px] text-muted">
                      {position ? money(position.minLotRisk) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <InfoNote tone="amber" icon={<Info size={12} />}>
                Default XAUUSD values in this app are templates only. Confirm tick size, tick value,
                contract size, minimum lot and lot step with your broker before relying on the
                calculated size.
              </InfoNote>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Risk scenarios"
              subtitle="The same prices sized at different risk percentages."
              icon={<Target size={14} />}
            />
            <div className="scroll-thin overflow-x-auto">
              <table className="table-base min-w-[560px]">
                <thead>
                  <tr>
                    <th>Risk</th>
                    <th>Risk amount</th>
                    <th>Lots</th>
                    <th>Actual risk</th>
                    <th>Reward</th>
                    <th>R:R</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioPcts.map((value) => {
                    const scenario = spec
                      ? calculatePosition({
                          direction,
                          entry,
                          sl,
                          tp,
                          balance: Math.max(0, balance),
                          riskPct: value,
                          spec,
                          minRR: settings.minRR,
                          maxRiskPct: settings.maxRiskPct,
                        })
                      : null
                    const overMax = value > settings.maxRiskPct
                    return (
                      <tr key={value} className={value === riskPct ? 'bg-accent/[0.06]' : ''}>
                        <td>
                          <span
                            className={cn(
                              'font-mono text-[11px] font-semibold',
                              overMax ? 'text-warn' : 'text-fg',
                            )}
                          >
                            {scenarioLabel(value)}
                          </span>
                          {value === settings.defaultRiskPct ? (
                            <span className="ml-1.5 text-[9px] uppercase tracking-wide text-dim">
                              default
                            </span>
                          ) : null}
                          {overMax ? (
                            <span className="ml-1.5 text-[9px] uppercase tracking-wide text-warn">
                              over max
                            </span>
                          ) : null}
                        </td>
                        <td className="font-mono text-[11px] text-muted">
                          {money(scenario?.riskTarget ?? 0)}
                        </td>
                        <td className="font-mono text-[11px] font-semibold text-fg">
                          {scenario && scenario.lots > 0 ? formatLots(scenario.lots) : '—'}
                        </td>
                        <td
                          className={cn(
                            'font-mono text-[11px]',
                            scenario && scenario.riskPctActual > settings.maxRiskPct
                              ? 'text-warn'
                              : 'text-muted',
                          )}
                        >
                          {scenario && scenario.lots > 0
                            ? `${money(scenario.riskActual)} · ${pct(scenario.riskPctActual, 2)}`
                            : '—'}
                        </td>
                        <td className="font-mono text-[11px] text-profit">
                          {scenario?.rewardActual != null ? money(scenario.rewardActual) : '—'}
                        </td>
                        <td className="font-mono text-[11px] text-fg">
                          {scenario?.rr != null ? `1:${scenario.rr.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-4 py-2.5 text-[10px] text-dim">
              Scenarios use auto risk sizing with the current entry, stop and target. An em dash means
              the inputs are not valid enough to size the trade.
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader
              title="Calculated position"
              subtitle={
                position && !position.incomplete && position.lots > 0
                  ? `${direction} ${spec?.symbol ?? ''} · ${formatLots(position.lots)} lots${
                      position.lotsOverridden ? ' (manual)' : ''
                    }`
                  : position &&
                      !position.incomplete &&
                      position.directionValid &&
                      position.rawLots > 0
                    ? `Auto size is below the ${spec ? formatLots(spec.minLot) : '0.01'} lot minimum — enter a lot size to evaluate it.`
                    : 'Complete the entry and stop loss to calculate a size.'
              }
              icon={<Calculator size={14} />}
            />
            <div className="p-4">
              <div className="rounded-xl border border-line bg-ink/50 p-4 text-center">
                <div
                  className={cn(
                    'font-mono text-3xl font-semibold tabular-nums tracking-tight',
                    position && position.lots > 0 ? 'text-fg' : 'text-dim',
                  )}
                >
                  {position && position.lots > 0 ? formatLots(position.lots) : '0.00'}
                </div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-dim">
                  standard lots
                </div>
                {position?.lotsOverridden && position.lots > 0 ? (
                  <div className="mt-1 font-mono text-[10px] text-accent-2">
                    Manual override · auto{' '}
                    {(position.autoLots ?? 0) > 0
                      ? `${formatLots(position.autoLots ?? 0)} lots`
                      : 'below minimum'}
                  </div>
                ) : position && position.rawLots > 0 ? (
                  <div className="mt-1 font-mono text-[10px] text-muted">
                    Raw {position.rawLots.toFixed(4)} → step-rounded {formatLots(position.lots)}
                  </div>
                ) : null}
              </div>

              <div className="mt-3 divide-y divide-line/70">
                <ResultRow
                  label="Risk target"
                  value={money(position?.riskTarget ?? 0)}
                  hint={`${riskPct.toFixed(2)}% of ${money(balance)}`}
                />
                <ResultRow
                  label="Actual risk at this size"
                  value={money(position?.riskActual ?? 0)}
                  tone={
                    position && position.riskPctActual > settings.maxRiskPct ? 'warn' : 'default'
                  }
                  hint={
                    position
                      ? `${pct(position.riskPctActual, 2)} of balance · ${money(
                          position.minLotRisk,
                        )} at minimum lot`
                      : undefined
                  }
                />
                <ResultRow
                  label="Stop distance"
                  value={
                    position
                      ? `${price(position.slDistance, digits)} (${slPoints.toFixed(0)} pts)`
                      : '—'
                  }
                />
                <ResultRow
                  label="Target distance"
                  value={
                    position && position.tpDistance > 0
                      ? `${price(position.tpDistance, digits)} (${tpPoints.toFixed(0)} pts)`
                      : '—'
                  }
                />
                <ResultRow
                  label="Reward-to-risk"
                  value={position?.rr != null ? `1:${position.rr.toFixed(2)}` : '—'}
                  tone={
                    position?.rr == null
                      ? 'default'
                      : position.rr < settings.minRR
                        ? 'loss'
                        : 'profit'
                  }
                  hint={`Your minimum is 1:${settings.minRR.toFixed(2)}`}
                />
                <ResultRow
                  label="Reward at target"
                  value={position?.rewardActual != null ? money(position.rewardActual) : '—'}
                  tone="profit"
                />
                <ResultRow
                  label="Balance after a loss"
                  value={money(position?.balanceAfterLoss ?? balance)}
                  tone="loss"
                />
                <ResultRow
                  label="Balance after a win"
                  value={
                    position?.balanceAfterWin != null
                      ? money(position.balanceAfterWin)
                      : '—'
                  }
                  tone="profit"
                />
                <ResultRow
                  label="Break-even win rate"
                  value={position?.breakEvenWinRate != null ? pct(position.breakEvenWinRate, 1) : '—'}
                  hint="The win rate required at this R:R before costs."
                />
                <ResultRow
                  label="Risk per point"
                  value={spec ? money((spec.tickValue / spec.tickSize) * (position?.lots ?? 0)) : '—'}
                  hint="Approximate USD move per 1.00 price unit at this size."
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Numerical check"
              subtitle="Mechanical rules only. A cleared number is not a trade signal."
              icon={clear ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}
              action={
                <Badge variant={clear ? 'green' : 'red'}>{clear ? 'Clear' : 'Blocked'}</Badge>
              }
            />
            <div className="space-y-3 p-4">
              {clear ? (
                <div className="flex items-start gap-2 rounded-lg border border-profit/20 bg-profit/[0.06] px-3 py-2.5">
                  <ShieldCheck size={15} className="mt-0.5 shrink-0 text-profit" />
                  <div className="text-[11px] leading-relaxed text-emerald-100/85">
                    <p className="font-semibold text-profit">Risk numbers are within your rules.</p>
                    <p className="mt-0.5 text-muted">
                      This does not mean the setup is valid. The PA + S&amp;R checklist and your own
                      judgement still decide whether a trade exists.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="space-y-2">
                  {blockers.map((blocker) => (
                    <li
                      key={blocker}
                      className="flex items-start gap-2 rounded-lg border border-loss/15 bg-loss/[0.04] px-2.5 py-2 text-[11px] leading-relaxed text-red-100/80"
                    >
                      <AlertTriangle size={12} className="mt-0.5 shrink-0 text-loss" />
                      <span>{blocker}</span>
                    </li>
                  ))}
                </ul>
              )}

              {position?.warnings.length ? (
                <div className="space-y-1.5 border-t border-line pt-3">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-warn">
                    Warnings
                  </div>
                  {position.warnings.map((warning) => (
                    <p key={warning} className="text-[10px] leading-relaxed text-muted">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}

              <Divider />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-dim">Confirmed risk amount</span>
                <Badge variant={clear ? 'green' : 'slate'}>
                  {position && position.riskActual > 0 ? money(position.riskActual) : '—'}
                </Badge>
              </div>
              <Button
                variant={clear ? 'primary' : 'soft'}
                className="w-full"
                onClick={() => navigate('/plan?new=1')}
              >
                <ClipboardCheck size={14} /> Open plan + checklist
                <ArrowRight size={13} />
              </Button>
            </div>
          </Card>

          {spec ? (
            <Card>
              <CardHeader
                title="Contract specification"
                subtitle={`${spec.symbol} · ${spec.name}`}
                icon={<Info size={14} />}
              />
              <div className="divide-y divide-line/70 px-4 py-2">
                <ResultRow label="Contract size" value={`${spec.contractSize} units`} />
                <ResultRow label="Tick size" value={formatLots(spec.tickSize)} />
                <ResultRow label="Tick value" value={money(spec.tickValue)} />
                <ResultRow
                  label="Value per 1.00 move"
                  value={money(spec.tickValue / spec.tickSize)}
                />
                <ResultRow label="Minimum lot" value={formatLots(spec.minLot)} />
                <ResultRow label="Lot step" value={formatLots(spec.lotStep)} />
                <ResultRow label="Maximum lot" value={formatLots(spec.maxLot)} />
              </div>
              <div className="px-4 pb-4">
                <InfoNote tone="amber" icon={<AlertTriangle size={12} />}>
                  Template values — verify with your broker. An incorrect tick value changes the
                  calculated lot size directly.
                </InfoNote>
              </div>
            </Card>
          ) : null}

          <InfoNote tone="slate" icon={<Info size={12} />}>
            Position size = risk amount ÷ (stop distance × value per price unit), then rounded down
            to your lot step. Fees, spread and slippage are not included. The journal records what
            actually happened, not what this calculator predicted.
          </InfoNote>

          <div className="rounded-xl border border-line bg-panel/60 p-4">
            <div className="text-[10px] uppercase tracking-[0.1em] text-dim">Last recorded result</div>
            {trades.length > 0 ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted">
                  {trades.length} trade{trades.length === 1 ? '' : 's'} in the journal
                </span>
                <span
                  className={cn(
                    'font-mono text-[12px] font-semibold',
                    riskTone(riskStatus.dayPnl) === 'profit'
                      ? 'text-profit'
                      : riskTone(riskStatus.dayPnl) === 'loss'
                        ? 'text-loss'
                        : 'text-fg',
                  )}
                >
                  {riskStatus.dayPnl === 0 ? '—' : moneySigned(riskStatus.dayPnl)} today
                </span>
              </div>
            ) : (
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                No trades logged yet. The risk guard stays neutral until you record real results.
              </p>
            )}
            <div className="mt-2 text-[10px] text-dim">
              Average R:{' '}
              <span className="font-mono text-muted">
                {rMultiple(
                  trades.length > 0
                    ? trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length
                    : null,
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
