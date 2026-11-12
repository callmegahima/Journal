import { useState } from 'react'
import { Clock3, LogOut, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/primitives'
import { AuthShell } from '@/components/auth/AuthScreens'
import { useAuth } from '@/store/AuthContext'

/** Shown to a new trader until an admin approves (or rejects) their account. */
export function PendingApprovalScreen({
  rejected,
  onRecheck,
}: {
  rejected: boolean
  onRecheck: () => Promise<void>
}) {
  const { user, signOut } = useAuth()
  const [checking, setChecking] = useState(false)

  return (
    <AuthShell>
      <div className="card space-y-3 p-5 text-center">
        <div
          className={
            rejected
              ? 'mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-loss/10 text-loss'
              : 'mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-warn/10 text-warn'
          }
        >
          {rejected ? <XCircle size={20} /> : <Clock3 size={20} />}
        </div>
        <h2 className="text-sm font-semibold text-fg">
          {rejected ? 'Registration not approved' : 'Waiting for approval'}
        </h2>
        <p className="text-[11px] leading-relaxed text-muted">
          {rejected ? (
            <>
              The admin did not approve the account{' '}
              <span className="font-medium text-fg">{user?.email}</span>. Contact the admin if you
              think this is a mistake.
            </>
          ) : (
            <>
              Thanks for signing up. Your account{' '}
              <span className="font-medium text-fg">{user?.email}</span> has been sent to the admin
              for approval. This page opens your journal by itself once you are approved.
            </>
          )}
        </p>
        {!rejected ? (
          <Button
            variant="primary"
            className="w-full"
            loading={checking}
            onClick={async () => {
              setChecking(true)
              try {
                await onRecheck()
              } finally {
                setChecking(false)
              }
            }}
          >
            <RefreshCw size={14} /> Check again
          </Button>
        ) : null}
        <Button variant="ghost" className="w-full" onClick={() => void signOut()}>
          <LogOut size={14} /> Sign out
        </Button>
      </div>
    </AuthShell>
  )
}
