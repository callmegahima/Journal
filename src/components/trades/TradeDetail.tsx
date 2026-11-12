import { useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Copy,
  Image as ImageIcon,
  Link2,
  Pencil,
  Target,
  Trash2,
} from 'lucide-react'
import type { Trade } from '@/types'
import { useData } from '@/store/DataContext'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'
import {
  Badge,
  Button,
  DirectionBadge,
  ResultBadge,
} from '@/components/ui/primitives'
import { ImageLightbox } from '@/components/ui/ImageUpload'
import { formatDateTime, timezoneLabel } from '@/lib/dates'
import { formatDuration } from '@/lib/metrics'
import { average, lots as formatLots, money, pct, price, rMultiple } from '@/lib/format'
import { plannedRR } from '@/lib/calc'
import { cn } from '@/lib/utils'

function Metric({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string
  value: string
  tone?: 'default' | 'profit' | 'loss'
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-line/80 bg-ink/40 px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-dim">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 font-mono text-[15px] font-semibold tabular-nums',
          tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-fg',
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[9px] text-dim">{hint}</div> : null}
    </div>
  )
}

export function TradeDetail({
  trade,
  open,
  onClose,
  onEdit,
  onDelete,
}: {
  trade: Trade | null
  open: boolean
  onClose: () => void
  onEdit: (trade: Trade) => void
  onDelete: (trade: Trade) => Promise<void>
}) {
  const { data } = useData()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  if (!trade) return null

  const instrument = data.settings.instruments.find((item) => item.id === trade.instrumentId)
  const plan = trade.planId ? data.plans.find((item) => item.id === trade.planId) : undefined
  const checklist = trade.checklistId
    ? data.checklists.find((item) => item.id === trade.checklistId)
    : undefined
  const balanceBefore =
    data.settings.startingBalance +
    data.trades
      .filter((item) => item.id !== trade.id && item.date < trade.date)
      .reduce((sum, item) => sum + item.pnl, 0)
  const riskPct = balanceBefore > 0 ? (trade.riskAmount / balanceBefore) * 100 : null
  const rr = plannedRR(trade.entry, trade.sl, trade.tp)
  const id = `T-${String(trade.seq).padStart(4, '0')}`

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="xl"
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-accent-2">{id}</span>
            <DirectionBadge direction={trade.direction} />
            <ResultBadge result={trade.result} />
            <span className="text-muted">{trade.setup}</span>
          </span>
        }
        description={`${formatDateTime(trade.date, data.settings.timezone)} · ${timezoneLabel(
          data.settings.timezone,
        )}`}
        footer={
          <>
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 size={13} /> Delete
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" onClick={() => onEdit(trade)}>
              <Pencil size={13} /> Edit trade
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Metric
              label="Net P/L"
              value={`${trade.pnl >= 0 ? '+' : ''}${money(trade.pnl)}`}
              tone={trade.pnl > 0 ? 'profit' : trade.pnl < 0 ? 'loss' : 'default'}
            />
            <Metric
              label="R multiple"
              value={trade.riskAmount > 0 ? rMultiple(trade.rMultiple) : '—'}
              tone={trade.rMultiple > 0 ? 'profit' : trade.rMultiple < 0 ? 'loss' : 'default'}
            />
            <Metric
              label="Risk"
              value={trade.riskAmount > 0 ? money(trade.riskAmount) : 'No stop'}
              hint={trade.riskAmount > 0 && riskPct != null ? pct(riskPct, 2) : undefined}
            />
            <Metric label="Lot size" value={formatLots(trade.lots)} />
            <Metric
              label="Planned R:R"
              value={rr > 0 ? `1:${rr.toFixed(2)}` : '—'}
            />
            <Metric
              label="Instrument"
              value={instrument?.symbol ?? trade.instrumentId}
              hint={`${trade.timeframe} · ${trade.session}`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card p-3.5">
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <Target size={12} /> Prices
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                {[
                  ['Entry', price(trade.entry, 2)],
                  ['Exit', price(trade.exit, 2)],
                  ['Stop Loss', trade.sl ? price(trade.sl, 2) : 'None'],
                  ['Take Profit', trade.tp ? price(trade.tp, 2) : 'None'],
                  ['Lots', formatLots(trade.lots)],
                  ['Points', String(Math.round((trade.direction === 'BUY' ? trade.exit - trade.entry : trade.entry - trade.exit) / (instrument?.tickSize || 0.01)))],
                  ['MT5 profit', money(trade.grossPnl ?? trade.pnl - (trade.commission ?? 0) - (trade.swap ?? 0))],
                  ['Commission', money(trade.commission ?? 0)],
                  ['Swap', money(trade.swap ?? 0)],
                  ['Net P/L', money(trade.pnl)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-dim">{label}</span>
                    <span className="font-mono text-fg">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card p-3.5">
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <Clock size={12} /> Context
              </h3>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="text-dim">Session</span>
                  <span className="text-fg">{trade.session}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-dim">Timeframe</span>
                  <span className="font-mono text-fg">{trade.timeframe}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-dim">Setup</span>
                  <span className="text-right text-fg">{trade.setup}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-dim">Opened</span>
                  <span className="text-fg">{formatDateTime(trade.date, data.settings.timezone, 'dd MMM yyyy · HH:mm')}</span>
                </div>
                {trade.closeDate ? (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="text-dim">Closed</span>
                      <span className="text-fg">{formatDateTime(trade.closeDate, data.settings.timezone, 'dd MMM yyyy · HH:mm')}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-dim">Held</span>
                      <span className="font-mono text-fg">
                        {formatDuration((Date.parse(trade.closeDate) - Date.parse(trade.date)) / 60000)}
                      </span>
                    </div>
                  </>
                ) : null}
                <div className="flex justify-between gap-2">
                  <span className="text-dim">Logged</span>
                  <span className="text-fg">{formatDateTime(trade.createdAt, data.settings.timezone, 'dd MMM yyyy · HH:mm')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Before entry', src: trade.screenshotBefore },
              { label: 'After exit', src: trade.screenshotAfter },
            ].map((shot) => (
              <div key={shot.label} className="card overflow-hidden">
                <div className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  <ImageIcon size={11} /> {shot.label}
                </div>
                {shot.src ? (
                  <button
                    type="button"
                    onClick={() => setImage({ src: shot.src as string, alt: shot.label })}
                    className="block w-full"
                  >
                    <img
                      src={shot.src}
                      alt={shot.label}
                      className="h-52 w-full object-cover transition hover:opacity-90"
                    />
                  </button>
                ) : (
                  <div className="flex h-32 items-center justify-center text-[11px] text-dim">
                    No screenshot attached
                  </div>
                )}
              </div>
            ))}
          </div>

          {plan || checklist ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {plan ? (
                <div className="card p-3.5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
                    <Link2 size={11} /> Linked plan
                  </div>
                  <div className="text-[12px] font-medium text-fg">{plan.setup}</div>
                  <div className="mt-1 text-[10px] text-muted">
                    {plan.direction} · {plan.timeframe} · {plan.status} · risk {money(plan.riskAmount)}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant={plan.direction === 'BUY' ? 'green' : 'red'}>
                      {plan.direction}
                    </Badge>
                    <span className="font-mono text-[10px] text-dim">
                      Entry {price(plan.entry, 2)} · SL {price(plan.sl, 2)} · TP {price(plan.tp, 2)}
                    </span>
                  </div>
                </div>
              ) : null}
              {checklist ? (
                <div className="card p-3.5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
                    <Copy size={11} /> Checklist
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'text-[12px] font-semibold',
                        checklist.decision === 'READY'
                          ? 'text-profit'
                          : checklist.decision === 'WAIT'
                            ? 'text-warn'
                            : 'text-loss',
                      )}
                    >
                      {checklist.decision}
                    </span>
                    <span className="font-mono text-[12px] text-fg">{checklist.overallPct}%</span>
                  </div>
                  <div className="mt-1 text-[10px] text-muted">
                    {checklist.items.filter((item) => item.checked).length}/{checklist.items.length}{' '}
                    conditions · {checklist.templateName}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card p-3.5">
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
                Reason for entering
              </h3>
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
                {trade.reasonEntry || '—'}
              </p>
            </div>
            <div className="card p-3.5">
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
                Reason for exiting
              </h3>
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
                {trade.reasonExit || '—'}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card p-3.5">
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
                Mistakes made
              </h3>
              {trade.mistakes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {trade.mistakes.map((mistake) => (
                    <Badge key={mistake} variant="red">
                      {mistake}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-dim">No mistakes tagged.</p>
              )}
            </div>
            <div className="card p-3.5">
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
                Lessons learned
              </h3>
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
                {trade.lessons || '—'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-dim">
            <span>
              P/L is your recorded actual result. Average trade in journal:{' '}
              <span className="font-mono text-muted">
                {money(
                  average(data.trades.map((item) => item.pnl)) ?? 0,
                )}
              </span>
            </span>
            <span className="flex items-center gap-1">
              {trade.direction === 'BUY' ? (
                <ArrowUpRight size={11} className="text-profit" />
              ) : (
                <ArrowDownRight size={11} className="text-loss" />
              )}
              {trade.direction} · {trade.instrumentId.toUpperCase()}
            </span>
          </div>
        </div>
      </Modal>

      <ImageLightbox
        src={image?.src}
        alt={image?.alt}
        open={Boolean(image)}
        onClose={() => setImage(null)}
      />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        busy={deleting}
        title={`Delete ${id}?`}
        description="This permanently removes the trade from your journal. Any linked plan will be marked planned again, and checklist links will be cleared. Export a backup first if you are unsure."
        confirmLabel="Delete trade"
        onConfirm={async () => {
          setDeleting(true)
          try {
            await onDelete(trade)
            setConfirmOpen(false)
            onClose()
          } finally {
            setDeleting(false)
          }
        }}
      />
    </>
  )
}
