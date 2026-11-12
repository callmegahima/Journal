/**
 * After a new deploy the old page files are deleted, so an app that was opened before the
 * deploy cannot load the next page it needs and would hang. When that happens, reload once
 * to pick up the new version. A short guard stops a reload loop if the site is really down.
 */
const KEY = 'pa-reload-for-new-version-at'
const GUARD_MS = 20_000

export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < GUARD_MS) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // sessionStorage blocked: still try one reload.
  }
  window.location.reload()
  return true
}

/** Wrap a lazy page import so a missing (old) file reloads the app instead of hanging. */
export function loadPage<T>(loader: () => Promise<T>): Promise<T> {
  return loader().catch((error: unknown) => {
    if (reloadForNewVersion()) return new Promise<T>(() => {})
    throw error
  })
}
