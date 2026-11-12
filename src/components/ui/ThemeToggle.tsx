import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

/** Compact switch that flips the app between the dark and light palettes. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!isDark}
      aria-label={label}
      title={label}
      onClick={toggle}
      className={cn(
        'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border border-line-2 bg-panel-2 p-0.5 transition-colors hover:border-dim',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-full shadow-sm transition-transform duration-200',
          isDark
            ? 'translate-x-0 bg-panel-3 text-accent-2'
            : 'translate-x-7 bg-white text-warn',
        )}
      >
        {isDark ? <Moon size={13} /> : <Sun size={13} />}
      </span>
    </button>
  )
}
