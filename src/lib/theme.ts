import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'pa-journal-theme'
const THEME_COLORS: Record<Theme, string> = {
  dark: '#0B1120',
  light: '#F4F6FA',
}

let currentTheme: Theme = 'dark'
const listeners = new Set<() => void>()

function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function preferredTheme(): Theme {
  const stored = readStoredTheme()
  if (stored) return stored
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[theme])
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return currentTheme
}

function getServerSnapshot(): Theme {
  return 'dark'
}

/** Read the saved preference (or the OS preference) and apply it on boot. */
export function initTheme() {
  currentTheme = preferredTheme()
  applyTheme(currentTheme)
}

export function setTheme(theme: Theme) {
  if (theme === currentTheme) return
  currentTheme = theme
  applyTheme(theme)
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage can be blocked (private mode); the theme still works for the session.
  }
  for (const listener of listeners) listener()
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return {
    theme,
    setTheme,
    toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
  }
}
