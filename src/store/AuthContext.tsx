import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { appUrl, cloudConfigured, requireSupabase, supabase } from '@/lib/supabase'

interface AuthContextValue {
  /** False when the site was built without Supabase keys. */
  enabled: boolean
  loading: boolean
  user: User | null
  session: Session | null
  /** True after the user opened a "reset password" email link. */
  recovering: boolean
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  resendConfirmation: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  finishRecovery: () => void
  /** Deletes the account on the server, runs `cleanup` (erase local copy), then signs out. */
  deleteAccount: (cleanup?: () => Promise<void>) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Turns Supabase's error text into plain advice. */
export function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'Email or password is incorrect.'
  if (lower.includes('email not confirmed'))
    return 'Confirm your email first — open the link we sent you. You can resend it below.'
  if (lower.includes('user already registered'))
    return 'An account with this email already exists. Sign in instead.'
  if (lower.includes('rate limit') || lower.includes('too many'))
    return 'Too many attempts. Wait a minute and try again.'
  if (lower.includes('password should be') || lower.includes('weak'))
    return 'Choose a stronger password: at least 8 characters with letters and numbers.'
  if (lower.includes('failed to fetch') || lower.includes('network'))
    return 'No connection to the server. Check your internet and try again.'
  return message || 'Something went wrong. Try again.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(cloudConfigured)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
      // Remove "?code=…" from the address bar after an email link was handled.
      if (window.location.search.includes('code=')) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`)
      }
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') setRecovering(false)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await requireSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: appUrl() },
    })
    if (error) throw error
    // Supabase returns a user with no identities when the email is already registered.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new Error('User already registered')
    }
    return { needsConfirmation: !data.session }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await requireSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await requireSupabase().auth.signOut()
  }, [])

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: appUrl(),
    })
    if (error) throw error
  }, [])

  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await requireSupabase().auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: appUrl() },
    })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await requireSupabase().auth.updateUser({ password })
    if (error) throw error
  }, [])

  const deleteAccount = useCallback(async (cleanup?: () => Promise<void>) => {
    const client = requireSupabase()
    const { error } = await client.rpc('delete_my_account')
    if (error) throw error
    try {
      await cleanup?.()
    } finally {
      await client.auth.signOut({ scope: 'local' })
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled: cloudConfigured,
      loading,
      user: session?.user ?? null,
      session,
      recovering,
      signUp,
      signIn,
      signOut,
      sendPasswordReset,
      resendConfirmation,
      updatePassword,
      finishRecovery: () => setRecovering(false),
      deleteAccount,
    }),
    [
      loading,
      session,
      recovering,
      signUp,
      signIn,
      signOut,
      sendPasswordReset,
      resendConfirmation,
      updatePassword,
      deleteAccount,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
