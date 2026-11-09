import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Brain,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Frown,
  Lightbulb,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import type { PlanFollowed, PsychEntry, WeeklyReflection } from '@/types'
import { useData } from '@/store/DataContext'
import { useToast } from '@/store/ToastContext'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Divider,
  EmptyState,
  InfoNote,
  ProgressBar,
  SectionTitle,
} from '@/components/ui/primitives'
import { StatCard } from '@/components/ui/StatCard'
import { Tabs } from '@/components/ui/Tabs'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { SelectField, TextAreaField } from '@/components/ui/form'
import { EMOTIONAL_STATES, TRADE_REASONS } from '@/lib/defaults'
import {
  calculateDisciplineScore,
  mistakeCounts,
  ruleBreaks,
} from '@/lib/metrics'
import {
  formatDateKey,
  formatDateTime,
  nowIso,
  startOfWeekKey,
  todayKey,
  toDateKey,
  weekRangeLabel,
} from '@/lib/dates'
import { moneySigned, pct } from '@/lib/format'
import { cn, uid } from '@/lib/utils'

interface PsychDraft {
  id: string
  createdAt: string
  date: string
  preState: string
  confidence: number
  reasons: string[]
  preNotes: string
  planFollowed: PlanFollowed
  patient: boolean | null
  followedPlan: boolean | null
  overtraded: boolean | null
  revenge: boolean | null
  movedSL: boolean | null
  improvement: string
  postNotes: string
}

interface ReflectionDraft {
  id: string
  createdAt: string
  weekStart: string
  notes: string
}

const DISCIPLINE_FIELDS: {
  key: keyof Pick<
    PsychDraft,
    'patient' | 'followedPlan' | 'overtraded' | 'revenge' | 'movedSL'
  >
  label: string
  goodAnswer: boolean
  description: string
}[] = [
  {
    key: 'patient',
    label: 'Patient entries',
    goodAnswer: true,
    description: 'I waited for my level and confirmation instead of chasing.',
  },
  {
    key: 'followedPlan',
    label: 'Followed the plan',
    goodAnswer: true,
    description: 'The trade matched my written plan and checklist.',
  },
  {
    key: 'overtraded',
    label: 'Overtraded',
    goodAnswer: false,
    description: 'I took more trades or size than my rules allow.',
  },
  {
    key: 'revenge',
    label: 'Revenge traded',
    goodAnswer: false,
    description: 'I tried to win back a loss immediately.',
  },
  {
    key: 'movedSL',
    label: 'Moved my stop loss',
    goodAnswer: false,
    description: 'I widened or removed a stop after entry.',
  },
]

const PLAN_FOLLOWED_OPTIONS: { value: PlanFollowed; label: string }[] = [
  { value: 'Yes', label: 'Yes — I followed it' },
  { value: 'No', label: 'No — I broke it' },
  { value: 'Not yet', label: 'Not yet — still in progress' },
]

function scoreTone(score: number | null): string {
  if (score == null) return 'text-muted'
  if (score >= 80) return 'text-profit'
  if (score >= 50) return 'text-warn'
  return 'text-loss'
}

function scoreVariant(score: number | null): 'green' | 'amber' | 'red' | 'slate' {
  if (score == null) return 'slate'
  if (score >= 80) return 'green'
  if (score >= 50) return 'amber'
  return 'red'
}

function TriState({
  label,
  description,
  value,
  goodAnswer,
  onChange,
}: {
  label: string
  description: string
  value: boolean | null
  goodAnswer: boolean
  onChange: (value: boolean | null) => void
}) {
  const options: { value: boolean | null; label: string }[] = [
    { value: true, label: 'Yes' },
    { value: false, label: 'No' },
    { value: null, label: 'Skip' },
  ]
  const isGood = value == null ? null : value === goodAnswer
  return (
    <div className="rounded-lg border border-line/80 bg-ink/35 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-fg">{label}</div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-dim">{description}</p>
        </div>
        <div className="segmented shrink-0">
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              data-active={value === option.value}
              onClick={() => onChange(option.value)}
              className={cn(
                'min-w-[44px]',
                value === option.value && isGood === true
                  ? 'text-profit'
                  : value === option.value && isGood === false
                    ? 'text-loss'
                    : '',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function PsychForm({
  entry,
  onClose,
}: {
  entry?: PsychEntry
  onClose: () => void
}) {
  const { data, savePsych } = useData()
  const { toast } = useToast()
  const tz = data.settings.timezone
  const [draft, setDraft] = useState<PsychDraft>(() => ({
    id: entry?.id ?? uid('psych'),
    createdAt: entry?.createdAt ?? nowIso(),
    date: entry?.date ?? todayKey(tz),
    preState: entry?.preState ?? 'Calm',
    confidence: entry?.confidence ?? 5,
    reasons: entry?.reasons ?? [],
    preNotes: entry?.preNotes ?? '',
    planFollowed: entry?.planFollowed ?? 'Not yet',
    patient: entry?.patient ?? null,
    followedPlan: entry?.followedPlan ?? null,
    overtraded: entry?.overtraded ?? null,
    revenge: entry?.revenge ?? null,
    movedSL: entry?.movedSL ?? null,
    improvement: entry?.improvement ?? '',
    postNotes: entry?.postNotes ?? '',
  }))
  const [busy, setBusy] = useState(false)

  const score = calculateDisciplineScore(draft)
  const breaks = ruleBreaks(draft)
  const answered = DISCIPLINE_FIELDS.filter((field) => draft[field.key] != null).length

  const set = <K extends keyof PsychDraft>(key: K, value: PsychDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const toggleReason = (reason: string) => {
    set(
      'reasons',
      draft.reasons.includes(reason)
        ? draft.reasons.filter((item) => item !== reason)
        : [...draft.reasons, reason],
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await savePsych({
        id: draft.id,
        date: draft.date,
        createdAt: draft.createdAt,
        updatedAt: nowIso(),
        preState: draft.preState,
        confidence: draft.confidence,
        reasons: draft.reasons,
        preNotes: draft.preNotes.trim(),
        planFollowed: draft.planFollowed,
        patient: draft.patient,
        followedPlan: draft.followedPlan,
        overtraded: draft.overtraded,
        revenge: draft.revenge,
        movedSL: draft.movedSL,
        improvement: draft.improvement.trim(),
        postNotes: draft.postNotes.trim(),
        disciplineScore: score,
      })
      toast(entry ? 'Check-in updated.' : 'Check-in saved.', 'success')
      onClose()
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Could not save this check-in.',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={entry ? 'Edit psychological check-in' : 'New psychological check-in'}
      description="Record the state you were in and how you behaved. This is a private review — it is never sent anywhere."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="psych-form" variant="primary" loading={busy}>
            {entry ? 'Save changes' : 'Save check-in'}
          </Button>
        </>
      }
    >
      <form id="psych-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="psych-date">
              Date
            </label>
            <input
              id="psych-date"
              type="date"
              className="input"
              value={draft.date}
              onChange={(event) => set('date', event.target.value)}
              required
            />
          </div>
          <SelectField
            label="Pre-trade emotional state"
            value={draft.preState}
            onChange={(value) => set('preState', value)}
            options={EMOTIONAL_STATES.map((state) => ({ value: state, label: state }))}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label mb-0" htmlFor="psych-confidence">
              Confidence before trading
            </label>
            <span className="font-mono text-[12px] font-semibold text-accent-2">
              {draft.confidence}/10
            </span>
          </div>
          <input
            id="psych-confidence"
            type="range"
            min={1}
            max={10}
            step={1}
            value={draft.confidence}
            onChange={(event) => set('confidence', Number(event.target.value))}
            className="w-full accent-accent"
          />
          <div className="mt-1 flex justify-between text-[9px] text-dim">
            <span>No confidence</span>
            <span>Overconfident</span>
          </div>
        </div>

        <div>
          <span className="label">Why were you taking this trade?</span>
          <div className="flex flex-wrap gap-1.5">
            {TRADE_REASONS.map((reason) => {
              const active = draft.reasons.includes(reason)
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => toggleReason(reason)}
                  className={cn(
                    'rounded-md border px-2.5 py-1.5 text-[11px] transition',
                    active
                      ? 'border-accent/40 bg-accent/10 text-accent-2'
                      : 'border-line bg-panel-2/50 text-muted hover:text-fg',
                  )}
                >
                  {reason}
                </button>
              )
            })}
          </div>
        </div>

        <TextAreaField
          label="Pre-trade notes"
          value={draft.preNotes}
          onChange={(value) => set('preNotes', value)}
          placeholder="What was on your mind? Sleep, stress, news, recent losses…"
          rows={2}
        />

        <SectionTitle
          title="Behaviour review"
          subtitle="Answer what actually happened. Skip anything that does not apply to this session."
        />

        <div className="space-y-1.5">
          {DISCIPLINE_FIELDS.map((field) => (
            <TriState
              key={field.key}
              label={field.label}
              description={field.description}
              value={draft[field.key]}
              goodAnswer={field.goodAnswer}
              onChange={(value) => set(field.key, value)}
            />
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Did you follow your trading plan?"
            value={draft.planFollowed}
            onChange={(value) => set('planFollowed', value as PlanFollowed)}
            options={PLAN_FOLLOWED_OPTIONS}
          />
          <div className="rounded-lg border border-line/80 bg-ink/40 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-[0.08em] text-dim">
                Discipline score
              </span>
              <Badge variant={scoreVariant(score)}>
                {score == null ? 'Not scored' : `${score}%`}
              </Badge>
            </div>
            <div className={cn('mt-1 font-mono text-xl font-semibold', scoreTone(score))}>
              {score == null ? '—' : `${score}%`}
            </div>
            <div className="mt-1 text-[10px] text-muted">
              {breaks === 0
                ? 'No rule breaks recorded'
                : `${breaks} rule break${breaks === 1 ? '' : 's'} recorded`}{' '}
              · {answered}/{DISCIPLINE_FIELDS.length} answered
            </div>
          </div>
        </div>

        <TextAreaField
          label="What will you improve next time?"
          value={draft.improvement}
          onChange={(value) => set('improvement', value)}
          placeholder="One specific, actionable change — not a vague promise."
          rows={2}
        />

        <TextAreaField
          label="Post-session notes"
          value={draft.postNotes}
          onChange={(value) => set('postNotes', value)}
          placeholder="How did you feel after? Did the process hold under pressure?"
          rows={2}
        />

        <InfoNote tone="blue" icon={<Brain size={12} />}>
          The discipline score is calculated from the questions you answer: good behaviours count in
          your favour, and overtrading, revenge trading or moving a stop count against you. It
          describes process, not profitability.
        </InfoNote>
      </form>
    </Modal>
  )
}

function ReflectionForm({
  reflection,
  onClose,
}: {
  reflection?: WeeklyReflection
  onClose: () => void
}) {
  const { data, saveReflection } = useData()
  const { toast } = useToast()
  const tz = data.settings.timezone
  const [draft, setDraft] = useState<ReflectionDraft>(() => ({
    id: reflection?.id ?? uid('reflection'),
    createdAt: reflection?.createdAt ?? nowIso(),
    weekStart: reflection?.weekStart ?? startOfWeekKey(todayKey(tz)),
    notes: reflection?.notes ?? '',
  }))
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.notes.trim()) {
      toast('Write at least one reflection before saving.', 'info')
      return
    }
    setBusy(true)
    try {
      const collision = data.reflections.find(
        (item) => item.weekStart === draft.weekStart && item.id !== draft.id,
      )
      const target = collision ?? draft
      await saveReflection({
        id: target.id,
        weekStart: target.weekStart,
        notes: draft.notes.trim(),
        createdAt: collision ? collision.createdAt : draft.createdAt,
        updatedAt: nowIso(),
      })
      toast(
        collision ? 'Existing reflection for that week was updated.' : 'Weekly reflection saved.',
        'success',
      )
      onClose()
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Could not save this reflection.',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={reflection ? 'Edit weekly reflection' : 'New weekly reflection'}
      description="Review the week as a process: what worked, what broke, and what changes next week."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="reflection-form" variant="primary" loading={busy}>
            Save reflection
          </Button>
        </>
      }
    >
      <form id="reflection-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="reflection-week">
            Week starting (Monday)
          </label>
          <input
            id="reflection-week"
            type="date"
            className="input"
            value={draft.weekStart}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                weekStart: startOfWeekKey(event.target.value),
              }))
            }
            required
          />
          <p className="mt-1 text-[10px] text-dim">
            {weekRangeLabel(draft.weekStart)} · dates use your display timezone
          </p>
        </div>
        <TextAreaField
          label="Weekly review"
          value={draft.notes}
          onChange={(value) => setDraft((current) => ({ ...current, notes: value }))}
          placeholder="What did you do well? Which rule was hardest to keep? What is the one change for next week?"
          rows={8}
        />
        {data.reflections.some(
          (item) => item.weekStart === draft.weekStart && item.id !== draft.id,
        ) ? (
          <InfoNote tone="amber" icon={<ShieldAlert size={12} />}>
            A reflection already exists for this week. Saving will update that existing entry.
          </InfoNote>
        ) : null}
      </form>
    </Modal>
  )
}

export function PsychologyPage() {
  const { data, deletePsych, deleteReflection } = useData()
  const { toast } = useToast()
  const { settings, trades, psych, reflections } = data
  const tz = settings.timezone
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState('checkins')
  const [form, setForm] = useState<{ entry?: PsychEntry } | null>(null)
  const [reflectionForm, setReflectionForm] = useState<{
    reflection?: WeeklyReflection
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PsychEntry | null>(null)
  const [deleteReflectionTarget, setDeleteReflectionTarget] =
    useState<WeeklyReflection | null>(null)

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setForm({})
      setTab('checkins')
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const sortedEntries = useMemo(
    () =>
      [...psych].sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
      ),
    [psych],
  )
  const sortedReflections = useMemo(
    () => [...reflections].sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    [reflections],
  )

  const scored = psych.filter((entry) => entry.disciplineScore != null)
  const avgDiscipline =
    scored.length > 0
      ? scored.reduce((sum, entry) => sum + (entry.disciplineScore ?? 0), 0) / scored.length
      : null
  const totalBreaks = psych.reduce((sum, entry) => sum + ruleBreaks(entry), 0)
  const planDecided = psych.filter((entry) => entry.planFollowed !== 'Not yet')
  const planRate =
    planDecided.length > 0
      ? (planDecided.filter((entry) => entry.planFollowed === 'Yes').length /
          planDecided.length) *
        100
      : null
  const latest = sortedEntries[0]

  const mistakes = useMemo(() => mistakeCounts(trades), [trades])
  const maxMistake = mistakes[0]?.count ?? 0

  const checkinDays = useMemo(() => new Set(psych.map((entry) => entry.date)), [psych])
  const withCheckin = useMemo(
    () => trades.filter((trade) => checkinDays.has(toDateKey(trade.date, tz))),
    [trades, checkinDays, tz],
  )
  const withoutCheckin = useMemo(
    () => trades.filter((trade) => !checkinDays.has(toDateKey(trade.date, tz))),
    [trades, checkinDays, tz],
  )
  const avgPnl = (list: typeof trades) =>
    list.length > 0 ? list.reduce((sum, trade) => sum + trade.pnl, 0) / list.length : null

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Psychology"
        title="Trade the process, not the feeling"
        description="Check in before and after you trade, score your discipline honestly, and review the week. These entries are private, local and never used to generate trade signals."
        actions={
          <>
            <Button variant="soft" onClick={() => setReflectionForm({})}>
              <CalendarDays size={14} /> Weekly reflection
            </Button>
            <Button variant="primary" onClick={() => setForm({})}>
              <Plus size={14} /> New check-in
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          label="Check-ins"
          value={String(psych.length)}
          sub={latest ? `Latest ${formatDateKey(latest.date, 'dd MMM yyyy')}` : 'No entries yet'}
          icon={<Brain size={14} />}
        />
        <StatCard
          label="Avg discipline"
          value={avgDiscipline == null ? '—' : pct(avgDiscipline, 0)}
          tone={
            avgDiscipline == null
              ? 'default'
              : avgDiscipline >= 80
                ? 'profit'
                : avgDiscipline >= 50
                  ? 'warn'
                  : 'loss'
          }
          sub={`${scored.length} scored check-in${scored.length === 1 ? '' : 's'}`}
          icon={<CheckCircle2 size={14} />}
        />
        <StatCard
          label="Rule breaks logged"
          value={String(totalBreaks)}
          tone={totalBreaks === 0 ? 'profit' : 'warn'}
          sub="Across all recorded check-ins"
          icon={<ShieldAlert size={14} />}
        />
        <StatCard
          label="Plan followed"
          value={planRate == null ? '—' : pct(planRate, 0)}
          tone={planRate == null ? 'default' : planRate >= 80 ? 'profit' : 'warn'}
          sub={`${planDecided.length} decided check-in${planDecided.length === 1 ? '' : 's'}`}
          icon={<ClipboardCheck size={14} />}
        />
      </div>

      <Tabs
        tabs={[
          { id: 'checkins', label: 'Check-ins', count: psych.length, icon: <Brain size={13} /> },
          {
            id: 'reflections',
            label: 'Weekly reflections',
            count: reflections.length,
            icon: <CalendarDays size={13} />,
          },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'checkins' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            {sortedEntries.length > 0 ? (
              sortedEntries.map((entry) => {
                const score = entry.disciplineScore
                const breaks = ruleBreaks(entry)
                return (
                  <Card key={entry.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border border-line bg-panel-2">
                          <span className="font-mono text-[12px] font-semibold text-fg">
                            {score == null ? '—' : score}
                          </span>
                          <span className="text-[8px] uppercase tracking-wide text-dim">score</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[12px] font-semibold text-fg">
                              {formatDateKey(entry.date, 'EEE, dd MMM yyyy')}
                            </span>
                            <Badge variant="slate">{entry.preState}</Badge>
                            <Badge
                              variant={
                                entry.planFollowed === 'Yes'
                                  ? 'green'
                                  : entry.planFollowed === 'No'
                                    ? 'red'
                                    : 'amber'
                              }
                            >
                              Plan {entry.planFollowed}
                            </Badge>
                            {breaks > 0 ? (
                              <Badge variant="red">
                                {breaks} rule break{breaks === 1 ? '' : 's'}
                              </Badge>
                            ) : (
                              <Badge variant="green">No breaks</Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-dim">
                            <span>Confidence {entry.confidence}/10</span>
                            {entry.reasons.length > 0 ? (
                              <span>Reason: {entry.reasons.join(', ')}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setForm({ entry })}
                          aria-label="Edit check-in"
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(entry)}
                          aria-label="Delete check-in"
                        >
                          <Trash2 size={12} className="text-loss" />
                        </Button>
                      </div>
                    </div>

                    {entry.preNotes || entry.postNotes || entry.improvement ? (
                      <div className="mt-3 grid gap-2 border-t border-line/70 pt-3 sm:grid-cols-3">
                        {entry.preNotes ? (
                          <div>
                            <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-dim">
                              Before
                            </div>
                            <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">
                              {entry.preNotes}
                            </p>
                          </div>
                        ) : null}
                        {entry.postNotes ? (
                          <div>
                            <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-dim">
                              After
                            </div>
                            <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">
                              {entry.postNotes}
                            </p>
                          </div>
                        ) : null}
                        {entry.improvement ? (
                          <div>
                            <div className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-dim">
                              <Lightbulb size={9} /> Improve
                            </div>
                            <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">
                              {entry.improvement}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </Card>
                )
              })
            ) : (
              <Card className="p-4">
                <EmptyState
                  icon={<Brain size={20} />}
                  title="No psychological check-ins yet"
                  description="A check-in takes a minute. Record how you felt before the session, how you behaved, and one thing to improve. Honest data here is more useful than a perfect-looking journal."
                  action={
                    <Button variant="primary" onClick={() => setForm({})}>
                      <Plus size={14} /> Start your first check-in
                    </Button>
                  }
                />
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Mistake patterns"
                subtitle="Counted from the mistakes tagged in your journal."
                icon={<ShieldAlert size={14} />}
              />
              <div className="space-y-2.5 p-4">
                {mistakes.length > 0 ? (
                  mistakes.slice(0, 7).map((item) => (
                    <div key={item.mistake}>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate text-muted">{item.mistake}</span>
                        <span className="font-mono font-semibold text-fg">{item.count}</span>
                      </div>
                      <ProgressBar
                        value={maxMistake > 0 ? (item.count / maxMistake) * 100 : 0}
                        tone="red"
                        height="h-1"
                        className="mt-1"
                      />
                    </div>
                  ))
                ) : trades.length === 0 ? (
                  <p className="text-[11px] leading-relaxed text-muted">
                    Log trades with tagged mistakes to see recurring patterns here.
                  </p>
                ) : (
                  <div className="flex items-start gap-2 text-[11px] leading-relaxed text-profit">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                    No mistakes tagged in your recorded trades.
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Check-ins and results"
                subtitle="A simple same-day comparison — not proof of cause and effect."
                icon={<TrendingUp size={14} />}
              />
              <div className="space-y-3 p-4">
                <div className="rounded-lg border border-line/80 bg-ink/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted">Trades on check-in days</span>
                    <span className="font-mono text-[11px] text-fg">{withCheckin.length}</span>
                  </div>
                  <div className="mt-1 font-mono text-lg font-semibold text-fg">
                    {avgPnl(withCheckin) == null ? '—' : moneySigned(avgPnl(withCheckin) ?? 0)}
                    <span className="ml-1 text-[9px] font-normal text-dim">avg P/L</span>
                  </div>
                </div>
                <div className="rounded-lg border border-line/80 bg-ink/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted">Trades without a check-in</span>
                    <span className="font-mono text-[11px] text-fg">{withoutCheckin.length}</span>
                  </div>
                  <div className="mt-1 font-mono text-lg font-semibold text-fg">
                    {avgPnl(withoutCheckin) == null
                      ? '—'
                      : moneySigned(avgPnl(withoutCheckin) ?? 0)}
                    <span className="ml-1 text-[9px] font-normal text-dim">avg P/L</span>
                  </div>
                </div>
                <InfoNote tone="slate" icon={<Sparkles size={12} />}>
                  Small samples can mislead. Use this as a prompt to review your process, not as a
                  reason to force a check-in before every trade.
                </InfoNote>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Latest check-in"
                subtitle={latest ? formatDateKey(latest.date, 'dd MMM yyyy') : 'Nothing recorded yet'}
                icon={<Frown size={14} />}
              />
              <div className="p-4">
                {latest ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted">State</span>
                      <Badge variant="blue">{latest.preState}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted">Discipline</span>
                      <span
                        className={cn(
                          'font-mono text-[12px] font-semibold',
                          scoreTone(latest.disciplineScore),
                        )}
                      >
                        {latest.disciplineScore == null ? '—' : `${latest.disciplineScore}%`}
                      </span>
                    </div>
                    <Divider />
                    <p className="text-[11px] leading-relaxed text-muted">
                      {latest.improvement ||
                        latest.postNotes ||
                        latest.preNotes ||
                        'No notes on this check-in.'}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] leading-relaxed text-muted">
                    Your latest state and notes will appear here after the first check-in.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            {sortedReflections.length > 0 ? (
              sortedReflections.map((reflection) => (
                <Card key={reflection.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[12px] font-semibold text-fg">
                        {weekRangeLabel(reflection.weekStart)}
                      </div>
                      <div className="mt-0.5 text-[9px] text-dim">
                        Updated {formatDateTime(reflection.updatedAt, tz, 'dd MMM yyyy')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setReflectionForm({ reflection })}
                        aria-label="Edit reflection"
                      >
                        <Pencil size={12} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteReflectionTarget(reflection)}
                        aria-label="Delete reflection"
                      >
                        <Trash2 size={12} className="text-loss" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
                    {reflection.notes}
                  </p>
                </Card>
              ))
            ) : (
              <Card className="p-4">
                <EmptyState
                  icon={<CalendarDays size={20} />}
                  title="No weekly reflections yet"
                  description="At the end of the week, write what worked, which rule was hardest to keep, and the single change you will make next week."
                  action={
                    <Button variant="primary" onClick={() => setReflectionForm({})}>
                      <Plus size={14} /> Write a reflection
                    </Button>
                  }
                />
              </Card>
            )}
          </div>
          <div className="space-y-3">
            <InfoNote tone="blue" icon={<Lightbulb size={12} />}>
              A useful reflection is specific. “I will wait for the confirmation candle close” is
              actionable; “I will be more disciplined” is not.
            </InfoNote>
            <Card>
              <CardHeader
                title="Review routine"
                subtitle="A simple weekly loop."
                icon={<ClipboardCheck size={14} />}
              />
              <ol className="space-y-2 p-4 text-[11px] leading-relaxed text-muted">
                <li>
                  <span className="font-semibold text-fg">1. Count the rule breaks.</span> Look for
                  patterns, not one-off mistakes.
                </li>
                <li>
                  <span className="font-semibold text-fg">2. Compare plans to results.</span> A win
                  outside the plan is still a process failure.
                </li>
                <li>
                  <span className="font-semibold text-fg">3. Choose one change.</span> Keep it small
                  enough to actually follow next week.
                </li>
                <li>
                  <span className="font-semibold text-fg">4. Re-read it before Monday.</span> The
                  reflection only matters if it changes behaviour.
                </li>
              </ol>
            </Card>
            <Button variant="soft" className="w-full" onClick={() => setReflectionForm({})}>
              <Plus size={14} /> New weekly reflection
            </Button>
          </div>
        </div>
      )}

      {form ? <PsychForm entry={form.entry} onClose={() => setForm(null)} /> : null}

      {reflectionForm ? (
        <ReflectionForm
          reflection={reflectionForm.reflection}
          onClose={() => setReflectionForm(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          await deletePsych(deleteTarget.id)
          toast('Check-in deleted.', 'success')
          setDeleteTarget(null)
        }}
        title="Delete this check-in?"
        description="The psychological entry and its discipline score will be removed. This cannot be undone, and it does not affect your trades."
        confirmLabel="Delete check-in"
      />

      <ConfirmDialog
        open={Boolean(deleteReflectionTarget)}
        onClose={() => setDeleteReflectionTarget(null)}
        onConfirm={async () => {
          if (!deleteReflectionTarget) return
          await deleteReflection(deleteReflectionTarget.id)
          toast('Weekly reflection deleted.', 'success')
          setDeleteReflectionTarget(null)
        }}
        title="Delete this reflection?"
        description="The weekly notes will be removed. This cannot be undone."
        confirmLabel="Delete reflection"
      />
    </div>
  )
}
