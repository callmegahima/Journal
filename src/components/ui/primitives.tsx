import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'soft' | 'ghost' | 'danger' | 'success' | 'outline'
type ButtonSize = 'sm' | 'md' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  soft: 'btn-soft',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  success: 'btn-success',
  outline: 'border-line-2 text-fg hover:bg-panel-2',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-[12px]',
  md: 'h-9 px-3 text-[13px]',
  icon: 'h-9 w-9 px-0',
}

export function Button({
  variant = 'soft',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn('btn', variantClasses[variant], sizeClasses[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : null}
      {children}
    </button>
  )
}

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...props} />
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-0.5 text-muted">{icon}</span> : null}
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold tracking-tight text-fg">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-fg">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

type BadgeVariant = 'blue' | 'green' | 'red' | 'amber' | 'slate'

export function Badge({
  variant = 'slate',
  children,
  className,
}: {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}) {
  const map: Record<BadgeVariant, string> = {
    blue: 'badge-blue',
    green: 'badge-green',
    red: 'badge-red',
    amber: 'badge-amber',
    slate: 'badge-slate',
  }
  return <span className={cn('badge', map[variant], className)}>{children}</span>
}

export function DirectionBadge({ direction }: { direction: 'BUY' | 'SELL' }) {
  return (
    <Badge variant={direction === 'BUY' ? 'green' : 'red'}>
      {direction === 'BUY' ? '▲' : '▼'} {direction}
    </Badge>
  )
}

export function ResultBadge({ result }: { result: 'Win' | 'Loss' | 'Breakeven' }) {
  return (
    <Badge variant={result === 'Win' ? 'green' : result === 'Loss' ? 'red' : 'slate'}>
      {result}
    </Badge>
  )
}

export function ProgressBar({
  value,
  tone = 'blue',
  className,
  height = 'h-1.5',
}: {
  value: number
  tone?: 'blue' | 'green' | 'red' | 'amber'
  className?: string
  height?: string
}) {
  const colors = {
    blue: 'bg-accent',
    green: 'bg-profit',
    red: 'bg-loss',
    amber: 'bg-warn',
  }
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-line', height, className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', colors[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-line-2/80 text-center',
        compact ? 'px-5 py-8' : 'px-6 py-14',
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-panel-2 text-muted">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function InfoNote({
  children,
  tone = 'slate',
  icon,
}: {
  children: ReactNode
  tone?: 'slate' | 'amber' | 'blue' | 'red' | 'green'
  icon?: ReactNode
}) {
  const tones = {
    slate: 'border-line-2/70 bg-panel-2/60 text-muted',
    amber: 'border-warn/20 bg-warn/[0.06] text-warn',
    blue: 'border-accent/20 bg-accent/[0.06] text-accent-2',
    red: 'border-loss/20 bg-loss/[0.06] text-loss',
    green: 'border-profit/20 bg-profit/[0.06] text-profit',
  }
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed',
        tones[tone],
      )}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div>{children}</div>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-40',
        checked ? 'border-accent/50 bg-accent' : 'border-line-2 bg-panel-3',
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line', className)} />
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line-2 bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  )
}
