import { lazy, Suspense, useEffect, useRef } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { DataProvider, useData } from '@/store/DataContext'
import { AuthProvider, useAuth } from '@/store/AuthContext'
import { AuthScreens, SetNewPasswordScreen } from '@/components/auth/AuthScreens'
import { LegacyImportBanner } from '@/components/settings/AccountCard'
import { ToastProvider } from '@/store/ToastContext'
import { AppShell } from '@/components/layout/AppShell'
import { LockScreen } from '@/components/LockScreen'
import { LogoMark } from '@/components/Logo'
import { Button } from '@/components/ui/primitives'

const DashboardPage = lazy(() =>
  import('@/pages/Dashboard').then((module) => ({ default: module.DashboardPage })),
)
const TradingPlanPage = lazy(() =>
  import('@/pages/TradingPlan').then((module) => ({ default: module.TradingPlanPage })),
)
const JournalPage = lazy(() =>
  import('@/pages/Journal').then((module) => ({ default: module.JournalPage })),
)
const CalendarPage = lazy(() =>
  import('@/pages/Calendar').then((module) => ({ default: module.CalendarPage })),
)
const StrategyPage = lazy(() =>
  import('@/pages/Strategy').then((module) => ({ default: module.StrategyPage })),
)
const RiskCalculatorPage = lazy(() =>
  import('@/pages/RiskCalculator').then((module) => ({ default: module.RiskCalculatorPage })),
)
const PsychologyPage = lazy(() =>
  import('@/pages/Psychology').then((module) => ({ default: module.PsychologyPage })),
)
const AnalyticsPage = lazy(() =>
  import('@/pages/Analytics').then((module) => ({ default: module.AnalyticsPage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/Settings').then((module) => ({ default: module.SettingsPage })),
)

function PageLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2 text-[11px] text-dim">
      <Loader2 size={14} className="animate-spin" />
      Loading this page…
    </div>
  )
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
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/plan" element={<TradingPlanPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/strategy" element={<StrategyPage />} />
          <Route path="/risk" element={<RiskCalculatorPage />} />
          <Route path="/psychology" element={<PsychologyPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
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
  return (
    <DataProvider key={user.id} userId={user.id}>
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
