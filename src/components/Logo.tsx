import { cn } from '@/lib/utils'

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="64" height="64" rx="14" fill="#111827" />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="13.25" stroke="#2B3A52" strokeWidth="1.5" />
      <path
        d="M14 46V18h11.5c6.4 0 10.5 3.4 10.5 9.2 0 5.9-4.1 9.4-10.5 9.4H21V46h-7Zm7-15.2h4.1c2.6 0 4.1-1.4 4.1-3.6 0-2.3-1.5-3.6-4.1-3.6H21v7.2Z"
        fill="#F8FAFC"
      />
      <path d="M39 46 49.5 18H57L46.5 46H39Z" fill="#3B82F6" />
      <path d="M12 52h40" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={compact ? 30 : 36} />
      {!compact ? (
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight text-fg">
            PA Trading Journal
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-dim">
            Plan · Trade · Review
          </div>
        </div>
      ) : null}
    </div>
  )
}
