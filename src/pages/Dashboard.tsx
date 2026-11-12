import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Brain,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Plus,
  ShieldAlert,
  Sparkles,
  Target,
  Wallet,
  X,
} from 'lucide-react'
import type { PlanStatus, Trade } from '@/types'
import { useData } from '@/store/DataContext'
import { useToast } from '@/store/ToastContext'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DirectionBadge,
  EmptyState,
  InfoNote,
  ProgressBar,
  ResultBadge,
  SectionTitle,
} from '@/components/ui/primitives'
import { StatCard } from '@/components/ui/StatCard'
import { EquityChart, WinLossDonut } from '@/components/charts'
import { TradeDetail } from '@/components/trades/TradeDetail'
import {
  calculateDisciplineScore,
  checklistQuality,
  computeMetrics,
  computeRiskStatus,
  groupStats,
} from '@/lib/metrics'
import {
  formatDateTime,
  timezoneShort,
  todayKey,
  weekRangeLabel,
} from '@/lib/dates'
import { money, moneySigned, num, pct, rMultiple } from '@/lib/format'
import { cn } from '@/lib/utils'

function statusVariant(status: PlanStatus): 'blue' | 'green' | 'amber' | 'slate' {
  if (status === 'Planned') return 'blue'
  if (status === 'Executed') return 'green'
  if (status === 'Cancelled') return 'amber'
  return 'slate'
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'profit' | 'loss' | 'default'
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-muted">{label}</span>
      <span
        className={cn(
          'font-mono font-semibold tabular-nums',
          tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-fg',
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function DashboardPage() {
  const { data, deleteTrade, saveSettings } = useData()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { settings, trades, plans, checklists, psych, reflections } = data
  const tz = settings.timezone

  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)

  const metrics = useMemo(
    () => computeMetrics(trades, settings.startingBalance, tz),
    [trades, settings.startingBalance, tz],
  )
  const risk = useMemo(() => computeRiskStatus(trades, settings, tz), [trades, settings, tz])
  const quality = useMemo(() => checklistQuality(trades, checklists), [trades, checklists])
  const setupStats = useMemo(() => groupStats(trades, (trade) => trade.setup), [trades])
  const todayTrades = useMemo(
    () =>
      trades
        .filter((trade) => formatDateTime(trade.date, tz, 'yyyy-MM-dd') === todayKey(tz))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [trades, tz],
  )
  const openPlans = useMemo(
    () =>
      plans
        .filter((plan) => plan.status === 'Draft' || plan.status === 'Planned')
        .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
        .slice(0, 5),
    [plans],
  )
  const recentTrades = useMemo(
    () => [...trades].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
    [trades],
  )
  const latestPsych = useMemo(
    () => [...psych].sort((a, b) => b.date.localeCompare(a.date))[0],
    [psych],
  )
  const latestReflection = useMemo(
    () => [...reflections].sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0],
    [reflections],
  )

  const todayPnl = todayTrades.reduce((sum, trade) => sum + trade.pnl, 0)
  const bestSetup = setupStats[0]
  const weakestSetup = setupStats.length > 1 ? setupStats[setupStats.length - 1] : undefined
  const discipline = latestPsych ? calculateDisciplineScore(latestPsych) : null
  const breached = risk.dayBreached || risk.weekBreached
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(
      new Date(),
    ),
  )
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const handleDelete = async (trade: Trade) => {
    await deleteTrade(trade.id)
    toast(`Trade T-${String(trade.seq).padStart(4, '0')} deleted.`, 'success')
  }

  const dismissOnboarding = () => {
    void saveSettings({ onboardingDismissed: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${timezoneShort(tz)} · ${weekRangeLabel(todayKey(tz))}`}
        title={`${greeting}${settings.displayName ? `, ${settings.displayName}` : ''}.`}
        description="Your manual trading workspace. Plan the trade, verify the risk, then review what actually happened. No broker connection, no execution."
        actions={
          <>
            <Button variant="soft" onClick={() => navigate('/journal?new=1')}>
              <Plus size={14} /> Log trade
            </Button>
            <Button variant="primary" onClick={() => navigate('/plan?new=1')}>
              <ClipboardList size={14} /> New plan
            </Button>
          </>
        }
      />

      {!settings.onboardingDismissed ? (
        <Card className="relative overflow-hidden border-accent/20 bg-accent/[0.035] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent-2">
              <Sparkles size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[13px] font-semibold text-fg">Set up your journal properly</h2>
              <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-muted">
                Your journal starts with a {money(settings.startingBalance)} USD balance,{' '}
                {timezoneShort(tz)} display time and 1:{settings.leverage} leverage. Match these to
                your MT5 account in Settings so every number lines up with your broker.
              </p>
              <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: 'Verify the contract spec',
                    detail: 'Check tick size, tick value and lot limits with your broker.',
                    to: '/settings',
                  },
                  {
                    label: 'Set a passcode',
                    detail: 'Optional device-local lock. There is no password recovery.',
                    to: '/settings',
                  },
                  {
                    label: 'Write your first plan',
                    detail: 'Run the PA + S&R checklist before risking anything.',
                    to: '/plan?new=1',
                  },
                  {
                    label: 'Log real results',
                    detail: 'Only your recorded trades feed the analytics.',
                    to: '/journal?new=1',
                  },
                ].map((step, index) => (
                  <button
                    key={step.label}
                    type="button"
                    onClick={() => navigate(step.to)}
                    className="rounded-lg border border-line/80 bg-ink/40 p-2.5 text-left transition hover:border-accent/30 hover:bg-panel-2/60"
                  >
                    <div className="flex items-center gap-1.5 font-medium text-fg">
                      <span className="flex h-4 w-4 items-center justify-center rounded bg-accent/15 font-mono text-[9px] text-accent-2">
                        {index + 1}
                      </span>
                      {step.label}
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-dim">{step.detail}</p>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={dismissOnboarding}
              className="shrink-0 rounded-md p-1 text-dim transition hover:bg-panel-2 hover:text-fg"
              aria-label="Dismiss setup guidance"
            >
              <X size={15} />
            </button>
          </div>
        </Card>
      ) : null}

      {breached ? (
        <InfoNote tone="red" icon={<ShieldAlert size={13} />}>
          <span className="font-semibold">
            {risk.dayBreached && risk.weekBreached
              ? 'Daily and weekly loss limits are reached.'
              : risk.dayBreached
                ? 'Daily loss limit is reached.'
                : 'Weekly loss limit is reached.'}
          </span>{' '}
          Do not open a new trade today. Review the session instead — the checklist will return
          NO TRADE until the limit resets.
        </InfoNote>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Current balance"
          value={money(metrics.balance)}
          sub={`Started at ${money(settings.startingBalance)}`}
          tone={metrics.netPnl > 0 ? 'profit' : metrics.netPnl < 0 ? 'loss' : 'default'}
          icon={<Wallet size={14} />}
        />
        <StatCard
          label="Net P/L"
          value={moneySigned(metrics.netPnl)}
          sub={`${metrics.count} closed trade${metrics.count === 1 ? '' : 's'} · ${metrics.wins}W / ${metrics.losses}L`}
          tone={metrics.netPnl > 0 ? 'profit' : metrics.netPnl < 0 ? 'loss' : 'default'}
        />
        <StatCard
          label="Win rate"
          value={metrics.winRate == null ? '—' : pct(metrics.winRate, 0)}
          sub={
            metrics.decided === 0
              ? 'No decided trades yet'
              : `${metrics.wins} of ${metrics.decided} decided · payoff ${
                  metrics.payoffRatio == null ? '—' : metrics.payoffRatio.toFixed(2)
                }`
          }
          tone="accent"
        />
        <StatCard
          label="Profit factor"
          value={
            metrics.profitFactor == null
              ? '—'
              : metrics.profitFactor === Infinity
                ? '∞'
                : metrics.profitFactor.toFixed(2)
          }
          sub={`Gross +${money(metrics.grossProfit)} / −${money(metrics.grossLoss)}`}
          tone={
            metrics.profitFactor == null
              ? 'default'
              : metrics.profitFactor >= 1
                ? 'profit'
                : 'loss'
          }
        />
        <StatCard
          label="Expectancy"
          value={metrics.expectancy == null ? '—' : moneySigned(metrics.expectancy)}
          sub={`${metrics.expectancyR == null ? '—' : rMultiple(metrics.expectancyR)} per trade`}
          tone={
            metrics.expectancy == null
              ? 'default'
              : metrics.expectancy > 0
                ? 'profit'
                : metrics.expectancy < 0
                  ? 'loss'
                  : 'default'
          }
        />
        <StatCard
          label="Max drawdown"
          value={money(metrics.maxDrawdown)}
          sub={`${pct(metrics.maxDrawdownPct, 1)} · worst run ${metrics.maxConsecutiveLosses}L`}
          tone={metrics.maxDrawdown > 0 ? 'loss' : 'default'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Equity curve"
            subtitle="Starting balance plus your recorded net P/L, grouped by day in your display timezone."
            icon={<Target size={15} />}
            action={
              <Badge variant={metrics.netPnl >= 0 ? 'green' : 'red'}>
                {moneySigned(metrics.netPnl)}
              </Badge>
            }
          />
          <div className="p-4">
            <EquityChart
              points={metrics.equity}
              startingBalance={settings.startingBalance}
              height={268}
            />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line px-4 py-3 sm:grid-cols-4">
            <StatRow
              label="Avg win"
              value={metrics.avgWin == null ? '—' : money(metrics.avgWin)}
              tone="profit"
            />
            <StatRow
              label="Avg loss"
              value={metrics.avgLoss == null ? '—' : money(metrics.avgLoss)}
              tone="loss"
            />
            <StatRow
              label="Avg planned R:R"
              value={metrics.avgPlannedRR == null ? '—' : `1:${metrics.avgPlannedRR.toFixed(2)}`}
            />
            <StatRow
              label="Streak"
              value={
                metrics.currentStreak.type === 'None'
                  ? '—'
                  : `${metrics.currentStreak.count} ${metrics.currentStreak.type.toLowerCase()}${metrics.currentStreak.count === 1 ? '' : 's'}`
              }
              tone={
                metrics.currentStreak.type === 'Win'
                  ? 'profit'
                  : metrics.currentStreak.type === 'Loss'
                    ? 'loss'
                    : 'default'
              }
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Risk guard"
            subtitle="Calculated from your stored loss limits and recorded results."
            icon={<ShieldAlert size={15} />}
            action={
              <Button size="sm" variant="ghost" onClick={() => navigate('/risk')}>
                Calculator <ArrowRight size={12} />
              </Button>
            }
          />
          <div className="space-y-4 p-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="font-medium text-fg">Today</span>
                <span
                  className={cn(
                    'font-mono font-semibold',
                    risk.dayPnl > 0
                      ? 'text-profit'
                      : risk.dayPnl < 0
                        ? 'text-loss'
                        : 'text-muted',
                  )}
                >
                  {risk.dayPnl === 0 ? '—' : moneySigned(risk.dayPnl)}
                </span>
              </div>
              <ProgressBar
                value={risk.dayUsedPct}
                tone={risk.dayBreached ? 'red' : risk.dayUsedPct > 60 ? 'amber' : 'green'}
              />
              <div className="mt-1.5 flex justify-between text-[10px] text-dim">
                <span>
                  Loss used {money(risk.dayLossUsed)} of {money(risk.dayLimit)}
                </span>
                <span>{money(risk.dayRemaining)} left</span>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="font-medium text-fg">This week</span>
                <span
                  className={cn(
                    'font-mono font-semibold',
                    risk.weekPnl > 0
                      ? 'text-profit'
                      : risk.weekPnl < 0
                        ? 'text-loss'
                        : 'text-muted',
                  )}
                >
                  {risk.weekPnl === 0 ? '—' : moneySigned(risk.weekPnl)}
                </span>
              </div>
              <ProgressBar
                value={risk.weekUsedPct}
                tone={risk.weekBreached ? 'red' : risk.weekUsedPct > 60 ? 'amber' : 'green'}
              />
              <div className="mt-1.5 flex justify-between text-[10px] text-dim">
                <span>
                  Loss used {money(risk.weekLossUsed)} of {money(risk.weekLimit)}
                </span>
                <span>{money(risk.weekRemaining)} left</span>
              </div>
            </div>

            <div className="rounded-lg border border-line/80 bg-ink/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-dim">
                Today's activity
              </div>
              {todayTrades.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {todayTrades.slice(0, 4).map((trade) => (
                    <button
                      key={trade.id}
                      type="button"
                      onClick={() => setSelectedTrade(trade)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left transition hover:bg-panel-2/70"
                    >
                      <span className="flex items-center gap-1.5 text-[10px] text-muted">
                        <DirectionBadge direction={trade.direction} />
                        <span className="max-w-[130px] truncate">{trade.setup}</span>
                      </span>
                      <span
                        className={cn(
                          'font-mono text-[10px] font-semibold',
                          trade.pnl > 0
                            ? 'text-profit'
                            : trade.pnl < 0
                              ? 'text-loss'
                              : 'text-muted',
                        )}
                      >
                        {moneySigned(trade.pnl)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                  No trades recorded today. That is not a problem — waiting is part of the
                  process.
                </p>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-2 text-[10px] text-dim">
                <span>Daily trades</span>
                <span className="font-mono text-muted">{num(todayTrades.length, 0)}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-dim">
                <span>Today net</span>
                <span
                  className={cn(
                    'font-mono',
                    todayPnl > 0 ? 'text-profit' : todayPnl < 0 ? 'text-loss' : 'text-muted',
                  )}
                >
                  {todayPnl === 0 ? '—' : moneySigned(todayPnl)}
                </span>
              </div>
            </div>

            <InfoNote tone="slate" icon={<CheckCircle2 size={12} />}>
              The risk guard is informational. It cannot block a broker order because this app
              never connects to one.
            </InfoNote>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Open plans"
            subtitle="Drafts and planned trades that have not been executed yet."
            icon={<ClipboardList size={15} />}
            action={
              <Button size="sm" variant="ghost" onClick={() => navigate('/plan')}>
                All plans <ArrowRight size={12} />
              </Button>
            }
          />
          {openPlans.length > 0 ? (
            <div className="divide-y divide-line/70">
              {openPlans.map((plan) => {
                const run = plan.checklistId
                  ? checklists.find((item) => item.id === plan.checklistId)
                  : undefined
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => navigate(`/plan?edit=${plan.id}`)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-panel-2/50"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <DirectionBadge direction={plan.direction} />
                        <span className="truncate text-[12px] font-semibold text-fg">
                          {plan.setup}
                        </span>
                        <Badge variant={statusVariant(plan.status)}>{plan.status}</Badge>
                      </div>
                      <div className="mt-1 text-[10px] text-muted">
                        {formatDateTime(plan.dateTime, tz, 'dd MMM · HH:mm')} · {plan.timeframe} ·{' '}
                        {plan.levelType}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-dim">
                        Entry {plan.entry ?? '—'} · SL {plan.sl ?? '—'} · TP {plan.tp ?? '—'} ·
                        risk {money(plan.riskAmount)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={cn(
                          'text-[10px] font-semibold',
                          run?.decision === 'READY'
                            ? 'text-profit'
                            : run?.decision === 'WAIT'
                              ? 'text-warn'
                              : run?.decision === 'NO TRADE'
                                ? 'text-loss'
                                : 'text-dim',
                        )}
                      >
                        {run?.decision ?? 'No checklist'}
                      </div>
                      <div className="mt-0.5 font-mono text-[9px] text-dim">
                        {run ? `${run.overallPct}%` : 'Draft'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                compact
                icon={<ClipboardList size={18} />}
                title="No open plans"
                description="Plan the next setup before the market gives you a reason to improvise."
                action={
                  <Button size="sm" variant="primary" onClick={() => navigate('/plan?new=1')}>
                    <Plus size={13} /> New plan
                  </Button>
                }
              />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent trades"
            subtitle="The last entries in your journal."
            icon={<CalendarDays size={15} />}
            action={
              <Button size="sm" variant="ghost" onClick={() => navigate('/journal')}>
                Journal <ArrowRight size={12} />
              </Button>
            }
          />
          {recentTrades.length > 0 ? (
            <div className="divide-y divide-line/70">
              {recentTrades.map((trade) => (
                <button
                  key={trade.id}
                  type="button"
                  onClick={() => setSelectedTrade(trade)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-panel-2/50"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-[10px] text-dim">
                      T-{String(trade.seq).padStart(4, '0')}
                    </span>
                    <DirectionBadge direction={trade.direction} />
                    <span className="truncate text-[11px] text-muted">{trade.setup}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-[10px] text-dim sm:inline">
                      {formatDateTime(trade.date, tz, 'dd MMM')}
                    </span>
                    <ResultBadge result={trade.result} />
                    <span
                      className={cn(
                        'w-[70px] text-right font-mono text-[11px] font-semibold',
                        trade.pnl > 0
                          ? 'text-profit'
                          : trade.pnl < 0
                            ? 'text-loss'
                            : 'text-muted',
                      )}
                    >
                      {moneySigned(trade.pnl)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                compact
                icon={<CalendarDays size={18} />}
                title="No trades logged"
                description="Analytics stay empty until you record a real closed trade."
                action={
                  <Button size="sm" variant="soft" onClick={() => navigate('/journal?new=1')}>
                    <Plus size={13} /> Log trade
                  </Button>
                }
              />
            </div>
          )}
        </Card>
      </div>

      <SectionTitle
        title="Performance & discipline"
        subtitle="Patterns are only shown from data you have actually entered."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Brain size={15} className="text-accent-2" />
            <h3 className="text-[12px] font-semibold text-fg">Mental check-in</h3>
          </div>
          {latestPsych ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted">Latest entry</span>
                <span className="font-mono text-fg">
                  {formatDateTime(`${latestPsych.date}T12:00:00.000Z`, tz, 'dd MMM yyyy')}
                </span>
              </div>
              <StatRow label="Pre-session state" value={latestPsych.preState || '—'} />
              <StatRow label="Confidence" value={`${latestPsych.confidence}/10`} />
              <StatRow
                label="Discipline"
                value={discipline == null ? '—' : `${discipline}%`}
                tone={discipline == null ? 'default' : discipline >= 70 ? 'profit' : 'loss'}
              />
              <StatRow label="Plan followed" value={latestPsych.planFollowed} />
              <Button
                size="sm"
                variant="soft"
                className="mt-1 w-full"
                onClick={() => navigate('/psychology')}
              >
                Open psychology <ArrowRight size={12} />
              </Button>
            </div>
          ) : (
            <div className="flex h-[170px] flex-col items-center justify-center text-center">
              <p className="max-w-[220px] text-[11px] leading-relaxed text-muted">
                No mental check-ins yet. Log how you felt before and after a session to see
                discipline patterns.
              </p>
              <Button
                size="sm"
                variant="soft"
                className="mt-3"
                onClick={() => navigate('/psychology?new=1')}
              >
                <Plus size={12} /> Add check-in
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Target size={15} className="text-accent-2" />
            <h3 className="text-[12px] font-semibold text-fg">Checklist quality</h3>
          </div>
          {quality.linked.length > 0 ? (
            <div className="space-y-2.5">
              <StatRow
                label={`READY trades (${quality.ready.count})`}
                value={quality.ready.winRate == null ? '—' : pct(quality.ready.winRate, 0)}
              />
              <StatRow
                label={`Not READY (${quality.notReady.count})`}
                value={quality.notReady.winRate == null ? '—' : pct(quality.notReady.winRate, 0)}
              />
              <StatRow
                label={`Score ≥ 90% (${quality.highScore.count})`}
                value={
                  quality.highScore.avgPnl == null ? '—' : moneySigned(quality.highScore.avgPnl)
                }
                tone={
                  quality.highScore.avgPnl == null || quality.highScore.avgPnl === 0
                    ? 'default'
                    : quality.highScore.avgPnl > 0
                      ? 'profit'
                      : 'loss'
                }
              />
              <StatRow
                label={`Score < 90% (${quality.lowScore.count})`}
                value={
                  quality.lowScore.avgPnl == null ? '—' : moneySigned(quality.lowScore.avgPnl)
                }
                tone={
                  quality.lowScore.avgPnl == null || quality.lowScore.avgPnl === 0
                    ? 'default'
                    : quality.lowScore.avgPnl > 0
                      ? 'profit'
                      : 'loss'
                }
              />
              <p className="pt-1 text-[10px] leading-relaxed text-dim">
                Win rates are shown for trade-linked checklists only. Sample sizes are small
                until you build history.
              </p>
            </div>
          ) : (
            <div className="flex h-[170px] flex-col items-center justify-center text-center">
              <p className="max-w-[230px] text-[11px] leading-relaxed text-muted">
                Link a plan checklist when you log a trade to compare process quality with
                outcomes.
              </p>
              <Button
                size="sm"
                variant="soft"
                className="mt-3"
                onClick={() => navigate('/plan?new=1')}
              >
                <ClipboardList size={12} /> Create plan
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Wallet size={15} className="text-accent-2" />
            <h3 className="text-[12px] font-semibold text-fg">Win / loss split</h3>
          </div>
          <WinLossDonut
            wins={metrics.wins}
            losses={metrics.losses}
            breakeven={metrics.breakeven}
            height={152}
          />
          <div className="mt-3 space-y-1.5 border-t border-line/70 pt-2.5">
            {bestSetup ? (
              <StatRow
                label={`Best setup · ${bestSetup.key} (${bestSetup.trades})`}
                value={moneySigned(bestSetup.net)}
                tone={bestSetup.net > 0 ? 'profit' : 'default'}
              />
            ) : null}
            {weakestSetup ? (
              <StatRow
                label={`Weakest · ${weakestSetup.key} (${weakestSetup.trades})`}
                value={moneySigned(weakestSetup.net)}
                tone={weakestSetup.net < 0 ? 'loss' : 'default'}
              />
            ) : null}
            {latestReflection ? (
              <StatRow
                label={`Last reflection · ${weekRangeLabel(latestReflection.weekStart)}`}
                value={latestReflection.notes.trim() ? 'Written' : 'Empty'}
              />
            ) : null}
            {!bestSetup && !latestReflection ? (
              <p className="text-[10px] leading-relaxed text-dim">
                Setup performance and weekly reflections will appear here.
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      <TradeDetail
        trade={selectedTrade}
        open={Boolean(selectedTrade)}
        onClose={() => setSelectedTrade(null)}
        onEdit={(trade) => {
          setSelectedTrade(null)
          navigate(`/journal?edit=${trade.id}`)
        }}
        onDelete={handleDelete}
      />
    </div>
  )
}
