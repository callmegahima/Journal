import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppData,
  CalendarEvent,
  ChecklistRun,
  Plan,
  PsychEntry,
  Settings,
  Trade,
  WeeklyReflection,
} from '@/types'
import {
  clearAllData,
  clearBackupFolder,
  loadAllData,
  loadBackupFolder,
  persistRecord,
  persistSettings,
  removeRecord,
  replaceAllData,
  saveBackupFolder,
} from '@/lib/db'
import { buildDefaultSettings, hydrateSettings, SETTINGS_VERSION } from '@/lib/defaults'
import { verifyPasscode } from '@/lib/auth'
import { nowIso } from '@/lib/dates'
import {
  folderPermission,
  pickBackupFolder,
  supportsAutoBackup,
  writeAutoBackup,
  type AutoBackupFolder,
  type FolderPermission,
} from '@/lib/autosave'

export interface AutoBackupStatus {
  supported: boolean
  connected: boolean
  folderName: string | null
  permission: FolderPermission
  lastSavedAt: string | null
  saving: boolean
  error: string | null
}

interface DataContextValue {
  data: AppData
  loading: boolean
  loadError: string | null
  reload: () => Promise<void>
  saveSettings: (updater: Partial<Settings> | ((current: Settings) => Settings)) => Promise<void>
  savePlan: (plan: Plan) => Promise<void>
  deletePlan: (id: string) => Promise<void>
  saveTrade: (trade: Trade) => Promise<void>
  deleteTrade: (id: string) => Promise<void>
  saveChecklist: (run: ChecklistRun) => Promise<void>
  deleteChecklist: (id: string) => Promise<void>
  savePsych: (entry: PsychEntry) => Promise<void>
  deletePsych: (id: string) => Promise<void>
  saveEvent: (event: CalendarEvent) => Promise<void>
  deleteEvent: (id: string) => Promise<void>
  saveReflection: (reflection: WeeklyReflection) => Promise<void>
  deleteReflection: (id: string) => Promise<void>
  resetAll: () => Promise<void>
  exportData: () => string
  importData: (raw: string) => Promise<void>
  autoBackup: AutoBackupStatus
  chooseAutoBackupFolder: () => Promise<void>
  reconnectAutoBackupFolder: () => Promise<void>
  disconnectAutoBackupFolder: () => Promise<void>
  saveAutoBackupNow: () => Promise<boolean>
  unlocked: boolean
  unlock: (passcode: string) => Promise<boolean>
  lockNow: () => void
}

const emptyData = (): AppData => ({
  settings: buildDefaultSettings(),
  plans: [],
  trades: [],
  checklists: [],
  psych: [],
  events: [],
  reflections: [],
})

function serializeBackup(data: AppData): string {
  return JSON.stringify(
    {
      app: 'PA Trading Journal',
      version: SETTINGS_VERSION,
      exportedAt: nowIso(),
      data,
    },
    null,
    2,
  )
}

const AUTO_SAVE_DELAY = 800

const DataContext = createContext<DataContextValue | null>(null)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPlan(value: unknown): value is Plan {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.dateTime === 'string' &&
    typeof value.direction === 'string'
  )
}

function isTrade(value: unknown): value is Trade {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.date === 'string' &&
    typeof value.entry === 'number' &&
    typeof value.pnl === 'number'
  )
}

function isChecklist(value: unknown): value is ChecklistRun {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    Array.isArray(value.items) &&
    typeof value.overallPct === 'number'
  )
}

function isPsych(value: unknown): value is PsychEntry {
  return isRecord(value) && typeof value.id === 'string' && typeof value.date === 'string'
}

function isEvent(value: unknown): value is CalendarEvent {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.date === 'string' &&
    typeof value.title === 'string'
  )
}

function isReflection(value: unknown): value is WeeklyReflection {
  return isRecord(value) && typeof value.id === 'string' && typeof value.weekStart === 'string'
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [autoBackup, setAutoBackup] = useState<AutoBackupStatus>(() => {
    const supported = supportsAutoBackup()
    return {
      supported,
      connected: false,
      folderName: null,
      permission: supported ? 'prompt' : 'denied',
      lastSavedAt: null,
      saving: false,
      error: null,
    }
  })
  const dataRef = useRef(data)
  const folderRef = useRef<AutoBackupFolder | null>(null)
  const autoSaveTimer = useRef<number | null>(null)
  const savingRef = useRef(false)
  const dirtyRef = useRef(false)
  const scheduleRef = useRef<() => void>(() => {})

  const runAutoSave = useCallback(async (): Promise<boolean> => {
    const folder = folderRef.current
    if (!folder) return false
    if (savingRef.current) {
      dirtyRef.current = true
      return false
    }
    savingRef.current = true
    setAutoBackup((current) => ({ ...current, saving: true }))
    try {
      const permission = await folderPermission(folder)
      if (permission !== 'granted') {
        setAutoBackup((current) => ({
          ...current,
          permission,
          saving: false,
          error:
            permission === 'denied'
              ? 'Folder access was denied. Choose the folder again to resume automatic backups.'
              : null,
        }))
        return false
      }
      await writeAutoBackup(folder, serializeBackup(dataRef.current))
      if (folderRef.current === folder) {
        setAutoBackup((current) => ({
          ...current,
          permission: 'granted',
          lastSavedAt: nowIso(),
          saving: false,
          error: null,
        }))
      }
      return true
    } catch (error) {
      setAutoBackup((current) => ({
        ...current,
        saving: false,
        error:
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Browser permission for the backup folder expired. Reconnect the folder to continue.'
            : error instanceof Error
              ? error.message
              : 'The backup file could not be written.',
      }))
      return false
    } finally {
      savingRef.current = false
      if (dirtyRef.current) {
        dirtyRef.current = false
        scheduleRef.current()
      }
    }
  }, [])

  const scheduleAutoSave = useCallback(() => {
    if (!folderRef.current) return
    if (autoSaveTimer.current !== null) window.clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = window.setTimeout(() => {
      autoSaveTimer.current = null
      void runAutoSave()
    }, AUTO_SAVE_DELAY)
  }, [runAutoSave])

  useEffect(() => {
    scheduleRef.current = scheduleAutoSave
  }, [scheduleAutoSave])

  const commit = useCallback(
    (next: AppData) => {
      dataRef.current = next
      setData(next)
      scheduleAutoSave()
    },
    [scheduleAutoSave],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const loaded = await loadAllData()
      dataRef.current = loaded
      setData(loaded)
      setUnlocked(!loaded.settings.lock.enabled)

      try {
        const folder = await loadBackupFolder()
        if (folder) {
          folderRef.current = folder
          const permission = await folderPermission(folder)
          setAutoBackup((current) => ({
            ...current,
            connected: true,
            folderName: folder.name,
            permission,
            error: null,
          }))
          if (permission === 'granted') void runAutoSave()
        }
      } catch {
        // A missing or unreadable folder handle should not stop the journal loading.
      }
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'The local database could not be opened.',
      )
    } finally {
      setLoading(false)
    }
  }, [runAutoSave])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(
    () => () => {
      if (autoSaveTimer.current !== null) window.clearTimeout(autoSaveTimer.current)
    },
    [],
  )

  const saveSettings = useCallback(
    async (updater: Partial<Settings> | ((current: Settings) => Settings)) => {
      const current = dataRef.current
      const nextSettings =
        typeof updater === 'function'
          ? updater(current.settings)
          : { ...current.settings, ...updater }
      await persistSettings(nextSettings)
      commit({ ...current, settings: nextSettings })
    },
    [commit],
  )

  const savePlan = useCallback(
    async (plan: Plan) => {
      const stamped = { ...plan, updatedAt: nowIso() }
      await persistRecord('plans', stamped)
      const current = dataRef.current
      const exists = current.plans.some((p) => p.id === stamped.id)
      commit({
        ...current,
        plans: exists
          ? current.plans.map((p) => (p.id === stamped.id ? stamped : p))
          : [...current.plans, stamped],
      })
    },
    [commit],
  )

  const deletePlan = useCallback(
    async (id: string) => {
      await removeRecord('plans', id)
      const current = dataRef.current
      const affected = current.checklists.filter((c) => c.planId === id)
      const updatedChecklists = current.checklists.map((c) =>
        c.planId === id ? { ...c, planId: undefined } : c,
      )
      await Promise.all(
        affected.map((c) => persistRecord('checklists', { ...c, planId: undefined })),
      )
      commit({
        ...current,
        plans: current.plans.filter((p) => p.id !== id),
        checklists: updatedChecklists,
      })
    },
    [commit],
  )

  const saveTrade = useCallback(
    async (trade: Trade) => {
      const stamped = { ...trade, updatedAt: nowIso() }
      await persistRecord('trades', stamped)
      const current = dataRef.current
      const exists = current.trades.some((t) => t.id === stamped.id)
      commit({
        ...current,
        trades: exists
          ? current.trades.map((t) => (t.id === stamped.id ? stamped : t))
          : [...current.trades, stamped],
      })
    },
    [commit],
  )

  const deleteTrade = useCallback(
    async (id: string) => {
      await removeRecord('trades', id)
      const current = dataRef.current

      const updatedPlans = current.plans.map((plan) =>
        plan.tradeId === id
          ? { ...plan, tradeId: undefined, status: 'Planned' as const, updatedAt: nowIso() }
          : plan,
      )
      const changedPlans = updatedPlans.filter(
        (plan, index) => plan !== current.plans[index],
      )
      await Promise.all(changedPlans.map((plan) => persistRecord('plans', plan)))

      const updatedChecklists = current.checklists.map((run) =>
        run.tradeId === id ? { ...run, tradeId: undefined } : run,
      )
      const changedChecklists = updatedChecklists.filter(
        (run, index) => run !== current.checklists[index],
      )
      await Promise.all(
        changedChecklists.map((run) => persistRecord('checklists', run)),
      )

      commit({
        ...current,
        trades: current.trades.filter((t) => t.id !== id),
        plans: updatedPlans,
        checklists: updatedChecklists,
      })
    },
    [commit],
  )

  const saveChecklist = useCallback(
    async (run: ChecklistRun) => {
      const stamped = { ...run, updatedAt: nowIso() }
      await persistRecord('checklists', stamped)
      const current = dataRef.current
      const exists = current.checklists.some((c) => c.id === stamped.id)
      commit({
        ...current,
        checklists: exists
          ? current.checklists.map((c) => (c.id === stamped.id ? stamped : c))
          : [...current.checklists, stamped],
      })
    },
    [commit],
  )

  const deleteChecklist = useCallback(
    async (id: string) => {
      await removeRecord('checklists', id)
      const current = dataRef.current
      const updatedPlans = current.plans.map((plan) =>
        plan.checklistId === id ? { ...plan, checklistId: undefined } : plan,
      )
      const updatedTrades = current.trades.map((trade) =>
        trade.checklistId === id ? { ...trade, checklistId: undefined } : trade,
      )
      await Promise.all([
        ...updatedPlans
          .filter((plan, index) => plan !== current.plans[index])
          .map((plan) => persistRecord('plans', plan)),
        ...updatedTrades
          .filter((trade, index) => trade !== current.trades[index])
          .map((trade) => persistRecord('trades', trade)),
      ])
      commit({
        ...current,
        checklists: current.checklists.filter((c) => c.id !== id),
        plans: updatedPlans,
        trades: updatedTrades,
      })
    },
    [commit],
  )

  const savePsych = useCallback(
    async (entry: PsychEntry) => {
      const stamped = { ...entry, updatedAt: nowIso() }
      await persistRecord('psych', stamped)
      const current = dataRef.current
      const exists = current.psych.some((p) => p.id === stamped.id)
      commit({
        ...current,
        psych: exists
          ? current.psych.map((p) => (p.id === stamped.id ? stamped : p))
          : [...current.psych, stamped],
      })
    },
    [commit],
  )

  const deletePsych = useCallback(
    async (id: string) => {
      await removeRecord('psych', id)
      const current = dataRef.current
      commit({ ...current, psych: current.psych.filter((p) => p.id !== id) })
    },
    [commit],
  )

  const saveEvent = useCallback(
    async (event: CalendarEvent) => {
      const stamped = { ...event, updatedAt: nowIso() }
      await persistRecord('events', stamped)
      const current = dataRef.current
      const exists = current.events.some((e) => e.id === stamped.id)
      commit({
        ...current,
        events: exists
          ? current.events.map((e) => (e.id === stamped.id ? stamped : e))
          : [...current.events, stamped],
      })
    },
    [commit],
  )

  const deleteEvent = useCallback(
    async (id: string) => {
      await removeRecord('events', id)
      const current = dataRef.current
      commit({ ...current, events: current.events.filter((e) => e.id !== id) })
    },
    [commit],
  )

  const saveReflection = useCallback(
    async (reflection: WeeklyReflection) => {
      const stamped = { ...reflection, updatedAt: nowIso() }
      await persistRecord('reflections', stamped)
      const current = dataRef.current
      const exists = current.reflections.some((r) => r.id === stamped.id)
      commit({
        ...current,
        reflections: exists
          ? current.reflections.map((r) => (r.id === stamped.id ? stamped : r))
          : [...current.reflections, stamped],
      })
    },
    [commit],
  )

  const deleteReflection = useCallback(
    async (id: string) => {
      await removeRecord('reflections', id)
      const current = dataRef.current
      commit({ ...current, reflections: current.reflections.filter((r) => r.id !== id) })
    },
    [commit],
  )

  const resetAll = useCallback(async () => {
    await clearAllData()
    const settings = buildDefaultSettings()
    await persistSettings(settings)
    commit(emptyData())
    setUnlocked(true)
  }, [commit])

  const exportData = useCallback(() => serializeBackup(dataRef.current), [])

  const chooseAutoBackupFolder = useCallback(async () => {
    const folder = await pickBackupFolder()
    const permission = await folderPermission(folder, true)
    if (permission !== 'granted') {
      throw new Error('Folder access was not granted, so automatic backups are still off.')
    }
    await saveBackupFolder(folder)
    folderRef.current = folder
    setAutoBackup((current) => ({
      ...current,
      connected: true,
      folderName: folder.name,
      permission: 'granted',
      error: null,
    }))
    await runAutoSave()
  }, [runAutoSave])

  const reconnectAutoBackupFolder = useCallback(async () => {
    const folder = folderRef.current
    if (!folder) throw new Error('Choose a backup folder first.')
    const permission = await folderPermission(folder, true)
    setAutoBackup((current) => ({ ...current, permission }))
    if (permission !== 'granted') {
      throw new Error('Folder access was not granted.')
    }
    await runAutoSave()
  }, [runAutoSave])

  const disconnectAutoBackupFolder = useCallback(async () => {
    if (autoSaveTimer.current !== null) {
      window.clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = null
    }
    dirtyRef.current = false
    folderRef.current = null
    await clearBackupFolder()
    setAutoBackup((current) => ({
      ...current,
      connected: false,
      folderName: null,
      permission: 'prompt',
      lastSavedAt: null,
      saving: false,
      error: null,
    }))
  }, [])

  const saveAutoBackupNow = useCallback(async () => {
    if (!folderRef.current) throw new Error('Choose a backup folder first.')
    return runAutoSave()
  }, [runAutoSave])

  const importData = useCallback(
    async (raw: string) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        throw new Error('That file is not valid JSON.')
      }
      if (!isRecord(parsed)) throw new Error('Unexpected backup format.')
      const payload = isRecord(parsed.data) ? parsed.data : parsed
      if (!isRecord(payload)) throw new Error('Unexpected backup format.')

      const settings = hydrateSettings(
        isRecord(payload.settings) ? (payload.settings as Partial<Settings>) : undefined,
      )
      const next: AppData = {
        settings,
        plans: Array.isArray(payload.plans) ? payload.plans.filter(isPlan) : [],
        trades: Array.isArray(payload.trades) ? payload.trades.filter(isTrade) : [],
        checklists: Array.isArray(payload.checklists)
          ? payload.checklists.filter(isChecklist)
          : [],
        psych: Array.isArray(payload.psych) ? payload.psych.filter(isPsych) : [],
        events: Array.isArray(payload.events) ? payload.events.filter(isEvent) : [],
        reflections: Array.isArray(payload.reflections)
          ? payload.reflections.filter(isReflection)
          : [],
      }

      await replaceAllData(next)
      commit(next)
      setUnlocked(!settings.lock.enabled)
    },
    [commit],
  )

  const unlock = useCallback(async (passcode: string) => {
    const current = dataRef.current
    const ok = await verifyPasscode(passcode, current.settings.lock)
    if (ok) setUnlocked(true)
    return ok
  }, [])

  const lockNow = useCallback(() => {
    setUnlocked(false)
  }, [])

  const reload = useCallback(async () => {
    await load()
  }, [load])

  const value = useMemo<DataContextValue>(
    () => ({
      data,
      loading,
      loadError,
      reload,
      saveSettings,
      savePlan,
      deletePlan,
      saveTrade,
      deleteTrade,
      saveChecklist,
      deleteChecklist,
      savePsych,
      deletePsych,
      saveEvent,
      deleteEvent,
      saveReflection,
      deleteReflection,
      resetAll,
      exportData,
      importData,
      autoBackup,
      chooseAutoBackupFolder,
      reconnectAutoBackupFolder,
      disconnectAutoBackupFolder,
      saveAutoBackupNow,
      unlocked,
      unlock,
      lockNow,
    }),
    [
      data,
      loading,
      loadError,
      reload,
      saveSettings,
      savePlan,
      deletePlan,
      saveTrade,
      deleteTrade,
      saveChecklist,
      deleteChecklist,
      savePsych,
      deletePsych,
      saveEvent,
      deleteEvent,
      saveReflection,
      deleteReflection,
      resetAll,
      exportData,
      importData,
      autoBackup,
      chooseAutoBackupFolder,
      reconnectAutoBackupFolder,
      disconnectAutoBackupFolder,
      saveAutoBackupNow,
      unlocked,
      unlock,
      lockNow,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used inside DataProvider')
  return context
}
