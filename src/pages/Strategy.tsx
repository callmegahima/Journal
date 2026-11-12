import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Copy,
  Info,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Target,
  Trash2,
  Wand2,
} from 'lucide-react'
import type {
  ChecklistGroup,
  ChecklistItemDef,
  ChecklistTemplate,
  Direction,
  PlaybookEntry,
  SetupDef,
  TemplateItem,
} from '@/types'
import { CHECKLIST_GROUP_LABELS, CHECKLIST_GROUP_ORDER } from '@/types'
import type { Settings } from '@/types'
import { useGroupLabel } from '@/components/checklist/useGroupLabel'
import { clearBuiltins, restoreBuiltins } from '@/lib/defaults'
import { SetupBuilder, templateForSetup } from '@/components/strategy/SetupBuilder'
import { useData } from '@/store/DataContext'
import { useToast } from '@/store/ToastContext'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  InfoNote,
  Toggle,
} from '@/components/ui/primitives'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/form'
import { Tabs } from '@/components/ui/Tabs'
import { cn, uid } from '@/lib/utils'

type TabId = 'setups' | 'items' | 'templates' | 'playbook'

const TAB_IDS: TabId[] = ['setups', 'items', 'templates', 'playbook']

const DIRECTION_LABEL: Record<ChecklistTemplate['direction'], string> = {
  BUY: 'BUY only',
  SELL: 'SELL only',
  BOTH: 'BUY + SELL',
}

const GROUP_TONES: Record<ChecklistGroup, string> = {
  market: 'text-accent-2',
  sr: 'text-accent-2',
  pa: 'text-accent-2',
  buy: 'text-profit',
  sell: 'text-loss',
  risk: 'text-warn',
}

function upsertById<T extends { id: string }>(list: T[], next: T): T[] {
  return list.some((item) => item.id === next.id)
    ? list.map((item) => (item.id === next.id ? next : item))
    : [...list, next]
}

/** Remembers a deleted built-in so it is not added back on the next load. */
function rememberRemoved(settings: Settings, id: string, builtin: boolean): string[] | undefined {
  if (!builtin) return settings.removedBuiltins
  return Array.from(new Set([...(settings.removedBuiltins ?? []), id]))
}

function SetupForm({
  setup,
  onClose,
}: {
  setup?: SetupDef
  onClose: () => void
}) {
  const { saveSettings } = useData()
  const { toast } = useToast()
  const [name, setName] = useState(setup?.name ?? '')
  const [description, setDescription] = useState(setup?.description ?? '')
  const [entryCriteria, setEntryCriteria] = useState(setup?.entryCriteria ?? '')
  const [invalidation, setInvalidation] = useState(setup?.invalidation ?? '')
  const [active, setActive] = useState(setup?.active ?? true)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) {
      toast('Give the setup a name.', 'error')
      return
    }
    if (!description.trim()) {
      toast('Describe the setup so your future self understands it.', 'error')
      return
    }
    setBusy(true)
    try {
      const next: SetupDef = {
        id: setup?.id ?? uid('setup'),
        name: name.trim(),
        description: description.trim(),
        entryCriteria: entryCriteria.trim(),
        invalidation: invalidation.trim(),
        active,
        builtin: setup?.builtin ?? false,
      }
      await saveSettings((current) => {
        const setups = upsertById(current.setups, next)
        const playbook = current.playbook.some((entry) => entry.setupId === next.id)
          ? current.playbook
          : [...current.playbook, { setupId: next.id, notes: '', customCriteria: '' }]
        // Keep the setup's own checklist linked when it is renamed.
        const templates =
          setup && setup.name !== next.name
            ? current.templates.map((template) =>
                template.setupName === setup.name ? { ...template, setupName: next.name } : template,
              )
            : current.templates
        return { ...current, setups, playbook, templates }
      })
      toast(setup ? 'Setup updated.' : 'Setup added to your playbook.', 'success')
      onClose()
    } catch {
      toast('Could not save the setup.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={setup ? 'Edit setup' : 'New setup'}
      description="Describe the conditions, the invalidation and the context. Vague setups produce vague trades."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy}>
            <Save size={14} /> Save setup
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="setup-name">
            Setup name
          </label>
          <input
            id="setup-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Support bounce"
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="setup-description">
            Description
          </label>
          <textarea
            id="setup-description"
            className="input min-h-[76px]"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What does this setup look like, and where does it work best?"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="setup-entry">
              Entry criteria
            </label>
            <textarea
              id="setup-entry"
              className="input min-h-[110px]"
              value={entryCriteria}
              onChange={(event) => setEntryCriteria(event.target.value)}
              placeholder="Checklist-style conditions that must be true before entry."
            />
          </div>
          <div>
            <label className="label" htmlFor="setup-invalidation">
              Invalidation
            </label>
            <textarea
              id="setup-invalidation"
              className="input min-h-[110px]"
              value={invalidation}
              onChange={(event) => setInvalidation(event.target.value)}
              placeholder="What proves this idea wrong, and where does the stop belong?"
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-line/80 bg-ink/40 px-3 py-2.5">
          <div>
            <div className="text-[12px] font-medium text-fg">Active setup</div>
            <p className="text-[10px] text-dim">
              Inactive setups stay in history but are hidden from new plan suggestions.
            </p>
          </div>
          <Toggle checked={active} onChange={setActive} label="Active setup" />
        </div>
      </div>
    </Modal>
  )
}

function ItemForm({
  item,
  group,
  onClose,
}: {
  item?: ChecklistItemDef
  group?: ChecklistGroup
  onClose: () => void
}) {
  const { saveSettings } = useData()
  const { toast } = useToast()
  const [text, setText] = useState(item?.text ?? '')
  const [hint, setHint] = useState(item?.hint ?? '')
  const [itemGroup, setItemGroup] = useState<ChecklistGroup>(item?.group ?? group ?? 'market')
  const [direction, setDirection] = useState<Direction | ''>(item?.direction ?? '')
  const [busy, setBusy] = useState(false)
  const groupLabel = useGroupLabel()

  const save = async () => {
    if (!text.trim()) {
      toast('Write the checklist condition.', 'error')
      return
    }
    setBusy(true)
    try {
      const next: ChecklistItemDef = {
        id: item?.id ?? uid('item'),
        group: itemGroup,
        text: text.trim(),
        hint: hint.trim() || undefined,
        direction: direction === '' ? undefined : direction,
        builtin: item?.builtin ?? false,
      }
      await saveSettings((current) => ({
        ...current,
        checklistItems: upsertById(current.checklistItems, next),
      }))
      toast(item ? 'Checklist item updated.' : 'Checklist item added.', 'success')
      onClose()
    } catch {
      toast('Could not save the checklist item.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={item ? 'Edit checklist item' : 'New checklist item'}
      description="Items are reusable across templates. Mandatory / optional is set per template."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy}>
            <Save size={14} /> Save item
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {item?.builtin ? (
          <InfoNote tone="blue" icon={<Info size={12} />}>
            This is a built-in item. Change the wording to fit your strategy, or delete it if you
            do not use it. Deleted built-ins can be brought back with Restore built-ins.
          </InfoNote>
        ) : null}
        <div>
          <label className="label" htmlFor="item-text">
            Condition
          </label>
          <textarea
            id="item-text"
            className="input min-h-[76px]"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="e.g. Higher timeframe direction agrees with the trade."
            autoFocus
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Group</label>
            <select
              className="input"
              value={itemGroup}
              onChange={(event) => setItemGroup(event.target.value as ChecklistGroup)}
            >
              {CHECKLIST_GROUP_ORDER.map((group) => (
                <option key={group} value={group}>
                  {groupLabel(group)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Applies to</label>
            <select
              className="input"
              value={direction}
              onChange={(event) => setDirection(event.target.value as Direction | '')}
            >
              <option value="">Both directions</option>
              <option value="BUY">BUY only</option>
              <option value="SELL">SELL only</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="item-hint">
            Hint (optional)
          </label>
          <input
            id="item-hint"
            className="input"
            value={hint}
            onChange={(event) => setHint(event.target.value)}
            placeholder="Clarify what counts as done."
          />
        </div>
      </div>
    </Modal>
  )
}

function defaultTemplateItems(
  items: ChecklistItemDef[],
  direction: ChecklistTemplate['direction'],
): TemplateItem[] {
  return items
    .filter((item) => {
      if (item.group === 'buy' && direction === 'SELL') return false
      if (item.group === 'sell' && direction === 'BUY') return false
      if (item.direction === 'BUY' && direction === 'SELL') return false
      if (item.direction === 'SELL' && direction === 'BUY') return false
      return true
    })
    .map((item) => ({ itemId: item.id, enabled: true, mandatory: true }))
}

function TemplateForm({
  template,
  onClose,
}: {
  template?: ChecklistTemplate
  onClose: () => void
}) {
  const { data, saveSettings } = useData()
  const { toast } = useToast()
  const [name, setName] = useState(template?.name ?? '')
  const [direction, setDirection] = useState<ChecklistTemplate['direction']>(
    template?.direction ?? 'BOTH',
  )
  const [setupName, setSetupName] = useState(template?.setupName ?? 'ALL')
  const [items, setItems] = useState<TemplateItem[]>(
    template?.items ?? defaultTemplateItems(data.settings.checklistItems, 'BOTH'),
  )
  const [busy, setBusy] = useState(false)
  const groupLabel = useGroupLabel()

  const itemMap = useMemo(
    () => new Map(data.settings.checklistItems.map((item) => [item.id, item])),
    [data.settings.checklistItems],
  )

  const visibleGroups = CHECKLIST_GROUP_ORDER.filter((group) =>
    items.some((entry) => itemMap.get(entry.itemId)?.group === group),
  )

  const toggleItem = (itemId: string, key: 'enabled' | 'mandatory') => {
    setItems((current) =>
      current.map((entry) =>
        entry.itemId === itemId ? { ...entry, [key]: !entry[key] } : entry,
      ),
    )
  }

  const bulk = (group: ChecklistGroup, key: 'enabled' | 'mandatory', value: boolean) => {
    setItems((current) =>
      current.map((entry) =>
        itemMap.get(entry.itemId)?.group === group ? { ...entry, [key]: value } : entry,
      ),
    )
  }

  const changeDirection = (next: ChecklistTemplate['direction']) => {
    setDirection(next)
    setItems((current) => {
      const filtered = current.filter((entry) => {
        const def = itemMap.get(entry.itemId)
        if (!def) return false
        if (def.group === 'buy' && next === 'SELL') return false
        if (def.group === 'sell' && next === 'BUY') return false
        if (def.direction === 'BUY' && next === 'SELL') return false
        if (def.direction === 'SELL' && next === 'BUY') return false
        return true
      })
      const present = new Set(filtered.map((entry) => entry.itemId))
      const additions = defaultTemplateItems(data.settings.checklistItems, next).filter(
        (entry) => !present.has(entry.itemId),
      )
      return [...filtered, ...additions]
    })
  }

  const save = async () => {
    if (!name.trim()) {
      toast('Name the template.', 'error')
      return
    }
    const enabled = items.filter((entry) => entry.enabled)
    if (enabled.length === 0) {
      toast('Enable at least one checklist item.', 'error')
      return
    }
    setBusy(true)
    try {
      const next: ChecklistTemplate = {
        id: template?.id ?? uid('tpl'),
        name: name.trim(),
        direction,
        setupName,
        items,
        builtin: template?.builtin ?? false,
      }
      await saveSettings((current) => ({
        ...current,
        templates: upsertById(current.templates, next),
      }))
      toast(template ? 'Template updated.' : 'Template created.', 'success')
      onClose()
    } catch {
      toast('Could not save the template.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={template ? 'Edit checklist template' : 'New checklist template'}
      description="Choose which conditions appear and which ones block a READY decision when unchecked."
      footer={
        <>
          <span className="mr-auto text-[10px] text-dim">
            {items.filter((entry) => entry.enabled).length} enabled ·{' '}
            {items.filter((entry) => entry.enabled && entry.mandatory).length} mandatory
          </span>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy}>
            <Save size={14} /> Save template
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="template-name">
              Template name
            </label>
            <input
              id="template-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. London breakout checklist"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Direction</label>
            <select
              className="input"
              value={direction}
              onChange={(event) =>
                changeDirection(event.target.value as ChecklistTemplate['direction'])
              }
            >
              <option value="BOTH">BUY + SELL</option>
              <option value="BUY">BUY only</option>
              <option value="SELL">SELL only</option>
            </select>
          </div>
          <div>
            <label className="label">Setup scope</label>
            <select
              className="input"
              value={setupName}
              onChange={(event) => setSetupName(event.target.value)}
            >
              <option value="ALL">All setups</option>
              {data.settings.setups.map((setup) => (
                <option key={setup.id} value={setup.name}>
                  {setup.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <InfoNote tone="blue" icon={<ListChecks size={12} />}>
          Mandatory items make the decision WAIT until checked. Optional items still count toward
          the completion percentage. Numerical risk rules always override the template and can
          force NO TRADE.
        </InfoNote>

        <div className="space-y-3">
          {visibleGroups.map((group) => {
            const groupEntries = items.filter(
              (entry) => itemMap.get(entry.itemId)?.group === group,
            )
            return (
              <div key={group} className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn('text-[11px] font-semibold uppercase tracking-wider', GROUP_TONES[group])}
                    >
                      {groupLabel(group)}
                    </span>
                    <span className="font-mono text-[9px] text-dim">
                      {groupEntries.filter((entry) => entry.enabled).length}/{groupEntries.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => bulk(group, 'enabled', true)}
                      className="rounded px-1.5 py-1 text-[9px] font-medium text-muted hover:bg-panel-2 hover:text-fg"
                    >
                      Enable all
                    </button>
                    <button
                      type="button"
                      onClick={() => bulk(group, 'enabled', false)}
                      className="rounded px-1.5 py-1 text-[9px] font-medium text-muted hover:bg-panel-2 hover:text-fg"
                    >
                      Disable all
                    </button>
                    <span className="h-3 w-px bg-line" />
                    <button
                      type="button"
                      onClick={() => bulk(group, 'mandatory', true)}
                      className="rounded px-1.5 py-1 text-[9px] font-medium text-warn/90 hover:bg-warn/10"
                    >
                      Require all
                    </button>
                    <button
                      type="button"
                      onClick={() => bulk(group, 'mandatory', false)}
                      className="rounded px-1.5 py-1 text-[9px] font-medium text-muted hover:bg-panel-2 hover:text-fg"
                    >
                      Optional all
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-line/60">
                  {groupEntries.map((entry) => {
                    const def = itemMap.get(entry.itemId)
                    if (!def) return null
                    return (
                      <div
                        key={entry.itemId}
                        className="flex items-start gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] leading-snug text-fg">{def.text}</div>
                          {def.hint ? (
                            <div className="mt-0.5 text-[9px] text-dim">{def.hint}</div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-3 pt-0.5">
                          <label className="flex cursor-pointer items-center gap-1.5 text-[9px] text-muted">
                            <Toggle
                              checked={entry.enabled}
                              onChange={() => toggleItem(entry.itemId, 'enabled')}
                              label={`Enable ${def.text}`}
                            />
                            In use
                          </label>
                          <label
                            className={cn(
                              'flex cursor-pointer items-center gap-1.5 text-[9px]',
                              entry.enabled ? 'text-warn/90' : 'text-dim',
                            )}
                          >
                            <Toggle
                              checked={entry.mandatory}
                              onChange={() => toggleItem(entry.itemId, 'mandatory')}
                              disabled={!entry.enabled}
                              label={`Make ${def.text} mandatory`}
                            />
                            Required
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

export function StrategyPage() {
  const { data, saveSettings } = useData()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { settings } = data
  const [tab, setTab] = useState<TabId>('setups')
  const [search, setSearch] = useState('')
  const [setupForm, setSetupForm] = useState<{ setup?: SetupDef } | null>(null)
  const [builder, setBuilder] = useState<{ setup?: SetupDef } | null>(null)
  const [itemForm, setItemForm] = useState<{ item?: ChecklistItemDef; group?: ChecklistGroup } | null>(
    null,
  )
  const [templateForm, setTemplateForm] = useState<{ template?: ChecklistTemplate } | null>(null)
  const [deleteSetup, setDeleteSetup] = useState<SetupDef | null>(null)
  const [deleteItem, setDeleteItem] = useState<ChecklistItemDef | null>(null)
  const [deleteTemplate, setDeleteTemplate] = useState<ChecklistTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [renameGroup, setRenameGroup] = useState<ChecklistGroup | null>(null)
  const [groupName, setGroupName] = useState('')
  const groupLabel = useGroupLabel()
  const [playbookDraft, setPlaybookDraft] = useState<Record<string, { notes: string; customCriteria: string }>>(
    () =>
      Object.fromEntries(
        settings.playbook.map((entry) => [
          entry.setupId,
          { notes: entry.notes, customCriteria: entry.customCriteria },
        ]),
      ),
  )
  const [savingPlaybook, setSavingPlaybook] = useState<string | null>(null)

  const query = search.trim().toLowerCase()

  const filteredSetups = useMemo(
    () =>
      settings.setups.filter((setup) =>
        query
          ? [setup.name, setup.description, setup.entryCriteria, setup.invalidation]
              .join(' ')
              .toLowerCase()
              .includes(query)
          : true,
      ),
    [settings.setups, query],
  )

  const filteredTemplates = useMemo(
    () =>
      settings.templates.filter((template) =>
        query
          ? [template.name, template.setupName, template.direction]
              .join(' ')
              .toLowerCase()
              .includes(query)
          : true,
      ),
    [settings.templates, query],
  )

  const filteredItems = useMemo(
    () =>
      settings.checklistItems.filter((item) =>
        query ? [item.text, item.hint ?? '', item.group].join(' ').toLowerCase().includes(query) : true,
      ),
    [settings.checklistItems, query],
  )

  const activeSetups = settings.setups.filter((setup) => setup.active).length
  const mandatoryCount = settings.templates.reduce(
    (sum, template) => sum + template.items.filter((entry) => entry.enabled && entry.mandatory).length,
    0,
  )

  const handleDeleteSetup = async () => {
    if (!deleteSetup) return
    setDeleting(true)
    try {
      await saveSettings((current) => ({
        ...current,
        removedBuiltins: rememberRemoved(current, deleteSetup.id, deleteSetup.builtin),
        setups: current.setups.filter((setup) => setup.id !== deleteSetup.id),
        playbook: current.playbook.filter((entry) => entry.setupId !== deleteSetup.id),
      }))
      toast('Setup deleted. Existing plans and trades keep their setup name.', 'success')
      setDeleteSetup(null)
    } catch {
      toast('Could not delete the setup.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteItem = async () => {
    if (!deleteItem) return
    setDeleting(true)
    try {
      await saveSettings((current) => ({
        ...current,
        removedBuiltins: rememberRemoved(current, deleteItem.id, deleteItem.builtin),
        checklistItems: current.checklistItems.filter((item) => item.id !== deleteItem.id),
        templates: current.templates.map((template) => ({
          ...template,
          items: template.items.filter((entry) => entry.itemId !== deleteItem.id),
        })),
      }))
      toast('Checklist item removed from your templates.', 'success')
      setDeleteItem(null)
    } catch {
      toast('Could not delete the checklist item.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteTemplate = async () => {
    if (!deleteTemplate) return
    setDeleting(true)
    try {
      await saveSettings((current) => ({
        ...current,
        removedBuiltins: rememberRemoved(current, deleteTemplate.id, deleteTemplate.builtin),
        templates: current.templates.filter((template) => template.id !== deleteTemplate.id),
      }))
      toast('Template deleted. Saved checklist history is unchanged.', 'success')
      setDeleteTemplate(null)
    } catch {
      toast('Could not delete the template.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const builtinCount =
    settings.setups.filter((setup) => setup.builtin).length +
    settings.checklistItems.filter((item) => item.builtin).length +
    settings.templates.filter((template) => template.builtin).length
  const removedCount = settings.removedBuiltins?.length ?? 0

  const handleClearBuiltins = async () => {
    setDeleting(true)
    try {
      await saveSettings((current) => clearBuiltins(current))
      toast('Built-in strategy removed. Add your own setups, checklist items and templates.', 'success')
      setConfirmClear(false)
    } catch {
      toast('Could not remove the built-in strategy.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleRestoreBuiltins = async () => {
    setDeleting(true)
    try {
      await saveSettings((current) => restoreBuiltins(current))
      toast('Built-in setups, checklist items and templates restored.', 'success')
      setConfirmRestore(false)
    } catch {
      toast('Could not restore the built-ins.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const saveGroupName = async () => {
    if (!renameGroup) return
    const name = groupName.trim()
    try {
      await saveSettings((current) => {
        const labels = { ...(current.groupLabels ?? {}) }
        if (!name || name === CHECKLIST_GROUP_LABELS[renameGroup]) delete labels[renameGroup]
        else labels[renameGroup] = name
        return { ...current, groupLabels: labels }
      })
      toast('Section renamed.', 'success')
      setRenameGroup(null)
    } catch {
      toast('Could not rename the section.', 'error')
    }
  }

  const duplicateTemplate = async (template: ChecklistTemplate) => {
    try {
      const next: ChecklistTemplate = {
        ...template,
        id: uid('tpl'),
        name: `${template.name} (copy)`,
        builtin: false,
        items: template.items.map((entry) => ({ ...entry })),
      }
      await saveSettings((current) => ({
        ...current,
        templates: [...current.templates, next],
      }))
      toast('Template duplicated. Edit the copy to make it yours.', 'success')
    } catch {
      toast('Could not duplicate the template.', 'error')
    }
  }

  const savePlaybook = async (setupId: string) => {
    const draft = playbookDraft[setupId] ?? { notes: '', customCriteria: '' }
    setSavingPlaybook(setupId)
    try {
      await saveSettings((current) => {
        const entry: PlaybookEntry = {
          setupId,
          notes: draft.notes,
          customCriteria: draft.customCriteria,
        }
        const playbook = current.playbook.some((item) => item.setupId === setupId)
          ? current.playbook.map((item) => (item.setupId === setupId ? entry : item))
          : [...current.playbook, entry]
        return { ...current, playbook }
      })
      toast('Playbook note saved.', 'success')
    } catch {
      toast('Could not save the playbook note.', 'error')
    } finally {
      setSavingPlaybook(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Strategy & Setups"
        title="Define the edge before the market tests it"
        description="Your setups, checklist library, templates and playbook notes live here. Changes apply to new checklists; saved checklist history stays intact."
        actions={
          <>
            <Button variant="soft" onClick={() => navigate('/risk')}>
              <Target size={14} /> Risk calculator
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (tab === 'setups') setBuilder({})
                else if (tab === 'items') setItemForm({})
                else if (tab === 'templates') setTemplateForm({})
                else navigate('/plan?new=1')
              }}
            >
              <Plus size={14} />
              {tab === 'setups'
                ? 'Add my setup'
                : tab === 'items'
                  ? 'New item'
                  : tab === 'templates'
                    ? 'New template'
                    : 'Plan a trade'}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Setups', value: settings.setups.length, sub: `${activeSetups} active` },
          {
            label: 'Checklist items',
            value: settings.checklistItems.length,
            sub: `${settings.checklistItems.filter((item) => item.builtin).length} built-in`,
          },
          {
            label: 'Templates',
            value: settings.templates.length,
            sub: `${mandatoryCount} mandatory slots`,
          },
          {
            label: 'Playbook notes',
            value: settings.playbook.filter(
              (entry) => entry.notes.trim() || entry.customCriteria.trim(),
            ).length,
            sub: `${settings.playbook.length} setup entries`,
          },
        ].map((stat) => (
          <Card key={stat.label} className="px-3.5 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-dim">
              {stat.label}
            </div>
            <div className="mt-0.5 font-mono text-lg font-semibold text-fg">{stat.value}</div>
            <div className="text-[9px] text-dim">{stat.sub}</div>
          </Card>
        ))}
      </div>

      <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Wand2 size={16} className="shrink-0 text-accent-2" />
        <div className="min-w-[200px] flex-1">
          <div className="text-[12px] font-semibold text-fg">Use your own strategy</div>
          <p className="text-[10px] leading-relaxed text-dim">
            Everything here can be edited or deleted, including the built-in price action + S&amp;R
            strategy. Add your own setup with its checklist in one step, and it loads automatically
            when you pick that setup in a trade plan.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="primary" onClick={() => setBuilder({})}>
            <Plus size={12} /> Add my setup &amp; checklist
          </Button>
          {builtinCount > 0 ? (
            <Button size="sm" variant="soft" onClick={() => setConfirmClear(true)}>
              <Trash2 size={12} /> Remove built-ins
            </Button>
          ) : null}
          {removedCount > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(true)}>
              <RotateCcw size={12} /> Restore built-ins
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs
          className="min-w-0 flex-1"
          value={tab}
          onChange={(id) => {
            if (TAB_IDS.includes(id as TabId)) setTab(id as TabId)
            setSearch('')
          }}
          tabs={[
            { id: 'setups', label: 'Setups', count: settings.setups.length, icon: <Target size={13} /> },
            {
              id: 'items',
              label: 'Checklist items',
              count: settings.checklistItems.length,
              icon: <ListChecks size={13} />,
            },
            {
              id: 'templates',
              label: 'Templates',
              count: settings.templates.length,
              icon: <Sparkles size={13} />,
            },
            {
              id: 'playbook',
              label: 'Playbook',
              count: settings.playbook.length,
              icon: <BookOpen size={13} />,
            },
          ]}
        />
        {tab !== 'playbook' ? (
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={`Search ${tab}…`}
            className="w-[220px]"
          />
        ) : null}
      </div>

      {tab === 'setups' ? (
        filteredSetups.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {filteredSetups.map((setup) => (
              <Card key={setup.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate text-[13px] font-semibold text-fg">{setup.name}</h3>
                      <Badge variant={setup.active ? 'green' : 'slate'}>
                        {setup.active ? 'Active' : 'Inactive'}
                      </Badge>
                      {setup.builtin ? <Badge variant="blue">Built-in</Badge> : null}
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                      {setup.description}
                    </p>
                  </div>
                  <Toggle
                    checked={setup.active}
                    onChange={(active) => {
                      void saveSettings((current) => ({
                        ...current,
                        setups: current.setups.map((item) =>
                          item.id === setup.id ? { ...item, active } : item,
                        ),
                      }))
                    }}
                    label={`Toggle ${setup.name}`}
                  />
                </div>

                <div className="mt-3 space-y-2">
                  <div className="rounded-lg border border-line/70 bg-ink/35 p-2.5">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-dim">
                      Entry criteria
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted">
                      {setup.entryCriteria || 'Not written yet.'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-line/70 bg-ink/35 p-2.5">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-dim">
                      Invalidation
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted">
                      {setup.invalidation || 'Not written yet.'}
                    </p>
                  </div>
                </div>

                <div className="mt-auto flex items-center gap-1.5 pt-3">
                  <Button
                    size="sm"
                    variant="soft"
                    className="flex-1"
                    onClick={() => setSetupForm({ setup })}
                  >
                    <Pencil size={12} /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="soft"
                    className="flex-1"
                    onClick={() => setBuilder({ setup })}
                    title="Edit this setup's own checklist"
                  >
                    <ListChecks size={12} />
                    {templateForSetup(settings.templates, setup.name) ? 'Checklist' : 'Add checklist'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/journal?new=1`)}
                    title="Log a trade using your journal"
                  >
                    <ArrowRight size={12} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteSetup(setup)}
                    aria-label="Delete setup"
                    title="Delete setup"
                  >
                    <Trash2 size={13} className="text-loss/80" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Target size={20} />}
            title={query ? 'No setups match your search' : 'No setups yet'}
            description={
              query
                ? 'Clear the search or add a new setup with explicit entry criteria and invalidation.'
                : 'Add the setups you trade, with clear entry criteria and invalidation.'
            }
            action={
              <Button
                variant="primary"
                onClick={() => {
                  setSearch('')
                  setBuilder({})
                }}
              >
                <Plus size={14} /> Add my setup
              </Button>
            }
          />
        )
      ) : null}

      {tab === 'items' ? (
        filteredItems.length > 0 || !query ? (
          <div className="space-y-3">
            {CHECKLIST_GROUP_ORDER.map((group) => {
              const groupItems = filteredItems.filter((item) => item.group === group)
              if (groupItems.length === 0 && query) return null
              return (
                <Card key={group}>
                  <CardHeader
                    title={groupLabel(group)}
                    subtitle={`${groupItems.length} item${groupItems.length === 1 ? '' : 's'} available to templates`}
                    icon={<ListChecks size={14} />}
                    action={
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setGroupName(groupLabel(group))
                            setRenameGroup(group)
                          }}
                          aria-label={`Rename ${groupLabel(group)}`}
                          title="Rename section"
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button size="sm" variant="soft" onClick={() => setItemForm({ group })}>
                          <Plus size={12} /> Add
                        </Button>
                      </div>
                    }
                  />
                  <div className="divide-y divide-line/60">
                    {groupItems.length === 0 ? (
                      <p className="px-4 py-3 text-[10px] text-dim">
                        No items in this section. Add your own, or rename the section to fit your
                        strategy.
                      </p>
                    ) : null}
                    {groupItems.map((item) => (
                      <div key={item.id} className="flex items-start gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] leading-snug text-fg">{item.text}</span>
                            {item.direction ? (
                              <Badge variant={item.direction === 'BUY' ? 'green' : 'red'}>
                                {item.direction}
                              </Badge>
                            ) : null}
                            {item.builtin ? <span className="text-[9px] text-dim">built-in</span> : null}
                          </div>
                          {item.hint ? (
                            <p className="mt-0.5 text-[9px] text-dim">{item.hint}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setItemForm({ item })}
                            aria-label="Edit checklist item"
                          >
                            <Pencil size={12} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteItem(item)}
                            aria-label="Delete checklist item"
                            title="Delete checklist item"
                          >
                            <Trash2 size={13} className="text-loss/80" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={<ListChecks size={20} />}
            title="No checklist items match your search"
            description="Checklist items are the reusable conditions behind every template."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  setSearch('')
                  setItemForm({})
                }}
              >
                <Plus size={14} /> New item
              </Button>
            }
          />
        )
      ) : null}

      {tab === 'templates' ? (
        filteredTemplates.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {filteredTemplates.map((template) => {
              const enabled = template.items.filter((entry) => entry.enabled).length
              const mandatory = template.items.filter(
                (entry) => entry.enabled && entry.mandatory,
              ).length
              return (
                <Card key={template.id} className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="truncate text-[13px] font-semibold text-fg">
                          {template.name}
                        </h3>
                        <Badge variant={template.direction === 'BUY' ? 'green' : template.direction === 'SELL' ? 'red' : 'blue'}>
                          {DIRECTION_LABEL[template.direction]}
                        </Badge>
                        {template.builtin ? <Badge variant="slate">Built-in</Badge> : null}
                      </div>
                      <p className="mt-1 text-[10px] text-muted">
                        {template.setupName === 'ALL'
                          ? 'Applies to every setup'
                          : `Scoped to ${template.setupName}`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-line/70 bg-ink/35 px-2.5 py-2">
                      <div className="text-[9px] uppercase tracking-wide text-dim">Enabled</div>
                      <div className="mt-0.5 font-mono text-[13px] font-semibold text-fg">
                        {enabled}
                      </div>
                    </div>
                    <div className="rounded-lg border border-line/70 bg-ink/35 px-2.5 py-2">
                      <div className="text-[9px] uppercase tracking-wide text-dim">Mandatory</div>
                      <div className="mt-0.5 font-mono text-[13px] font-semibold text-warn">
                        {mandatory}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {CHECKLIST_GROUP_ORDER.filter((group) =>
                      template.items.some((entry) => {
                        const def = settings.checklistItems.find((item) => item.id === entry.itemId)
                        return def?.group === group && entry.enabled
                      }),
                    ).map((group) => (
                      <span
                        key={group}
                        className="rounded bg-panel-2 px-1.5 py-0.5 text-[9px] text-muted"
                      >
                        {groupLabel(group)}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto flex items-center gap-1.5 pt-3">
                    <Button
                      size="sm"
                      variant="soft"
                      className="flex-1"
                      onClick={() => setTemplateForm({ template })}
                    >
                      <Pencil size={12} /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void duplicateTemplate(template)}
                      title="Duplicate template"
                    >
                      <Copy size={13} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTemplate(template)}
                      aria-label="Delete template"
                      title="Delete template"
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
            icon={<Sparkles size={20} />}
            title={query ? 'No templates match your search' : 'No templates yet'}
            description="Templates decide which checklist conditions appear and which ones are mandatory. Add checklist items first, then build a template from them."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  setSearch('')
                  setTemplateForm({})
                }}
              >
                <Plus size={14} /> New template
              </Button>
            }
          />
        )
      ) : null}

      {tab === 'playbook' ? (
        settings.setups.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {settings.setups.map((setup) => {
              const draft = playbookDraft[setup.id] ?? { notes: '', customCriteria: '' }
              return (
                <Card key={setup.id}>
                  <CardHeader
                    title={setup.name}
                    subtitle={setup.active ? 'Active setup' : 'Inactive setup'}
                    icon={<BookOpen size={14} />}
                    action={
                      <Button
                        size="sm"
                        variant="soft"
                        loading={savingPlaybook === setup.id}
                        onClick={() => void savePlaybook(setup.id)}
                      >
                        <Save size={12} /> Save
                      </Button>
                    }
                  />
                  <div className="space-y-3 p-4">
                    <div>
                      <label className="label" htmlFor={`playbook-criteria-${setup.id}`}>
                        Custom criteria for this setup
                      </label>
                      <textarea
                        id={`playbook-criteria-${setup.id}`}
                        className="input min-h-[82px] text-[12px]"
                        value={draft.customCriteria}
                        onChange={(event) =>
                          setPlaybookDraft((current) => ({
                            ...current,
                            [setup.id]: { ...draft, customCriteria: event.target.value },
                          }))
                        }
                        placeholder="Your own refinements: session, level quality, confirmation type, filters…"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`playbook-notes-${setup.id}`}>
                        Notes & observations
                      </label>
                      <textarea
                        id={`playbook-notes-${setup.id}`}
                        className="input min-h-[82px] text-[12px]"
                        value={draft.notes}
                        onChange={(event) =>
                          setPlaybookDraft((current) => ({
                            ...current,
                            [setup.id]: { ...draft, notes: event.target.value },
                          }))
                        }
                        placeholder="What has worked, what has failed, and what you still need to test."
                      />
                    </div>
                    <p className="text-[10px] leading-relaxed text-dim">
                      Notes are for your process. They do not change the checklist automatically —
                      edit the template when a rule becomes permanent.
                    </p>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={<BookOpen size={20} />}
            title="Add a setup first"
            description="Playbook notes are organised by setup. Create a setup to start writing."
            action={
              <Button variant="primary" onClick={() => setBuilder({})}>
                <Plus size={14} /> Add my setup
              </Button>
            }
          />
        )
      ) : null}

      <InfoNote tone="slate" icon={<Info size={12} />}>
        The checklist decision is still driven by numerical risk rules: invalid stop/target sides,
        position size below the broker minimum, R:R below your minimum, or a breached daily /
        weekly loss limit will force NO TRADE regardless of how many boxes are checked.
      </InfoNote>

      {setupForm ? (
        <SetupForm setup={setupForm.setup} onClose={() => setSetupForm(null)} />
      ) : null}
      {builder ? <SetupBuilder setup={builder.setup} onClose={() => setBuilder(null)} /> : null}
      {itemForm ? (
        <ItemForm item={itemForm.item} group={itemForm.group} onClose={() => setItemForm(null)} />
      ) : null}
      {templateForm ? (
        <TemplateForm template={templateForm.template} onClose={() => setTemplateForm(null)} />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteSetup)}
        onClose={() => setDeleteSetup(null)}
        busy={deleting}
        title="Delete this setup?"
        description={
          deleteSetup?.builtin
            ? 'The setup and its playbook note will be removed. Existing plans, trades and checklist history keep the setup name. You can bring built-ins back later with Restore built-ins.'
            : 'The setup and its playbook note will be removed from your strategy library. Existing plans, trades and checklist history keep the setup name. This cannot be undone.'
        }
        confirmLabel="Delete setup"
        onConfirm={handleDeleteSetup}
      />
      <ConfirmDialog
        open={Boolean(deleteItem)}
        onClose={() => setDeleteItem(null)}
        busy={deleting}
        title="Delete this checklist item?"
        description={
          deleteItem?.builtin
            ? 'The item is removed from your library and from every template. Saved checklist snapshots keep their original wording. You can bring built-ins back later with Restore built-ins.'
            : 'The item is removed from your library and from every template. Saved checklist snapshots keep their original wording. This cannot be undone.'
        }
        confirmLabel="Delete item"
        onConfirm={handleDeleteItem}
      />
      <ConfirmDialog
        open={Boolean(deleteTemplate)}
        onClose={() => setDeleteTemplate(null)}
        busy={deleting}
        title="Delete this template?"
        description={
          deleteTemplate?.builtin
            ? 'The template disappears from the plan editor. Saved checklist history and linked plans are unchanged. You can bring built-ins back later with Restore built-ins.'
            : 'The template disappears from the plan editor. Saved checklist history and linked plans are unchanged. This cannot be undone.'
        }
        confirmLabel="Delete template"
        onConfirm={handleDeleteTemplate}
      />
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        busy={deleting}
        title="Remove the built-in strategy?"
        description={`This removes all ${builtinCount} built-in setups, checklist items and templates so you can build your own. Setups, items and templates you created stay. Saved plans, trades and checklist history are unchanged, and you can bring the built-ins back with Restore built-ins.`}
        confirmLabel="Remove built-ins"
        onConfirm={handleClearBuiltins}
      />
      <ConfirmDialog
        open={confirmRestore}
        onClose={() => setConfirmRestore(false)}
        busy={deleting}
        title="Restore the built-ins?"
        description={`This adds back the ${removedCount} built-in setups, checklist items and templates you deleted. Your own ones, and built-ins you edited, stay as they are.`}
        confirmLabel="Restore built-ins"
        onConfirm={handleRestoreBuiltins}
      />
      <Modal
        open={Boolean(renameGroup)}
        onClose={() => setRenameGroup(null)}
        size="sm"
        title="Rename section"
        description="Name this checklist section to match your strategy. Leave it empty to use the original name."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameGroup(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void saveGroupName()}>
              <Save size={14} /> Save name
            </Button>
          </>
        }
      >
        <label className="label" htmlFor="group-name">
          Section name
        </label>
        <input
          id="group-name"
          className="input"
          value={groupName}
          maxLength={40}
          onChange={(event) => setGroupName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void saveGroupName()
          }}
          placeholder={renameGroup ? CHECKLIST_GROUP_LABELS[renameGroup] : ''}
          autoFocus
        />
        {renameGroup === 'buy' || renameGroup === 'sell' ? (
          <p className="mt-2 text-[10px] text-dim">
            Items in this section only show on {renameGroup === 'buy' ? 'BUY' : 'SELL'} plans.
          </p>
        ) : null}
      </Modal>
    </div>
  )
}
