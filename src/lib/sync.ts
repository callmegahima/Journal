import type { AppData, Settings } from '@/types'

/**
 * Cross-device sync through one secret GitHub Gist.
 *
 * - The whole journal is encrypted on the device (AES-GCM, key from the sync password via
 *   PBKDF2) before upload, so the gist only ever holds ciphertext.
 * - Each record is merged by id; the copy with the newer `updatedAt` wins.
 * - Deletions are kept as tombstones so a record deleted on one device is not brought back
 *   by the other.
 * - The passcode lock stays per device and is never synced.
 */

export const SYNC_FILENAME = 'pa-trading-journal.sync.json'
const CONFIG_KEY = 'pa-journal-sync-config'
const META_KEY = 'pa-journal-sync-meta'
const PBKDF2_ITERATIONS = 250_000
const TOMBSTONE_TTL_DAYS = 120

export type SyncCollection = 'plans' | 'trades' | 'checklists' | 'psych' | 'events' | 'reflections'
export const SYNC_COLLECTIONS: SyncCollection[] = [
  'plans',
  'trades',
  'checklists',
  'psych',
  'events',
  'reflections',
]

export interface SyncConfig {
  token: string
  password: string
  gistId: string | null
}

export interface Tombstone {
  collection: SyncCollection
  id: string
  deletedAt: string
}

/** Device-local bookkeeping that travels alongside the data. */
export interface SyncMeta {
  settingsUpdatedAt: string
  tombstones: Tombstone[]
  lastSyncAt: string | null
}

export interface SyncPayload {
  app: 'PA Trading Journal'
  format: 1
  syncedAt: string
  settingsUpdatedAt: string
  tombstones: Tombstone[]
  data: AppData
}

interface EncryptedEnvelope {
  app: 'PA Trading Journal'
  encrypted: 'AES-GCM'
  kdf: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

/* ------------------------------------------------------------------ local storage */

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be unavailable (private mode); sync then simply stays off.
  }
}

export function loadSyncConfig(): SyncConfig | null {
  const config = readJson<SyncConfig>(CONFIG_KEY)
  return config && config.token && config.password ? config : null
}

export function saveSyncConfig(config: SyncConfig | null): void {
  if (config) writeJson(CONFIG_KEY, config)
  else {
    try {
      localStorage.removeItem(CONFIG_KEY)
    } catch {
      // ignore
    }
  }
}

export function loadSyncMeta(): SyncMeta {
  const meta = readJson<SyncMeta>(META_KEY)
  return {
    settingsUpdatedAt: meta?.settingsUpdatedAt ?? new Date(0).toISOString(),
    tombstones: Array.isArray(meta?.tombstones) ? meta.tombstones : [],
    lastSyncAt: meta?.lastSyncAt ?? null,
  }
}

export function saveSyncMeta(meta: SyncMeta): void {
  writeJson(META_KEY, meta)
}

export function markSettingsChanged(): void {
  const meta = loadSyncMeta()
  saveSyncMeta({ ...meta, settingsUpdatedAt: new Date().toISOString() })
}

export function recordDeletion(collection: string, id: string): void {
  if (!SYNC_COLLECTIONS.includes(collection as SyncCollection)) return
  const meta = loadSyncMeta()
  const tombstones = meta.tombstones.filter(
    (t) => !(t.collection === collection && t.id === id),
  )
  tombstones.push({ collection: collection as SyncCollection, id, deletedAt: new Date().toISOString() })
  saveSyncMeta({ ...meta, tombstones })
}

/* ------------------------------------------------------------------ merge */

interface Stamped {
  id: string
  updatedAt?: string
}

function stamp(record: Stamped): string {
  return record.updatedAt ?? ''
}

export function mergeTombstones(a: Tombstone[], b: Tombstone[]): Tombstone[] {
  const cutoff = Date.now() - TOMBSTONE_TTL_DAYS * 86_400_000
  const map = new Map<string, Tombstone>()
  for (const t of [...a, ...b]) {
    if (Date.parse(t.deletedAt) < cutoff) continue
    const key = `${t.collection}:${t.id}`
    const existing = map.get(key)
    if (!existing || existing.deletedAt < t.deletedAt) map.set(key, t)
  }
  return Array.from(map.values())
}

function mergeCollection<T extends Stamped>(
  local: T[],
  remote: T[],
  tombstones: Map<string, string>,
): T[] {
  const map = new Map<string, T>()
  for (const record of [...local, ...remote]) {
    const existing = map.get(record.id)
    if (!existing || stamp(record) > stamp(existing)) map.set(record.id, record)
  }
  return Array.from(map.values()).filter((record) => {
    const deletedAt = tombstones.get(record.id)
    // A record edited after it was deleted elsewhere is kept.
    return !deletedAt || stamp(record) > deletedAt
  })
}

export interface MergeResult {
  data: AppData
  settingsUpdatedAt: string
  tombstones: Tombstone[]
}

export function mergeData(
  local: AppData,
  localMeta: SyncMeta,
  remote: SyncPayload | null,
): MergeResult {
  if (!remote) {
    return {
      data: local,
      settingsUpdatedAt: localMeta.settingsUpdatedAt,
      tombstones: mergeTombstones(localMeta.tombstones, []),
    }
  }
  const tombstones = mergeTombstones(localMeta.tombstones, remote.tombstones ?? [])
  const byCollection = (collection: SyncCollection) =>
    new Map(tombstones.filter((t) => t.collection === collection).map((t) => [t.id, t.deletedAt]))

  const remoteNewerSettings = remote.settingsUpdatedAt > localMeta.settingsUpdatedAt
  const settings: Settings = remoteNewerSettings
    ? { ...remote.data.settings, lock: local.settings.lock, autoLockMinutes: local.settings.autoLockMinutes }
    : local.settings

  const data: AppData = {
    settings,
    plans: mergeCollection(local.plans, remote.data.plans ?? [], byCollection('plans')),
    trades: mergeCollection(local.trades, remote.data.trades ?? [], byCollection('trades')),
    checklists: mergeCollection(local.checklists, remote.data.checklists ?? [], byCollection('checklists')),
    psych: mergeCollection(local.psych, remote.data.psych ?? [], byCollection('psych')),
    events: mergeCollection(local.events, remote.data.events ?? [], byCollection('events')),
    reflections: mergeCollection(local.reflections, remote.data.reflections ?? [], byCollection('reflections')),
  }
  return {
    data,
    settingsUpdatedAt: remoteNewerSettings ? remote.settingsUpdatedAt : localMeta.settingsUpdatedAt,
    tombstones,
  }
}

/** Stable fingerprint used to skip writes when nothing changed. */
export function fingerprint(data: AppData): string {
  const sortById = <T extends Stamped>(list: T[]) =>
    [...list].sort((a, b) => a.id.localeCompare(b.id)).map((r) => `${r.id}@${stamp(r)}`)
  const { lock: _lock, autoLockMinutes: _auto, ...shared } = data.settings
  return JSON.stringify([
    shared,
    ...SYNC_COLLECTIONS.map((c) => sortById(data[c] as Stamped[])),
  ])
}

/* ------------------------------------------------------------------ crypto */

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptPayload(payload: SyncPayload, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)
  const plain = new TextEncoder().encode(JSON.stringify(payload))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource),
  )
  const envelope: EncryptedEnvelope = {
    app: 'PA Trading Journal',
    encrypted: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(cipher),
  }
  return JSON.stringify(envelope)
}

export class WrongPasswordError extends Error {
  constructor() {
    super('The sync password does not match the one used on your other device.')
  }
}

export async function decryptPayload(raw: string, password: string): Promise<SyncPayload> {
  const envelope = JSON.parse(raw) as EncryptedEnvelope
  if (envelope.encrypted !== 'AES-GCM') throw new Error('Unrecognised sync file.')
  const key = await deriveKey(password, fromBase64(envelope.salt), envelope.iterations)
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv) as BufferSource },
      key,
      fromBase64(envelope.ciphertext) as BufferSource,
    )
    return JSON.parse(new TextDecoder().decode(plain)) as SyncPayload
  } catch {
    throw new WrongPasswordError()
  }
}

/* ------------------------------------------------------------------ GitHub Gist API */

const API = 'https://api.github.com'

function headers(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function gh<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(token), ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  })
  if (response.status === 401) throw new Error('GitHub rejected the token. Check it has not expired.')
  if (response.status === 403 || response.status === 404) {
    throw new Error('The token cannot access gists. Create it with the "gist" permission.')
  }
  if (!response.ok) throw new Error(`GitHub error ${response.status}.`)
  return (await response.json()) as T
}

interface GistFile {
  filename: string
  content?: string
  truncated?: boolean
  raw_url: string
}
interface Gist {
  id: string
  files: Record<string, GistFile>
}

/** Find this journal's gist, or return null if none exists yet. */
export async function findSyncGist(token: string): Promise<string | null> {
  for (let page = 1; page <= 10; page += 1) {
    const gists = await gh<Gist[]>(token, `/gists?per_page=100&page=${page}`)
    const match = gists.find((g) => Object.keys(g.files).includes(SYNC_FILENAME))
    if (match) return match.id
    if (gists.length < 100) break
  }
  return null
}

export async function readSyncGist(token: string, gistId: string): Promise<string | null> {
  const gist = await gh<Gist>(token, `/gists/${gistId}`)
  const file = gist.files[SYNC_FILENAME]
  if (!file) return null
  if (!file.truncated && file.content != null) return file.content
  const raw = await fetch(file.raw_url, { cache: 'no-store' })
  if (!raw.ok) throw new Error(`Could not download the sync file (${raw.status}).`)
  return raw.text()
}

export async function writeSyncGist(
  token: string,
  gistId: string | null,
  content: string,
): Promise<string> {
  const body = JSON.stringify({
    description: 'PA Trading Journal — encrypted sync data',
    files: { [SYNC_FILENAME]: { content } },
    ...(gistId ? {} : { public: false }),
  })
  const gist = gistId
    ? await gh<Gist>(token, `/gists/${gistId}`, { method: 'PATCH', body })
    : await gh<Gist>(token, '/gists', { method: 'POST', body })
  return gist.id
}
