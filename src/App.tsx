import { Component, lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { DataProvider, useData } from '@/store/DataContext'
import { AuthProvider, useAuth } from '@/store/AuthContext'
import { AuthScreens, SetNewPasswordScreen } from '@/components/auth/AuthScreens'
import { PendingApprovalScreen } from '@/components/auth/PendingApproval'
import { useApprovalStatus } from '@/lib/approval'
import { LegacyImportBanner } from '@/components/settings/AccountCard'
import { ToastProvider } from '@/store/ToastContext'
import { AppShell } from '@/components/layout/AppShell'
import { LockScreen } from '@/components/LockScreen'
import { LogoMark } from '@/components/Logo'
import { Button } from '@/components/ui/primitives'
import { hardReload, loadPage } from '@/lib/reload'

const DashboardPage = lazy(() =>
  loadPage(() => import('@/pages/Dashboard')).then((module) => ({ default: module.DashboardPage })),
)
const TradingPlanPage = lazy(() =>
  loadPage(() => import('@/pages/TradingPlan')).then((module) => ({ default: module.TradingPlanPage })),
)
const JournalPage = lazy(() =>
  loadPage(() => import('@/pages/Journal')).then((module) => ({ default: module.JournalPage })),
)
const CalendarPage = lazy(() =>
  loadPage(() => import('@/pages/Calendar')).then((module) => ({ default: module.CalendarPage })),
)
const StrategyPage = lazy(() =>
  loadPage(() => import('@/pages/Strategy')).then((module) => ({ default: module.StrategyPage })),
)
const MarginCalculatorPage = lazy(() =>
  loadPage(() => import('@/pages/MarginCalculator')).then((module) => ({ default: module.MarginCalculatorPage })),
)
const NewsTradePage = lazy(() =>
  loadPage(() => import('@/pages/MarginCalculator')).then((module) => ({ default: module.NewsTradePage })),
)
const RiskCalculatorPage = lazy(() =>
  loadPage(() => import('@/pages/RiskCalculator')).then((module) => ({ default: module.RiskCalculatorPage })),
)
const PsychologyPage = lazy(() =>
  loadPage(() => import('@/pages/Psychology')).then((module) => ({ default: module.PsychologyPage })),
)
const AnalyticsPage = lazy(() =>
  loadPage(() => import('@/pages/Analytics')).then((module) => ({ default: module.AnalyticsPage })),
)
const AdminPage = lazy(() =>
  loadPage(() => import('@/pages/Admin')).then((module) => ({ default: module.AdminPage })),
)
const SettingsPage = lazy(() =>
  loadPage(() => import('@/pages/Settings')).then((module) => ({ default: module.SettingsPage })),
)

function PageLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2 text-[11px] text-dim">
      <Loader2 size={14} className="animate-spin" />
      Loading this page…
    </div>
  )
}

/** If a page still fails to load (offline, site down), show a way out instead of a blank screen. */
class PageErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidUpdate(previous: { resetKey: string }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false })
    }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <AlertTriangle size={20} className="text-warn" />
        <div className="text-[13px] font-semibold text-fg">This page couldn't load</div>
        <p className="max-w-sm text-[11px] leading-relaxed text-dim">
          The app was probably updated, or the connection dropped. Reload to get the latest
          version. Your journal data is safe.
        </p>
        <Button variant="primary" onClick={hardReload}>
          <RotateCcw size={14} /> Reload
        </Button>
      </div>
    )
  }
}

function RoutedPages({ children }: { children: ReactNode }) {
  const location = useLocation()
  return <PageErrorBoundary resetKey={location.pathname}>{children}</PageErrorBoundary>
}

function ScrollToTop() {
  const location = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])
  return null
}

function AutoLock() {
  const { data, unlocked, lockNow } = useData()
  const lastActivity = useRef(Date.now())
  const minutes = data.settings.autoLockMinutes
  const lockEnabled = data.settings.lock.enabled

  useEffect(() => {
    if (!unlocked || !lockEnabled || minutes <= 0) return
    lastActivity.current = Date.now()

    const bump = () => {
      lastActivity.current = Date.now()
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const
    for (const event of events) {
      window.addEventListener(event, bump, { passive: true })
    }
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= minutes * 60_000) {
        lockNow()
      }
    }, 15_000)

    return () => {
      for (const event of events) {
        window.removeEventListener(event, bump)
      }
      window.clearInterval(timer)
    }
  }, [unlocked, lockEnabled, minutes, lockNow])

  return null
}

function Splash({ label = 'Opening your journal' }: { label?: string }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-4">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-60" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.07] blur-3xl" />
      <div className="relative flex flex-col items-center gap-4 animate-fade-in">
        <LogoMark size={54} />
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-dim">
          <Loader2 size={13} className="animate-spin" />
          {label}
        </div>
        <p className="max-w-xs text-center text-[10px] leading-relaxed text-dim">
          Loading your plans, trades and checklists.
        </p>
      </div>
    </div>
  )
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4">
      <div className="w-full max-w-md rounded-2xl border border-loss/25 bg-panel p-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-loss/10 text-loss">
          <AlertTriangle size={20} />
        </div>
        <h1 className="mt-3 text-sm font-semibold text-fg">The journal could not open</h1>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{message}</p>
        <div className="mt-4 rounded-lg border border-line bg-ink/50 px-3 py-2.5 text-left text-[10px] leading-relaxed text-dim">
          Your data is stored in this browser. Try a reload first. If the problem continues, check
          that site storage is enabled and that another tab is not holding an incompatible database
          version. Do not clear site data without a backup.
        </div>
        <Button variant="primary" className="mt-4 w-full" onClick={onRetry}>
          <RotateCcw size={14} /> Try again
        </Button>
      </div>
    </div>
  )
}

function JournalApp() {
  const { data, loading, loadError, reload, unlocked } = useData()

  if (loading) return <Splash />
  if (loadError) return <LoadError message={loadError} onRetry={() => void reload()} />
  if (data.settings.lock.enabled && !unlocked) return <LockScreen />

  return (
    <AppShell>
      <AutoLock />
      <ScrollToTop />
      <LegacyImportBanner />
      <RoutedPages>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/plan" element={<TradingPlanPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/strategy" element={<StrategyPage />} />
          <Route path="/risk" element={<RiskCalculatorPage />} />
          <Route path="/margin" element={<MarginCalculatorPage />} />
          <Route path="/news" element={<NewsTradePage />} />
          <Route path="/psychology" element={<PsychologyPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </RoutedPages>
    </AppShell>
  )
}

/** Decides who is using the app; each account only ever opens its own journal. */
function AccountGate() {
  const { enabled, loading, user, recovering } = useAuth()

  // Built without account keys: keep working as a private, browser-only journal.
  if (!enabled) {
    return (
      <DataProvider userId={null}>
        <HashRouter>
          <JournalApp />
        </HashRouter>
      </DataProvider>
    )
  }
  if (loading) return <Splash label="Checking your sign-in" />
  if (recovering) return <SetNewPasswordScreen />
  if (!user) return <AuthScreens />
  return <ApprovedGate key={user.id} userId={user.id} />
}

/** New accounts wait here until an admin approves them. */
function ApprovedGate({ userId }: { userId: string }) {
  const { status, recheck } = useApprovalStatus(userId)
  if (status == null) return <Splash label="Checking your account" />
  if (status !== 'approved') {
    return <PendingApprovalScreen rejected={status === 'rejected'} onRecheck={recheck} />
  }
  return (
    <DataProvider key={userId} userId={userId}>
      <HashRouter>
        <JournalApp />
      </HashRouter>
    </DataProvider>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AccountGate />
      </AuthProvider>
    </ToastProvider>
  )
}
