import type { AppData, Settings } from '@/types'
import { requireSupabase } from '@/lib/supabase'

/**
 * Account sync with Supabase.
 *
 * The journal stays local-first (IndexedDB, one database per signed-in user). Every local
 * change is noted here as "dirty"; a sync pushes dirty records to the user's rows and pulls
 * anything changed on their other devices. Each record keeps the copy with the newer
 * `updatedAt`. Row Level Security on the server limits every query to the signed-in user.
 */

export type SyncCollection = 'plans' | 'trades' | 'checklists' | 'psych' | 'events' | 'reflections'
export const SYNC_COLLECTIONS: SyncCollection[] = [
  'plans',
  'trades',
  'checklists',
  'psych',
  'events',
  'reflections',
]

interface SyncState {
  /** Highest server_updated_at already pulled. */
  cursor: string
  /** "collection:id" → when it was changed locally (not yet pushed). */
  dirty: Record<string, string>
  /** "collection:id" → deletedAt for records deleted locally since the last push. */
  deleted: Record<string, string>
  settingsDirty: boolean
  settingsUpdatedAt: string
  lastSyncAt: string | null
}

const EPOCH = new Date(0).toISOString()
let activeUser: string | null = null

export function setSyncUser(userId: string | null): void {
  activeUser = userId
}

function key(userId: string): string {
  return `pa-journal-cloud:${userId}`
}

export function loadSyncState(userId = activeUser): SyncState {
  const empty: SyncState = {
    cursor: EPOCH,
    dirty: {},
    deleted: {},
    settingsDirty: false,
    settingsUpdatedAt: EPOCH,
    lastSyncAt: null,
  }
  if (!userId) return empty
  try {
    const raw = localStorage.getItem(key(userId))
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<SyncState>) } : empty
  } catch {
    return empty
  }
}

function saveSyncState(state: SyncState, userId = activeUser): void {
  if (!userId) return
  try {
    localStorage.setItem(key(userId), JSON.stringify(state))
  } catch {
    // ignore — sync simply retries everything next time
  }
}

function update(mutator: (state: SyncState) => void): void {
  if (!activeUser) return
  const state = loadSyncState()
  mutator(state)
  saveSyncState(state)
}

/* ------------------------------------------------------------ change notes (called by db.ts) */

export function noteChange(collection: string, id: string): void {
  if (!SYNC_COLLECTIONS.includes(collection as SyncCollection)) return
  update((state) => {
    const k = `${collection}:${id}`
    state.dirty[k] = new Date().toISOString()
    delete state.deleted[k]
  })
}

export function noteDeletion(collection: string, id: string): void {
  if (!SYNC_COLLECTIONS.includes(collection as SyncCollection)) return
  update((state) => {
    const k = `${collection}:${id}`
    delete state.dirty[k]
    state.deleted[k] = new Date().toISOString()
  })
}

export function noteSettingsChange(): void {
  update((state) => {
    state.settingsDirty = true
    state.settingsUpdatedAt = new Date().toISOString()
  })
}

/** Mark every record as needing upload — used after importing a backup or device data. */
export function noteAllChanged(data: AppData): void {
  update((state) => {
    for (const collection of SYNC_COLLECTIONS) {
      for (const record of data[collection] as { id: string }[]) {
        state.dirty[`${collection}:${record.id}`] = new Date().toISOString()
      }
    }
    state.settingsDirty = true
    state.settingsUpdatedAt = new Date().toISOString()
  })
}

export function pendingChanges(): number {
  const state = loadSyncState()
  return (
    Object.keys(state.dirty).length +
    Object.keys(state.deleted).length +
    (state.settingsDirty ? 1 : 0)
  )
}

/* ------------------------------------------------------------ sync */

interface Stamped {
  id: string
  updatedAt?: string
}

interface RecordRow {
  collection: SyncCollection
  id: string
  data: Stamped | null
  deleted: boolean
  updated_at: string
  server_updated_at: string
}

/** Settings that belong to one device and are never synced. */
function sharedSettings(settings: Settings): Omit<Settings, 'lock' | 'autoLockMinutes'> {
  const { lock: _lock, autoLockMinutes: _autoLock, ...shared } = settings
  return shared
}

/** A record that arrived from another device (record null = deleted there). */
export interface PulledChange {
  collection: SyncCollection
  id: string
  record: Stamped | null
}

export interface SyncResult {
  changes: PulledChange[]
  /** Newer settings from another device, or null. */
  settings: Settings | null
  pushed: number
  pulled: number
}

const PAGE = 500

export async function syncWithCloud(local: AppData): Promise<SyncResult> {
  const client = requireSupabase()
  const syncStartedAt = new Date().toISOString()
  const state = loadSyncState()
  const pushedDirty: Record<string, string> = { ...state.dirty }
  const pushedDeleted: Record<string, string> = { ...state.deleted }
  let data = local
  let pulledSettings: Settings | null = null
  const changes: PulledChange[] = []
  let pulled = 0
  /** Keys whose local copy was replaced or removed by a newer remote one. */
  const pulledKeys = new Set<string>()

  // ---- pull settings
  const settingsRes = await client
    .from('journal_settings')
    .select('data, updated_at')
    .maybeSingle()
  if (settingsRes.error) throw settingsRes.error
  const remoteSettings = settingsRes.data as { data: Settings; updated_at: string } | null
  if (
    remoteSettings &&
    !state.settingsDirty &&
    remoteSettings.updated_at > state.settingsUpdatedAt
  ) {
    pulledSettings = {
      ...data.settings,
      ...remoteSettings.data,
      lock: data.settings.lock,
      autoLockMinutes: data.settings.autoLockMinutes,
    }
    data = { ...data, settings: pulledSettings }
    state.settingsUpdatedAt = remoteSettings.updated_at
  }

  // ---- pull records changed since the cursor
  const collections = Object.fromEntries(
    SYNC_COLLECTIONS.map((c) => [c, new Map((data[c] as Stamped[]).map((r) => [r.id, r]))]),
  ) as Record<SyncCollection, Map<string, Stamped>>

  for (;;) {
    const res = await client
      .from('journal_records')
      .select('collection, id, data, deleted, updated_at, server_updated_at')
      .gt('server_updated_at', state.cursor)
      .order('server_updated_at', { ascending: true })
      .limit(PAGE)
    if (res.error) throw res.error
    const rows = (res.data ?? []) as RecordRow[]
    for (const row of rows) {
      const map = collections[row.collection]
      if (!map) continue
      const k = `${row.collection}:${row.id}`
      const localRecord = map.get(row.id)
      const localStamp = localRecord?.updatedAt ?? EPOCH
      const localDeletedAt = state.deleted[k]
      if (row.deleted) {
        if (localRecord && localStamp <= row.updated_at && !state.dirty[k]) {
          map.delete(row.id)
          pulledKeys.add(k)
          changes.push({ collection: row.collection, id: row.id, record: null })
          pulled += 1
        }
      } else if (row.data) {
        const newerThanLocal = !localRecord || row.updated_at > localStamp
        const newerThanDeletion = !localDeletedAt || row.updated_at > localDeletedAt
        if (newerThanLocal && newerThanDeletion) {
          map.set(row.id, row.data)
          delete state.dirty[k]
          delete state.deleted[k]
          pulledKeys.add(k)
          changes.push({ collection: row.collection, id: row.id, record: row.data })
          pulled += 1
        }
      }
      if (row.server_updated_at > state.cursor) state.cursor = row.server_updated_at
    }
    if (rows.length < PAGE) break
  }

  // ---- push local changes
  const upserts: Omit<RecordRow, 'server_updated_at'>[] = []
  for (const k of Object.keys(state.dirty)) {
    const [collection, ...rest] = k.split(':')
    const id = rest.join(':')
    const record = collections[collection as SyncCollection]?.get(id)
    if (!record) continue
    upserts.push({
      collection: collection as SyncCollection,
      id,
      data: record,
      deleted: false,
      updated_at: record.updatedAt ?? new Date().toISOString(),
    })
  }
  for (const [k, deletedAt] of Object.entries(state.deleted)) {
    const [collection, ...rest] = k.split(':')
    upserts.push({
      collection: collection as SyncCollection,
      id: rest.join(':'),
      data: null,
      deleted: true,
      updated_at: deletedAt,
    })
  }
  // Send in batches of at most 100 rows or ~1.5 MB (trades can carry chart screenshots).
  let batch: typeof upserts = []
  let batchBytes = 0
  const flush = async () => {
    if (batch.length === 0) return
    const { error } = await client
      .from('journal_records')
      .upsert(batch, { onConflict: 'user_id,collection,id' })
    if (error) throw error
    batch = []
    batchBytes = 0
  }
  for (const row of upserts) {
    const size = JSON.stringify(row).length
    if (batch.length >= 100 || (batch.length > 0 && batchBytes + size > 1_500_000)) await flush()
    batch.push(row)
    batchBytes += size
  }
  await flush()

  if (state.settingsDirty) {
    const { error } = await client.from('journal_settings').upsert(
      { data: sharedSettings(data.settings), updated_at: state.settingsUpdatedAt },
      { onConflict: 'user_id' },
    )
    if (error) throw error
  }

  // Clear only what this sync handled; anything changed while it ran stays pending.
  const latest = loadSyncState()
  for (const k of pulledKeys) {
    if (latest.dirty[k] && latest.dirty[k] <= syncStartedAt) delete latest.dirty[k]
    if (latest.deleted[k] && latest.deleted[k] <= syncStartedAt) delete latest.deleted[k]
  }
  for (const [k, notedAt] of Object.entries(pushedDirty)) {
    if (latest.dirty[k] === notedAt) delete latest.dirty[k]
  }
  for (const [k, deletedAt] of Object.entries(pushedDeleted)) {
    if (latest.deleted[k] === deletedAt) delete latest.deleted[k]
  }
  latest.cursor = state.cursor
  if (state.settingsDirty) {
    if (latest.settingsUpdatedAt === state.settingsUpdatedAt) latest.settingsDirty = false
  } else if (!latest.settingsDirty) {
    latest.settingsUpdatedAt = state.settingsUpdatedAt
  }
  latest.lastSyncAt = new Date().toISOString()
  saveSyncState(latest)

  return {
    changes,
    settings: pulledSettings,
    pushed: upserts.length + (state.settingsDirty ? 1 : 0),
    pulled,
  }
}

/**
 * Apply what a sync pulled to the journal as it is now. Records the user changed while the
 * sync was running keep the local version; they are uploaded on the next sync.
 */
export function applyPulledChanges(
  current: AppData,
  result: SyncResult,
): { data: AppData; puts: PulledChange[]; deletes: PulledChange[]; settings: Settings | null } | null {
  const state = loadSyncState()
  const settings =
    result.settings && !state.settingsDirty
      ? {
          ...result.settings,
          lock: current.settings.lock,
          autoLockMinutes: current.settings.autoLockMinutes,
        }
      : null
  const applied = result.changes.filter((change) => {
    const k = `${change.collection}:${change.id}`
    return !state.dirty[k] && !state.deleted[k]
  })
  if (!settings && applied.length === 0) return null

  const next: AppData = { ...current, settings: settings ?? current.settings }
  for (const collection of SYNC_COLLECTIONS) {
    const mine = applied.filter((change) => change.collection === collection)
    if (mine.length === 0) continue
    const map = new Map((current[collection] as Stamped[]).map((r) => [r.id, r]))
    for (const change of mine) {
      if (change.record) map.set(change.id, change.record)
      else map.delete(change.id)
    }
    ;(next as unknown as Record<SyncCollection, Stamped[]>)[collection] = Array.from(map.values())
  }
  return {
    data: next,
    puts: applied.filter((change) => change.record),
    deletes: applied.filter((change) => !change.record),
    settings,
  }
}
