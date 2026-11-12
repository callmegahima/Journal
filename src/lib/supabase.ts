import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Public project settings, read at build time from:
 *   - `.env.local` when running locally
 *   - GitHub repository variables when GitHub Pages builds the site
 * Both values are designed to be public; the database's Row Level Security is what keeps
 * each user's data private.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const cloudConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        // PKCE puts the email-link code in "?code=…", which does not clash with the app's
        // "#/page" routes.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

/** Where email links (confirm sign-up, reset password) send people back to. */
export function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Accounts are not set up on this site yet.')
  return supabase
}
