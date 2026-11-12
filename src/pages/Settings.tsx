import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FolderOpen,
  FolderSync,
  Gauge,
  HardDrive,
  Info,
  KeyRound,
  Lock,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Unplug,
  Upload,
  User,
  Wrench,
} from 'lucide-react'
import type { InstrumentSpec } from '@/types'
import { useData } from '@/store/DataContext'
import { AccountCard } from '@/components/settings/AccountCard'
import { useToast } from '@/store/ToastContext'
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
import { StatCard } from '@/components/ui/StatCard'
import { Tabs } from '@/components/ui/Tabs'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Hint, NumberField, SelectField } from '@/components/ui/form'
import {
  createPasscode,
  passcodeStrength,
  verifyPasscode,
} from '@/lib/auth'
import { storageEstimate } from '@/lib/db'
import { downloadFile, tradesToCsv } from '@/lib/csv'
import { AUTO_BACKUP_FILE } from '@/lib/autosave'
import { TIMEZONE_OPTIONS, formatDateTime, timezoneShort, todayKey } from '@/lib/dates'
import { money, num } from '@/lib/format'
import { uid } from '@/lib/utils'
import {
  calculatePnl,
  calculateTradeRisk,
  roundTo,
  tickValueFor,
  valuePerPriceUnit,
} from '@/lib/calc'

type SettingsTab = 'account' | 'risk' | 'instruments' | 'security' | 'data'

type PassMode = 'set' | 'remove'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function SectionNote({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-muted">{children}</p>
}

export function SettingsPage() {
  const {
    data,
    saveSettings,
    exportData,
    importData,
    resetAll,
    autoBackup,
    chooseAutoBackupFolder,
    reconnectAutoBackupFolder,
    disconnectAutoBackupFolder,
    saveAutoBackupNow,
    saveTrade,
  } = useData()
  const { toast } = useToast()
  const { settings, trades, plans, checklists, psych, events, reflections } = data
  const [tab, setTab] = useState<SettingsTab>('account')

  const [profile, setProfile] = useState<{
    displayName: string
    startingBalance: number | null
    timezone: string
  }>({
    displayName: settings.displayName,
    startingBalance: settings.startingBalance,
    timezone: settings.timezone,
  })
  const [risk, setRisk] = useState({
    defaultRiskPct: settings.defaultRiskPct,
    maxRiskPct: settings.maxRiskPct,
    dailyLossLimitPct: settings.dailyLossLimitPct,
    weeklyLossLimitPct: settings.weeklyLossLimitPct,
    minRR: settings.minRR,
    leverage: settings.leverage,
  })
  const [instruments, setInstruments] = useState<InstrumentSpec[]>(
    settings.instruments.map((instrument) => ({ ...instrument })),
  )
  const [activeInstrumentId, setActiveInstrumentId] = useState(settings.activeInstrumentId)
  const [autoLock, setAutoLock] = useState(settings.autoLockMinutes)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [deleteInstrument, setDeleteInstrument] = useState<InstrumentSpec | null>(null)
  const [pendingImport, setPendingImport] = useState<{ name: string; raw: string } | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [passMode, setPassMode] = useState<PassMode | null>(null)
  const [passForm, setPassForm] = useState({
    current: '',
    next: '',
    confirm: '',
    show: false,
    busy: false,
    error: '',
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setProfile({
      displayName: settings.displayName,
      startingBalance: settings.startingBalance,
      timezone: settings.timezone,
    })
    setRisk({
      defaultRiskPct: settings.defaultRiskPct,
      maxRiskPct: settings.maxRiskPct,
      dailyLossLimitPct: settings.dailyLossLimitPct,
      weeklyLossLimitPct: settings.weeklyLossLimitPct,
      minRR: settings.minRR,
      leverage: settings.leverage,
    })
    setInstruments(settings.instruments.map((instrument) => ({ ...instrument })))
    setActiveInstrumentId(settings.activeInstrumentId)
    setAutoLock(settings.autoLockMinutes)
  }, [settings])

  const refreshStorage = async () => {
    setStorage(await storageEstimate())
  }

  useEffect(() => {
    void refreshStorage()
  }, [])

  const equity = useMemo(
    () => settings.startingBalance + trades.reduce((sum, trade) => sum + trade.pnl, 0),
    [settings.startingBalance, trades],
  )

  const saveProfile = async () => {
    const balance = profile.startingBalance ?? 0
    if (!profile.displayName.trim()) {
      toast('Give the journal a display name first.', 'error')
      return
    }
    if (!Number.isFinite(balance) || balance <= 0) {
      toast('Starting balance must be greater than zero.', 'error')
      return
    }
    await saveSettings({
      displayName: profile.displayName.trim(),
      startingBalance: balance,
      timezone: profile.timezone,
    })
    toast('Profile saved.', 'success')
  }

  const saveRisk = async () => {
    if (!(risk.defaultRiskPct > 0) || !(risk.maxRiskPct > 0)) {
      toast('Risk percentages must be greater than zero.', 'error')
      return
    }
    if (risk.defaultRiskPct > risk.maxRiskPct) {
      toast('Default risk cannot be higher than the maximum risk per trade.', 'error')
      return
    }
    if (risk.maxRiskPct > 100 || risk.dailyLossLimitPct > 100 || risk.weeklyLossLimitPct > 100) {
      toast('Loss limits and maximum risk cannot exceed 100%.', 'error')
      return
    }
    if (!(risk.minRR > 0)) {
      toast('Minimum reward-to-risk must be greater than zero.', 'error')
      return
    }
    if (!(risk.leverage > 0)) {
      toast('Account leverage must be greater than zero (e.g. 100 for 1:100).', 'error')
      return
    }
    await saveSettings(risk)
    toast('Risk rules saved.', 'success')
  }

  const updateInstrument = (id: string, patch: Partial<InstrumentSpec>) => {
    setInstruments((current) =>
      current.map((instrument) =>
        instrument.id === id
          ? (() => {
              const next = { ...instrument, ...patch }
              return { ...next, tickValue: tickValueFor(next) }
            })()
          : instrument,
      ),
    )
  }

  const addInstrument = () => {
    const next: InstrumentSpec = {
      id: uid('inst'),
      symbol: 'CUSTOM',
      name: 'Custom instrument',
      contractSize: 100,
      tickSize: 0.01,
      tickValue: 1,
      minLot: 0.01,
      lotStep: 0.01,
      maxLot: 100,
    }
    setInstruments((current) => [...current, next])
    setActiveInstrumentId((current) => current || next.id)
  }

  const [recalcOpen, setRecalcOpen] = useState(false)

  const recalculateTrades = async () => {
    const specs = data.settings.instruments
    let updated = 0
    for (const trade of data.trades) {
      const spec = specs.find((s) => s.id === trade.instrumentId)
      if (!spec || !(trade.lots > 0)) continue
      const { pnl, result } = calculatePnl({
        direction: trade.direction,
        entry: trade.entry,
        exit: trade.exit,
        lots: trade.lots,
        spec,
        commission: trade.commission,
        swap: trade.swap,
      })
      const grossPnl = calculatePnl({
        direction: trade.direction,
        entry: trade.entry,
        exit: trade.exit,
        lots: trade.lots,
        spec,
      }).gross
      // Keep a manually entered risk for trades without a stop loss.
      const riskAmount =
        trade.sl != null && trade.sl > 0
          ? calculateTradeRisk(trade.entry, trade.sl, trade.lots, spec)
          : trade.riskAmount
      const rMultiple = riskAmount > 0 ? roundTo(pnl / riskAmount, 2) : 0
      if (pnl === trade.pnl && riskAmount === trade.riskAmount) continue
      await saveTrade({ ...trade, grossPnl, pnl, result, riskAmount, rMultiple })
      updated += 1
    }
    setRecalcOpen(false)
    toast(
      updated > 0
        ? `Recalculated P/L for ${updated} trade${updated === 1 ? '' : 's'}.`
        : 'All trades already match the contract specification.',
      'success',
    )
  }

  const saveInstruments = async () => {
    if (instruments.length === 0) {
      toast('Keep at least one instrument in the journal.', 'error')
      return
    }
    for (const instrument of instruments) {
      if (!instrument.symbol.trim() || !instrument.name.trim()) {
        toast('Every instrument needs a symbol and a name.', 'error')
        return
      }
      if (
        !(instrument.contractSize > 0) ||
        !(instrument.tickSize > 0) ||
        !(instrument.tickValue > 0) ||
        !(instrument.minLot > 0) ||
        !(instrument.lotStep > 0) ||
        !(instrument.maxLot > 0)
      ) {
        toast(`Check the contract specification for ${instrument.symbol}: all values must be positive.`, 'error')
        return
      }
      if (instrument.maxLot < instrument.minLot) {
        toast(`Maximum lot for ${instrument.symbol} cannot be below the minimum lot.`, 'error')
        return
      }
    }
    const symbols = instruments.map((instrument) => instrument.symbol.trim().toUpperCase())
    if (new Set(symbols).size !== symbols.length) {
      toast('Each instrument needs a unique symbol.', 'error')
      return
    }
    const active =
      instruments.find((instrument) => instrument.id === activeInstrumentId)?.id ??
      instruments[0].id
    const cleaned = instruments.map((instrument) => ({
      ...instrument,
      symbol: instrument.symbol.trim().toUpperCase(),
      name: instrument.name.trim(),
    }))
    await saveSettings({ instruments: cleaned, activeInstrumentId: active })
    setActiveInstrumentId(active)
    toast('Instrument settings saved.', 'success')
  }

  const confirmDeleteInstrument = async () => {
    if (!deleteInstrument) return
    const remaining = instruments.filter((instrument) => instrument.id !== deleteInstrument.id)
    setInstruments(remaining)
    if (activeInstrumentId === deleteInstrument.id) {
      setActiveInstrumentId(remaining[0]?.id ?? '')
    }
    setDeleteInstrument(null)
    toast(
      'Instrument removed from the draft. Save instrument settings to persist the change.',
      'info',
    )
  }

  const openPass = (mode: PassMode) => {
    setPassForm({ current: '', next: '', confirm: '', show: false, busy: false, error: '' })
    setPassMode(mode)
  }

  const submitPass = async (event: FormEvent) => {
    event.preventDefault()
    if (!passMode) return
    const lock = settings.lock
    setPassForm((current) => ({ ...current, busy: true, error: '' }))
    try {
      if (lock.enabled) {
        const ok = await verifyPasscode(passForm.current, lock)
        if (!ok) {
          setPassForm((current) => ({
            ...current,
            busy: false,
            error: 'Current passcode is incorrect.',
          }))
          return
        }
      }
      if (passMode === 'remove') {
        await saveSettings({ lock: { enabled: false } })
        toast('Passcode lock removed.', 'success')
        setPassMode(null)
        return
      }
      if (passForm.next.length < 6) {
        setPassForm((current) => ({
          ...current,
          busy: false,
          error: 'Use at least 6 characters for the passcode.',
        }))
        return
      }
      if (passForm.next !== passForm.confirm) {
        setPassForm((current) => ({
          ...current,
          busy: false,
          error: 'The two passcodes do not match.',
        }))
        return
      }
      const nextLock = await createPasscode(passForm.next)
      await saveSettings({ lock: nextLock })
      toast(lock.enabled ? 'Passcode changed.' : 'Passcode lock enabled.', 'success')
      setPassMode(null)
    } catch (error) {
      setPassForm((current) => ({
        ...current,
        busy: false,
        error:
          error instanceof Error
            ? error.message
            : 'Could not update the passcode on this device.',
      }))
    } finally {
      setPassForm((current) => ({ ...current, busy: false }))
    }
  }

  const saveAutoLock = async () => {
    await saveSettings({ autoLockMinutes: autoLock })
    toast(
      autoLock === 0
        ? 'Auto-lock disabled.'
        : `Auto-lock set to ${autoLock} minute${autoLock === 1 ? '' : 's'}.`,
      'success',
    )
  }

  const exportBackup = () => {
    downloadFile(
      `pa-journal-backup-${todayKey(settings.timezone)}.json`,
      exportData(),
      'application/json',
    )
    toast('Full journal backup exported.', 'success')
  }

  const exportTrades = () => {
    if (trades.length === 0) {
      toast('There are no trades to export yet.', 'info')
      return
    }
    downloadFile(
      `pa-journal-trades-${todayKey(settings.timezone)}.csv`,
      tradesToCsv(trades, settings, settings.timezone),
      'text/csv;charset=utf-8',
    )
    toast(`Exported ${trades.length} trades to CSV.`, 'success')
  }

  const connectBackupFolder = async () => {
    try {
      await chooseAutoBackupFolder()
      toast('Folder connected. The backup file will be kept up to date.', 'success')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      toast(
        error instanceof Error ? error.message : 'Could not connect that folder.',
        'error',
      )
    }
  }

  const reconnectBackupFolder = async () => {
    try {
      await reconnectAutoBackupFolder()
      toast('Folder access restored. Backup updated.', 'success')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      toast(
        error instanceof Error ? error.message : 'Could not restore folder access.',
        'error',
      )
    }
  }

  const saveBackupNow = async () => {
    try {
      const ok = await saveAutoBackupNow()
      toast(
        ok ? 'Backup file updated.' : 'The backup file could not be updated.',
        ok ? 'success' : 'error',
      )
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'The backup file could not be updated.',
        'error',
      )
    }
  }

  const disconnectBackupFolder = async () => {
    try {
      await disconnectAutoBackupFolder()
      toast('Automatic folder backup turned off. The existing file was left in place.', 'info')
    } catch {
      toast('Could not disconnect the backup folder.', 'error')
    }
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const raw = await file.text()
      setPendingImport({ name: file.name, raw })
    } catch {
      toast('That file could not be read.', 'error')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const storagePct = storage && storage.quota > 0 ? (storage.usage / storage.quota) * 100 : 0
  const passStrength = passcodeStrength(passForm.next)
  const lockEnabled = settings.lock.enabled
  const derivedRisk = {
    defaultAmount: (settings.startingBalance * risk.defaultRiskPct) / 100,
    maxAmount: (settings.startingBalance * risk.maxRiskPct) / 100,
    dailyAmount: (settings.startingBalance * risk.dailyLossLimitPct) / 100,
    weeklyAmount: (settings.startingBalance * risk.weeklyLossLimitPct) / 100,
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Settings"
        title="Configure the journal honestly"
        description="Your balance, timezone, risk limits and contract specification. Your journal is private to your login — no broker connection, no trading credentials requested."
      />

      <Tabs
        tabs={[
          { id: 'account', label: 'Profile & account', icon: <User size={13} /> },
          { id: 'risk', label: 'Risk rules', icon: <Gauge size={13} /> },
          { id: 'instruments', label: 'Instruments', icon: <Wrench size={13} /> },
          { id: 'security', label: 'Passcode & lock', icon: <Lock size={13} /> },
          { id: 'data', label: 'Backup & data', icon: <Database size={13} /> },
        ]}
        value={tab}
        onChange={(value) => setTab(value as SettingsTab)}
      />

      {tab === 'account' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <AccountCard />
            <Card>
              <CardHeader
                title="Profile and account"
                subtitle="The starting balance is the baseline for equity and risk calculations, not a live account balance."
                icon={<User size={14} />}
                action={
                  <Button variant="primary" size="sm" onClick={saveProfile}>
                    Save profile
                  </Button>
                }
              />
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="settings-name">
                    Display name
                  </label>
                  <input
                    id="settings-name"
                    className="input"
                    value={profile.displayName}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, displayName: event.target.value }))
                    }
                    placeholder="How the journal greets you"
                    autoComplete="off"
                  />
                </div>
                <SelectField
                  label="Display timezone"
                  value={profile.timezone}
                  onChange={(value) =>
                    setProfile((current) => ({ ...current, timezone: value }))
                  }
                  options={TIMEZONE_OPTIONS.map((zone) => ({
                    value: zone.value,
                    label: zone.label,
                  }))}
                />
                <NumberField
                  label="Starting balance"
                  value={profile.startingBalance}
                  onChange={(value) =>
                    setProfile((current) => ({ ...current, startingBalance: value }))
                  }
                  min={0.01}
                  prefix="$"
                  hint="Default template is $50 USD. Use your real starting equity."
                />
                <div>
                  <span className="label">Currency</span>
                  <div className="input flex items-center text-muted">USD — fixed for this journal</div>
                </div>
              </div>
              <div className="border-t border-line px-4 py-3">
                <InfoNote tone="blue" icon={<Info size={12} />}>
                  All dates are stored as UTC instants and displayed in the timezone above. Date-only
                  fields use the calendar date in this timezone. Changing the timezone can move a
                  late-night trade to the previous or next day.
                </InfoNote>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Data honesty"
                subtitle="What this app is and is not."
                icon={<ShieldCheck size={14} />}
              />
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {[
                  {
                    title: 'Manual by design',
                    text: 'Prices, fills and results are entered by you. The app never places, modifies or closes a trade.',
                  },
                  {
                    title: 'No broker credentials',
                    text: 'The only login is your journal account. The app never asks for broker, MT5 or API credentials.',
                  },
                  {
                    title: 'No profit promises',
                    text: 'Analytics describe recorded history. They do not predict future results or guarantee an edge.',
                  },
                  {
                    title: 'Private to you',
                    text: 'Only your login can read your journal. A copy is kept in this browser for offline use; your account keeps it safe across devices.',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-lg border border-line/80 bg-ink/35 p-3"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg">
                      <CheckCircle2 size={12} className="text-profit" />
                      {item.title}
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted">{item.text}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <StatCard
              label="Current equity"
              value={money(equity)}
              sub={`${money(settings.startingBalance)} starting + recorded P/L`}
              icon={<Gauge size={14} />}
            />
            <StatCard
              label="Timezone"
              value={timezoneShort(profile.timezone)}
              sub={TIMEZONE_OPTIONS.find((zone) => zone.value === profile.timezone)?.label}
              tone="accent"
            />
            <Card>
              <CardHeader title="Journal activity" icon={<HardDrive size={14} />} />
              <div className="space-y-1.5 p-4">
                {[
                  ['Trades', trades.length],
                  ['Plans', plans.length],
                  ['Checklist runs', checklists.length],
                  ['Check-ins', psych.length],
                  ['Calendar events', events.length],
                  ['Weekly reflections', reflections.length],
                ].map(([label, count]) => (
                  <div key={String(label)} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted">{label}</span>
                    <span className="font-mono font-semibold text-fg">{count}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'risk' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader
              title="Risk rules"
              subtitle="These rules feed the standalone calculator and the checklist decision. They never place a trade."
              icon={<Gauge size={14} />}
              action={
                <Button variant="primary" size="sm" onClick={saveRisk}>
                  Save risk rules
                </Button>
              }
            />
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <NumberField
                label="Default risk per trade"
                value={risk.defaultRiskPct}
                onChange={(value) =>
                  setRisk((current) => ({ ...current, defaultRiskPct: value ?? 0 }))
                }
                min={0.01}
                max={100}
                step={0.1}
                suffix="%"
                hint="Pre-filled in new plans and the calculator."
              />
              <NumberField
                label="Maximum risk per trade"
                value={risk.maxRiskPct}
                onChange={(value) =>
                  setRisk((current) => ({ ...current, maxRiskPct: value ?? 0 }))
                }
                min={0.01}
                max={100}
                step={0.1}
                suffix="%"
                hint="The checklist blocks anything above this."
              />
              <NumberField
                label="Daily loss limit"
                value={risk.dailyLossLimitPct}
                onChange={(value) =>
                  setRisk((current) => ({ ...current, dailyLossLimitPct: value ?? 0 }))
                }
                min={0.01}
                max={100}
                step={0.1}
                suffix="%"
                hint="Of the balance at the start of the day."
              />
              <NumberField
                label="Weekly loss limit"
                value={risk.weeklyLossLimitPct}
                onChange={(value) =>
                  setRisk((current) => ({ ...current, weeklyLossLimitPct: value ?? 0 }))
                }
                min={0.01}
                max={100}
                step={0.1}
                suffix="%"
                hint="Of the balance at the start of the week."
              />
              <NumberField
                label="Minimum reward-to-risk"
                value={risk.minRR}
                onChange={(value) =>
                  setRisk((current) => ({ ...current, minRR: value ?? 0 }))
                }
                min={0.1}
                step={0.1}
                suffix="R"
                hint="A 1:2 minimum means the target must be at least twice the stop distance."
              />
              <NumberField
                label="Account leverage"
                value={risk.leverage}
                onChange={(value) =>
                  setRisk((current) => ({ ...current, leverage: value ?? 0 }))
                }
                min={1}
                step={1}
                prefix="1:"
                hint="Same as in MT5. Used only for the margin estimate: lots × contract size × price ÷ leverage."
              />
              <div className="rounded-lg border border-line/80 bg-ink/40 p-3">
                <div className="text-[10px] uppercase tracking-[0.08em] text-dim">
                  Daily vs weekly
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  {risk.dailyLossLimitPct > risk.weeklyLossLimitPct
                    ? 'Warning: the daily limit is larger than the weekly limit, which makes the weekly rule redundant.'
                    : 'The weekly limit is at least as large as the daily limit.'}
                </p>
              </div>
            </div>
            <div className="border-t border-line px-4 py-3">
              <InfoNote tone="amber" icon={<AlertTriangle size={12} />}>
                Percentage limits are applied to the balance at the start of the day or week, not to
                the current equity after a loss. Keep the values realistic for the account size.
              </InfoNote>
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title="What these rules mean"
                subtitle={`Based on the saved starting balance of ${money(settings.startingBalance)}.`}
                icon={<ShieldCheck size={14} />}
              />
              <div className="space-y-2 p-4">
                {[
                  ['Default risk', derivedRisk.defaultAmount, risk.defaultRiskPct],
                  ['Maximum risk', derivedRisk.maxAmount, risk.maxRiskPct],
                  ['Daily loss limit', derivedRisk.dailyAmount, risk.dailyLossLimitPct],
                  ['Weekly loss limit', derivedRisk.weeklyAmount, risk.weeklyLossLimitPct],
                ].map(([label, amount, percentage]) => (
                  <div
                    key={String(label)}
                    className="flex items-center justify-between gap-3 text-[11px]"
                  >
                    <span className="text-muted">{label}</span>
                    <span className="font-mono font-semibold text-fg">
                      {money(amount as number)}
                      <span className="ml-1 text-[9px] font-normal text-dim">
                        ({num(percentage as number, 2)}%)
                      </span>
                    </span>
                  </div>
                ))}
                <Divider />
                <p className="text-[10px] leading-relaxed text-dim">
                  These are not recommendations. They are the numbers currently stored in your
                  journal.
                </p>
              </div>
            </Card>

            <InfoNote tone="blue" icon={<Info size={12} />}>
              The checklist decision is mechanical: numerical blockers produce NO TRADE, unchecked
              mandatory items produce WAIT, and only fully satisfied rules produce READY. READY is
              not a signal to enter.
            </InfoNote>
          </div>
        </div>
      ) : null}

      {tab === 'instruments' ? (
        <div className="space-y-4">
          <InfoNote tone="amber" icon={<AlertTriangle size={12} />}>
            The XAUUSD values are templates only. Confirm contract size, tick size, tick value,
            minimum lot, lot step and maximum lot with your broker. A wrong tick value directly
            changes every position size the calculator produces.
          </InfoNote>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-muted">
              {instruments.length} instrument{instruments.length === 1 ? '' : 's'} configured
            </div>
            <div className="flex items-center gap-2">
              <Button variant="soft" onClick={addInstrument}>
                <Plus size={14} /> Add instrument
              </Button>
              <Button variant="primary" onClick={saveInstruments}>
                Save instrument settings
              </Button>
              <Button variant="soft" onClick={() => setRecalcOpen(true)}>
                Recalculate all trades
              </Button>
            </div>
            <ConfirmDialog
              open={recalcOpen}
              onClose={() => setRecalcOpen(false)}
              onConfirm={recalculateTrades}
              title="Recalculate P/L for all trades?"
              description="Every trade's P/L, risk and R multiple will be recomputed as (exit − entry) × contract size × lots using the saved instrument settings. Commission and swap saved on each trade are kept; manually typed P/L values are replaced. Export a backup first if you want to keep the old values."
              confirmLabel="Recalculate"
              tone="primary"
            />
          </div>

          {instruments.map((instrument) => {
            const isActive = instrument.id === activeInstrumentId
            const builtin = instrument.id === 'xauusd'
            return (
              <Card key={instrument.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {instrument.symbol || 'Unnamed instrument'}
                      {isActive ? <Badge variant="blue">Active</Badge> : null}
                      {builtin ? <Badge variant="slate">Built-in template</Badge> : null}
                    </span>
                  }
                  subtitle={
                    isActive
                      ? 'Used by default in new plans and the trade journal.'
                      : 'Not the default instrument. New plans use the active instrument.'
                  }
                  icon={<Wrench size={14} />}
                  action={
                    <div className="flex items-center gap-1">
                      {!isActive ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setActiveInstrumentId(instrument.id)}
                        >
                          Make active
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={builtin || instruments.length <= 1}
                        onClick={() => setDeleteInstrument(instrument)}
                        aria-label={`Delete ${instrument.symbol}`}
                      >
                        <Trash2 size={12} className={builtin ? '' : 'text-loss'} />
                      </Button>
                    </div>
                  }
                />
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="label" htmlFor={`symbol-${instrument.id}`}>
                      Symbol
                    </label>
                    <input
                      id={`symbol-${instrument.id}`}
                      className="input font-mono"
                      value={instrument.symbol}
                      onChange={(event) =>
                        updateInstrument(instrument.id, { symbol: event.target.value })
                      }
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`name-${instrument.id}`}>
                      Name
                    </label>
                    <input
                      id={`name-${instrument.id}`}
                      className="input"
                      value={instrument.name}
                      onChange={(event) =>
                        updateInstrument(instrument.id, { name: event.target.value })
                      }
                      autoComplete="off"
                    />
                  </div>
                  <NumberField
                    label="Contract size"
                    value={instrument.contractSize}
                    onChange={(value) =>
                      updateInstrument(instrument.id, { contractSize: value ?? 0 })
                    }
                    min={0}
                    hint="Units per 1.00 lot"
                  />
                  <NumberField
                    label="Tick size"
                    value={instrument.tickSize}
                    onChange={(value) =>
                      updateInstrument(instrument.id, { tickSize: value ?? 0 })
                    }
                    min={0}
                    step={0.00001}
                    hint="Price increment"
                  />
                  <NumberField
                    label="Tick value"
                    value={tickValueFor(instrument)}
                    onChange={() => {}}
                    disabled
                    min={0}
                    step={0.01}
                    prefix="$"
                    hint="Auto: contract size × tick size"
                  />
                  <NumberField
                    label="Minimum lot"
                    value={instrument.minLot}
                    onChange={(value) =>
                      updateInstrument(instrument.id, { minLot: value ?? 0 })
                    }
                    min={0}
                    step={0.01}
                  />
                  <NumberField
                    label="Lot step"
                    value={instrument.lotStep}
                    onChange={(value) =>
                      updateInstrument(instrument.id, { lotStep: value ?? 0 })
                    }
                    min={0}
                    step={0.01}
                  />
                  <NumberField
                    label="Maximum lot"
                    value={instrument.maxLot}
                    onChange={(value) =>
                      updateInstrument(instrument.id, { maxLot: value ?? 0 })
                    }
                    min={0}
                    step={0.01}
                  />
                </div>
                <div className="border-t border-line px-4 py-2.5 text-[10px] text-dim">
                  Value per 1.00 price move: {money(valuePerPriceUnit(instrument))} per
                  lot ({money(valuePerPriceUnit(instrument) * 0.01)} at 0.01 lot) · {instrument.tickSize > 0 ? num(1 / instrument.tickSize, 0) : '—'} ticks per
                  price unit
                </div>
              </Card>
            )
          })}

          {instruments.length === 0 ? (
            <Card className="p-4">
              <SectionNote>
                There is no instrument configured. Add one before using the calculator or logging a
                trade.
              </SectionNote>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'security' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Passcode lock"
                subtitle="Optional device-local protection. The passcode is hashed with PBKDF2-SHA256; it is never stored in plain text."
                icon={<Lock size={14} />}
                action={
                  <Badge variant={lockEnabled ? 'green' : 'slate'}>
                    {lockEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                }
              />
              <div className="space-y-3 p-4">
                <SectionNote>
                  {lockEnabled
                    ? 'The journal asks for your passcode after a reload or when it auto-locks. There is no passcode recovery — export a backup you can restore elsewhere.'
                    : 'Without a passcode, anyone with access to this browser profile can open the journal. Enabling one is recommended on a shared device.'}
                </SectionNote>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => openPass('set')}>
                    <KeyRound size={14} />
                    {lockEnabled ? 'Change passcode' : 'Set passcode'}
                  </Button>
                  {lockEnabled ? (
                    <Button variant="danger" onClick={() => openPass('remove')}>
                      <LockKeyhole size={14} /> Remove passcode
                    </Button>
                  ) : null}
                </div>
                {!crypto.subtle ? (
                  <InfoNote tone="red" icon={<AlertTriangle size={12} />}>
                    Secure hashing is unavailable in this context. Open the app on localhost or
                    HTTPS to enable the passcode lock.
                  </InfoNote>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Auto-lock"
                subtitle="Locks the journal after a period without mouse, keyboard or touch activity."
                icon={<Lock size={14} />}
                action={
                  <Button size="sm" variant="soft" onClick={saveAutoLock}>
                    Save
                  </Button>
                }
              />
              <div className="p-4">
                <SelectField
                  label="Lock after"
                  value={String(autoLock)}
                  onChange={(value) => setAutoLock(Number(value))}
                  options={[
                    { value: '0', label: 'Never (not recommended)' },
                    { value: '1', label: '1 minute' },
                    { value: '5', label: '5 minutes' },
                    { value: '15', label: '15 minutes' },
                    { value: '30', label: '30 minutes' },
                    { value: '60', label: '60 minutes' },
                  ]}
                />
                <div className="mt-2">
                  <Hint>
                    Auto-lock only has an effect when a passcode is enabled. It does not encrypt the
                    database at rest; it hides the interface after inactivity.
                  </Hint>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="No recovery"
                subtitle="Read this before enabling a passcode."
                icon={<AlertTriangle size={14} />}
              />
              <div className="space-y-2 p-4">
                <InfoNote tone="red" icon={<AlertTriangle size={12} />}>
                  If you forget the passcode, the journal cannot be recovered from this browser. The
                  only fallback is a JSON backup restored on a device where you can access the data.
                </InfoNote>
                <InfoNote tone="slate" icon={<Info size={12} />}>
                  The passcode protects the interface, not the underlying browser storage. Someone
                  with full access to your operating system profile or developer tools may still
                  read local data. Use device-level encryption if that matters.
                </InfoNote>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <StatCard
              label="Lock status"
              value={lockEnabled ? 'Protected' : 'Open'}
              tone={lockEnabled ? 'profit' : 'warn'}
              sub={lockEnabled ? 'Passcode required on unlock' : 'No passcode configured'}
              icon={<Lock size={14} />}
            />
            <StatCard
              label="Auto-lock"
              value={autoLock === 0 ? 'Off' : `${autoLock} min`}
              sub="Saved setting, applied after activity"
              icon={<LockKeyhole size={14} />}
            />
            <InfoNote tone="blue" icon={<ShieldCheck size={12} />}>
              This journal never asks for broker credentials, API keys or card details. If a page
              claiming to be this app does, close it.
            </InfoNote>
          </div>
        </div>
      ) : null}

      {tab === 'data' ? (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader
                title="Export"
                subtitle="A JSON backup contains everything; CSV contains trades only."
                icon={<Download size={14} />}
              />
              <div className="grid gap-2 p-4 sm:grid-cols-2">
                <Button variant="primary" onClick={exportBackup}>
                  <FileJson size={14} /> Export JSON backup
                </Button>
                <Button variant="soft" onClick={exportTrades}>
                  <Download size={14} /> Export all trades (CSV)
                </Button>
              </div>
              <div className="border-t border-line px-4 py-3">
                <InfoNote tone="blue" icon={<Info size={12} />}>
                  Keep the JSON backup somewhere safe. It is not encrypted, so store it like any other
                  private financial record.
                </InfoNote>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Storage"
                subtitle="Estimated browser storage used by this site."
                icon={<HardDrive size={14} />}
              />
              <div className="p-4">
                {storage ? (
                  <>
                    <div className="flex items-end justify-between gap-2">
                      <span className="font-mono text-lg font-semibold text-fg">
                        {formatBytes(storage.usage)}
                      </span>
                      <span className="text-[10px] text-dim">
                        of {formatBytes(storage.quota)} quota
                      </span>
                    </div>
                    <ProgressBar
                      value={storagePct}
                      tone={storagePct > 80 ? 'red' : storagePct > 60 ? 'amber' : 'blue'}
                      className="mt-2"
                    />
                    <p className="mt-2 text-[10px] leading-relaxed text-dim">
                      Screenshots are the largest contributor. Clearing browser data deletes the
                      journal, so export a backup first.
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] leading-relaxed text-muted">
                    This browser does not expose a storage estimate. The journal still works, but it
                    cannot show how much space it uses.
                  </p>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Automatic backup to this computer"
              subtitle="Connect a folder and the journal keeps a JSON backup file up to date there."
              icon={<FolderSync size={14} />}
              action={
                <Badge
                  variant={
                    !autoBackup.supported
                      ? 'slate'
                      : !autoBackup.connected
                        ? 'slate'
                        : autoBackup.permission === 'granted'
                          ? 'green'
                          : 'amber'
                  }
                >
                  {!autoBackup.supported
                    ? 'Not supported'
                    : !autoBackup.connected
                      ? 'Off'
                      : autoBackup.permission === 'granted'
                        ? 'Connected'
                        : 'Needs permission'}
                </Badge>
              }
            />
            <div className="space-y-3 p-4">
              {!autoBackup.supported ? (
                <InfoNote tone="amber" icon={<AlertTriangle size={12} />}>
                  This browser cannot save directly to a folder. Use Chrome or Edge on a desktop
                  computer, or export a backup manually.
                </InfoNote>
              ) : (
                <>
                  {autoBackup.connected ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                      <span className="flex items-center gap-1.5 text-fg">
                        <FolderOpen size={12} className="text-accent" />
                        <span className="font-mono">{autoBackup.folderName}</span>
                      </span>
                      <span className="font-mono text-dim">/ {AUTO_BACKUP_FILE}</span>
                      {autoBackup.lastSavedAt ? (
                        <span className="text-dim">
                          Last saved{' '}
                          {formatDateTime(
                            autoBackup.lastSavedAt,
                            settings.timezone,
                            'yyyy-MM-dd HH:mm',
                          )}
                        </span>
                      ) : (
                        <span className="text-dim">Not saved yet</span>
                      )}
                      {autoBackup.saving ? <span className="text-accent">Saving…</span> : null}
                    </div>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-muted">
                      Pick a folder once. The journal then keeps{' '}
                      <span className="font-mono text-fg">{AUTO_BACKUP_FILE}</span> up to date there.
                      The file is a normal JSON backup you can restore from Import below.
                    </p>
                  )}

                  {autoBackup.error ? (
                    <InfoNote tone="red" icon={<AlertTriangle size={12} />}>
                      {autoBackup.error}
                    </InfoNote>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    {!autoBackup.connected ? (
                      <Button variant="primary" onClick={() => void connectBackupFolder()}>
                        <FolderOpen size={14} /> Choose folder
                      </Button>
                    ) : (
                      <>
                        {autoBackup.permission !== 'granted' ? (
                          <Button variant="primary" onClick={() => void reconnectBackupFolder()}>
                            <RefreshCw size={14} /> Restore access
                          </Button>
                        ) : null}
                        <Button
                          variant="soft"
                          onClick={() => void saveBackupNow()}
                          disabled={autoBackup.saving}
                        >
                          <Save size={14} /> Save now
                        </Button>
                        <Button variant="soft" onClick={() => void connectBackupFolder()}>
                          <FolderSync size={14} /> Change folder
                        </Button>
                        <Button variant="ghost" onClick={() => void disconnectBackupFolder()}>
                          <Unplug size={14} /> Disconnect
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="border-t border-line px-4 py-3">
              <InfoNote tone="blue" icon={<Info size={12} />}>
                The browser may ask for folder access again after a reload — click Restore access.
                The backup file is not encrypted, so store it like any other private financial
                record.
              </InfoNote>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Import / restore"
              subtitle="Importing replaces the entire journal in this browser."
              icon={<Upload size={14} />}
            />
            <div className="flex flex-wrap items-center gap-3 p-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
              <Button variant="soft" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} /> Choose JSON backup
              </Button>
              <span className="text-[10px] text-dim">
                Existing plans, trades, checklists, psychology entries, events and reflections will
                be replaced.
              </span>
            </div>
            <div className="border-t border-line px-4 py-3">
              <InfoNote tone="amber" icon={<AlertTriangle size={12} />}>
                Export a current backup before importing. The import validates the file structure and
                refuses malformed JSON, but it cannot detect a backup from an unrelated app.
              </InfoNote>
            </div>
          </Card>

          <Card className="border-loss/25">
            <CardHeader
              title="Danger zone"
              subtitle="Delete everything in this browser and return to the default template settings."
              icon={<AlertTriangle size={14} />}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="max-w-xl text-[11px] leading-relaxed text-muted">
                This removes all plans, trades, checklists, screenshots, psychology entries, calendar
                events, reflections and the passcode. It cannot be undone without a backup.
              </div>
              <Button variant="danger" onClick={() => setResetOpen(true)}>
                <Trash2 size={14} /> Reset all data
              </Button>
            </div>
          </Card>

          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ['Trades', trades.length],
              ['Plans', plans.length],
              ['Checklists', checklists.length],
              ['Check-ins', psych.length],
              ['Events', events.length],
              ['Reflections', reflections.length],
            ].map(([label, count]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-line/80 bg-panel/60 px-3 py-2.5"
              >
                <div className="text-[9px] uppercase tracking-[0.08em] text-dim">{label}</div>
                <div className="mt-0.5 font-mono text-[15px] font-semibold text-fg">{count}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Modal
        open={passMode !== null}
        onClose={() => setPassMode(null)}
        size="sm"
        title={passMode === 'remove' ? 'Remove passcode lock' : lockEnabled ? 'Change passcode' : 'Set passcode'}
        description={
          passMode === 'remove'
            ? 'Confirm your current passcode. The journal will open without a lock afterwards.'
            : 'Use at least 6 characters. There is no recovery if you forget it.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPassMode(null)} disabled={passForm.busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="pass-form"
              variant={passMode === 'remove' ? 'danger' : 'primary'}
              loading={passForm.busy}
            >
              {passMode === 'remove' ? 'Remove lock' : 'Save passcode'}
            </Button>
          </>
        }
      >
        <form id="pass-form" onSubmit={submitPass} className="space-y-3" autoComplete="off">
          {lockEnabled ? (
            <div>
              <label className="label" htmlFor="pass-current">
                Current passcode
              </label>
              <input
                id="pass-current"
                type={passForm.show ? 'text' : 'password'}
                className="input"
                value={passForm.current}
                onChange={(event) =>
                  setPassForm((current) => ({
                    ...current,
                    current: event.target.value,
                    error: '',
                  }))
                }
                autoFocus
              />
            </div>
          ) : null}

          {passMode === 'set' ? (
            <>
              <div>
                <label className="label" htmlFor="pass-next">
                  New passcode
                </label>
                <div className="relative">
                  <input
                    id="pass-next"
                    type={passForm.show ? 'text' : 'password'}
                    className="input pr-10"
                    value={passForm.next}
                    onChange={(event) =>
                      setPassForm((current) => ({
                        ...current,
                        next: event.target.value,
                        error: '',
                      }))
                    }
                    autoFocus={!lockEnabled}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-dim transition hover:text-fg"
                    onClick={() =>
                      setPassForm((current) => ({ ...current, show: !current.show }))
                    }
                    aria-label={passForm.show ? 'Hide passcodes' : 'Show passcodes'}
                  >
                    {passForm.show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <ProgressBar
                    value={(passStrength.score / 5) * 100}
                    tone={
                      passStrength.score <= 1
                        ? 'red'
                        : passStrength.score <= 3
                          ? 'amber'
                          : 'green'
                    }
                    height="h-1"
                  />
                  <span className="w-12 shrink-0 text-right text-[9px] text-dim">
                    {passStrength.label}
                  </span>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="pass-confirm">
                  Confirm new passcode
                </label>
                <input
                  id="pass-confirm"
                  type={passForm.show ? 'text' : 'password'}
                  className="input"
                  value={passForm.confirm}
                  onChange={(event) =>
                    setPassForm((current) => ({
                      ...current,
                      confirm: event.target.value,
                      error: '',
                    }))
                  }
                />
              </div>
              <InfoNote tone="amber" icon={<AlertTriangle size={12} />}>
                Store this passcode somewhere safe. Without it, a data export is still possible only
                from an already unlocked session.
              </InfoNote>
            </>
          ) : null}

          {passForm.error ? (
            <p className="text-[11px] font-medium text-loss">{passForm.error}</p>
          ) : null}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteInstrument)}
        onClose={() => setDeleteInstrument(null)}
        onConfirm={confirmDeleteInstrument}
        title="Remove this instrument?"
        description={`${deleteInstrument?.symbol ?? 'This instrument'} will be removed from the draft list. Trades already logged with it keep their data. Save instrument settings afterwards to persist the change.`}
        confirmLabel="Remove instrument"
      />

      <ConfirmDialog
        open={Boolean(pendingImport)}
        onClose={() => setPendingImport(null)}
        onConfirm={async () => {
          if (!pendingImport) return
          try {
            await importData(pendingImport.raw)
            toast(`Imported ${pendingImport.name}.`, 'success')
            await refreshStorage()
            setPendingImport(null)
          } catch (error) {
            toast(
              error instanceof Error ? error.message : 'The backup could not be imported.',
              'error',
            )
            setPendingImport(null)
          }
        }}
        title="Replace all data with this backup?"
        description={`Importing “${pendingImport?.name ?? 'backup'}” replaces every plan, trade, checklist, psychology entry, event and reflection in this browser. Export a current backup first if you are unsure.`}
        confirmLabel="Replace and import"
        requireText="IMPORT"
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={async () => {
          await resetAll()
          await refreshStorage()
          setTab('account')
          toast('All journal data was reset to defaults.', 'success')
        }}
        title="Reset the entire journal?"
        description="This permanently deletes all local data and returns every setting to its default, including the XAUUSD template and no passcode. It cannot be undone without a backup."
        confirmLabel="Reset everything"
        requireText="RESET"
      />

      <div className="pb-2 text-[10px] leading-relaxed text-dim">
        PA Trading Journal · local-first, manual trading journal · {timezoneShort(settings.timezone)}{' '}
        · all amounts in USD. This app does not execute trades or connect to a broker.
      </div>
    </div>
  )
}
