import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ListPlus, Plus, Save, Trash2 } from 'lucide-react'
import type {
  ChecklistGroup,
  ChecklistItemDef,
  ChecklistTemplate,
  Direction,
  SetupDef,
  TemplateItem,
} from '@/types'
import { CHECKLIST_GROUP_ORDER } from '@/types'
import { useData } from '@/store/DataContext'
import { useToast } from '@/store/ToastContext'
import { Modal } from '@/components/ui/Modal'
import { Button, Toggle } from '@/components/ui/primitives'
import { useGroupLabel } from '@/components/checklist/useGroupLabel'
import { uid } from '@/lib/utils'

interface Row {
  key: string
  /** Set when the row is an existing checklist item. */
  itemId?: string
  text: string
  group: ChecklistGroup
  direction: Direction | ''
  mandatory: boolean
}

function upsertById<T extends { id: string }>(list: T[], next: T): T[] {
  return list.some((item) => item.id === next.id)
    ? list.map((item) => (item.id === next.id ? next : item))
    : [...list, next]
}

function newRow(group: ChecklistGroup = 'market', text = ''): Row {
  return { key: uid('row'), text, group, direction: '', mandatory: true }
}

/** The checklist template that belongs to a setup (scoped to its name). */
export function templateForSetup(
  templates: ChecklistTemplate[],
  setupName: string,
): ChecklistTemplate | undefined {
  return templates.find((template) => template.setupName === setupName)
}

/**
 * One form for a trader's own setup and its checklist. Saving creates (or updates) the setup,
 * its checklist items, and a template scoped to the setup, so picking the setup in a plan
 * loads this checklist automatically.
 */
export function SetupBuilder({ setup, onClose }: { setup?: SetupDef; onClose: () => void }) {
  const { data, saveSettings } = useData()
  const { toast } = useToast()
  const groupLabel = useGroupLabel()
  const { settings } = data

  const existingTemplate = useMemo(
    () => (setup ? templateForSetup(settings.templates, setup.name) : undefined),
    [setup, settings.templates],
  )

  const [name, setName] = useState(setup?.name ?? '')
  const [description, setDescription] = useState(setup?.description ?? '')
  const [entryCriteria, setEntryCriteria] = useState(setup?.entryCriteria ?? '')
  const [invalidation, setInvalidation] = useState(setup?.invalidation ?? '')
  const [direction, setDirection] = useState<ChecklistTemplate['direction']>(
    existingTemplate?.direction ?? 'BOTH',
  )
  const [rows, setRows] = useState<Row[]>(() => {
    if (!existingTemplate) return [newRow('market'), newRow('market'), newRow('risk')]
    const defs = new Map(settings.checklistItems.map((item) => [item.id, item]))
    const loaded = existingTemplate.items
      .filter((entry) => entry.enabled && defs.has(entry.itemId))
      .map((entry) => {
        const def = defs.get(entry.itemId) as ChecklistItemDef
        return {
          key: uid('row'),
          itemId: def.id,
          text: def.text,
          group: def.group,
          direction: def.direction ?? '',
          mandatory: entry.mandatory,
        } satisfies Row
      })
    return loaded.length > 0 ? loaded : [newRow()]
  })
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteGroup, setPasteGroup] = useState<ChecklistGroup>('market')
  const [busy, setBusy] = useState(false)

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const move = (index: number, delta: number) =>
    setRows((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  const addPasted = () => {
    const lines = pasteText
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|\[\s?\])\s*/, '').trim())
      .filter(Boolean)
    if (lines.length === 0) {
      toast('Paste at least one condition, one per line.', 'error')
      return
    }
    setRows((current) => [
      ...current.filter((row) => row.text.trim()),
      ...lines.map((line) => newRow(pasteGroup, line)),
    ])
    setPasteText('')
    setPasteOpen(false)
  }

  const filled = rows.filter((row) => row.text.trim())

  const save = async () => {
    const setupName = name.trim()
    if (!setupName) {
      toast('Give your setup a name.', 'error')
      return
    }
    const clash = settings.setups.find(
      (entry) => entry.name.toLowerCase() === setupName.toLowerCase() && entry.id !== setup?.id,
    )
    if (clash) {
      toast(`You already have a setup called "${clash.name}".`, 'error')
      return
    }
    if (filled.length === 0) {
      toast('Add at least one checklist condition.', 'error')
      return
    }
    setBusy(true)
    try {
      await saveSettings((current) => {
        const nextSetup: SetupDef = {
          id: setup?.id ?? uid('setup'),
          name: setupName,
          description: description.trim(),
          entryCriteria: entryCriteria.trim(),
          invalidation: invalidation.trim(),
          active: setup?.active ?? true,
          builtin: setup?.builtin ?? false,
        }

        let checklistItems = current.checklistItems
        const templateItems: TemplateItem[] = []
        for (const row of filled) {
          const existing = row.itemId
            ? current.checklistItems.find((item) => item.id === row.itemId)
            : undefined
          const def: ChecklistItemDef = {
            id: existing?.id ?? uid('item'),
            group: row.group,
            text: row.text.trim(),
            hint: existing?.hint,
            direction: row.direction === '' ? undefined : row.direction,
            builtin: existing?.builtin ?? false,
          }
          checklistItems = upsertById(checklistItems, def)
          templateItems.push({ itemId: def.id, enabled: true, mandatory: row.mandatory })
        }

        // Keep other templates pointing at this setup if it was renamed.
        const oldName = setup?.name
        let templates = current.templates.map((template) =>
          oldName && oldName !== setupName && template.setupName === oldName
            ? { ...template, setupName }
            : template,
        )
        const ownTemplate = existingTemplate
          ? templates.find((template) => template.id === existingTemplate.id)
          : undefined
        const nextTemplate: ChecklistTemplate = {
          id: ownTemplate?.id ?? uid('tpl'),
          name:
            ownTemplate && ownTemplate.name !== `${oldName} checklist`
              ? ownTemplate.name
              : `${setupName} checklist`,
          direction,
          setupName,
          items: templateItems,
          builtin: ownTemplate?.builtin ?? false,
        }
        templates = upsertById(templates, nextTemplate)

        const playbook = current.playbook.some((entry) => entry.setupId === nextSetup.id)
          ? current.playbook
          : [...current.playbook, { setupId: nextSetup.id, notes: '', customCriteria: '' }]

        return {
          ...current,
          setups: upsertById(current.setups, nextSetup),
          checklistItems,
          templates,
          playbook,
        }
      })
      toast(
        setup
          ? 'Setup and checklist saved.'
          : `"${setupName}" added. Pick it in a trade plan to use its checklist.`,
        'success',
      )
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
      size="xl"
      title={setup ? `Setup & checklist: ${setup.name}` : 'Add my setup & checklist'}
      description="Describe your setup and list what must be true before you enter. When you pick this setup in a trade plan, this checklist loads automatically."
      footer={
        <>
          <span className="mr-auto text-[10px] text-dim">
            {filled.length} condition{filled.length === 1 ? '' : 's'} ·{' '}
            {filled.filter((row) => row.mandatory).length} required
          </span>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy}>
            <Save size={14} /> Save setup & checklist
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <section className="space-y-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-dim">
            1 · Your setup
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="builder-name">
                Setup name
              </label>
              <input
                id="builder-name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. London breakout"
                maxLength={60}
                autoFocus
              />
            </div>
            <div>
              <label className="label" htmlFor="builder-direction">
                Trades
              </label>
              <select
                id="builder-direction"
                className="input"
                value={direction}
                onChange={(event) =>
                  setDirection(event.target.value as ChecklistTemplate['direction'])
                }
              >
                <option value="BOTH">BUY and SELL</option>
                <option value="BUY">BUY only</option>
                <option value="SELL">SELL only</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="builder-description">
              Description (optional)
            </label>
            <textarea
              id="builder-description"
              className="input min-h-[60px]"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What does this setup look like, and when does it work best?"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="builder-entry">
                Entry rules (optional)
              </label>
              <textarea
                id="builder-entry"
                className="input min-h-[60px]"
                value={entryCriteria}
                onChange={(event) => setEntryCriteria(event.target.value)}
                placeholder="How and where you enter."
              />
            </div>
            <div>
              <label className="label" htmlFor="builder-invalidation">
                Invalidation (optional)
              </label>
              <textarea
                id="builder-invalidation"
                className="input min-h-[60px]"
                value={invalidation}
                onChange={(event) => setInvalidation(event.target.value)}
                placeholder="What proves the idea wrong, and where the stop goes."
              />
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-dim">
              2 · Your checklist
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setPasteOpen((open) => !open)}>
                <ListPlus size={12} /> Paste a list
              </Button>
              <Button
                size="sm"
                variant="soft"
                onClick={() =>
                  setRows((current) => [
                    ...current,
                    newRow(current[current.length - 1]?.group ?? 'market'),
                  ])
                }
              >
                <Plus size={12} /> Add condition
              </Button>
            </div>
          </div>

          {pasteOpen ? (
            <div className="space-y-2 rounded-lg border border-line/80 bg-ink/40 p-3">
              <label className="label" htmlFor="builder-paste">
                One condition per line
              </label>
              <textarea
                id="builder-paste"
                className="input min-h-[96px] text-[12px]"
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                placeholder={'Asian range marked\nPrice breaks the range with a strong candle\nRetest holds\nRisk is 1% or less'}
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="input w-auto"
                  value={pasteGroup}
                  onChange={(event) => setPasteGroup(event.target.value as ChecklistGroup)}
                  aria-label="Section for pasted conditions"
                >
                  {CHECKLIST_GROUP_ORDER.map((group) => (
                    <option key={group} value={group}>
                      {groupLabel(group)}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="primary" onClick={addPasted}>
                  Add to checklist
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            {rows.map((row, index) => (
              <div
                key={row.key}
                className="rounded-lg border border-line/80 bg-ink/30 p-2.5"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-right font-mono text-[10px] text-dim">
                    {index + 1}
                  </span>
                  <input
                    className="input min-w-0 flex-1"
                    value={row.text}
                    onChange={(event) => update(row.key, { text: event.target.value })}
                    placeholder="e.g. Higher timeframe trend agrees with the trade"
                    aria-label={`Condition ${index + 1}`}
                  />
                  <div className="flex shrink-0 items-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      <ArrowUp size={12} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => move(index, 1)}
                      disabled={index === rows.length - 1}
                      aria-label="Move down"
                    >
                      <ArrowDown size={12} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                      aria-label="Remove condition"
                    >
                      <Trash2 size={12} className="text-loss/80" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                  <select
                    className="input h-8 w-auto py-0 text-[11px]"
                    value={row.group}
                    onChange={(event) =>
                      update(row.key, { group: event.target.value as ChecklistGroup })
                    }
                    aria-label="Section"
                  >
                    {CHECKLIST_GROUP_ORDER.map((group) => (
                      <option key={group} value={group}>
                        {groupLabel(group)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input h-8 w-auto py-0 text-[11px]"
                    value={row.direction}
                    onChange={(event) =>
                      update(row.key, { direction: event.target.value as Direction | '' })
                    }
                    aria-label="Applies to"
                  >
                    <option value="">BUY and SELL</option>
                    <option value="BUY">BUY only</option>
                    <option value="SELL">SELL only</option>
                  </select>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-warn/90">
                    <Toggle
                      checked={row.mandatory}
                      onChange={(mandatory) => update(row.key, { mandatory })}
                      label={`Condition ${index + 1} required`}
                    />
                    Required
                  </label>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] leading-relaxed text-dim">
            Required conditions keep a plan on WAIT until they are ticked. Your risk rules (stop
            loss, R:R, loss limits) are always checked as well.
            {setup ? ' Conditions you remove here stay in your checklist library.' : ''}
          </p>
        </section>
      </div>
    </Modal>
  )
}
