import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * New accounts wait for an admin to approve them (see supabase/approvals.sql). The database
 * enforces this; the app only shows the right screen.
 */

export type ApprovalStatus = 'approved' | 'pending' | 'rejected'

/** Fired after an admin approves or rejects someone, so the badge refreshes at once. */
export const APPROVALS_CHANGED = 'mtj-approvals-changed'

const RECHECK_MS = 30 * 1000
const ADMIN_POLL_MS = 60 * 1000

/** The signed-in account's approval status; null while checking. */
export function useApprovalStatus(userId: string | null): {
  status: ApprovalStatus | null
  recheck: () => Promise<void>
} {
  const [status, setStatus] = useState<ApprovalStatus | null>(null)

  const recheck = useCallback(async () => {
    if (!userId || !supabase) {
      setStatus('approved')
      return
    }
    const { data, error } = await supabase.rpc('my_approval_status')
    if (error) {
      // Offline, or approvals not set up yet: let the app open. The database still refuses
      // to sync an unapproved account's journal.
      setStatus((current) => current ?? 'approved')
      return
    }
    setStatus(data === 'pending' || data === 'rejected' ? data : 'approved')
  }, [userId])

  useEffect(() => {
    setStatus(null)
    void recheck()
  }, [recheck])

  // While waiting, check again regularly and whenever the trader comes back to the tab.
  useEffect(() => {
    if (status !== 'pending') return
    const timer = window.setInterval(() => void recheck(), RECHECK_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void recheck()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [status, recheck])

  return { status, recheck }
}

export function desktopAlertsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

function showDesktopAlert(count: number) {
  if (!desktopAlertsSupported() || Notification.permission !== 'granted') return
  try {
    const note = new Notification('New sign-up waiting for approval', {
      body:
        count === 1
          ? '1 new trader is waiting for you to approve their account.'
          : `${count} new traders are waiting for you to approve their accounts.`,
      icon: `${import.meta.env.BASE_URL}favicon.svg`,
      tag: 'mtj-pending-signups',
    })
    note.onclick = () => {
      window.focus()
      window.location.hash = '#/admin'
      note.close()
    }
  } catch {
    // Some phone browsers only allow notifications from a service worker; the in-app alert still shows.
  }
}

/**
 * For admins: how many sign-ups are waiting. Checks every minute and when the tab comes back,
 * and calls `onNew` (plus a desktop notification, if allowed) when new ones arrive.
 */
export function usePendingSignups(
  isAdmin: boolean | null,
  onNew: (count: number, added: number) => void,
): number {
  const [count, setCount] = useState(0)
  const previous = useRef<number | null>(null)
  const onNewRef = useRef(onNew)
  onNewRef.current = onNew

  useEffect(() => {
    if (!isAdmin || !supabase) {
      setCount(0)
      previous.current = null
      return
    }
    const client = supabase
    let cancelled = false
    const check = async () => {
      const { data, error } = await client.rpc('admin_pending_count')
      if (cancelled || error || typeof data !== 'number') return
      const before = previous.current
      previous.current = data
      setCount(data)
      // Alert on first load when some are waiting, and whenever more arrive.
      if ((before == null && data > 0) || (before != null && data > before)) {
        const added = before == null ? data : data - before
        onNewRef.current(data, added)
        showDesktopAlert(data)
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), ADMIN_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const onChanged = () => void check()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(APPROVALS_CHANGED, onChanged)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(APPROVALS_CHANGED, onChanged)
    }
  }, [isAdmin])

  return count
}
