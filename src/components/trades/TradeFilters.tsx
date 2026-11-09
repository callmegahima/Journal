import { RotateCcw, Search } from 'lucide-react'
import type { InstrumentSpec, SetupDef } from '@/types'
import { SESSIONS, TIMEFRAMES } from '@/types'
import type { TradeFilters } from '@/lib/metrics'
import { rangePreset } from '@/lib/dates'
import { cn } from '@/lib/utils'

export function TradeFilterBar({
  filters,
  onChange,
  instruments,
  setups,
  tz,
  search,
  onSearchChange,
  showPresets = true,
  className,
}: {
  filters: TradeFilters
  onChange: (filters: TradeFilters) => void
  instruments: InstrumentSpec[]
  setups: SetupDef[]
  tz: string
  search?: string
  onSearchChange?: (value: string) => void
  showPresets?: boolean
  className?: string
}) {
  const preset = (key: '7d' | '30d' | '90d' | 'ytd' | 'all') => {
    const range = rangePreset(key, tz)
    if (key === 'all') {
      onChange({ ...filters, from: '', to: '' })
    } else {
      onChange({ ...filters, from: range.from, to: range.to })
    }
  }

  const hasFilters =
    filters.from !== '' ||
    filters.to !== '' ||
    filters.instrumentId !== 'ALL' ||
    filters.direction !== 'ALL' ||
    filters.timeframe !== 'ALL' ||
    filters.setup !== 'ALL' ||
    filters.session !== 'ALL' ||
    Boolean(search)

  return (
    <div className={cn('card p-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {onSearchChange ? (
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim"
            />
            <input
              type="search"
              className="input input-sm pl-8"
              value={search ?? ''}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search ID, setup, notes, mistakes…"
            />
          </div>
        ) : null}

        <select
          className="input input-sm w-auto min-w-[110px]"
          value={filters.instrumentId}
          onChange={(event) => onChange({ ...filters, instrumentId: event.target.value })}
          aria-label="Filter by instrument"
        >
          <option value="ALL">All instruments</option>
          {instruments.map((instrument) => (
            <option key={instrument.id} value={instrument.id}>
              {instrument.symbol}
            </option>
          ))}
        </select>

        <select
          className="input input-sm w-auto min-w-[96px]"
          value={filters.direction}
          onChange={(event) =>
            onChange({
              ...filters,
              direction: event.target.value as TradeFilters['direction'],
            })
          }
          aria-label="Filter by direction"
        >
          <option value="ALL">BUY + SELL</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>

        <select
          className="input input-sm w-auto min-w-[96px]"
          value={filters.timeframe}
          onChange={(event) =>
            onChange({
              ...filters,
              timeframe: event.target.value as TradeFilters['timeframe'],
            })
          }
          aria-label="Filter by timeframe"
        >
          <option value="ALL">All TFs</option>
          {TIMEFRAMES.map((timeframe) => (
            <option key={timeframe} value={timeframe}>
              {timeframe}
            </option>
          ))}
        </select>

        <select
          className="input input-sm w-auto min-w-[128px]"
          value={filters.setup}
          onChange={(event) => onChange({ ...filters, setup: event.target.value })}
          aria-label="Filter by setup"
        >
          <option value="ALL">All setups</option>
          {setups.map((setup) => (
            <option key={setup.id} value={setup.name}>
              {setup.name}
            </option>
          ))}
        </select>

        <select
          className="input input-sm w-auto min-w-[108px]"
          value={filters.session}
          onChange={(event) =>
            onChange({ ...filters, session: event.target.value as TradeFilters['session'] })
          }
          aria-label="Filter by session"
        >
          <option value="ALL">All sessions</option>
          {SESSIONS.map((session) => (
            <option key={session} value={session}>
              {session}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <input
            type="date"
            className="input input-sm w-[128px]"
            value={filters.from}
            onChange={(event) => onChange({ ...filters, from: event.target.value })}
            aria-label="From date"
          />
          <span className="text-[10px] text-dim">to</span>
          <input
            type="date"
            className="input input-sm w-[128px]"
            value={filters.to}
            onChange={(event) => onChange({ ...filters, to: event.target.value })}
            aria-label="To date"
          />
        </div>

        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              onChange({
                from: '',
                to: '',
                instrumentId: 'ALL',
                direction: 'ALL',
                timeframe: 'ALL',
                setup: 'ALL',
                session: 'ALL',
              })
              onSearchChange?.('')
            }}
            className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[10px] font-medium text-muted transition hover:bg-panel-2 hover:text-fg"
          >
            <RotateCcw size={11} /> Reset
          </button>
        ) : null}
      </div>

      {showPresets ? (
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line/60 pt-2">
          <span className="mr-1 text-[9px] uppercase tracking-wider text-dim">Quick range</span>
          {(
            [
              ['7d', '7 days'],
              ['30d', '30 days'],
              ['90d', '90 days'],
              ['ytd', 'YTD'],
              ['all', 'All'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => preset(key)}
              className="rounded px-2 py-1 text-[10px] font-medium text-muted transition hover:bg-panel-2 hover:text-fg"
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-[9px] text-dim">
            Dates use your display timezone
          </span>
        </div>
      ) : null}
    </div>
  )
}

export const FILTER_DEFAULTS: TradeFilters = {
  from: '',
  to: '',
  instrumentId: 'ALL',
  direction: 'ALL',
  timeframe: 'ALL',
  setup: 'ALL',
  session: 'ALL',
}
