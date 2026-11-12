import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
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
import { buildDefaultSettings, hydrateSettings } from '@/lib/defaults'
import type { AutoBackupFolder } from '@/lib/autosave'

const DB_NAME = 'pa-trading-journal'
const DB_VERSION = 2

interface JournalDB extends DBSchema {
  meta: {
    key: string
    value: Settings
  }
  plans: {
    key: string
    value: Plan
    indexes: { 'by-status': string }
  }
  trades: {
    key: string
    value: Trade
    indexes: { 'by-date': string }
  }
  checklists: {
    key: string
    value: ChecklistRun
  }
  psych: {
    key: string
    value: PsychEntry
    indexes: { 'by-date': string }
  }
  events: {
    key: string
    value: CalendarEvent
    indexes: { 'by-date': string }
  }
  reflections: {
    key: string
    value: WeeklyReflection
  }
  backup: {
    key: string
    value: AutoBackupFolder
  }
}

type CollectionName = 'plans' | 'trades' | 'checklists' | 'psych' | 'events' | 'reflections'

let dbPromise: Promise<IDBPDatabase<JournalDB>> | null = null

function getDb(): Promise<IDBPDatabase<JournalDB>> {
  if (!dbPromise) {
    dbPromise = openDB<JournalDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta')
        }
        if (!db.objectStoreNames.contains('plans')) {
          db.createObjectStore('plans', { keyPath: 'id' }).createIndex('by-status', 'status')
        }
        if (!db.objectStoreNames.contains('trades')) {
          db.createObjectStore('trades', { keyPath: 'id' }).createIndex('by-date', 'date')
        }
        if (!db.objectStoreNames.contains('checklists')) {
          db.createObjectStore('checklists', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('psych')) {
          db.createObjectStore('psych', { keyPath: 'id' }).createIndex('by-date', 'date')
        }
        if (!db.objectStoreNames.contains('events')) {
          db.createObjectStore('events', { keyPath: 'id' }).createIndex('by-date', 'date')
        }
        if (!db.objectStoreNames.contains('reflections')) {
          db.createObjectStore('reflections', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('backup')) {
          db.createObjectStore('backup')
        }
      },
    })
  }
  return dbPromise
}

export async function loadAllData(): Promise<AppData> {
  const db = await getDb()
  const [settings, plans, trades, checklists, psych, events, reflections] =
    await Promise.all([
      db.get('meta', 'settings'),
      db.getAll('plans'),
      db.getAll('trades'),
      db.getAll('checklists'),
      db.getAll('psych'),
      db.getAll('events'),
      db.getAll('reflections'),
    ])

  return {
    settings: hydrateSettings(settings ?? buildDefaultSettings()),
    plans: plans ?? [],
    trades: trades ?? [],
    checklists: checklists ?? [],
    psych: psych ?? [],
    events: events ?? [],
    reflections: reflections ?? [],
  }
}

export async function persistSettings(settings: Settings): Promise<void> {
  const db = await getDb()
  await db.put('meta', settings, 'settings')
}

export async function persistRecord(name: CollectionName, value: unknown): Promise<void> {
  const db = await getDb()
  // idb's typed overloads need the concrete store; values are validated by callers.
  await db.put(name as 'plans', value as never)
}

export async function removeRecord(name: CollectionName, id: string): Promise<void> {
  const db = await getDb()
  await db.delete(name as 'plans', id)
}

export async function replaceAllData(data: AppData): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(
    ['meta', 'plans', 'trades', 'checklists', 'psych', 'events', 'reflections'],
    'readwrite',
  )
  await Promise.all([
    tx.objectStore('meta').clear(),
    tx.objectStore('plans').clear(),
    tx.objectStore('trades').clear(),
    tx.objectStore('checklists').clear(),
    tx.objectStore('psych').clear(),
    tx.objectStore('events').clear(),
    tx.objectStore('reflections').clear(),
  ])
  await tx.objectStore('meta').put(data.settings, 'settings')
  await Promise.all([
    ...data.plans.map((item) => tx.objectStore('plans').put(item)),
    ...data.trades.map((item) => tx.objectStore('trades').put(item)),
    ...data.checklists.map((item) => tx.objectStore('checklists').put(item)),
    ...data.psych.map((item) => tx.objectStore('psych').put(item)),
    ...data.events.map((item) => tx.objectStore('events').put(item)),
    ...data.reflections.map((item) => tx.objectStore('reflections').put(item)),
  ])
  await tx.done
}

export async function clearAllData(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(
    ['meta', 'plans', 'trades', 'checklists', 'psych', 'events', 'reflections'],
    'readwrite',
  )
  await Promise.all([
    tx.objectStore('meta').clear(),
    tx.objectStore('plans').clear(),
    tx.objectStore('trades').clear(),
    tx.objectStore('checklists').clear(),
    tx.objectStore('psych').clear(),
    tx.objectStore('events').clear(),
    tx.objectStore('reflections').clear(),
  ])
  await tx.done
}

export async function loadBackupFolder(): Promise<AutoBackupFolder | null> {
  const db = await getDb()
  return (await db.get('backup', 'folder')) ?? null
}

export async function saveBackupFolder(folder: AutoBackupFolder): Promise<void> {
  const db = await getDb()
  await db.put('backup', folder, 'folder')
}

export async function clearBackupFolder(): Promise<void> {
  const db = await getDb()
  await db.delete('backup', 'folder')
}

export async function storageEstimate(): Promise<{
  usage: number
  quota: number
} | null> {
  if (!navigator.storage?.estimate) return null
  try {
    const estimate = await navigator.storage.estimate()
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
  } catch {
    return null
  }
}
