import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  ClipboardList,
  FileText,
  History,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import type {
  ChecklistRun,
  Decision,
  Plan,
  PlanStatus,
  Trade,
} from '@/types'
import { CHECKLIST_GROUP_ORDER } from '@/types'
import { useGroupLabel } from '@/components/checklist/useGroupLabel'
import { useData } from '@/store/DataContext'
import { useToast } from '@/store/ToastContext'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Button,
  Card,
  DirectionBadge,
  EmptyState,
  InfoNote,
  ProgressBar,
} from '@/components/ui/primitives'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/form'
import { ImageLightbox } from '@/components/ui/ImageUpload'
import { PlanEditor } from '@/components/plan/PlanEditor'
import { TradeForm } from '@/components/trades/TradeForm'
import { TradeDetail } from '@/components/trades/TradeDetail'
import { summarizeChecklist } from '@/lib/checklist'
import { formatDateTime, timezoneShort } from '@/lib/dates'
import { lots as formatLots, money, price } from '@/lib/format'
import { cn } from '@/lib/utils'

type StatusFilter = PlanStatus | 'ALL'

const STATUS_VARIANTS: Record<PlanStatus, 'blue' | 'green' | 'amber' | 'slate'> = {
  Draft: 'slate',
  Planned: 'blue',
  Executed: 'green',
  Cancelled: 'amber',
}

const DECISION_TONES: Record<Decision, string> = {
  READY: 'text-profit',
  WAIT: 'text-warn',
  'NO TRADE': 'text-loss',
}

function decisionVariant(decision: Decision): 'green' | 'amber' | 'red' {
  if (decision === 'READY') return 'green'
  if (decision === 'WAIT') return 'amber'
  return 'red'
}

function PlanValue({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-line/70 bg-ink/35 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wide text-dim">{label}</div>
      <div className={cn('mt-0.5 text-[12px] font-semibold text-fg', mono && 'font-mono')}>
        {value}
      </div>
    </div>
  )
}

function RunDetail({
  run,
  plan,
  trade,
  tz,
  onClose,
  onEditPlan,
}: {
  run: ChecklistRun | null
  plan: Plan | undefined
  trade: Trade | undefined
  tz: string
  onClose: () => void
  onEditPlan: (plan: Plan) => void
}) {
  const [imageOpen, setImageOpen] = useState(false)
  const groupLabel = useGroupLabel()
  if (!run) return null
  const summary = summarizeChecklist(run)

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={`Checklist · ${run.setup}`}
        description={`${run.direction} · ${run.timeframe} · ${run.templateName} · ${formatDateTime(
          run.createdAt,
          tz,
          'dd MMM yyyy · HH:mm',
        )}`}
        footer={
          <>
            <span className="mr-auto text-[10px] text-dim">
              {run.finalized ? 'Finalized checklist' : 'Draft checklist'} ·{' '}
              {run.items.filter((item) => item.checked).length}/{run.items.length} conditions
            </span>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {plan ? (
              <Button variant="primary" onClick={() => onEditPlan(plan)}>
                <Pencil size={13} /> Open plan
              </Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-4">
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3',
              run.decision === 'READY'
                ? 'border-profit/25 bg-profit/[0.06]'
                : run.decision === 'WAIT'
                  ? 'border-warn/25 bg-warn/[0.06]'
                  : 'border-loss/25 bg-loss/[0.06]',
            )}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className={cn('text-base font-bold', DECISION_TONES[run.decision])}>
                  {run.decision}
                </span>
                <Badge variant={decisionVariant(run.decision)}>{run.finalized ? 'Final' : 'Draft'}</Badge>
              </div>
              <p className="mt-0.5 text-[10px] text-muted">
                {summary.mandatoryDone}/{summary.mandatoryTotal} mandatory conditions ·{' '}
                {summary.done}/{summary.total} total
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-xl font-semibold text-fg">{run.overallPct}%</div>
              <div className="text-[9px] uppercase tracking-wider text-dim">complete</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <PlanValue label="Entry" value={price(run.risk.entry, 2)} />
            <PlanValue label="Stop" value={price(run.risk.sl, 2)} />
            <PlanValue label="Target" value={price(run.risk.tp, 2)} />
            <PlanValue label="Lots" value={formatLots(run.risk.lots)} />
            <PlanValue label="Risk" value={money(run.risk.riskAmount)} />
            <PlanValue
              label="R:R"
              value={run.risk.rr > 0 ? `1:${run.risk.rr.toFixed(2)}` : '—'}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {run.scores.map((score) => (
              <div key={score.group} className="card p-3">
                <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-muted">{groupLabel(score.group)}</span>
                  <span className="font-mono text-dim">
                    {score.done}/{score.total} · {score.pct}%
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

          <div className="card overflow-hidden">
            <div className="border-b border-line px-4 py-2.5 text-[11px] font-semibold text-fg">
              Conditions
            </div>
            <div className="divide-y divide-line/60">
              {CHECKLIST_GROUP_ORDER.filter((group) =>
                run.items.some((item) => item.group === group),
              ).map((group) => (
                <div key={group} className="px-3 py-2">
                  <div className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-dim">
                    {groupLabel(group)}
                  </div>
                  <div className="space-y-0.5">
                    {run.items
                      .filter((item) => item.group === group)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-2 rounded px-1 py-1 text-[11px]"
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                              item.checked
                                ? 'border-profit/40 bg-profit/15 text-profit'
                                : 'border-line-2 bg-ink/50',
                            )}
                          >
                            {item.checked ? <Check size={9} strokeWidth={3} /> : null}
                          </span>
                          <span className={item.checked ? 'text-fg' : 'text-muted'}>
                            {item.text}
                            {item.mandatory ? (
                              <span className="ml-1.5 rounded bg-warn/10 px-1 py-px text-[8px] font-semibold uppercase text-warn">
                                req
                              </span>
                            ) : null}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {run.notes ? (
            <div className="card p-3.5">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-dim">
                Checklist notes
              </div>
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
                {run.notes}
              </p>
            </div>
          ) : null}

          {run.screenshot ? (
            <button
              type="button"
              onClick={() => setImageOpen(true)}
              className="block w-full overflow-hidden rounded-xl border border-line"
            >
              <img
                src={run.screenshot}
                alt="Checklist chart screenshot"
                className="h-56 w-full object-cover transition hover:opacity-90"
              />
            </button>
          ) : null}

          <div className="grid gap-2 text-[10px] text-dim sm:grid-cols-2">
            <div className="rounded-lg border border-line/70 bg-ink/40 p-2.5">
              Linked plan: <span className="text-muted">{plan ? plan.setup : 'None'}</span>
            </div>
            <div className="rounded-lg border border-line/70 bg-ink/40 p-2.5">
              Linked trade:{' '}
              <span className="text-muted">
                {trade ? `T-${String(trade.seq).padStart(4, '0')} · ${money(trade.pnl)}` : 'None'}
              </span>
            </div>
          </div>

          {!plan && !trade ? (
            <InfoNote tone="slate" icon={<ClipboardList size={12} />}>
              This checklist is not linked to a plan or trade. It remains in your history as a
              standalone pre-trade check.
            </InfoNote>
          ) : null}
        </div>
      </Modal>
      <ImageLightbox
        src={run.screenshot}
        alt="Checklist screenshot"
        open={imageOpen}
        onClose={() => setImageOpen(false)}
      />
    </>
  )
}

export function TradingPlanPage() {
  const { data, deletePlan, deleteChecklist, deleteTrade } = useData()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { settings, plans, checklists, trades } = data
  const tz = settings.timezone

  const [tab, setTab] = useState<'plans' | 'history'>(
    searchParams.get('tab') === 'checklists' ? 'history' : 'plans',
  )
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [setupFilter, setSetupFilter] = useState('ALL')
  const [historyDecision, setHistoryDecision] = useState<Decision | 'ALL'>('ALL')
  const [editor, setEditor] = useState<{ plan?: Plan; prefill?: Partial<Plan> } | null>(null)
  const location = useLocation()
  const [tradePlan, setTradePlan] = useState<Plan | undefined>(undefined)
  const [runDetail, setRunDetail] = useState<ChecklistRun | null>(null)
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null)
  const [deleteRunTarget, setDeleteRunTarget] = useState<ChecklistRun | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (searchParams.get('tab') === 'checklists') setTab('history')
    if (searchParams.get('new') === '1') {
      const prefill = (location.state as { prefill?: Partial<Plan> } | null)?.prefill
      setEditor(prefill ? { prefill } : {})
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
      return
    }
    const editId = searchParams.get('edit')
    if (editId) {
      const target = plans.find((plan) => plan.id === editId)
      if (target) setEditor({ plan: target })
      const next = new URLSearchParams(searchParams)
      next.delete('edit')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, plans, setSearchParams, location.state])

  const filteredPlans = useMemo(() => {
    const query = search.trim().toLowerCase()
    return plans
      .filter((plan) => status === 'ALL' || plan.status === status)
      .filter((plan) => setupFilter === 'ALL' || plan.setup === setupFilter)
      .filter((plan) => {
        if (!query) return true
        return [plan.setup, plan.levelType, plan.levelNotes, plan.reasoning]
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
      .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
  }, [plans, status, setupFilter, search])

  const filteredRuns = useMemo(() => {
    const query = search.trim().toLowerCase()
    return checklists
      .filter((run) => historyDecision === 'ALL' || run.decision === historyDecision)
      .filter((run) => {
        if (!query) return true
        return [run.setup, run.templateName, run.levelType, run.notes]
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [checklists, historyDecision, search])

  const counts = useMemo(
    () => ({
      total: plans.length,
      draft: plans.filter((plan) => plan.status === 'Draft').length,
      planned: plans.filter((plan) => plan.status === 'Planned').length,
      executed: plans.filter((plan) => plan.status === 'Executed').length,
      ready: checklists.filter((run) => run.decision === 'READY').length,
    }),
    [plans, checklists],
  )

  const handleDeletePlan = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deletePlan(deleteTarget.id)
      toast('Plan deleted. Linked checklist links were cleared.', 'success')
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteRun = async () => {
    if (!deleteRunTarget) return
    setDeleting(true)
    try {
      await deleteChecklist(deleteRunTarget.id)
      toast('Checklist removed from history.', 'success')
      setDeleteRunTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteTrade = async (trade: Trade) => {
    await deleteTrade(trade.id)
    toast(`Trade T-${String(trade.seq).padStart(4, '0')} deleted.`, 'success')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Trading Plan"
        title="Plan before the trade"
        description={`Build a trade plan, run your strategy checklist and let the numerical risk rules decide READY, WAIT or NO TRADE. Times use ${timezoneShort(tz)}.`}
        actions={
          <>
            <Button variant="soft" onClick={() => setTab('history')}>
              <History size={14} /> Checklist history
            </Button>
            <Button variant="primary" onClick={() => setEditor({})}>
              <Plus size={14} /> New plan
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: 'All plans', value: counts.total, tone: 'text-fg' },
          { label: 'Drafts', value: counts.draft, tone: 'text-muted' },
          { label: 'Planned', value: counts.planned, tone: 'text-accent-2' },
          { label: 'Executed', value: counts.executed, tone: 'text-profit' },
          { label: 'READY checks', value: counts.ready, tone: 'text-profit' },
        ].map((item) => (
          <Card key={item.label} className="px-3.5 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-dim">
              {item.label}
            </div>
            <div className={cn('mt-0.5 font-mono text-lg font-semibold', item.tone)}>
              {item.value}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-px">
        <div className="flex gap-1">
          {[
            { id: 'plans' as const, label: 'Plans', icon: ClipboardList, count: plans.length },
            {
              id: 'history' as const,
              label: 'Checklist history',
              icon: ClipboardCheck,
              count: checklists.length,
            },
          ].map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id)
                  setSearch('')
                }}
                className={cn(
                  '-mb-px flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5 pt-1 text-[12px] font-semibold transition',
                  tab === item.id
                    ? 'border-accent text-fg'
                    : 'border-transparent text-muted hover:text-fg',
                )}
              >
                <Icon size={13} />
                {item.label}
                <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[9px] text-dim">
                  {item.count}
                </span>
              </button>
            )
          })}
        </div>
        <div className="pb-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={tab === 'plans' ? 'Search plans…' : 'Search checklists…'}
            className="w-[230px]"
          />
        </div>
      </div>

      {tab === 'plans' ? (
        <>
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <select
              className="input input-sm w-auto min-w-[120px]"
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              aria-label="Filter plans by status"
            >
              <option value="ALL">All statuses</option>
              <option value="Draft">Draft</option>
              <option value="Planned">Planned</option>
              <option value="Executed">Executed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <select
              className="input input-sm w-auto min-w-[150px]"
              value={setupFilter}
              onChange={(event) => setSetupFilter(event.target.value)}
              aria-label="Filter plans by setup"
            >
              <option value="ALL">All setups</option>
              {settings.setups.map((setup) => (
                <option key={setup.id} value={setup.name}>
                  {setup.name}
                </option>
              ))}
            </select>
            <span className="ml-auto text-[10px] text-dim">
              {filteredPlans.length} of {plans.length} plans
            </span>
            {(status !== 'ALL' || setupFilter !== 'ALL' || search) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setStatus('ALL')
                  setSetupFilter('ALL')
                  setSearch('')
                }}
              >
                Reset filters
              </Button>
            )}
          </Card>

          {filteredPlans.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {filteredPlans.map((plan) => {
                const run = plan.checklistId
                  ? checklists.find((item) => item.id === plan.checklistId)
                  : undefined
                const trade = plan.tradeId
                  ? trades.find((item) => item.id === plan.tradeId)
                  : undefined
                return (
                  <Card key={plan.id} className="flex flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <DirectionBadge direction={plan.direction} />
                        <Badge variant={STATUS_VARIANTS[plan.status]}>{plan.status}</Badge>
                        {run ? (
                          <span
                            className={cn('text-[10px] font-semibold', DECISION_TONES[run.decision])}
                          >
                            {run.decision}
                          </span>
                        ) : null}
                      </div>
                      <span className="font-mono text-[10px] text-dim">
                        {formatDateTime(plan.dateTime, tz, 'dd MMM · HH:mm')}
                      </span>
                    </div>

                    <h3 className="mt-2 truncate text-[14px] font-semibold text-fg">{plan.setup}</h3>
                    <div className="mt-0.5 text-[10px] text-muted">
                      {plan.timeframe} · {plan.session} · {plan.marketDirection} ·{' '}
                      {plan.levelType}
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                      <PlanValue label="Entry" value={price(plan.entry, 2)} />
                      <PlanValue label="Stop" value={price(plan.sl, 2)} />
                      <PlanValue label="Target" value={price(plan.tp, 2)} />
                      <PlanValue label="Risk" value={money(plan.riskAmount)} />
                      <PlanValue label="Lots" value={formatLots(plan.lots)} />
                      <PlanValue
                        label="R:R"
                        value={plan.rr > 0 ? `1:${plan.rr.toFixed(2)}` : '—'}
                      />
                    </div>

                    {run && run.items.length === 0 ? (
                      <div className="mt-3 text-[10px] text-dim">
                        No strategy checklist (news trade) · risk check: {run.decision}
                      </div>
                    ) : run ? (
                      <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between text-[10px]">
                          <span className="text-dim">Checklist</span>
                          <span className="font-mono text-muted">{run.overallPct}%</span>
                        </div>
                        <ProgressBar
                          value={run.overallPct}
                          tone={
                            run.overallPct === 100
                              ? 'green'
                              : run.overallPct >= 60
                                ? 'blue'
                                : 'amber'
                          }
                          height="h-1"
                        />
                      </div>
                    ) : null}

                    {(plan.reasoning || plan.levelNotes) && (
                      <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-muted">
                        {plan.reasoning || plan.levelNotes}
                      </p>
                    )}

                    {trade ? (
                      <button
                        type="button"
                        onClick={() => setSelectedTrade(trade)}
                        className="mt-3 flex items-center justify-between rounded-lg border border-profit/15 bg-profit/[0.05] px-2.5 py-1.5 text-[10px] transition hover:border-profit/30"
                      >
                        <span className="text-muted">
                          Executed as T-{String(trade.seq).padStart(4, '0')}
                        </span>
                        <span
                          className={cn(
                            'font-mono font-semibold',
                            trade.pnl > 0
                              ? 'text-profit'
                              : trade.pnl < 0
                                ? 'text-loss'
                                : 'text-muted',
                          )}
                        >
                          {money(trade.pnl)}
                        </span>
                      </button>
                    ) : null}

                    <div className="mt-auto flex items-center gap-1.5 pt-3">
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() => setEditor({ plan })}
                        className="flex-1"
                      >
                        <Pencil size={12} /> Edit
                      </Button>
                      {!trade ? (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setTradePlan(plan)}
                          className="flex-1"
                        >
                          <ArrowRight size={12} /> Log trade
                        </Button>
                      ) : null}
                      {run ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRunDetail(run)}
                          aria-label="View checklist"
                        >
                          <ClipboardCheck size={13} />
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(plan)}
                        aria-label="Delete plan"
                      >
                        <Trash2 size={13} className="text-loss/80" />
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          ) : (
            <EmptyState
              icon={<ClipboardList size={20} />}
              title={plans.length === 0 ? 'No trade plans yet' : 'No plans match these filters'}
              description={
                plans.length === 0
                  ? 'A plan turns a chart idea into a defined risk. Start with the level, the confirmation, the invalidation and the target.'
                  : 'Adjust the status, setup or search filters to find the plan you need.'
              }
              action={
                plans.length === 0 ? (
                  <Button variant="primary" onClick={() => setEditor({})}>
                    <Plus size={14} /> Create your first plan
                  </Button>
                ) : (
                  <Button
                    variant="soft"
                    onClick={() => {
                      setStatus('ALL')
                      setSetupFilter('ALL')
                      setSearch('')
                    }}
                  >
                    Reset filters
                  </Button>
                )
              }
            />
          )}
        </>
      ) : (
        <>
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <select
              className="input input-sm w-auto min-w-[130px]"
              value={historyDecision}
              onChange={(event) =>
                setHistoryDecision(event.target.value as Decision | 'ALL')
              }
              aria-label="Filter checklist history by decision"
            >
              <option value="ALL">All decisions</option>
              <option value="READY">READY</option>
              <option value="WAIT">WAIT</option>
              <option value="NO TRADE">NO TRADE</option>
            </select>
            <span className="ml-auto text-[10px] text-dim">
              {filteredRuns.length} of {checklists.length} checklist runs
            </span>
            {historyDecision !== 'ALL' || search ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setHistoryDecision('ALL')
                  setSearch('')
                }}
              >
                Reset filters
              </Button>
            ) : null}
          </Card>

          {filteredRuns.length > 0 ? (
            <Card className="overflow-hidden">
              <div className="scroll-thin overflow-x-auto">
                <table className="table-base min-w-[880px]">
                  <thead>
                    <tr>
                      <th>Created</th>
                      <th>Setup</th>
                      <th>Direction</th>
                      <th>Template</th>
                      <th>Decision</th>
                      <th>Score</th>
                      <th>Linked</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRuns.map((run) => {
                      const plan = run.planId
                        ? plans.find((item) => item.id === run.planId)
                        : undefined
                      const trade = run.tradeId
                        ? trades.find((item) => item.id === run.tradeId)
                        : undefined
                      const summary = summarizeChecklist(run)
                      return (
                        <tr key={run.id}>
                          <td className="whitespace-nowrap text-[11px] text-muted">
                            {formatDateTime(run.createdAt, tz, 'dd MMM yyyy · HH:mm')}
                          </td>
                          <td>
                            <div className="text-[12px] font-medium text-fg">{run.setup}</div>
                            <div className="text-[9px] text-dim">
                              {run.timeframe} · {run.levelType}
                            </div>
                          </td>
                          <td>
                            <DirectionBadge direction={run.direction} />
                          </td>
                          <td className="max-w-[170px] truncate text-[11px] text-muted">
                            {run.templateName}
                          </td>
                          <td>
                            <Badge variant={decisionVariant(run.decision)}>
                              {run.decision}
                            </Badge>
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-fg">
                                {run.overallPct}%
                              </span>
                              <span className="text-[9px] text-dim">
                                {summary.mandatoryDone}/{summary.mandatoryTotal} req
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="flex flex-col gap-0.5 text-[10px]">
                              {plan ? (
                                <span className="text-muted">Plan · {plan.status}</span>
                              ) : null}
                              {trade ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedTrade(trade)}
                                  className="text-left text-accent-2 hover:underline"
                                >
                                  T-{String(trade.seq).padStart(4, '0')}
                                </button>
                              ) : null}
                              {!plan && !trade ? <span className="text-dim">Standalone</span> : null}
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setRunDetail(run)}
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteRunTarget(run)}
                                aria-label="Delete checklist"
                              >
                                <Trash2 size={13} className="text-loss/80" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={<History size={20} />}
              title={
                checklists.length === 0
                  ? 'No checklist history yet'
                  : 'No checklist runs match these filters'
              }
              description={
                checklists.length === 0
                  ? 'Every plan saves a checklist snapshot with its score and decision, so you can review the process later.'
                  : 'Clear the decision filter or search to see more checklist runs.'
              }
              action={
                checklists.length === 0 ? (
                  <Button variant="primary" onClick={() => setEditor({})}>
                    <Plus size={14} /> Create a plan
                  </Button>
                ) : (
                  <Button
                    variant="soft"
                    onClick={() => {
                      setHistoryDecision('ALL')
                      setSearch('')
                    }}
                  >
                    Reset filters
                  </Button>
                )
              }
            />
          )}

          <InfoNote tone="blue" icon={<FileText size={12} />}>
            Checklist snapshots are immutable records of what you checked at the time. Opening a
            linked plan lets you edit the live version; the saved snapshot remains in history
            until you delete it.
          </InfoNote>
        </>
      )}

      {editor ? (
        <PlanEditor plan={editor.plan} prefill={editor.prefill} onClose={() => setEditor(null)} />
      ) : null}

      {tradePlan ? (
        <TradeForm plan={tradePlan} onClose={() => setTradePlan(undefined)} />
      ) : null}

      {runDetail ? (
        <RunDetail
          run={runDetail}
          plan={
            runDetail.planId ? plans.find((plan) => plan.id === runDetail.planId) : undefined
          }
          trade={
            runDetail.tradeId ? trades.find((trade) => trade.id === runDetail.tradeId) : undefined
          }
          tz={tz}
          onClose={() => setRunDetail(null)}
          onEditPlan={(plan) => {
            setRunDetail(null)
            setEditor({ plan })
          }}
        />
      ) : null}

      <TradeDetail
        trade={selectedTrade}
        open={Boolean(selectedTrade)}
        onClose={() => setSelectedTrade(null)}
        onEdit={(trade) => {
          setSelectedTrade(null)
          setTradePlan(undefined)
          navigate(`/journal?edit=${trade.id}`)
        }}
        onDelete={handleDeleteTrade}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        busy={deleting}
        title="Delete this plan?"
        description="The plan and its live checklist will be removed. Any linked checklist snapshot stays in history but loses its plan link. This cannot be undone."
        confirmLabel="Delete plan"
        onConfirm={handleDeletePlan}
      />

      <ConfirmDialog
        open={Boolean(deleteRunTarget)}
        onClose={() => setDeleteRunTarget(null)}
        busy={deleting}
        title="Delete this checklist run?"
        description="The saved checklist snapshot will be removed from history. Linked plans and trades keep their records but lose the checklist link. This cannot be undone."
        confirmLabel="Delete checklist"
        onConfirm={handleDeleteRun}
      />
    </div>
  )
}
