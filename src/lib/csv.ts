import type { Settings, Trade } from '@/types'
import { formatDateTime } from '@/lib/dates'
import { plannedRR } from '@/lib/calc'

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function tradesToCsv(trades: Trade[], settings: Settings, tz: string): string {
  const instrumentMap = new Map(settings.instruments.map((i) => [i.id, i.symbol]))
  const headers = [
    'Trade ID',
    'Date',
    'Instrument',
    'Direction',
    'Entry',
    'Exit',
    'Stop Loss',
    'Take Profit',
    'Lots',
    'Risk USD',
    'P/L USD',
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
        trade.sl,
        trade.tp,
        trade.lots,
        trade.riskAmount,
        trade.pnl,
        trade.result,
        trade.rMultiple,
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
