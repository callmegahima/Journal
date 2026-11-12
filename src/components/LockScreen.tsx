import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react'
import { LogoMark } from '@/components/Logo'
import { useData } from '@/store/DataContext'
import { Button } from '@/components/ui/primitives'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export function LockScreen() {
  const { data, unlock } = useData()
  const [passcode, setPasscode] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!passcode.trim()) {
      setError('Enter your passcode.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const ok = await unlock(passcode)
      if (!ok) {
        setError('Incorrect passcode. Try again.')
        setPasscode('')
      }
    } catch {
      setError('Could not verify the passcode on this device.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-4">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-60" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.07] blur-3xl" />
      <div className="relative w-full max-w-sm animate-slide-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={52} />
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-fg">
            My Trading Journal
          </h1>
          <p className="mt-1 text-xs text-muted">
            Welcome back{data.settings.displayName ? `, ${data.settings.displayName}` : ''}.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="card p-5 shadow-2xl shadow-black/30"
          autoComplete="off"
        >
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-line-2/60 bg-panel-2/60 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
            <Lock size={14} className="shrink-0 text-accent-2" />
            Your journal is locked on this device. Enter your passcode to continue.
          </div>

          <label className="label" htmlFor="passcode">
            Passcode
          </label>
          <div className="relative">
            <input
              id="passcode"
              type={show ? 'text' : 'password'}
              value={passcode}
              onChange={(event) => {
                setPasscode(event.target.value)
                setError('')
              }}
              className="input pr-10"
              placeholder="Enter passcode"
              autoFocus
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-dim transition hover:text-fg"
              onClick={() => setShow((value) => !value)}
              aria-label={show ? 'Hide passcode' : 'Show passcode'}
            >
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {error ? (
            <p className="mt-2 text-[11px] font-medium text-loss">{error}</p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            className="mt-4 w-full"
            loading={busy}
          >
            Unlock journal
          </Button>

          <div className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-[10px] leading-relaxed text-dim">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" />
            <span>
              Stored locally in this browser. If you forget your passcode, the journal
              cannot be recovered without the device passcode. Keep a backup.
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}
