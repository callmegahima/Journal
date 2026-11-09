const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const usdCompactFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

function cleanZero(value: number): number {
  return Object.is(value, -0) ? 0 : value
}

export function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return usdFormatter.format(cleanZero(value))
}

export function moneySigned(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const clean = cleanZero(value)
  if (clean > 0) return `+${usdFormatter.format(clean)}`
  return usdFormatter.format(clean)
}

export function moneyCompact(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return usdCompactFormatter.format(cleanZero(value))
}

export function pct(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}%`
}

export function num(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function price(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function lots(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

export function rMultiple(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}R`
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function decimalsForTick(tickSize: number): number {
  if (!Number.isFinite(tickSize) || tickSize <= 0) return 2
  const decimals = Math.ceil(-Math.log10(tickSize))
  return Math.min(Math.max(decimals, 0), 8)
}

export function percentOf(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (part / total) * 100))
}

export function truncateMiddle(value: string, max = 42): string {
  if (value.length <= max) return value
  const half = Math.floor((max - 1) / 2)
  return `${value.slice(0, half)}…${value.slice(-half)}`
}
