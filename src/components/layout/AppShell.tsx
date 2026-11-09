import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  Calculator,
  ClipboardList,
  LayoutDashboard,
  Lock,
  Menu,
  Plus,
  Settings,
  ShieldAlert,
  Target,
  X,
} from 'lucide-react'
import { Logo, LogoMark } from '@/components/Logo'
import { useData } from '@/store/DataContext'
import { cn } from '@/lib/utils'
import { money, moneySigned } from '@/lib/format'
import { computeMetrics, computeRiskStatus } from '@/lib/metrics'
import { clockTime, timezoneShort, todayKey } from '@/lib/dates'
import { ProgressBar } from '@/components/ui/primitives'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Trading',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/plan', label: 'Trading Plan', icon: ClipboardList },
      { to: '/journal', label: 'Trade Journal', icon: BookOpen },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/strategy', label: 'Strategy & Setups', icon: Target },
      { to: '/risk', label: 'Risk Calculator', icon: Calculator },
      { to: '/psychology', label: 'Psychology', icon: Brain },
      { to: '/analytics', label: 'Analytics & Reports', icon: BarChart3 },
    ],
  },
]

const ALL_ITEMS = [...GROUPS.flatMap((group) => group.items)]

function useClock(tz: string) {
  const [time, setTime] = useState(() => clockTime(tz))
  useEffect(() => {
    setTime(clockTime(tz))
    const timer = window.setInterval(() => setTime(clockTime(tz)), 1000)
    return () => window.clearInterval(timer)
  }, [tz])
  return time
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { data, lockNow } = useData()
  const { settings, trades } = data
  const navigate = useNavigate()
  const risk = useMemo(
    () => computeRiskStatus(trades, settings, settings.timezone),
    [trades, settings],
  )
  const metrics = useMemo(
    () => computeMetrics(trades, settings.startingBalance, settings.timezone),
    [trades, settings.startingBalance, settings.timezone],
  )
  const isToday = risk.dayKey === todayKey(settings.timezone)
  const activeInstrument =
    settings.instruments.find((item) => item.id === settings.activeInstrumentId) ??
    settings.instruments[0]

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between px-4">
        <Logo />
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-3 pb-4">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="mb-1.5 px-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-dim/80">
              {group.label}
            </div>
            <nav className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[12px] font-medium transition',
                        isActive
                          ? 'bg-accent/10 text-fg ring-1 ring-inset ring-accent/20'
                          : 'text-muted hover:bg-panel/80 hover:text-fg',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          size={15}
                          className={cn(
                            'shrink-0 transition',
                            isActive ? 'text-accent-2' : 'text-dim group-hover:text-muted',
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                        {isActive ? (
                          <span className="ml-auto h-1 w-1 rounded-full bg-accent" />
                        ) : null}
                      </>
                    )}
                  </NavLink>
                )
              })}
            </nav>
          </div>
        ))}

        <div className="mb-5">
          <div className="mb-1.5 px-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-dim/80">
            Account
          </div>
          <NavLink
            to="/settings"
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[12px] font-medium transition',
                isActive
                  ? 'bg-accent/10 text-fg ring-1 ring-inset ring-accent/20'
                  : 'text-muted hover:bg-panel/80 hover:text-fg',
              )
            }
          >
            <Settings size={15} className="shrink-0 text-dim group-hover:text-muted" />
            Settings
          </NavLink>
        </div>

        <button
          type="button"
          onClick={() => navigate('/risk')}
          className="w-full rounded-xl border border-line bg-panel/70 p-3 text-left transition hover:border-line-2"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-dim">
              <ShieldAlert size={12} />
              Risk guard
            </span>
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                risk.dayBreached || risk.weekBreached
                  ? 'bg-loss'
                  : risk.dayUsedPct > 60
                    ? 'bg-warn'
                    : 'bg-profit',
              )}
            />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-[10px] text-muted">Today</span>
            <span
              className={cn(
                'font-mono text-[11px] font-semibold',
                risk.dayPnl < 0 ? 'text-loss' : risk.dayPnl > 0 ? 'text-profit' : 'text-fg',
              )}
            >
              {risk.dayPnl === 0 ? '—' : moneySigned(risk.dayPnl)}
            </span>
          </div>
          <ProgressBar
            value={risk.dayUsedPct}
            tone={risk.dayBreached ? 'red' : risk.dayUsedPct > 60 ? 'amber' : 'green'}
            height="h-1"
            className="mt-2"
          />
          <div className="mt-1.5 flex justify-between text-[9px] text-dim">
            <span>Loss used {risk.dayUsedPct.toFixed(0)}%</span>
            <span>Limit {money(risk.dayLimit)}</span>
          </div>
          {!isToday ? <span className="sr-only">Timezone mismatch</span> : null}
        </button>
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-center gap-2 rounded-lg px-1 py-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-2 bg-panel-2 text-[10px] font-semibold text-accent-2">
            {settings.displayName.trim().slice(0, 2).toUpperCase() || 'PA'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium text-fg">
              {settings.displayName || 'Trader'}
            </div>
            <div className="flex items-center gap-1 text-[9px] text-dim">
              <Activity size={9} />
              Local journal · USD
            </div>
          </div>
          {settings.lock.enabled ? (
            <button
              type="button"
              onClick={lockNow}
              className="rounded-md p-1.5 text-dim transition hover:bg-panel-2 hover:text-fg"
              title="Lock journal"
              aria-label="Lock journal"
            >
              <Lock size={13} />
            </button>
          ) : null}
        </div>
        <div className="mt-1 flex items-center justify-between px-1 text-[9px] text-dim">
          <span>{activeInstrument?.symbol ?? 'XAUUSD'} · manual</span>
          <span className="font-mono">{money(metrics.balance)}</span>
        </div>
      </div>
    </div>
  )
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { data } = useData()
  const location = useLocation()
  const navigate = useNavigate()
  const clock = useClock(data.settings.timezone)
  const activeInstrument =
    data.settings.instruments.find((item) => item.id === data.settings.activeInstrumentId) ??
    data.settings.instruments[0]
  const current =
    ALL_ITEMS.find((item) => (item.end ? location.pathname === '/' : location.pathname.startsWith(item.to)))
      ?.label ?? (location.pathname.startsWith('/settings') ? 'Settings' : 'Dashboard')

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-ink/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={onMenu}
          className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-fg lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={19} />
        </button>
        <LogoMark size={24} />
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-fg">{current}</div>
          <div className="hidden text-[9px] uppercase tracking-[0.1em] text-dim sm:block">
            PA Trading Journal
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-1.5 rounded-lg border border-line bg-panel/60 px-2.5 py-1.5 text-[10px] text-muted lg:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="font-mono font-semibold text-fg">
            {activeInstrument?.symbol ?? 'XAUUSD'}
          </span>
          <span className="text-dim">active</span>
        </div>
        <div className="hidden items-center gap-1.5 rounded-lg border border-line bg-panel/60 px-2.5 py-1.5 text-[10px] text-muted md:flex">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-profit" />
          <span className="font-mono tabular-nums">{clock}</span>
          <span className="text-dim">· {timezoneShort(data.settings.timezone)}</span>
        </div>
        <div className="hidden items-center gap-2 rounded-lg border border-line bg-panel/60 px-2.5 py-1.5 sm:flex">
          <span className="text-[9px] uppercase tracking-[0.1em] text-dim">Balance</span>
          <span className="font-mono text-[11px] font-semibold text-fg">
            {money(
              data.settings.startingBalance +
                data.trades.reduce((sum, trade) => sum + trade.pnl, 0),
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/plan?new=1')}
          className="btn btn-primary h-8 px-2.5 text-[12px]"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">New plan</span>
          <span className="sm:hidden">Plan</span>
        </button>
      </div>
    </header>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileOpen])

  return (
    <div className="min-h-screen bg-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-[#0a0f1c] lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-[280px] border-r border-line bg-[#0a0f1c] shadow-2xl animate-slide-up">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 z-10 rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-fg"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main
          className="mx-auto w-full max-w-[1560px] px-4 pb-20 pt-5 sm:px-6 lg:px-8"
          id="main-content"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
