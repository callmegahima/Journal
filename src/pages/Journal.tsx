import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Download,
  Filter,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react'
import type { Plan, Trade } from '@/types'
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
  ResultBadge,
} from '@/components/ui/primitives'
import { StatCard } from '@/components/ui/StatCard'
import { ScreenshotThumb } from '@/components/ui/ImageUpload'
import { TradeFilterBar, FILTER_DEFAULTS } from '@/components/trades/TradeFilters'
import { TradeForm } from '@/components/trades/TradeForm'
import { TradeDetail } from '@/components/trades/TradeDetail'
import type { TradeFilters } from '@/lib/metrics'
import { balanceBefore, computeMetrics, filterTrades } from '@/lib/metrics'
import { formatDateTime, timezoneShort, todayKey } from '@/lib/dates'
import { downloadFile, tradesToCsv } from '@/lib/csv'
import { lots as formatLots, money, moneySigned, pct, price, rMultiple } from '@/lib/format'
import { cn } from '@/lib/utils'

type SortKey = 'date-desc' | 'date-asc' | 'pnl-desc' | 'pnl-asc' | 'r-desc'

const SORT_LABELS: Record<SortKey, string> = {
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  'pnl-desc': 'Best P/L',
  'pnl-asc': 'Worst P/L',
  'r-desc': 'Highest R',
}

export function JournalPage() {
  const { data, deleteTrade } = useData()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { settings, trades, plans } = data
  const tz = settings.timezone

  const [filters, setFilters] = useState<TradeFilters>(FILTER_DEFAULTS)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('date-desc')
  const [form, setForm] = useState<{ trade?: Trade; plan?: Plan } | null>(null)
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setForm({})
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
      return
    }
    const planId = searchParams.get('plan')
    if (planId) {
      const plan = plans.find((item) => item.id === planId)
      if (plan) setForm({ plan })
      const next = new URLSearchParams(searchParams)
      next.delete('plan')
      setSearchParams(next, { replace: true })
      return
    }
    const editId = searchParams.get('edit')
    if (editId) {
      const trade = trades.find((item) => item.id === editId)
      if (trade) setForm({ trade })
      const next = new URLSearchParams(searchParams)
      next.delete('edit')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, plans, trades, setSearchParams])

  const searchFiltered = useMemo(() => {
    const list = filterTrades(trades, filters, tz)
    const query = search.trim().toLowerCase()
    if (!query) return list
    return list.filter((trade) => {
      const haystack = [
        `t-${String(trade.seq).padStart(4, '0')}`,
        trade.setup,
        trade.direction,
        trade.timeframe,
        trade.session,
        trade.reasonEntry,
        trade.reasonExit,
        trade.lessons,
        ...trade.mistakes,
      ]
        .join(' ')
        .toLocaleLowerCase()
      return haystack.includes(query)
    })
  }, [trades, filters, tz, search])

  const filtered = useMemo(() => {
    const list = [...searchFiltered]
    switch (sort) {
      case 'date-asc':
        return list.sort((a, b) => a.date.localeCompare(b.date))
      case 'pnl-desc':
        return list.sort((a, b) => b.pnl - a.pnl)
      case 'pnl-asc':
        return list.sort((a, b) => a.pnl - b.pnl)
      case 'r-desc':
        return list.sort((a, b) => b.rMultiple - a.rMultiple)
      default:
        return list.sort((a, b) => b.date.localeCompare(a.date))
    }
  }, [searchFiltered, sort])

  const metrics = useMemo(
    () =>
      computeMetrics(
        filtered,
        balanceBefore(trades, filters.from, settings.startingBalance, tz),
        tz,
      ),
    [filtered, trades, filters.from, settings.startingBalance, tz],
  )
  const hasFilters =
    Boolean(search) ||
    filters.from !== '' ||
    filters.to !== '' ||
    filters.instrumentId !== 'ALL' ||
    filters.direction !== 'ALL' ||
    filters.timeframe !== 'ALL' ||
    filters.setup !== 'ALL' ||
    filters.session !== 'ALL'

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast('There are no trades to export with these filters.', 'info')
      return
    }
    downloadFile(
      `pa-journal-trades-${todayKey(tz)}.csv`,
      tradesToCsv(filtered, settings, tz),
      'text/csv;charset=utf-8',
    )
    toast(`Exported ${filtered.length} trade${filtered.length === 1 ? '' : 's'} to CSV.`, 'success')
  }

  const handleDelete = async (trade: Trade) => {
    await deleteTrade(trade.id)
    toast(`Trade T-${String(trade.seq).padStart(4, '0')} deleted.`, 'success')
  }

  const resetFilters = () => {
    setFilters(FILTER_DEFAULTS)
    setSearch('')
    setSort('date-desc')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Trade Journal"
        title="Record what actually happened"
        description="Every row is a real trade you entered. P/L comes from your execution data or your actual result — never from a broker feed. Screenshots stay on this device."
        actions={
          <>
            <Button variant="soft" onClick={exportCsv}>
              <Download size={14} /> Export CSV
            </Button>
            <Button variant="primary" onClick={() => setForm({})}>
              <Plus size={14} /> Log trade
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Filtered trades" value={String(filtered.length)} sub={`${trades.length} total in journal`} />
        <StatCard
          label="Net P/L"
          value={moneySigned(metrics.netPnl)}
          tone={metrics.netPnl > 0 ? 'profit' : metrics.netPnl < 0 ? 'loss' : 'default'}
          sub={`${metrics.wins}W / ${metrics.losses}L / ${metrics.breakeven}BE`}
        />
        <StatCard
          label="Win rate"
          value={metrics.winRate == null ? '—' : pct(metrics.winRate, 0)}
          tone="accent"
          sub={`${metrics.decided} decided trades`}
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
          sub={`${money(metrics.grossProfit)} gained`}
        />
        <StatCard
          label="Avg R"
          value={metrics.avgR == null ? '—' : rMultiple(metrics.avgR)}
          sub="Average recorded R multiple"
          tone={
            metrics.avgR == null || metrics.avgR === 0
              ? 'default'
              : metrics.avgR > 0
                ? 'profit'
                : 'loss'
          }
        />
        <StatCard
          label="Avg win / loss"
          value={
            metrics.avgWin == null
              ? '—'
              : `${money(metrics.avgWin)} / ${metrics.avgLoss == null ? '—' : money(metrics.avgLoss)}`
          }
          sub={`Expectancy ${metrics.expectancy == null ? '—' : moneySigned(metrics.expectancy)}`}
        />
      </div>

      <TradeFilterBar
        filters={filters}
        onChange={setFilters}
        instruments={settings.instruments}
        setups={settings.setups}
        tz={tz}
        search={search}
        onSearchChange={setSearch}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] text-dim">
            <Filter size={11} /> {filtered.length} shown
          </span>
          {metrics.count > 0 ? (
            <>
              <span className="h-3 w-px bg-line" />
              <Badge variant={metrics.netPnl >= 0 ? 'green' : 'red'}>
                {moneySigned(metrics.netPnl)}
              </Badge>
            </>
          ) : null}
          {hasFilters ? (
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              <RotateCcw size={11} /> Clear all
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-dim" htmlFor="journal-sort">
            Sort
          </label>
          <select
            id="journal-sort"
            className="input input-sm w-auto min-w-[140px]"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <table className="table-base min-w-[1050px]">
              <thead>
                <tr>
                  <th>Trade</th>
                  <th>Date</th>
                  <th>Setup</th>
                  <th>Prices</th>
                  <th>Size / risk</th>
                  <th className="text-right">P/L</th>
                  <th>Result</th>
                  <th>Shots</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((trade) => (
                  <tr
                    key={trade.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedTrade(trade)}
                  >
                    <td>
                      <div className="font-mono text-[11px] font-semibold text-accent-2">
                        T-{String(trade.seq).padStart(4, '0')}
                      </div>
                      <div className="mt-0.5">
                        <DirectionBadge direction={trade.direction} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="text-[11px] text-fg">
                        {formatDateTime(trade.date, tz, 'dd MMM yyyy')}
                      </div>
                      <div className="text-[9px] text-dim">
                        {formatDateTime(trade.date, tz, 'HH:mm')} · {trade.session}
                      </div>
                    </td>
                    <td className="max-w-[170px]">
                      <div className="truncate text-[12px] font-medium text-fg">{trade.setup}</div>
                      <div className="text-[9px] text-dim">
                        {trade.timeframe} · {trade.instrumentId.toUpperCase()}
                      </div>
                    </td>
                    <td>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px]">
                        <span className="text-dim">E {price(trade.entry, 2)}</span>
                        <span className="text-dim">X {price(trade.exit, 2)}</span>
                        <span className="text-dim">SL {trade.sl ? price(trade.sl, 2) : '—'}</span>
                        <span className="text-dim">TP {price(trade.tp, 2)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="font-mono text-[11px] text-fg">{formatLots(trade.lots)} lots</div>
                      <div className="text-[9px] text-dim">
                        {trade.riskAmount > 0 ? `${money(trade.riskAmount)} risk` : 'no stop'}
                      </div>
                    </td>
                    <td className="text-right">
                      <div
                        className={cn(
                          'font-mono text-[12px] font-semibold',
                          trade.pnl > 0
                            ? 'text-profit'
                            : trade.pnl < 0
                              ? 'text-loss'
                              : 'text-muted',
                        )}
                      >
                        {moneySigned(trade.pnl)}
                      </div>
                      <div
                        className={cn(
                          'font-mono text-[9px]',
                          trade.rMultiple > 0
                            ? 'text-profit/80'
                            : trade.rMultiple < 0
                              ? 'text-loss/80'
                              : 'text-dim',
                        )}
                      >
                        {trade.riskAmount > 0 ? rMultiple(trade.rMultiple) : '—'}
                      </div>
                    </td>
                    <td>
                      <ResultBadge result={trade.result} />
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <ScreenshotThumb src={trade.screenshotBefore} alt="Before entry" />
                        <ScreenshotThumb src={trade.screenshotAfter} alt="After exit" />
                      </div>
                    </td>
                    <td>
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setForm({ trade })}
                          aria-label={`Edit T-${String(trade.seq).padStart(4, '0')}`}
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedTrade(trade)}
                        >
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[10px] text-dim">
            <span>
              Showing {filtered.length} of {trades.length} trades · dates use {timezoneShort(tz)}
            </span>
            <span>
              Net <span className={metrics.netPnl >= 0 ? 'text-profit' : 'text-loss'}>{moneySigned(metrics.netPnl)}</span>
            </span>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <EmptyState
            icon={trades.length === 0 ? <BookOpen size={20} /> : <Search size={20} />}
            title={
              trades.length === 0
                ? 'Your journal is empty'
                : hasFilters
                  ? 'No trades match these filters'
                  : 'No trades to show'
            }
            description={
              trades.length === 0
                ? 'Log a real completed trade to start building honest performance data. You can attach a plan and screenshots.'
                : 'Try a wider date range, another setup, or clear the filters and search.'
            }
            action={
              trades.length === 0 ? (
                <Button variant="primary" onClick={() => setForm({})}>
                  <Plus size={14} /> Log your first trade
                </Button>
              ) : (
                <Button variant="soft" onClick={resetFilters}>
                  <RotateCcw size={13} /> Reset filters
                </Button>
              )
            }
          />
        </Card>
      )}

      {trades.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardHeader
              title="Record honestly"
              subtitle="The journal is only useful if the data is real."
              icon={<Sparkles size={14} />}
            />
            <div className="p-4">
              <InfoNote tone="blue" icon={<BookOpen size={12} />}>
                Use your actual fills, fees and exit. If the auto P/L does not match your broker
                statement, overwrite the P/L field with the actual result. Spread, swap and
                commission belong in fees or the actual P/L.
              </InfoNote>
            </div>
          </Card>
          <Card>
            <CardHeader
              title="Keep improving"
              subtitle="Review the process, not just the outcome."
              icon={<ArrowRight size={14} />}
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate('/analytics')}>
                  Analytics <ArrowRight size={12} />
                </Button>
              }
            />
            <div className="space-y-1.5 p-4 text-[11px] leading-relaxed text-muted">
              <p>
                Mistakes tagged: <span className="font-mono text-fg">{filtered.reduce((sum, trade) => sum + trade.mistakes.length, 0)}</span>
              </p>
              <p>
                Trades with a linked plan:{' '}
                <span className="font-mono text-fg">
                  {filtered.filter((trade) => trade.planId).length}/{filtered.length}
                </span>
              </p>
              <p>
                Trades with a checklist:{' '}
                <span className="font-mono text-fg">
                  {filtered.filter((trade) => trade.checklistId).length}/{filtered.length}
                </span>
              </p>
            </div>
          </Card>
        </div>
      ) : null}

      {form ? (
        <TradeForm
          trade={form.trade}
          plan={form.plan}
          onClose={() => setForm(null)}
        />
      ) : null}

      <TradeDetail
        trade={selectedTrade}
        open={Boolean(selectedTrade)}
        onClose={() => setSelectedTrade(null)}
        onEdit={(trade) => {
          setSelectedTrade(null)
          setForm({ trade })
        }}
        onDelete={handleDelete}
      />
    </div>
  )
}
