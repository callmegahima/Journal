import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { CalendarEvent, EventImpact, Trade } from '@/types'
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
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { TradeDetail } from '@/components/trades/TradeDetail'
import {
  addMonthsKey,
  formatDateKey,
  formatDateTime,
  isDateInMonth,
  monthGrid,
  monthTitle,
  nowIso,
  startOfWeekKey,
  todayKey,
  toDateKey,
  timezoneShort,
  weekRangeLabel,
} from '@/lib/dates'
import { computeMetrics } from '@/lib/metrics'
import { money, moneySigned, pct } from '@/lib/format'
import { cn, uid } from '@/lib/utils'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const IMPACT_VARIANT: Record<EventImpact, 'red' | 'amber' | 'slate'> = {
  High: 'red',
  Medium: 'amber',
  Low: 'slate',
}

function EventForm({
  event,
  date,
  onClose,
}: {
  event?: CalendarEvent
  date: string
  onClose: () => void
}) {
  const { saveEvent } = useData()
  const { toast } = useToast()
  const [title, setTitle] = useState(event?.title ?? '')
  const [impact, setImpact] = useState<EventImpact>(event?.impact ?? 'Medium')
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [busy, setBusy] = useState(false)

  const submit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault()
    if (!title.trim()) {
      toast('Give the event a title.', 'error')
      return
    }
    setBusy(true)
    try {
      const next: CalendarEvent = {
        id: event?.id ?? uid('event'),
        date,
        title: title.trim(),
        impact,
        notes: notes.trim(),
        createdAt: event?.createdAt ?? nowIso(),
        updatedAt: nowIso(),
      }
      await saveEvent(next)
      toast(event ? 'Event updated.' : 'Event added to the calendar.', 'success')
      onClose()
    } catch {
      toast('Could not save the event. Check browser storage.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={event ? 'Edit calendar event' : 'Add calendar event'}
      description={`${formatDateKey(date, 'EEEE, dd MMM yyyy')} · stored only on this device`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit(new Event('submit') as unknown as FormEvent)} loading={busy}>
            <Plus size={14} /> {event ? 'Save event' : 'Add event'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="event-title">
            Event title
          </label>
          <input
            id="event-title"
            className="input"
            value={title}
            onChange={(changeEvent) => setTitle(changeEvent.target.value)}
            placeholder="e.g. US CPI release — check before entry"
            autoFocus
          />
        </div>
        <div>
          <span className="label">Impact</span>
          <div className="grid grid-cols-3 gap-1.5">
            {(['Low', 'Medium', 'High'] as EventImpact[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setImpact(level)}
                className={cn(
                  'h-9 rounded-lg border text-[11px] font-semibold transition',
                  impact === level
                    ? level === 'High'
                      ? 'border-loss/50 bg-loss/15 text-loss'
                      : level === 'Medium'
                        ? 'border-warn/50 bg-warn/15 text-warn'
                        : 'border-accent/40 bg-accent/10 text-accent-2'
                    : 'border-line bg-ink/50 text-muted hover:border-line-2 hover:text-fg',
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="event-notes">
            Notes
          </label>
          <textarea
            id="event-notes"
            className="input min-h-[92px]"
            value={notes}
            onChange={(changeEvent) => setNotes(changeEvent.target.value)}
            placeholder="Time, expected impact, and your rule for trading around it…"
          />
        </div>
        <InfoNote tone="slate" icon={<CalendarDays size={12} />}>
          This is your own calendar. No economic calendar is downloaded or assumed.
        </InfoNote>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  )
}

function DayCell({
  dateKey,
  inMonth,
  selected,
  isToday,
  pnl,
  tradeCount,
  events,
  onSelect,
}: {
  dateKey: string
  inMonth: boolean
  selected: boolean
  isToday: boolean
  pnl: number
  tradeCount: number
  events: CalendarEvent[]
  onSelect: () => void
}) {
  const day = Number(dateKey.slice(-2))
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex min-h-[74px] flex-col rounded-lg border p-1.5 text-left transition sm:min-h-[92px]',
        selected
          ? 'border-accent/60 bg-accent/[0.07] ring-1 ring-inset ring-accent/25'
          : inMonth
            ? 'border-line/70 bg-panel/50 hover:border-line-2 hover:bg-panel-2/60'
            : 'border-line/40 bg-ink/30 opacity-45 hover:opacity-70',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded font-mono text-[10px] font-semibold',
            isToday
              ? 'bg-accent text-white'
              : selected
                ? 'text-accent-2'
                : 'text-muted',
          )}
        >
          {day}
        </span>
        <div className="flex items-center gap-0.5">
          {events.slice(0, 2).map((event) => (
            <span
              key={event.id}
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                event.impact === 'High'
                  ? 'bg-loss'
                  : event.impact === 'Medium'
                    ? 'bg-warn'
                    : 'bg-accent',
              )}
            />
          ))}
          {events.length > 2 ? (
            <span className="font-mono text-[8px] text-dim">+{events.length - 2}</span>
          ) : null}
        </div>
      </div>
      {tradeCount > 0 ? (
        <div className="mt-auto pt-1">
          <div
            className={cn(
              'font-mono text-[10px] font-semibold',
              pnl > 0 ? 'text-profit' : pnl < 0 ? 'text-loss' : 'text-muted',
            )}
          >
            {pnl === 0 ? '—' : moneySigned(pnl)}
          </div>
          <div className="text-[8px] text-dim">
            {tradeCount} trade{tradeCount === 1 ? '' : 's'}
          </div>
        </div>
      ) : events.length > 0 ? (
        <div className="mt-auto truncate pt-1 text-[8px] text-dim">{events[0].title}</div>
      ) : null}
    </button>
  )
}

export function CalendarPage() {
  const { data, deleteEvent, deleteTrade, saveReflection } = useData()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { settings, trades, events, reflections } = data
  const tz = settings.timezone
  const today = todayKey(tz)

  const [monthKey, setMonthKey] = useState(today.slice(0, 7))
  const [selectedDay, setSelectedDay] = useState(today)
  const [eventForm, setEventForm] = useState<{ event?: CalendarEvent; date: string } | null>(
    null,
  )
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null)
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [deleting, setDeleting] = useState(false)

  const tradesByDay = useMemo(() => {
    const map = new Map<string, Trade[]>()
    for (const trade of trades) {
      const key = toDateKey(trade.date, tz)
      const list = map.get(key)
      if (list) list.push(trade)
      else map.set(key, [trade])
    }
    return map
  }, [trades, tz])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const list = map.get(event.date)
      if (list) list.push(event)
      else map.set(event.date, [event])
    }
    return map
  }, [events])

  const weeks = useMemo(() => monthGrid(monthKey), [monthKey])

  const monthTrades = useMemo(
    () => trades.filter((trade) => isDateInMonth(toDateKey(trade.date, tz), monthKey)),
    [trades, tz, monthKey],
  )
  const monthEvents = useMemo(
    () => events.filter((event) => isDateInMonth(event.date, monthKey)),
    [events, monthKey],
  )
  const monthMetrics = useMemo(
    () => computeMetrics(monthTrades, settings.startingBalance, tz),
    [monthTrades, settings.startingBalance, tz],
  )

  const dayTrades = tradesByDay.get(selectedDay) ?? []
  const dayEvents = eventsByDay.get(selectedDay) ?? []
  const dayPnl = dayTrades.reduce((sum, trade) => sum + trade.pnl, 0)
  const weekStart = startOfWeekKey(selectedDay)
  const existingReflection = reflections.find((item) => item.weekStart === weekStart)
  const [reflectionText, setReflectionText] = useState(existingReflection?.notes ?? '')

  useEffect(() => {
    setReflectionText(existingReflection?.notes ?? '')
  }, [weekStart, existingReflection?.id, existingReflection?.notes])

  const moveMonth = (offset: number) => {
    const next = addMonthsKey(monthKey, offset)
    setMonthKey(next)
    setSelectedDay(`${next}-01`)
  }

  const goToday = () => {
    setMonthKey(today.slice(0, 7))
    setSelectedDay(today)
  }

  const selectDay = (dateKey: string) => {
    setSelectedDay(dateKey)
    if (!isDateInMonth(dateKey, monthKey)) setMonthKey(dateKey.slice(0, 7))
  }

  const handleDeleteEvent = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteEvent(deleteTarget.id)
      toast('Calendar event deleted.', 'success')
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteTrade = async (trade: Trade) => {
    await deleteTrade(trade.id)
    toast(`Trade T-${String(trade.seq).padStart(4, '0')} deleted.`, 'success')
  }

  const saveReflectionNow = async () => {
    const base =
      existingReflection ??
      ({
        id: uid('reflection'),
        weekStart,
        notes: '',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      } as const)
    try {
      await saveReflection({ ...base, notes: reflectionText })
      toast('Weekly reflection saved.', 'success')
    } catch {
      toast('Could not save the reflection.', 'error')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Calendar"
        title="See the month in context"
        description={`Daily P/L, trade activity and your own event notes in ${timezoneShort(tz)}. Events are user-created only — nothing is preloaded.`}
        actions={
          <>
            <Button variant="soft" onClick={() => setEventForm({ date: selectedDay })}>
              <Plus size={14} /> Add event
            </Button>
            <Button variant="primary" onClick={() => navigate('/journal?new=1')}>
              <Plus size={14} /> Log trade
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card className="px-3.5 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.08em] text-dim">Month net</div>
          <div
            className={cn(
              'mt-0.5 font-mono text-lg font-semibold',
              monthMetrics.netPnl > 0
                ? 'text-profit'
                : monthMetrics.netPnl < 0
                  ? 'text-loss'
                  : 'text-fg',
            )}
          >
            {monthMetrics.count === 0 ? '—' : moneySigned(monthMetrics.netPnl)}
          </div>
        </Card>
        <Card className="px-3.5 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.08em] text-dim">Trades</div>
          <div className="mt-0.5 font-mono text-lg font-semibold text-fg">
            {monthTrades.length}
          </div>
        </Card>
        <Card className="px-3.5 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.08em] text-dim">Win rate</div>
          <div className="mt-0.5 font-mono text-lg font-semibold text-accent-2">
            {monthMetrics.winRate == null ? '—' : pct(monthMetrics.winRate, 0)}
          </div>
        </Card>
        <Card className="px-3.5 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.08em] text-dim">Events</div>
          <div className="mt-0.5 font-mono text-lg font-semibold text-fg">
            {monthEvents.length}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-3">
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => moveMonth(-1)} aria-label="Previous month">
                <ChevronLeft size={15} />
              </Button>
              <h2 className="min-w-[128px] text-center text-[14px] font-semibold text-fg">
                {monthTitle(monthKey)}
              </h2>
              <Button size="sm" variant="ghost" onClick={() => moveMonth(1)} aria-label="Next month">
                <ChevronRight size={15} />
              </Button>
              <Button size="sm" variant="soft" onClick={goToday} className="ml-1">
                Today
              </Button>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-dim">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-profit" /> profit day
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-loss" /> loss day
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" /> event
              </span>
            </div>
          </div>

          <div className="scroll-thin overflow-x-auto p-2.5 sm:p-3">
            <div className="min-w-[560px]">
              <div className="mb-1 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="py-1 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-dim"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                {weeks.map((week) => (
                  <div key={week[0]} className="grid grid-cols-7 gap-1">
                    {week.map((dateKey) => {
                      const dayList = tradesByDay.get(dateKey) ?? []
                      const dayPnlValue = dayList.reduce((sum, trade) => sum + trade.pnl, 0)
                      return (
                        <DayCell
                          key={dateKey}
                          dateKey={dateKey}
                          inMonth={isDateInMonth(dateKey, monthKey)}
                          selected={selectedDay === dateKey}
                          isToday={today === dateKey}
                          pnl={dayPnlValue}
                          tradeCount={dayList.length}
                          events={eventsByDay.get(dateKey) ?? []}
                          onSelect={() => selectDay(dateKey)}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[10px] text-dim">
            <span>
              Click a day to inspect it. Days without trades are still useful — they show your
              patience.
            </span>
            <span className="font-mono">
              {monthTrades.length} trades · {money(monthMetrics.grossProfit)} gross profit
            </span>
          </div>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader
              title={formatDateKey(selectedDay, 'EEEE, dd MMM yyyy')}
              subtitle={`${dayTrades.length} trade${dayTrades.length === 1 ? '' : 's'} · ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
              icon={<CalendarDays size={15} />}
              action={
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEventForm({ date: selectedDay })}
                  >
                    <Plus size={12} /> Event
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => navigate('/journal?new=1')}
                  >
                    <Plus size={12} /> Trade
                  </Button>
                </div>
              }
            />
            <div className="p-4">
              <div className="flex items-center justify-between rounded-lg border border-line/80 bg-ink/40 px-3 py-2.5">
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-dim">Day net</div>
                  <div
                    className={cn(
                      'mt-0.5 font-mono text-xl font-semibold',
                      dayPnl > 0 ? 'text-profit' : dayPnl < 0 ? 'text-loss' : 'text-fg',
                    )}
                  >
                    {dayTrades.length === 0 ? '—' : moneySigned(dayPnl)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] uppercase tracking-wide text-dim">Result</div>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted">
                    {dayPnl > 0 ? (
                      <>
                        <TrendingUp size={12} className="text-profit" /> Green day
                      </>
                    ) : dayPnl < 0 ? (
                      <>
                        <TrendingDown size={12} className="text-loss" /> Red day
                      </>
                    ) : dayTrades.length > 0 ? (
                      'Flat day'
                    ) : (
                      'No trades'
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-dim">
                  Trades
                </div>
                {dayTrades.length > 0 ? (
                  <div className="space-y-1.5">
                    {dayTrades.map((trade) => (
                      <button
                        key={trade.id}
                        type="button"
                        onClick={() => setSelectedTrade(trade)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-line/70 bg-panel/40 px-2.5 py-2 text-left transition hover:border-line-2"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <DirectionBadge direction={trade.direction} />
                          <span className="truncate text-[11px] text-fg">{trade.setup}</span>
                          <span className="text-[9px] text-dim">{trade.timeframe}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <ResultBadge result={trade.result} />
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
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-line-2/70 px-3 py-3 text-[10px] leading-relaxed text-dim">
                    No trades on this day. If you took a trade elsewhere, add it in the journal.
                  </p>
                )}
              </div>

              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-dim">
                    Your events
                  </span>
                  <button
                    type="button"
                    onClick={() => setEventForm({ date: selectedDay })}
                    className="text-[10px] font-medium text-accent-2 hover:underline"
                  >
                    + Add
                  </button>
                </div>
                {dayEvents.length > 0 ? (
                  <div className="space-y-1.5">
                    {dayEvents.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-lg border border-line/70 bg-panel/40 px-2.5 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={IMPACT_VARIANT[event.impact]}>{event.impact}</Badge>
                              <span className="truncate text-[11px] font-medium text-fg">
                                {event.title}
                              </span>
                            </div>
                            {event.notes ? (
                              <p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-muted">
                                {event.notes}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => setEventForm({ event, date: event.date })}
                              className="rounded p-1 text-dim transition hover:bg-panel-2 hover:text-fg"
                              aria-label="Edit event"
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(event)}
                              className="rounded p-1 text-dim transition hover:bg-panel-2 hover:text-loss"
                              aria-label="Delete event"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-dim">
                    No events. Add your own high-impact news reminders or session notes.
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Weekly reflection"
              subtitle={weekRangeLabel(weekStart)}
              icon={<Sparkles size={14} />}
              action={
                <Button size="sm" variant="soft" onClick={() => void saveReflectionNow()}>
                  Save
                </Button>
              }
            />
            <div className="p-4">
              <textarea
                className="input min-h-[110px] text-[12px]"
                value={reflectionText}
                onChange={(event) => setReflectionText(event.target.value)}
                placeholder="What did this week teach you? Which rule held, which one broke, and what is the one adjustment for next week?"
              />
              <div className="mt-2 flex items-center justify-between text-[10px] text-dim">
                <span>{existingReflection ? 'Editing saved reflection' : 'New reflection'}</span>
                <span>{reflectionText.trim().length} characters</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Saved reflections"
          subtitle="Your own words, stored locally and linked to the week."
          icon={<ClipboardList size={15} />}
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate('/psychology')}
            >
              Psychology <ArrowRight size={12} />
            </Button>
          }
        />
        {reflections.length > 0 ? (
          <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {[...reflections]
              .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
              .slice(0, 6)
              .map((reflection) => (
                <button
                  key={reflection.id}
                  type="button"
                  onClick={() => selectDay(reflection.weekStart)}
                  className="rounded-lg border border-line/70 bg-panel/40 p-3 text-left transition hover:border-line-2 hover:bg-panel-2/40"
                >
                  <div className="text-[10px] font-semibold text-fg">
                    {weekRangeLabel(reflection.weekStart)}
                  </div>
                  <p className="mt-1 line-clamp-3 text-[10px] leading-relaxed text-muted">
                    {reflection.notes.trim() || 'No text saved for this week.'}
                  </p>
                  <div className="mt-1.5 text-[9px] text-dim">
                    Updated {formatDateTime(reflection.updatedAt, tz, 'dd MMM yyyy · HH:mm')}
                  </div>
                </button>
              ))}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState
              compact
              icon={<Sparkles size={18} />}
              title="No weekly reflections yet"
              description="Write one after a trading week. It becomes part of your process record."
            />
          </div>
        )}
      </Card>

      <InfoNote tone="slate" icon={<CalendarDays size={12} />}>
        Dates are grouped in your selected display timezone ({timezoneShort(tz)}). Trades logged near midnight can
        land on a different calendar day if you change the timezone later.
      </InfoNote>

      {eventForm ? (
        <EventForm
          event={eventForm.event}
          date={eventForm.date}
          onClose={() => setEventForm(null)}
        />
      ) : null}

      <TradeDetail
        trade={selectedTrade}
        open={Boolean(selectedTrade)}
        onClose={() => setSelectedTrade(null)}
        onEdit={(trade) => navigate(`/journal?edit=${trade.id}`)}
        onDelete={handleDeleteTrade}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        busy={deleting}
        title="Delete this event?"
        description={`"${deleteTarget?.title ?? ''}" will be removed from your calendar. This cannot be undone.`}
        confirmLabel="Delete event"
        onConfirm={handleDeleteEvent}
      />
    </div>
  )
}
