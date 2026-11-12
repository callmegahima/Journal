import type { Settings, Trade } from '@/types'
import { formatDateTime } from '@/lib/dates'
import { plannedRR } from '@/lib/calc'

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return ''
  let str = String(value)
  // Stop spreadsheet apps from running notes text as a formula (=, +, -, @ at the start).
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(str)) str = `'${str}`
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function tradesToCsv(trades: Trade[], settings: Settings, tz: string): string {
  const instrumentMap = new Map(settings.instruments.map((i) => [i.id, i.symbol]))
  const headers = [
    'Trade ID',
    'Open time',
    'Instrument',
    'Direction',
    'Entry',
    'Exit',
    'Close time',
    'Stop Loss',
    'Take Profit',
    'Lots',
    'Risk USD',
    'Profit USD',
    'Commission USD',
    'Swap USD',
    'Net P/L USD',
    'Result',
    'R Multiple',
    'Planned RR',
    'Setup',
    'Timeframe',
    'Session',
    'Reason for entry',
    'Reason for exit',
    'Mistakes',
    'Lessons learned',
    'Screenshot before',
    'Screenshot after',
    'Plan ID',
    'Checklist ID',
  ]

  const rows = [...trades]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((trade) =>
      [
        `T-${String(trade.seq).padStart(4, '0')}`,
        formatDateTime(trade.date, tz, 'yyyy-MM-dd HH:mm'),
        instrumentMap.get(trade.instrumentId) ?? trade.instrumentId,
        trade.direction,
        trade.entry,
        trade.exit,
        trade.closeDate ? formatDateTime(trade.closeDate, tz, 'yyyy-MM-dd HH:mm') : '',
        trade.sl,
        trade.tp,
        trade.lots,
        trade.riskAmount,
        trade.grossPnl ?? trade.pnl - (trade.commission ?? 0) - (trade.swap ?? 0),
        trade.commission ?? 0,
        trade.swap ?? 0,
        trade.pnl,
        trade.result,
        trade.riskAmount > 0 ? trade.rMultiple : '',
        plannedRR(trade.entry, trade.sl, trade.tp).toFixed(2),
        trade.setup,
        trade.timeframe,
        trade.session,
        trade.reasonEntry,
        trade.reasonExit,
        trade.mistakes.join(' | '),
        trade.lessons,
        trade.screenshotBefore ? 'Yes' : 'No',
        trade.screenshotAfter ? 'Yes' : 'No',
        trade.planId ?? '',
        trade.checklistId ?? '',
      ]
        .map(escapeCsv)
        .join(','),
    )

  return '\uFEFF' + [headers.join(','), ...rows].join('\r\n')
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
