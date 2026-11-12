import { Fragment } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Info,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import type {
  ChecklistSnapshotItem,
  ChecklistTemplate,
  Decision,
  Direction,
  GroupScore,
} from '@/types'
import { useGroupLabel } from '@/components/checklist/useGroupLabel'
import { cn } from '@/lib/utils'
import { ProgressBar } from '@/components/ui/primitives'
import { Toggle } from '@/components/ui/primitives'

const decisionStyles: Record<
  Decision,
  { wrap: string; text: string; icon: typeof CheckCircle2; title: string; sub: string }
> = {
  READY: {
    wrap: 'border-profit/30 bg-profit/[0.07]',
    text: 'text-profit',
    icon: CheckCircle2,
    title: 'READY',
    sub: 'Mandatory conditions and numerical risk checks are satisfied.',
  },
  WAIT: {
    wrap: 'border-warn/30 bg-warn/[0.07]',
    text: 'text-warn',
    icon: Clock3,
    title: 'WAIT',
    sub: 'Some mandatory confirmations are still missing.',
  },
  'NO TRADE': {
    wrap: 'border-loss/30 bg-loss/[0.07]',
    text: 'text-loss',
    icon: XCircle,
    title: 'NO TRADE',
    sub: 'Risk conditions fail or the setup is not valid.',
  },
}

function ScoreRing({ value }: { value: number }) {
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference
  const color = value >= 90 ? 'var(--color-profit)' : value >= 60 ? 'var(--color-accent)' : value >= 35 ? 'var(--color-warn)' : 'var(--color-loss)'
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--color-line)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[15px] font-semibold text-fg">{value}%</span>
        <span className="text-[8px] uppercase tracking-wider text-dim">complete</span>
      </div>
    </div>
  )
}

export function ChecklistPanel({
  items,
  onItemsChange,
  scores,
  overallPct,
  decision,
  blockers,
  missingMandatory,
  notes,
  onNotesChange,
  templates,
  templateId,
  onTemplateChange,
  direction,
  disabled = false,
  chartScreenshot,
  onOpenScreenshot,
}: {
  items: ChecklistSnapshotItem[]
  onItemsChange: (items: ChecklistSnapshotItem[]) => void
  scores: GroupScore[]
  overallPct: number
  decision: Decision
  blockers: string[]
  missingMandatory: string[]
  notes: string
  onNotesChange: (notes: string) => void
  templates: ChecklistTemplate[]
  templateId: string
  onTemplateChange: (id: string) => void
  direction: Direction
  disabled?: boolean
  chartScreenshot?: string
  onOpenScreenshot?: () => void
}) {
  const groupLabel = useGroupLabel()
  const styles = decisionStyles[decision]
  const DecisionIcon = styles.icon
  const groups = scores.map((score) => ({
    score,
    items: items.filter((item) => item.group === score.group),
  }))

  const toggle = (id: string) => {
    if (disabled) return
    onItemsChange(
      items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    )
  }

  return (
    <div className="space-y-3">
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 className="text-[13px] font-semibold text-fg">Strategy checklist</h3>
            <p className="mt-0.5 text-[10px] text-dim">
              {templates.find((template) => template.id === templateId)?.name ?? 'Custom checklist'}
            </p>
          </div>
          <ScoreRing value={overallPct} />
        </div>

        <div className="space-y-2.5 px-4 py-3">
          {scores.map((score) => (
            <div key={score.group}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
                <span className="truncate text-muted">{groupLabel(score.group)}</span>
                <span className="shrink-0 font-mono text-dim">
                  {score.done}/{score.total}
                </span>
              </div>
              <ProgressBar
                value={score.pct}
                tone={score.pct === 100 ? 'green' : score.pct >= 50 ? 'blue' : 'amber'}
                height="h-1"
              />
            </div>
          ))}
        </div>

        {templates.length > 0 ? (
          <div className="border-t border-line px-4 py-3">
            <label className="label mb-1.5">Template</label>
            <select
              className="input input-sm"
              value={templateId}
              onChange={(event) => onTemplateChange(event.target.value)}
              disabled={disabled}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className={cn('rounded-xl border p-3.5', styles.wrap)}>
        <div className="flex items-start gap-2.5">
          <DecisionIcon size={20} className={cn('mt-0.5 shrink-0', styles.text)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('text-[15px] font-bold tracking-tight', styles.text)}>
                {styles.title}
              </span>
              <span className="rounded bg-ink/40 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-muted">
                {direction}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{styles.sub}</p>
          </div>
        </div>

        {blockers.length > 0 ? (
          <div className="mt-3 space-y-1.5 rounded-lg border border-loss/20 bg-loss/[0.07] p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-loss">
              <ShieldAlert size={11} /> Risk blockers
            </div>
            <ul className="space-y-1">
              {blockers.map((blocker) => (
                <li key={blocker} className="flex gap-1.5 text-[10px] leading-relaxed text-loss">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-loss" />
                  {blocker}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {missingMandatory.length > 0 ? (
          <div className="mt-2.5 space-y-1.5 rounded-lg border border-warn/20 bg-warn/[0.05] p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-warn">
              <AlertTriangle size={11} /> Missing mandatory conditions
            </div>
            <ul className="space-y-1">
              {missingMandatory.slice(0, 6).map((item) => (
                <li key={item} className="flex gap-1.5 text-[10px] leading-relaxed text-warn">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warn" />
                  {item}
                </li>
              ))}
              {missingMandatory.length > 6 ? (
                <li className="pl-2.5 text-[10px] text-warn/75">
                  +{missingMandatory.length - 6} more
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {decision === 'READY' ? (
          <div className="mt-2.5 flex gap-1.5 text-[10px] leading-relaxed text-profit/85">
            <Info size={11} className="mt-0.5 shrink-0" />
            Status is calculated from your rules. It never places or executes a trade.
          </div>
        ) : null}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h3 className="text-[12px] font-semibold text-fg">Conditions</h3>
          <span className="text-[10px] text-dim">
            {items.filter((item) => item.checked).length}/{items.length} checked
          </span>
        </div>
        <div className="divide-y divide-line/60">
          {groups.map(({ score, items: groupItems }) => (
            <div key={score.group} className="px-2 py-2">
              <div className="mb-1 flex items-center justify-between px-2 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {groupLabel(score.group)}
                </span>
                <span className="font-mono text-[9px] text-dim">
                  {score.done}/{score.total}
                </span>
              </div>
              <div className="space-y-0.5">
                {groupItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    disabled={disabled}
                    className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition hover:bg-panel-2/60 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span
                      className={cn(
                        'mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
                        item.checked
                          ? 'border-accent bg-accent text-white'
                          : 'border-line-2 bg-ink/50',
                      )}
                    >
                      {item.checked ? <Check size={11} strokeWidth={3} /> : null}
                    </span>
                    <span
                      className={cn(
                        'flex-1 text-[11px] leading-snug transition',
                        item.checked ? 'text-fg' : 'text-muted',
                      )}
                    >
                      {item.text}
                      {item.mandatory ? (
                        <span className="ml-1.5 rounded bg-warn/10 px-1 py-[1px] align-middle text-[8px] font-semibold uppercase tracking-wide text-warn">
                          req
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <label className="label" htmlFor="checklist-notes">
          Checklist notes
        </label>
        <textarea
          id="checklist-notes"
          className="input min-h-[80px] text-[12px]"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Confluence, level quality, news context, anything that affects the decision…"
        />
        {chartScreenshot && onOpenScreenshot ? (
          <button
            type="button"
            onClick={onOpenScreenshot}
            className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-medium text-accent-2 hover:underline"
          >
            <CheckCircle2 size={11} /> Chart screenshot attached
          </button>
        ) : (
          <p className="mt-2 text-[10px] text-dim">
            Attach the chart screenshot on the plan form — it is saved with this checklist.
          </p>
        )}
      </div>
    </div>
  )
}

/** Small read-only summary used in plan cards / history rows. */
export function ChecklistInline({
  decision,
  overallPct,
  compact = false,
}: {
  decision: Decision
  overallPct: number
  compact?: boolean
}) {
  const tone =
    decision === 'READY'
      ? 'text-profit'
      : decision === 'WAIT'
        ? 'text-warn'
        : 'text-loss'
  return (
    <Fragment>
      <div className={cn('flex items-center gap-1.5', tone)}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        <span className={cn('font-semibold', compact ? 'text-[10px]' : 'text-[11px]')}>
          {decision}
        </span>
        {!compact ? (
          <span className="font-mono text-[10px] text-dim">{overallPct}%</span>
        ) : null}
      </div>
    </Fragment>
  )
}

export function ToggleTemplateItem({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (value: boolean) => void
}) {
  return <Toggle checked={enabled} onChange={onChange} label="Enable item" />
}
