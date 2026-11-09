import type { ReactNode } from 'react'
import { Card } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'default',
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'profit' | 'loss' | 'warn' | 'accent'
  className?: string
}) {
  const valueTone = {
    default: 'text-fg',
    profit: 'text-profit',
    loss: 'text-loss',
    warn: 'text-warn',
    accent: 'text-accent-2',
  }
  return (
    <Card className={cn('relative overflow-hidden p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="kpi-label">{label}</span>
        {icon ? <span className="text-dim">{icon}</span> : null}
      </div>
      <div className={cn('mt-1.5 font-mono text-[22px] font-semibold tabular-nums tracking-tight', valueTone[tone])}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-[11px] leading-relaxed text-muted">{sub}</div> : null}
    </Card>
  )
}
