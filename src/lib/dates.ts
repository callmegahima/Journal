import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export interface TimezoneOption {
  value: string
  label: string
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'Etc/GMT-2', label: 'GMT+2 — default (broker / chart time)' },
  { value: 'Etc/GMT-1', label: 'GMT+1' },
  { value: 'Etc/GMT', label: 'GMT+0' },
  { value: 'Etc/GMT+1', label: 'GMT-1' },
  { value: 'Etc/GMT+3', label: 'GMT-3' },
  { value: 'Etc/GMT+4', label: 'GMT-4' },
  { value: 'Etc/GMT+5', label: 'GMT-5' },
  { value: 'Etc/GMT+8', label: 'GMT-8' },
  { value: 'Europe/London', label: 'London — GMT / BST' },
  { value: 'Europe/Berlin', label: 'Berlin — CET / CEST' },
  { value: 'Europe/Athens', label: 'Athens — EET / EEST' },
  { value: 'America/New_York', label: 'New York — EST / EDT' },
  { value: 'America/Chicago', label: 'Chicago — CST / CDT' },
  { value: 'Asia/Dubai', label: 'Dubai — GST' },
  { value: 'Asia/Tokyo', label: 'Tokyo — JST' },
  { value: 'Australia/Sydney', label: 'Sydney — AEST / AEDT' },
]

export function timezoneLabel(value: string): string {
  return TIMEZONE_OPTIONS.find((tz) => tz.value === value)?.label ?? value
}

export function timezoneShort(value: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: value,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? value
  } catch {
    return value
  }
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function todayKey(tz: string): string {
  return formatInTimeZone(new Date(), tz, 'yyyy-MM-dd')
}

export function toDateKey(iso: string, tz: string): string {
  return formatInTimeZone(iso, tz, 'yyyy-MM-dd')
}

export function toMonthKey(iso: string, tz: string): string {
  return formatInTimeZone(iso, tz, 'yyyy-MM')
}

export function formatDateTime(iso: string, tz: string, pattern = 'dd MMM yyyy · HH:mm'): string {
  try {
    return formatInTimeZone(iso, tz, pattern)
  } catch {
    return iso
  }
}

export function formatTime(iso: string, tz: string): string {
  return formatDateTime(iso, tz, 'HH:mm')
}

export function clockTime(tz: string): string {
  try {
    return formatInTimeZone(new Date(), tz, 'EEE · HH:mm:ss')
  } catch {
    return ''
  }
}

/** Convert a datetime-local value (wall time in selected TZ) to a UTC ISO instant. */
export function localInputToIso(value: string, tz: string): string {
  if (!value) return nowIso()
  try {
    return fromZonedTime(value, tz).toISOString()
  } catch {
    return new Date(value).toISOString()
  }
}

/** Convert a UTC ISO instant to a datetime-local value for the selected TZ. */
export function isoToLocalInput(iso: string, tz: string): string {
  try {
    return formatInTimeZone(iso, tz, "yyyy-MM-dd'T'HH:mm")
  } catch {
    return format(new Date(iso), "yyyy-MM-dd'T'HH:mm")
  }
}

export function formatDateKey(dateKey: string, pattern = 'dd MMM yyyy'): string {
  try {
    return format(parseISO(dateKey), pattern)
  } catch {
    return dateKey
  }
}

export function formatDayLabel(dateKey: string): string {
  return formatDateKey(dateKey, 'EEE, dd MMM')
}

export function monthTitle(monthKey: string): string {
  try {
    return format(parseISO(`${monthKey}-01`), 'MMMM yyyy')
  } catch {
    return monthKey
  }
}

export function startOfWeekKey(dateKey: string): string {
  return format(startOfWeek(parseISO(dateKey), { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

export function endOfWeekKey(dateKey: string): string {
  return format(endOfWeek(parseISO(dateKey), { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

export function weekRangeLabel(dateKey: string): string {
  const start = startOfWeekKey(dateKey)
  const end = endOfWeekKey(dateKey)
  return `${formatDateKey(start, 'dd MMM')} – ${formatDateKey(end, 'dd MMM yyyy')}`
}

export function addDaysKey(dateKey: string, days: number): string {
  return format(addDays(parseISO(dateKey), days), 'yyyy-MM-dd')
}

export function addMonthsKey(monthKey: string, months: number): string {
  return format(addMonths(parseISO(`${monthKey}-01`), months), 'yyyy-MM')
}

export function lastNDays(tz: string, n: number): string[] {
  const today = todayKey(tz)
  return Array.from({ length: n }, (_, i) => addDaysKey(today, -(n - 1 - i)))
}

export function lastNMonths(tz: string, n: number): string[] {
  const current = todayKey(tz).slice(0, 7)
  return Array.from({ length: n }, (_, i) => addMonthsKey(current, -(n - 1 - i)))
}

export function monthGrid(monthKey: string): string[][] {
  const first = parseISO(`${monthKey}-01`)
  const gridStart = startOfWeek(startOfMonth(first), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(first), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd }).map((d) =>
    format(d, 'yyyy-MM-dd'),
  )
  const weeks: string[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
  return weeks
}

export function isDateInMonth(dateKey: string, monthKey: string): boolean {
  return dateKey.slice(0, 7) === monthKey
}

export function isFutureDateKey(dateKey: string): boolean {
  return dateKey > format(new Date(), 'yyyy-MM-dd')
}

export function rangePreset(preset: '7d' | '30d' | '90d' | 'ytd' | 'all', tz: string): {
  from: string
  to: string
} {
  const today = todayKey(tz)
  switch (preset) {
    case '7d':
      return { from: addDaysKey(today, -6), to: today }
    case '30d':
      return { from: addDaysKey(today, -29), to: today }
    case '90d':
      return { from: addDaysKey(today, -89), to: today }
    case 'ytd':
      return { from: `${today.slice(0, 4)}-01-01`, to: today }
    default:
      return { from: '2000-01-01', to: today }
  }
}

export function lastNMonthsList(n: number, tz: string): string[] {
  const current = todayKey(tz).slice(0, 7)
  return Array.from({ length: n }, (_, i) =>
    format(subMonths(parseISO(`${current}-01`), n - 1 - i), 'yyyy-MM'),
  )
}

export function subDaysKey(dateKey: string, days: number): string {
  return format(subDays(parseISO(dateKey), days), 'yyyy-MM-dd')
}
