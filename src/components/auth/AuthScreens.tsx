import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck, UserPlus } from 'lucide-react'
import { LogoMark } from '@/components/Logo'
import { Button } from '@/components/ui/primitives'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { friendlyAuthError, useAuth } from '@/store/AuthContext'
import { PrivacyNotice } from '@/components/auth/PrivacyNotice'
import { cn } from '@/lib/utils'

type Mode = 'signin' | 'signup' | 'forgot' | 'sent' | 'privacy'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.'
  return null
}

export function AuthShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-4 py-10">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-60" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.07] blur-3xl" />
      <div className={cn('relative w-full animate-slide-up', wide ? 'max-w-2xl' : 'max-w-sm')}>
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={48} />
          <h1 className="mt-3 text-lg font-semibold tracking-tight text-fg">My Trading Journal</h1>
          <p className="mt-1 text-xs text-muted">Plan, journal and review your trades — privately.</p>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
  icon,
}: {
  id: string
  label: string
  type: 'email' | 'password' | 'text'
  value: string
  onChange: (value: string) => void
  autoComplete: string
  placeholder?: string
  icon: ReactNode
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim">
          {icon}
        </span>
        <input
          id={id}
          name={id}
          type={type}
          className="input pl-9"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          spellCheck={false}
          autoCapitalize="none"
        />
      </div>
    </div>
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  show,
  onToggle,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  show: boolean
  onToggle: () => void
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim">
          <Lock size={14} />
        </span>
        <input
          id={id}
          name={id}
          type={show ? 'text' : 'password'}
          className="input px-9"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dim hover:text-fg"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function Message({ tone, children }: { tone: 'error' | 'ok'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg border px-3 py-2 text-[11px] leading-relaxed',
        tone === 'error'
          ? 'border-loss/25 bg-loss/[0.07] text-loss'
          : 'border-profit/25 bg-profit/[0.07] text-profit',
      )}
    >
      {children}
    </div>
  )
}

export function AuthScreens() {
  const { signIn, signInWithGoogle, signUp, sendPasswordReset, resendConfirmation } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agree, setAgree] = useState(false)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [sentKind, setSentKind] = useState<'confirm' | 'reset'>('confirm')

  const go = (next: Mode) => {
    setMode(next)
    setError('')
    setInfo('')
    setPassword('')
    setConfirm('')
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await action()
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const submitSignIn = (event: FormEvent) => {
    event.preventDefault()
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.')
    void run(() => signIn(email, password))
  }

  const submitSignUp = (event: FormEvent) => {
    event.preventDefault()
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.')
    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    if (password !== confirm) return setError('The two passwords do not match.')
    if (!agree) return setError('Please confirm you have read the privacy notice.')
    void run(async () => {
      const { needsConfirmation } = await signUp(email, password)
      if (needsConfirmation) {
        setSentKind('confirm')
        setMode('sent')
      }
    })
  }

  const submitForgot = (event: FormEvent) => {
    event.preventDefault()
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.')
    void run(async () => {
      await sendPasswordReset(email)
      setSentKind('reset')
      setMode('sent')
    })
  }

  if (mode === 'privacy') {
    return (
      <AuthShell wide>
        <div className="card p-5 sm:p-6">
          <button
            type="button"
            onClick={() => go('signin')}
            className="mb-3 inline-flex items-center gap-1 text-[11px] font-medium text-accent-2 hover:underline"
          >
            <ArrowLeft size={12} /> Back
          </button>
          <PrivacyNotice />
        </div>
      </AuthShell>
    )
  }

  if (mode === 'sent') {
    return (
      <AuthShell>
        <div className="card space-y-3 p-5 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent-2">
            <Mail size={20} />
          </div>
          <h2 className="text-sm font-semibold text-fg">Check your email</h2>
          <p className="text-[11px] leading-relaxed text-muted">
            {sentKind === 'confirm'
              ? 'We sent a confirmation link to '
              : 'If an account exists, we sent a password reset link to '}
            <span className="font-medium text-fg">{email.trim()}</span>. Open it on this device to
            continue. Check spam if it does not arrive within a few minutes.
            {sentKind === 'confirm'
              ? ' New accounts are then approved by the admin before the journal opens.'
              : ''}
          </p>
          {error ? <Message tone="error">{error}</Message> : null}
          {info ? <Message tone="ok">{info}</Message> : null}
          {sentKind === 'confirm' ? (
            <Button
              variant="soft"
              className="w-full"
              loading={busy}
              onClick={() =>
                void run(async () => {
                  await resendConfirmation(email)
                  setInfo('Sent again.')
                })
              }
            >
              Resend the email
            </Button>
          ) : null}
          <Button variant="ghost" className="w-full" onClick={() => go('signin')}>
            <ArrowLeft size={14} /> Back to sign in
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="card p-5 shadow-2xl shadow-black/30">
        {mode !== 'forgot' ? (
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-ink/50 p-1">
            {(['signin', 'signup'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => go(tab)}
                className={cn(
                  'h-8 rounded-md text-[12px] font-semibold transition',
                  mode === tab ? 'bg-accent/15 text-accent-2' : 'text-muted hover:text-fg',
                )}
              >
                {tab === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>
        ) : null}

        {mode === 'signin' || mode === 'signup' ? (
          <div className="mb-4 space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => void run(signInWithGoogle)}
            >
              <GoogleLogo /> Continue with Google
            </Button>
            {mode === 'signup' ? (
              <p className="text-center text-[10px] leading-relaxed text-dim">
                By continuing with Google you accept the{' '}
                <button
                  type="button"
                  onClick={() => go('privacy')}
                  className="font-medium text-accent-2 hover:underline"
                >
                  privacy notice
                </button>
                .
              </p>
            ) : null}
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-dim">
              <span className="h-px flex-1 bg-line" />
              or with email
              <span className="h-px flex-1 bg-line" />
            </div>
          </div>
        ) : null}

        {mode === 'signin' ? (
          <form className="space-y-3" onSubmit={submitSignIn} noValidate>
            <Field
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="you@example.com"
              icon={<Mail size={14} />}
            />
            <PasswordField
              id="password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              show={show}
              onToggle={() => setShow((v) => !v)}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => go('forgot')}
                className="text-[11px] font-medium text-accent-2 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            {error ? <Message tone="error">{error}</Message> : null}
            {error.startsWith('Confirm your email') ? (
              <Button
                type="button"
                variant="soft"
                className="w-full"
                onClick={() =>
                  void run(async () => {
                    await resendConfirmation(email)
                    setSentKind('confirm')
                    setMode('sent')
                  })
                }
              >
                Resend confirmation email
              </Button>
            ) : null}
            <Button type="submit" variant="primary" className="w-full" loading={busy}>
              <KeyRound size={14} /> Sign in
            </Button>
          </form>
        ) : null}

        {mode === 'signup' ? (
          <form className="space-y-3" onSubmit={submitSignUp} noValidate>
            <Field
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="you@example.com"
              icon={<Mail size={14} />}
            />
            <PasswordField
              id="new-password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              show={show}
              onToggle={() => setShow((v) => !v)}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              show={show}
              onToggle={() => setShow((v) => !v)}
            />
            <p className="text-[10px] text-dim">
              At least 8 characters, with letters and numbers.
            </p>
            <label className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={agree}
                onChange={(event) => setAgree(event.target.checked)}
              />
              <span>
                I have read the{' '}
                <button
                  type="button"
                  onClick={() => go('privacy')}
                  className="font-medium text-accent-2 hover:underline"
                >
                  privacy notice
                </button>
                .
              </span>
            </label>
            {error ? <Message tone="error">{error}</Message> : null}
            <Button type="submit" variant="primary" className="w-full" loading={busy}>
              <UserPlus size={14} /> Create account
            </Button>
          </form>
        ) : null}

        {mode === 'forgot' ? (
          <form className="space-y-3" onSubmit={submitForgot} noValidate>
            <div>
              <h2 className="text-sm font-semibold text-fg">Reset your password</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Enter your account email and we will send you a link to choose a new password.
              </p>
            </div>
            <Field
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="you@example.com"
              icon={<Mail size={14} />}
            />
            {error ? <Message tone="error">{error}</Message> : null}
            <Button type="submit" variant="primary" className="w-full" loading={busy}>
              Send reset link
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => go('signin')}>
              <ArrowLeft size={14} /> Back to sign in
            </Button>
          </form>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-dim">
        <ShieldCheck size={12} />
        Your trades are visible only to you.{' '}
        <button
          type="button"
          onClick={() => go('privacy')}
          className="font-medium text-accent-2 hover:underline"
        >
          Privacy
        </button>
      </div>
    </AuthShell>
  )
}

/** Shown after the user opens a "reset password" email link. */
export function SetNewPasswordScreen() {
  const { updatePassword, finishRecovery, user } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true)
    setError('')
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <div className="card p-5">
        {done ? (
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-profit/10 text-profit">
              <CheckCircle2 size={20} />
            </div>
            <h2 className="text-sm font-semibold text-fg">Password updated</h2>
            <p className="text-[11px] text-muted">You are signed in as {user?.email}.</p>
            <Button variant="primary" className="w-full" onClick={finishRecovery}>
              Open my journal
            </Button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={submit} noValidate>
            <div>
              <h2 className="text-sm font-semibold text-fg">Choose a new password</h2>
              <p className="mt-1 text-[11px] text-muted">For {user?.email}</p>
            </div>
            <PasswordField
              id="new-password"
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              show={show}
              onToggle={() => setShow((v) => !v)}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              show={show}
              onToggle={() => setShow((v) => !v)}
            />
            {error ? <Message tone="error">{error}</Message> : null}
            <Button type="submit" variant="primary" className="w-full" loading={busy}>
              Save new password
            </Button>
          </form>
        )}
      </div>
    </AuthShell>
  )
}

/** Shown when the site was built without Supabase keys. */
export function AccountsNotConfigured() {
  return (
    <AuthShell>
      <div className="card space-y-2 p-5 text-center">
        <h2 className="text-sm font-semibold text-fg">Accounts are not set up yet</h2>
        <p className="text-[11px] leading-relaxed text-muted">
          This copy of the journal was built without its account server settings. The site owner
          needs to add the Supabase project URL and public key, then redeploy.
        </p>
      </div>
    </AuthShell>
  )
}
