import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const styles: Record<ToastKind, string> = {
  success: 'border-profit/30 bg-profit/10 text-profit',
  error: 'border-loss/30 bg-loss/10 text-loss',
  info: 'border-accent/30 bg-accent/10 text-accent-2',
}

const icons = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      counter.current += 1
      const id = counter.current
      setToasts((current) => [...current.slice(-3), { id, message, kind }])
      window.setTimeout(() => dismiss(id), 4200)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2"
        aria-live="polite"
        role="status"
      >
        {toasts.map((item) => {
          const Icon = icons[item.kind]
          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-panel/95 px-3.5 py-3 text-[13px] font-medium shadow-2xl shadow-black/40 backdrop-blur animate-slide-up',
                styles[item.kind],
              )}
            >
              <Icon size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1 leading-snug text-fg">{item.message}</span>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="shrink-0 rounded p-0.5 text-muted transition hover:text-fg"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
