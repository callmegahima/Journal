import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface TabDef {
  id: string
  label: string
  count?: number
  icon?: ReactNode
}

export function Tabs({
  tabs,
  value,
  onChange,
  variant = 'underline',
  className,
}: {
  tabs: TabDef[]
  value: string
  onChange: (id: string) => void
  variant?: 'underline' | 'pills'
  className?: string
}) {
  if (variant === 'pills') {
    return (
      <div className={cn('segmented max-w-full overflow-x-auto', className)}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-active={value === tab.id}
            onClick={() => onChange(tab.id)}
            className="flex items-center gap-1.5 whitespace-nowrap"
          >
            {tab.icon}
            {tab.label}
            {tab.count != null ? (
              <span className="rounded bg-ink/40 px-1 py-0.5 font-mono text-[9px]">
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'scroll-thin flex gap-4 overflow-x-auto border-b border-line',
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-0.5 pb-2.5 pt-1 text-[12px] font-semibold transition',
            value === tab.id
              ? 'border-accent text-fg'
              : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {tab.icon}
          {tab.label}
          {tab.count != null ? (
            <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[9px] text-muted">
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
