import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Info, Search } from 'lucide-react'
import { Toggle } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

export function NumberField({
  label,
  value,
  onChange,
  placeholder = '0.00',
  suffix,
  prefix,
  hint,
  error,
  className,
  inputClassName,
  disabled = false,
  min,
  max,
  step = 'any',
  id,
  autoFocus,
}: {
  label?: string
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  suffix?: ReactNode
  prefix?: ReactNode
  hint?: ReactNode
  error?: string | null
  className?: string
  inputClassName?: string
  disabled?: boolean
  min?: number
  max?: number
  step?: number | 'any'
  id?: string
  autoFocus?: boolean
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const focused = useRef(false)
  const generatedId = useId()
  const fieldId = id ?? generatedId

  useEffect(() => {
    if (!focused.current) {
      setText(value == null ? '' : String(value))
    }
  }, [value])

  return (
    <div className={className}>
      {label ? (
        <label className="label" htmlFor={fieldId}>
          {label}
        </label>
      ) : null}
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-dim">
            {prefix}
          </span>
        ) : null}
        <input
          id={fieldId}
          type="text"
          inputMode="decimal"
          className={cn(
            'input font-mono tabular-nums',
            prefix ? 'pl-7' : '',
            suffix ? 'pr-12' : '',
            error ? 'border-loss/60 focus:border-loss focus:ring-loss/20' : '',
            inputClassName,
          )}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          onFocus={() => {
            focused.current = true
          }}
          onBlur={() => {
            focused.current = false
            setText(value == null ? '' : String(value))
          }}
          onChange={(event) => {
            const raw = event.target.value.replace(',', '.').replace(/[^\d.+-]/g, '')
            setText(raw)
            if (raw.trim() === '' || raw === '-' || raw === '.' || raw === '-.') {
              onChange(null)
              return
            }
            const parsed = Number(raw)
            if (!Number.isFinite(parsed)) return
            let next = parsed
            if (min != null) next = Math.max(min, next)
            if (max != null) next = Math.min(max, next)
            onChange(next)
          }}
          aria-invalid={Boolean(error)}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-dim">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1 text-[10px] leading-relaxed text-loss">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[10px] leading-relaxed text-dim">{hint}</p>
      ) : null}
      {min != null || max != null ? (
        <span className="sr-only">
          Allowed range {min ?? 'none'} to {max ?? 'none'}
        </span>
      ) : null}
      <span className="sr-only">step {step}</span>
    </div>
  )
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 3,
  className,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: ReactNode
  rows?: number
  className?: string
}) {
  return (
    <div className={className}>
      {label ? <label className="label">{label}</label> : null}
      <textarea
        className="input"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="mt-1 text-[10px] leading-relaxed text-dim">{hint}</p> : null}
    </div>
  )
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-fg">{label}</div>
        {description ? (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim"
      />
      <input
        type="search"
        className="input input-sm pl-8"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  className,
  disabled,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
  disabled?: boolean
}) {
  const fieldId = useId()
  return (
    <div className={className}>
      {label ? (
        <label className="label" htmlFor={fieldId}>
          {label}
        </label>
      ) : null}
      <select
        id={fieldId}
        className="input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-dim">
      <Info size={11} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
