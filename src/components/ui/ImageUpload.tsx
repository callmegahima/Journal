import { useId, useRef, useState, type DragEvent } from 'react'
import { Expand, Image as ImageIcon, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/store/ToastContext'
import { compressImage } from '@/lib/image'
import { cn } from '@/lib/utils'

export function ImageLightbox({
  src,
  alt = 'Chart screenshot',
  open,
  onClose,
}: {
  src: string | undefined
  alt?: string
  open: boolean
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={alt} size="xl" bodyClassName="bg-ink">
      {src ? (
        <img
          src={src}
          alt={alt}
          className="mx-auto max-h-[72vh] w-auto max-w-full rounded-lg object-contain"
        />
      ) : null}
    </Modal>
  )
}

export function ImageUpload({
  label,
  value,
  onChange,
  hint,
  disabled = false,
}: {
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
  hint?: string
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const { toast } = useToast()
  const id = useId()

  const processFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const dataUrl = await compressImage(file)
      onChange(dataUrl)
      toast('Screenshot attached.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not attach image.', 'error')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = event.dataTransfer.files?.[0]
    void processFile(file)
  }

  return (
    <div>
      <span className="label">{label}</span>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled || busy}
        onChange={(event) => void processFile(event.target.files?.[0])}
      />
      {value ? (
        <div className="group relative overflow-hidden rounded-xl border border-line bg-ink">
          <img
            src={value}
            alt={`${label} preview`}
            className="h-40 w-full cursor-zoom-in object-cover"
            onClick={() => setViewerOpen(true)}
          />
          <div className="absolute right-2 top-2 flex gap-1.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="rounded-md border border-white/10 bg-black/70 p-1.5 text-white/80 backdrop-blur hover:text-white"
              aria-label="Expand screenshot"
            >
              <Expand size={13} />
            </button>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="rounded-md border border-white/10 bg-black/70 p-1.5 text-red-300 backdrop-blur hover:text-red-200"
              aria-label="Remove screenshot"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            if (!disabled) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition',
            dragging
              ? 'border-accent/60 bg-accent/5'
              : 'border-line-2 bg-ink/40 hover:border-line-2/90',
          )}
        >
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel-2 text-muted">
            <ImageIcon size={16} />
          </div>
          <p className="text-[11px] text-muted">Drag & drop a chart screenshot, or</p>
          <Button
            type="button"
            size="sm"
            variant="soft"
            className="mt-2"
            loading={busy}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={13} /> Choose image
          </Button>
        </div>
      )}
      {hint ? <p className="mt-1.5 text-[10px] leading-relaxed text-dim">{hint}</p> : null}
      <ImageLightbox
        src={value}
        alt={`${label} full size`}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  )
}

export function ScreenshotThumb({
  src,
  alt,
}: {
  src: string | undefined
  alt: string
}) {
  const [open, setOpen] = useState(false)
  if (!src) {
    return <span className="text-[11px] text-dim">—</span>
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block h-8 w-12 overflow-hidden rounded border border-line transition hover:border-accent/50"
        aria-label={`View ${alt}`}
      >
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      </button>
      <ImageLightbox src={src} alt={alt} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
