import { useEffect, useState } from 'react'

/**
 * Live USD → local currency rate from free, key-less public sources (no personal data is
 * sent). Both publish a new rate about once a day; the app re-checks every minute, when the tab
 * becomes visible again and when the connection comes back. The last rate is kept in
 * localStorage so it still shows offline.
 */

export interface FxRate {
  currency: string
  rate: number
  /** When the source last published the rate (ISO). */
  updatedAt: string
  /** When this device last fetched it (ISO). */
  fetchedAt: string
  source: string
}

const REFRESH_MS = 60 * 1000
const storageKey = (currency: string) => `pa-fx-usd-${currency.toLowerCase()}`

function readCache(currency: string): FxRate | null {
  try {
    const raw = localStorage.getItem(storageKey(currency))
    if (!raw) return null
    const parsed = JSON.parse(raw) as FxRate
    return parsed && parsed.rate > 0 ? parsed : null
  } catch {
    return null
  }
}

function writeCache(value: FxRate) {
  try {
    localStorage.setItem(storageKey(value.currency), JSON.stringify(value))
  } catch {
    // Storage blocked: the rate still shows for this session.
  }
}

async function fromOpenErApi(currency: string, signal: AbortSignal): Promise<FxRate> {
  const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal })
  if (!res.ok) throw new Error(`open.er-api ${res.status}`)
  const json = (await res.json()) as {
    result?: string
    rates?: Record<string, number>
    time_last_update_unix?: number
  }
  const rate = json.rates?.[currency.toUpperCase()]
  if (json.result !== 'success' || !(rate && rate > 0)) throw new Error('open.er-api: no rate')
  return {
    currency: currency.toUpperCase(),
    rate,
    updatedAt: json.time_last_update_unix
      ? new Date(json.time_last_update_unix * 1000).toISOString()
      : new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    source: 'open.er-api.com',
  }
}

async function fromCurrencyApi(currency: string, signal: AbortSignal): Promise<FxRate> {
  const res = await fetch(
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    { signal },
  )
  if (!res.ok) throw new Error(`currency-api ${res.status}`)
  const json = (await res.json()) as { date?: string; usd?: Record<string, number> }
  const rate = json.usd?.[currency.toLowerCase()]
  if (!(rate && rate > 0)) throw new Error('currency-api: no rate')
  return {
    currency: currency.toUpperCase(),
    rate,
    updatedAt: json.date ? new Date(`${json.date}T00:00:00Z`).toISOString() : new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    source: 'fawazahmed0 currency-api',
  }
}

async function fetchRate(currency: string, signal: AbortSignal): Promise<FxRate> {
  try {
    return await fromOpenErApi(currency, signal)
  } catch (error) {
    if (signal.aborted) throw error
    return fromCurrencyApi(currency, signal)
  }
}

/** USD → `currency` rate that refreshes itself. `stale` is true when the last fetch failed. */
export function useUsdRate(currency: string): { fx: FxRate | null; stale: boolean } {
  const [fx, setFx] = useState<FxRate | null>(() => readCache(currency))
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let controller: AbortController | null = null
    let cancelled = false

    const refresh = async (force = false) => {
      const cached = readCache(currency)
      if (!force && cached && Date.now() - new Date(cached.fetchedAt).getTime() < REFRESH_MS) {
        setFx(cached)
        return
      }
      controller?.abort()
      controller = new AbortController()
      try {
        const next = await fetchRate(currency, controller.signal)
        if (cancelled) return
        writeCache(next)
        setFx(next)
        setStale(false)
      } catch {
        if (!cancelled && !controller.signal.aborted) setStale(true)
      }
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(true), REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onOnline = () => void refresh(true)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      controller?.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [currency])

  return { fx, stale }
}
