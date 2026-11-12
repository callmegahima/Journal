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
import { noteChange, noteDeletion, noteSettingsChange, setSyncUser } from '@/lib/sync'

/** Database used before accounts existed (one per browser). */
const LEGACY_DB_NAME = 'pa-trading-journal'
let dbName = LEGACY_DB_NAME
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

/** Point storage at the signed-in user's own database, so accounts never share data. */
export function setDatabaseUser(userId: string | null): void {
  const next = userId ? `${LEGACY_DB_NAME}-${userId}` : LEGACY_DB_NAME
  setSyncUser(userId)
  if (next === dbName) return
  if (dbPromise) void dbPromise.then((db) => db.close())
  dbPromise = null
  dbName = next
}

function getDb(): Promise<IDBPDatabase<JournalDB>> {
  if (!dbPromise) dbPromise = openJournalDb(dbName)
  return dbPromise
}

function openJournalDb(name: string): Promise<IDBPDatabase<JournalDB>> {
  {
    return openDB<JournalDB>(name, DB_VERSION, {
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
}

/**
 * Journal saved in this browser before accounts existed, or null if there is none.
 * Used once to offer moving it into the signed-in account.
 */
export async function loadLegacyData(): Promise<AppData | null> {
  if (typeof indexedDB.databases === 'function') {
    const list = await indexedDB.databases()
    if (!list.some((d) => d.name === LEGACY_DB_NAME)) return null
  }
  const db = await openJournalDb(LEGACY_DB_NAME)
  try {
    const [settings, plans, trades, checklists, psych, events, reflections] = await Promise.all([
      db.get('meta', 'settings'),
      db.getAll('plans'),
      db.getAll('trades'),
      db.getAll('checklists'),
      db.getAll('psych'),
      db.getAll('events'),
      db.getAll('reflections'),
    ])
    const total =
      plans.length + trades.length + checklists.length + psych.length + events.length + reflections.length
    if (total === 0) return null
    return {
      settings: hydrateSettings(settings ?? buildDefaultSettings()),
      plans,
      trades,
      checklists,
      psych,
      events,
      reflections,
    }
  } finally {
    db.close()
  }
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
  noteSettingsChange()
}

export async function persistRecord(name: CollectionName, value: unknown): Promise<void> {
  const db = await getDb()
  // idb's typed overloads need the concrete store; values are validated by callers.
  await db.put(name as 'plans', value as never)
  const id = (value as { id?: unknown }).id
  if (typeof id === 'string') noteChange(name, id)
}

export async function removeRecord(name: CollectionName, id: string): Promise<void> {
  const db = await getDb()
  await db.delete(name as 'plans', id)
  noteDeletion(name, id)
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

/** Save records that came from the cloud. Not noted as local changes, so they are not re-uploaded. */
export async function writePulledChanges(
  puts: { collection: string; record: unknown }[],
  deletes: { collection: string; id: string }[],
  settings: Settings | null,
): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(
    ['meta', 'plans', 'trades', 'checklists', 'psych', 'events', 'reflections'],
    'readwrite',
  )
  const writes: Promise<unknown>[] = []
  if (settings) writes.push(tx.objectStore('meta').put(settings, 'settings'))
  for (const { collection, record } of puts) {
    writes.push(tx.objectStore(collection as 'plans').put(record as never))
  }
  for (const { collection, id } of deletes) {
    writes.push(tx.objectStore(collection as 'plans').delete(id))
  }
  await Promise.all(writes)
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
