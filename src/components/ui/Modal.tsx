import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'editor'

const sizeClasses: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
  editor: 'sm:max-w-[1400px] sm:h-[94vh]',
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  bodyClassName,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: ModalSize
  dismissible?: boolean
  bodyClassName?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => panelRef.current?.focus(), 20)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(timer)
    }
  }, [open, onClose, dismissible])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-[3px] animate-fade-in"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-2xl shadow-black/60 animate-scale-in focus:outline-none sm:rounded-2xl',
          sizeClasses[size],
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold tracking-tight text-fg">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{description}</p>
            ) : null}
          </div>
          {dismissible ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted transition hover:bg-panel-2 hover:text-fg"
              aria-label="Close dialog"
            >
              <X size={17} />
            </button>
          ) : null}
        </div>
        <div className={cn('scroll-thin flex-1 overflow-y-auto px-4 py-4 sm:px-5', bodyClassName)}>
          {children}
        </div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-panel/95 px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  tone = 'danger',
  requireText,
  busy = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description: string
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  requireText?: string
  busy?: boolean
}) {
  const [typed, setTyped] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const blocked = Boolean(requireText) && typed.trim() !== requireText

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={working || busy}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={working || busy}
            disabled={blocked}
            onClick={async () => {
              setWorking(true)
              try {
                await onConfirm()
                onClose()
              } finally {
                setWorking(false)
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-loss/10 text-loss">
          <AlertTriangle size={17} />
        </div>
        <div className="text-[13px] leading-relaxed text-muted">{description}</div>
      </div>
      {requireText ? (
        <div className="mt-4">
          <label className="label" htmlFor="confirm-text">
            Type <span className="font-mono text-fg">{requireText}</span> to confirm
          </label>
          <input
            id="confirm-text"
            className="input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            placeholder={requireText}
          />
        </div>
      ) : null}
    </Modal>
  )
}
