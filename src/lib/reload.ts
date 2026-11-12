/**
 * Keeping an open app working across deploys.
 *
 * Each deploy deletes the previous version's page files, so an app opened before the deploy
 * cannot load the next page it needs. Two safeguards:
 *  1. The app checks for a new version (every few minutes and when you come back to it) and,
 *     when there is one, switches to it on the next page change, before anything can fail.
 *  2. If a page file is missing anyway, it reloads once to get the new version.
 *
 * Reloads add a throwaway `?v=` value so the browser cannot answer with its saved copy of the
 * start page (GitHub Pages lets browsers keep it for 10 minutes). It is removed again on load.
 */
const GUARD_KEY = 'pa-reload-for-new-version-at'
const GUARD_MS = 20_000
const CHECK_MS = 5 * 60_000

/** Full reload that always fetches the newest start page. */
export function hardReload() {
  const url = new URL(window.location.href)
  url.searchParams.set('v', String(Date.now()))
  window.location.replace(url.toString())
}

/** Remove the `?v=` added by hardReload so the address stays clean. */
export function cleanReloadParam() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('v')) return
    url.searchParams.delete('v')
    window.history.replaceState(window.history.state, '', url.toString())
  } catch {
    // Leave the address as it is.
  }
}

export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(GUARD_KEY) || 0)
    if (Date.now() - last < GUARD_MS) return false
    sessionStorage.setItem(GUARD_KEY, String(Date.now()))
  } catch {
    // sessionStorage blocked: still try one reload.
  }
  hardReload()
  return true
}

/** Wrap a lazy page import so a missing (old) file reloads the app instead of hanging. */
export function loadPage<T>(loader: () => Promise<T>): Promise<T> {
  return loader().catch((error: unknown) => {
    if (reloadForNewVersion()) return new Promise<T>(() => {})
    throw error
  })
}

function currentEntry(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')
  const match = script?.src.match(/assets\/(index-[\w-]+\.js)/)
  return match ? match[1] : null
}

let updateReady = false

async function checkForUpdate() {
  if (updateReady || !navigator.onLine) return
  const current = currentEntry()
  if (!current) return
  try {
    const res = await fetch(`./index.html?check=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const latest = (await res.text()).match(/assets\/(index-[\w-]+\.js)/)?.[1]
    if (latest && latest !== current) updateReady = true
  } catch {
    // Offline or blocked: try again later.
  }
}

/** Start watching for new deploys (production builds only). */
export function startUpdateWatcher() {
  if (import.meta.env.DEV) return
  void checkForUpdate()
  window.setInterval(() => void checkForUpdate(), CHECK_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate()
  })
  window.addEventListener('online', () => void checkForUpdate())
  // Page changes are hash changes (HashRouter): switch to the new version right there.
  window.addEventListener('hashchange', () => {
    if (updateReady) hardReload()
  })
}
