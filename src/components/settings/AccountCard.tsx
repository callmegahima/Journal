import { useState, type FormEvent } from 'react'
import {
  CloudOff,
  Info,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserCircle2,
} from 'lucide-react'
import { useData } from '@/store/DataContext'
import { useToast } from '@/store/ToastContext'
import { friendlyAuthError, useAuth } from '@/store/AuthContext'
import { Badge, Button, Card, CardHeader, InfoNote } from '@/components/ui/primitives'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { PrivacyNotice } from '@/components/auth/PrivacyNotice'
import { passwordProblem } from '@/components/auth/AuthScreens'
import { formatDateTime } from '@/lib/dates'
import { pendingChanges } from '@/lib/sync'

/** Signed-in account: sync status, password, privacy, sign out and account deletion. */
export function AccountCard() {
  const auth = useAuth()
  const { data, sync, syncNow, forgetLocal } = useData()
  const { toast } = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [eraseOpen, setEraseOpen] = useState(false)

  if (!auth.enabled || !auth.user) {
    return (
      <Card>
        <CardHeader
          title="Account"
          subtitle="This copy of the journal runs without accounts."
          icon={<CloudOff size={14} />}
          action={<Badge variant="slate">Local only</Badge>}
        />
        <div className="space-y-2 p-4 text-[11px] leading-relaxed text-muted">
          <p>
            Your journal is saved only in this browser. Sign-in and private cloud sync appear here
            once the site owner connects the account service.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setPrivacyOpen(true)}>
            <ShieldCheck size={13} /> Privacy notice
          </Button>
        </div>
        <PrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      </Card>
    )
  }

  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    const problem = passwordProblem(password)
    if (problem) return toast(problem, 'error')
    if (password !== confirm) return toast('The two passwords do not match.', 'error')
    setSavingPassword(true)
    try {
      await auth.updatePassword(password)
      setPassword('')
      setConfirm('')
      toast('Password changed.', 'success')
    } catch (error) {
      toast(friendlyAuthError(error), 'error')
    } finally {
      setSavingPassword(false)
    }
  }

  const runNow = async () => {
    const ok = await syncNow()
    toast(ok ? 'Synced with your account.' : 'Sync failed — see the message on the card.', ok ? 'success' : 'error')
  }

  const signOut = async () => {
    if (pendingChanges() > 0) await syncNow()
    await auth.signOut()
  }

  const signOutAndErase = async () => {
    const synced = await syncNow()
    if (!synced || pendingChanges() > 0) {
      toast('Some changes have not reached your account yet. Connect to the internet and try again.', 'error')
      return
    }
    await forgetLocal()
    await auth.signOut()
  }

  const deleteAccount = async () => {
    try {
      await auth.deleteAccount(forgetLocal)
    } catch (error) {
      toast(friendlyAuthError(error), 'error')
    }
  }

  return (
    <Card>
      <CardHeader
        title="Your account"
        subtitle="Your trades are private to this login. Nobody else can read them."
        icon={<UserCircle2 size={14} />}
        action={
          <Badge variant={sync.error ? 'amber' : 'green'}>
            {sync.syncing ? 'Syncing…' : sync.error ? 'Not synced' : 'Synced'}
          </Badge>
        }
      />
      <div className="space-y-4 p-4">
        <div className="grid gap-1 text-[11px]">
          <Row label="Signed in as" value={auth.user.email ?? '—'} mono />
          <Row
            label="Last synced"
            value={
              sync.lastSyncAt
                ? formatDateTime(sync.lastSyncAt, data.settings.timezone, 'dd MMM · HH:mm:ss')
                : 'Not yet'
            }
            mono
          />
          <Row label="Sync runs" value="On open, after each change, on return to the app, every 2 min" />
        </div>
        {sync.error ? (
          <InfoNote tone="amber" icon={<Info size={12} />}>
            {sync.error}
          </InfoNote>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => void runNow()} loading={sync.syncing}>
            <RefreshCw size={13} /> Sync now
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPrivacyOpen(true)}>
            <ShieldCheck size={13} /> Privacy notice
          </Button>
        </div>

        <form className="space-y-2 border-t border-line pt-4" onSubmit={changePassword}>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-fg">
            <KeyRound size={13} /> Change password
          </div>
          <input type="email" className="hidden" autoComplete="username" value={auth.user.email ?? ''} readOnly />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="input"
              type="password"
              placeholder="New password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Repeat new password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          <Button type="submit" size="sm" loading={savingPassword} disabled={!password}>
            Update password
          </Button>
        </form>

        <div className="space-y-2 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" size="sm" onClick={() => void signOut()}>
              <LogOut size={13} /> Sign out
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEraseOpen(true)}>
              <UploadCloud size={13} /> Sign out and remove from this device
            </Button>
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={13} /> Delete account
            </Button>
          </div>
          <p className="text-[10px] leading-relaxed text-dim">
            On a shared or borrowed device, use “Sign out and remove from this device”. Your journal
            stays safe in your account.
          </p>
        </div>
      </div>

      <PrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <ConfirmDialog
        open={eraseOpen}
        onClose={() => setEraseOpen(false)}
        onConfirm={signOutAndErase}
        title="Sign out and remove from this device?"
        description="The journal is synced to your account first, then the copy saved in this browser is erased. Sign in again any time to get it back."
        confirmLabel="Sign out and remove"
        tone="primary"
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={deleteAccount}
        title="Delete your account permanently?"
        description="This deletes your login and every plan, trade, checklist, note and review stored in your account, and clears them from this browser. It cannot be undone. Export a backup first if you want to keep a copy."
        confirmLabel="Delete account"
        requireText="DELETE"
      />
    </Card>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-dim">{label}</span>
      <span className={`truncate text-right text-fg ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function PrivacyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Privacy">
      <PrivacyNotice />
    </Modal>
  )
}

/** Offers, once per account, to move a journal saved in this browser before accounts existed. */
export function LegacyImportBanner() {
  const { legacy, importLegacy, dismissLegacy } = useData()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  if (!legacy) return null

  const run = async () => {
    setBusy(true)
    try {
      const added = await importLegacy()
      toast(`Moved ${added} item${added === 1 ? '' : 's'} into your account.`, 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/[0.06] p-4 sm:flex-row sm:items-center">
      <UploadCloud size={18} className="shrink-0 text-accent-2" />
      <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
        <span className="font-semibold text-fg">This browser has a journal from before sign-in</span>{' '}
        ({legacy.records} item{legacy.records === 1 ? '' : 's'}). Move it into this account so it
        syncs to your other devices? Only do this if the journal is yours.
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="primary" size="sm" loading={busy} onClick={() => void run()}>
          Move into my account
        </Button>
        <Button variant="ghost" size="sm" onClick={dismissLegacy}>
          Not mine
        </Button>
      </div>
    </div>
  )
}
