import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  Download,
  FileJson,
  Info,
  Plus,
  Printer,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react'
import { useData } from '@/store/DataContext'
import { useToast } from '@/store/ToastContext'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  InfoNote,
  ProgressBar,
} from '@/components/ui/primitives'
import { StatCard } from '@/components/ui/StatCard'
import {
  DailyPnlChart,
  EquityChart,
  HorizontalPerformanceChart,
  MonthlyPnlChart,
  RMultipleChart,
  WinLossDonut,
} from '@/components/charts'
import { TradeFilterBar, FILTER_DEFAULTS } from '@/components/trades/TradeFilters'
import type { GroupStat, TradeFilters } from '@/lib/metrics'
import {
  checklistQuality,
  computeMetrics,
  dailySeries,
  filterTrades,
  groupStats,
  mistakeCounts,
  monthlySeries,
  rDistribution,
  ruleBreaks,
} from '@/lib/metrics'
import {
  formatDateKey,
  timezoneShort,
  todayKey,
  toDateKey,
} from '@/lib/dates'
import { downloadFile, tradesToCsv } from '@/lib/csv'
import { money, moneySigned, pct, rMultiple } from '@/lib/format'
import { cn } from '@/lib/utils'

type GroupKey = 'setup' | 'session' | 'timeframe' | 'direction' | 'day'

const GROUP_OPTIONS: { value: GroupKey; label: string }[] = [
  { value: 'setup', label: 'Setup' },
  { value: 'session', label: 'Session' },
  { value: 'timeframe', label: 'Timeframe' },
  { value: 'direction', label: 'Direction' },
  { value: 'day', label: 'Day of week' },
]

function qualityTone(value: number | null): 'profit' | 'loss' | 'default' {
  if (value == null) return 'default'
  if (value > 0) return 'profit'
  if (value < 0) return 'loss'
  return 'default'
}

function StatLine({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'profit' | 'loss' | 'warn'
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-muted">{label}</span>
      <span
        className={cn(
          'font-mono font-semibold tabular-nums',
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
      </span>
    </div>
  )
}

function QualityBlock({
  title,
  count,
  avgPnl,
  winRate,
  tone,
}: {
  title: string
  count: number
  avgPnl: number | null
  winRate: number | null
  tone: 'green' | 'red' | 'blue' | 'amber'
}) {
  return (
    <div className="rounded-lg border border-line/80 bg-ink/35 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-fg">{title}</span>
        <Badge variant={tone}>{count} linked</Badge>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <div className="text-dim">Avg P/L</div>
          <div
            className={cn(
              'font-mono text-[12px] font-semibold',
              qualityTone(avgPnl) === 'profit'
                ? 'text-profit'
                : qualityTone(avgPnl) === 'loss'
                  ? 'text-loss'
                  : 'text-fg',
            )}
          >
            {avgPnl == null ? '—' : moneySigned(avgPnl)}
          </div>
        </div>
        <div>
          <div className="text-dim">Win rate</div>
          <div className="font-mono text-[12px] font-semibold text-fg">
            {winRate == null ? '—' : pct(winRate, 0)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function AnalyticsPage() {
  const { data, exportData } = useData()
  const { toast } = useToast()
  const { settings, trades, checklists, psych } = data
  const tz = settings.timezone

  const [filters, setFilters] = useState<TradeFilters>(FILTER_DEFAULTS)
  const [dailyWindow, setDailyWindow] = useState<30 | 60 | 90>(30)
  const [groupBy, setGroupBy] = useState<GroupKey>('setup')

  const filtered = useMemo(() => filterTrades(trades, filters, tz), [trades, filters, tz])
  const metrics = useMemo(
    () => computeMetrics(filtered, settings.startingBalance, tz),
    [filtered, settings.startingBalance, tz],
  )
  const daily = useMemo(
    () => dailySeries(filtered, tz, dailyWindow),
    [filtered, tz, dailyWindow],
  )
  const monthly = useMemo(() => monthlySeries(filtered, tz, 12), [filtered, tz])
  const rData = useMemo(() => rDistribution(filtered), [filtered])
  const quality = useMemo(
    () => checklistQuality(filtered, checklists),
    [filtered, checklists],
  )
  const mistakes = useMemo(() => mistakeCounts(filtered), [filtered])
  const maxMistake = mistakes[0]?.count ?? 0

  const groupKeyFn = useMemo(() => {
    switch (groupBy) {
      case 'session':
        return (trade: (typeof filtered)[number]) => trade.session
      case 'timeframe':
        return (trade: (typeof filtered)[number]) => trade.timeframe
      case 'direction':
        return (trade: (typeof filtered)[number]) => trade.direction
      case 'day':
        return (trade: (typeof filtered)[number]) =>
          formatDateKey(toDateKey(trade.date, tz), 'EEE')
      default:
        return (trade: (typeof filtered)[number]) => trade.setup
    }
  }, [groupBy, tz])

  const grouped = useMemo(() => groupStats(filtered, groupKeyFn), [filtered, groupKeyFn])
  const maxAbsGroupNet = grouped.reduce((max, stat) => Math.max(max, Math.abs(stat.net)), 0)

  const rangePsych = useMemo(
    () =>
      psych.filter(
        (entry) =>
          (!filters.from || entry.date >= filters.from) &&
          (!filters.to || entry.date <= filters.to),
      ),
    [psych, filters.from, filters.to],
  )
  const scoredPsych = rangePsych.filter((entry) => entry.disciplineScore != null)
  const avgDiscipline =
    scoredPsych.length > 0
      ? scoredPsych.reduce((sum, entry) => sum + (entry.disciplineScore ?? 0), 0) /
        scoredPsych.length
      : null
  const rangeBreaks = rangePsych.reduce((sum, entry) => sum + ruleBreaks(entry), 0)

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast('There are no trades to export with these filters.', 'info')
      return
    }
    downloadFile(
      `pa-journal-analytics-${todayKey(tz)}.csv`,
      tradesToCsv(filtered, settings, tz),
      'text/csv;charset=utf-8',
    )
    toast(
      `Exported ${filtered.length} filtered trade${filtered.length === 1 ? '' : 's'} to CSV.`,
      'success',
    )
  }

  const exportJson = () => {
    downloadFile(
      `pa-journal-backup-${todayKey(tz)}.json`,
      exportData(),
      'application/json',
    )
    toast('Full journal backup exported as JSON.', 'success')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Analytics & Reports"
        title="Look at what the data actually says"
        description="Every chart and number below is computed from the trades you recorded and filtered. There are no benchmark figures, no imported market data and no projected profits."
        actions={
          <>
            <Button variant="ghost" onClick={() => window.print()}>
              <Printer size={14} /> Print
            </Button>
            <Button variant="soft" onClick={exportJson}>
              <FileJson size={14} /> JSON backup
            </Button>
            <Button variant="primary" onClick={exportCsv}>
              <Download size={14} /> Export CSV
            </Button>
          </>
        }
      />

      <div data-print="hide">
        <TradeFilterBar
          filters={filters}
          onChange={setFilters}
          instruments={settings.instruments}
          setups={settings.setups}
          tz={tz}
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-4">
          <EmptyState
            icon={<BarChart3 size={20} />}
            title={trades.length === 0 ? 'No trades to analyse yet' : 'No trades match these filters'}
            description={
              trades.length === 0
                ? 'Analytics are built from your recorded trades. Log real completed trades — or widen the date range if you already have some.'
                : 'Try a wider date range, another setup or instrument, or reset the filters.'
            }
            action={
              trades.length === 0 ? (
                <Link
                  to="/journal?new=1"
                  className="btn btn-primary h-9 px-3 text-[13px]"
                >
                  <Plus size={14} /> Log a trade
                </Link>
              ) : (
                <Button variant="soft" onClick={() => setFilters(FILTER_DEFAULTS)}>
                  Reset filters
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Net P/L"
              value={moneySigned(metrics.netPnl)}
              tone={metrics.netPnl > 0 ? 'profit' : metrics.netPnl < 0 ? 'loss' : 'default'}
              sub={`${metrics.count} filtered trades`}
            />
            <StatCard
              label="Win rate"
              value={metrics.winRate == null ? '—' : pct(metrics.winRate, 1)}
              tone="accent"
              sub={`${metrics.wins}W · ${metrics.losses}L · ${metrics.breakeven}BE`}
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
              tone={
                metrics.profitFactor == null
                  ? 'default'
                  : metrics.profitFactor >= 1
                    ? 'profit'
                    : 'loss'
              }
              sub={`${money(metrics.grossProfit)} gross profit`}
            />
            <StatCard
              label="Expectancy"
              value={metrics.expectancy == null ? '—' : moneySigned(metrics.expectancy)}
              tone={
                metrics.expectancy == null
                  ? 'default'
                  : metrics.expectancy > 0
                    ? 'profit'
                    : metrics.expectancy < 0
                      ? 'loss'
                      : 'default'
              }
              sub="Average net result per trade"
            />
            <StatCard
              label="Max drawdown"
              value={metrics.maxDrawdown > 0 ? money(metrics.maxDrawdown) : '—'}
              tone={metrics.maxDrawdown > 0 ? 'loss' : 'default'}
              sub={
                metrics.maxDrawdown > 0
                  ? `${pct(metrics.maxDrawdownPct, 1)} from peak equity`
                  : 'No drawdown recorded'
              }
            />
            <StatCard
              label="Avg R"
              value={metrics.avgR == null ? '—' : rMultiple(metrics.avgR)}
              tone={
                metrics.avgR == null || metrics.avgR === 0
                  ? 'default'
                  : metrics.avgR > 0
                    ? 'profit'
                    : 'loss'
              }
              sub={
                metrics.avgPlannedRR == null
                  ? 'No planned R:R data'
                  : `Planned avg 1:${metrics.avgPlannedRR.toFixed(2)}`
              }
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader
                title="Equity curve"
                subtitle={`Starting from ${money(settings.startingBalance)} and adding only recorded P/L, in ${timezoneShort(tz)}.`}
                icon={<BarChart3 size={14} />}
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
                  height={280}
                />
              </div>
              <div className="grid gap-2 border-t border-line p-4 sm:grid-cols-3">
                <StatLine label="Current equity" value={money(metrics.balance)} />
                <StatLine
                  label="Peak / worst streak"
                  value={
                    metrics.currentStreak.type === 'None'
                      ? '—'
                      : `${metrics.currentStreak.type} ${metrics.currentStreak.count}`
                  }
                  tone={
                    metrics.currentStreak.type === 'Win'
                      ? 'profit'
                      : metrics.currentStreak.type === 'Loss'
                        ? 'loss'
                        : 'default'
                  }
                />
                <StatLine
                  label="Largest win / loss"
                  value={`${metrics.largestWin == null ? '—' : moneySigned(metrics.largestWin)} / ${
                    metrics.largestLoss == null ? '—' : moneySigned(metrics.largestLoss)
                  }`}
                  tone={metrics.largestWin != null ? 'profit' : 'default'}
                />
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Outcome mix"
                subtitle={`${metrics.decided} decided trades, ${metrics.breakeven} breakeven.`}
                icon={<Target size={14} />}
              />
              <div className="p-4">
                <WinLossDonut
                  wins={metrics.wins}
                  losses={metrics.losses}
                  breakeven={metrics.breakeven}
                  height={190}
                />
              </div>
              <div className="space-y-2 border-t border-line p-4">
                <StatLine
                  label="Average win"
                  value={metrics.avgWin == null ? '—' : money(metrics.avgWin)}
                  tone="profit"
                />
                <StatLine
                  label="Average loss"
                  value={metrics.avgLoss == null ? '—' : money(metrics.avgLoss)}
                  tone="loss"
                />
                <StatLine
                  label="Gross profit / loss"
                  value={`${money(metrics.grossProfit)} / ${money(metrics.grossLoss)}`}
                />
                <StatLine
                  label="Best / worst trade"
                  value={`${
                    metrics.bestTrade ? moneySigned(metrics.bestTrade.pnl) : '—'
                  } / ${
                    metrics.worstTrade ? moneySigned(metrics.worstTrade.pnl) : '—'
                  }`}
                />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="Daily P/L"
                subtitle="Net result for each day in the window. Empty days stay at zero."
                icon={<BarChart3 size={14} />}
                action={
                  <div className="segmented" data-print="hide">
                    {([30, 60, 90] as const).map((window) => (
                      <button
                        key={window}
                        type="button"
                        data-active={dailyWindow === window}
                        onClick={() => setDailyWindow(window)}
                      >
                        {window}d
                      </button>
                    ))}
                  </div>
                }
              />
              <div className="p-4">
                <DailyPnlChart data={daily} height={240} />
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Monthly P/L"
                subtitle="The last 12 calendar months, including months without trades."
                icon={<BarChart3 size={14} />}
              />
              <div className="p-4">
                <MonthlyPnlChart data={monthly} height={240} />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="R-multiple distribution"
                subtitle="How your outcomes spread across risk units, computed from the recorded R multiple."
                icon={<ShieldCheck size={14} />}
              />
              <div className="p-4">
                <RMultipleChart data={rData} height={240} />
              </div>
            </Card>

            <Card>
              <CardHeader
                title={`Net P/L by ${GROUP_OPTIONS.find((option) => option.value === groupBy)?.label.toLowerCase()}`}
                subtitle="Groups are sorted by net result. Small groups are still small samples."
                icon={<BarChart3 size={14} />}
                action={
                  <select
                    className="input input-sm w-auto"
                    value={groupBy}
                    onChange={(event) => setGroupBy(event.target.value as GroupKey)}
                    aria-label="Group performance by"
                    data-print="hide"
                  >
                    {GROUP_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                }
              />
              <div className="p-4">
                <HorizontalPerformanceChart
                  stats={grouped}
                  height={240}
                  emptyMessage="No grouped results to show."
                />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Group breakdown"
              subtitle="Win rate and average R beside each net result."
              icon={<Target size={14} />}
            />
            <div className="scroll-thin overflow-x-auto">
              <table className="table-base min-w-[680px]">
                <thead>
                  <tr>
                    <th>{GROUP_OPTIONS.find((option) => option.value === groupBy)?.label}</th>
                    <th>Trades</th>
                    <th>Wins</th>
                    <th>Losses</th>
                    <th>Win rate</th>
                    <th>Avg R</th>
                    <th className="text-right">Net P/L</th>
                    <th className="w-[150px]">Share of result</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((stat: GroupStat) => (
                    <tr key={stat.key}>
                      <td className="max-w-[200px] truncate text-[12px] font-medium text-fg">
                        {stat.key}
                      </td>
                      <td className="font-mono text-[11px] text-muted">{stat.trades}</td>
                      <td className="font-mono text-[11px] text-profit">{stat.wins}</td>
                      <td className="font-mono text-[11px] text-loss">{stat.losses}</td>
                      <td className="font-mono text-[11px] text-fg">
                        {stat.winRate == null ? '—' : pct(stat.winRate, 0)}
                      </td>
                      <td
                        className={cn(
                          'font-mono text-[11px]',
                          stat.avgR == null
                            ? 'text-muted'
                            : stat.avgR > 0
                              ? 'text-profit'
                              : stat.avgR < 0
                                ? 'text-loss'
                                : 'text-muted',
                        )}
                      >
                        {stat.avgR == null ? '—' : rMultiple(stat.avgR)}
                      </td>
                      <td
                        className={cn(
                          'text-right font-mono text-[11px] font-semibold',
                          stat.net > 0
                            ? 'text-profit'
                            : stat.net < 0
                              ? 'text-loss'
                              : 'text-muted',
                        )}
                      >
                        {moneySigned(stat.net)}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                stat.net >= 0 ? 'bg-profit' : 'bg-loss',
                              )}
                              style={{
                                width: `${
                                  maxAbsGroupNet > 0
                                    ? (Math.abs(stat.net) / maxAbsGroupNet) * 100
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right font-mono text-[9px] text-dim">
                            {metrics.netPnl !== 0
                              ? pct((stat.net / Math.abs(metrics.netPnl)) * 100, 0)
                              : '—'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-4 py-2.5 text-[10px] text-dim">
              “Share of result” compares each group with the absolute net result, not with total
              gross activity.
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="Checklist quality"
                subtitle="Only checklists linked to a recorded trade are compared. Correlation is not causation."
                icon={<CheckCircle2 size={14} />}
                action={
                  <Badge variant="blue">
                    {quality.linked.length} linked run{quality.linked.length === 1 ? '' : 's'}
                  </Badge>
                }
              />
              <div className="p-4">
                {quality.linked.length > 0 ? (
                  <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <QualityBlock
                        title="Score ≥ 90%"
                        count={quality.highScore.count}
                        avgPnl={quality.highScore.avgPnl}
                        winRate={quality.highScore.winRate}
                        tone="green"
                      />
                      <QualityBlock
                        title="Score < 90%"
                        count={quality.lowScore.count}
                        avgPnl={quality.lowScore.avgPnl}
                        winRate={quality.lowScore.winRate}
                        tone="red"
                      />
                      <QualityBlock
                        title="Decision READY"
                        count={quality.ready.count}
                        avgPnl={quality.ready.avgPnl}
                        winRate={quality.ready.winRate}
                        tone="blue"
                      />
                      <QualityBlock
                        title="Decision WAIT / NO TRADE"
                        count={quality.notReady.count}
                        avgPnl={quality.notReady.avgPnl}
                        winRate={quality.notReady.winRate}
                        tone="amber"
                      />
                    </div>
                    <InfoNote tone="slate" icon={<Info size={12} />}>
                      A high score or a READY decision only means the checklist and numerical rules
                      were satisfied. It is not a prediction of a winning trade.
                    </InfoNote>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-line-2/70 px-4 py-8 text-center">
                    <ClipboardEmpty />
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Mistake patterns"
                subtitle="Tagged mistakes in the filtered trades, most frequent first."
                icon={<AlertTriangle size={14} />}
              />
              <div className="p-4">
                {mistakes.length > 0 ? (
                  <div className="space-y-2.5">
                    {mistakes.slice(0, 8).map((item) => (
                      <div key={item.mistake}>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate text-muted">{item.mistake}</span>
                          <span className="font-mono font-semibold text-fg">{item.count}</span>
                        </div>
                        <ProgressBar
                          value={maxMistake > 0 ? (item.count / maxMistake) * 100 : 0}
                          tone="red"
                          height="h-1"
                          className="mt-1"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-lg border border-profit/20 bg-profit/[0.05] px-3 py-2.5 text-[11px] leading-relaxed text-emerald-100/85">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-profit" />
                    No mistakes tagged in the filtered trades.
                  </div>
                )}
              </div>
              {mistakes.length > 0 ? (
                <div className="border-t border-line px-4 py-2.5 text-[10px] text-dim">
                  A repeated mistake is a process problem, not bad luck. Review the trade notes
                  behind the most frequent tag.
                </div>
              ) : null}
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader
                title="Report summary"
                subtitle={`${todayKey(tz)} · ${timezoneShort(tz)} · all values in USD.`}
                icon={<Sparkles size={14} />}
              />
              <div className="grid gap-x-8 gap-y-1 p-4 sm:grid-cols-2">
                <StatLine label="Trades in report" value={String(metrics.count)} />
                <StatLine label="Net P/L" value={moneySigned(metrics.netPnl)} tone={qualityTone(metrics.netPnl)} />
                <StatLine label="Starting balance" value={money(settings.startingBalance)} />
                <StatLine label="Ending balance" value={money(metrics.balance)} />
                <StatLine label="Gross profit" value={money(metrics.grossProfit)} tone="profit" />
                <StatLine label="Gross loss" value={money(metrics.grossLoss)} tone="loss" />
                <StatLine
                  label="Decided win rate"
                  value={metrics.winRate == null ? '—' : pct(metrics.winRate, 1)}
                />
                <StatLine
                  label="Breakeven trades"
                  value={String(metrics.breakeven)}
                />
                <StatLine
                  label="Average planned R:R"
                  value={metrics.avgPlannedRR == null ? '—' : `1:${metrics.avgPlannedRR.toFixed(2)}`}
                />
                <StatLine
                  label="Average recorded R"
                  value={metrics.avgR == null ? '—' : rMultiple(metrics.avgR)}
                />
                <StatLine
                  label="Largest win"
                  value={metrics.largestWin == null ? '—' : moneySigned(metrics.largestWin)}
                  tone="profit"
                />
                <StatLine
                  label="Largest loss"
                  value={metrics.largestLoss == null ? '—' : moneySigned(metrics.largestLoss)}
                  tone="loss"
                />
              </div>
              <div className="border-t border-line px-4 py-2.5 text-[10px] leading-relaxed text-dim">
                Print this page for a paper record. Screenshots and notes stay in the journal; the
                print layout is intentionally simple.
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Psychology in this range"
                subtitle="Check-ins that fall inside the selected dates."
                icon={<Brain size={14} />}
              />
              <div className="space-y-2.5 p-4">
                <StatLine label="Check-ins" value={String(rangePsych.length)} />
                <StatLine
                  label="Average discipline"
                  value={avgDiscipline == null ? '—' : pct(avgDiscipline, 0)}
                  tone={
                    avgDiscipline == null
                      ? 'default'
                      : avgDiscipline >= 80
                        ? 'profit'
                        : avgDiscipline >= 50
                          ? 'warn'
                          : 'loss'
                  }
                />
                <StatLine
                  label="Rule breaks logged"
                  value={String(rangeBreaks)}
                  tone={rangeBreaks === 0 ? 'profit' : 'warn'}
                />
                <Link
                  to="/psychology"
                  className="btn btn-soft mt-1 h-9 w-full px-3 text-[13px]"
                >
                  <Brain size={14} /> Open psychology
                </Link>
                <InfoNote tone="blue" icon={<BookOpen size={12} />}>
                  If there are no check-ins in this range, the psychology averages stay blank rather
                  than borrowing numbers from another period.
                </InfoNote>
              </div>
            </Card>
          </div>

          <InfoNote tone="slate" icon={<Info size={12} />}>
            Analytics describe the trades you recorded, in this browser. They do not include open
            positions, broker spreads, swaps, taxes or trades you did not log. Export a backup before
            clearing browser data.
          </InfoNote>
        </>
      )}
    </div>
  )
}

function ClipboardEmpty() {
  return (
    <div className="flex flex-col items-center gap-2">
      <CheckCircle2 size={20} className="text-dim" />
      <p className="max-w-sm text-[11px] leading-relaxed text-dim">
        Link a checklist run to a trade when you log it, and this comparison will appear here.
      </p>
      <Link
        to="/plan?tab=checklists"
        className="btn btn-ghost h-8 px-2.5 text-[12px]"
      >
        Open checklist history
      </Link>
    </div>
  )
}
