import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[22px] font-semibold tracking-tight text-fg sm:text-[25px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2" data-print="hide">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
