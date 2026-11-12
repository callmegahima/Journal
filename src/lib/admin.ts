import { useEffect, useState } from 'react'
import { useAuth } from '@/store/AuthContext'
import { appUrl, requireSupabase, supabase } from '@/lib/supabase'

/**
 * Admin actions. Each call runs a database function that refuses anyone who is not listed
 * in public.app_admins (see supabase/admin.sql), so hiding the page is only cosmetic.
 */

export interface AdminUser {
  id: string
  email: string | null
  full_name: string | null
  provider: string
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  banned_until: string | null
  is_admin: boolean
  plans: number
  trades: number
  wins: number
  losses: number
  net_pnl: number
  starting_balance: number | null
  last_activity: string | null
}

export function isSuspended(user: Pick<AdminUser, 'banned_until'>): boolean {
  if (!user.banned_until) return false
  const until = Date.parse(user.banned_until)
  return Number.isNaN(until) ? user.banned_until.includes('infinity') : until > Date.now()
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const adminApi = {
  listUsers: async () =>
    ((await call<AdminUser[]>('admin_list_users')) ?? []).map((row) => ({
      ...row,
      net_pnl: Number(row.net_pnl ?? 0),
      starting_balance: row.starting_balance == null ? null : Number(row.starting_balance),
    })),
  setSuspended: (target: string, suspended: boolean) =>
    call<void>('admin_set_suspended', { target, suspended }),
  signOutUser: (target: string) => call<void>('admin_sign_out_user', { target }),
  confirmEmail: (target: string) => call<void>('admin_confirm_email', { target }),
  deleteUser: (target: string) => call<void>('admin_delete_user', { target }),
  /** Same email as "Forgot password", sent to that user. */
  sendPasswordReset: async (email: string) => {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: appUrl(),
    })
    if (error) throw new Error(error.message)
  },
}

/** True when the signed-in account is an admin; null while checking; false otherwise. */
export function useIsAdmin(): boolean | null {
  const { user } = useAuth()
  const [admin, setAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!user || !supabase) {
      setAdmin(false)
      return
    }
    setAdmin(null)
    supabase.rpc('is_app_admin').then(({ data, error }) => {
      if (!cancelled) setAdmin(!error && data === true)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  return admin
}
