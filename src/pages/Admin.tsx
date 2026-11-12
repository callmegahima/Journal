import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Ban,
  Bell,
  Check,
  Clock3,
  Download,
  KeyRound,
  LogOut,
  MailCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Button, Card, CardHeader, InfoNote } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { StatCard } from '@/components/ui/StatCard'
import { useAuth } from '@/store/AuthContext'
import { useToast } from '@/store/ToastContext'
import { adminApi, isSuspended, useIsAdmin, type AdminUser } from '@/lib/admin'
import { money, moneySigned } from '@/lib/format'
import { APPROVALS_CHANGED, desktopAlertsSupported } from '@/lib/approval'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'pending' | 'active' | 'suspended' | 'unconfirmed' | 'admins'

function approvalOf(user: AdminUser): 'pending' | 'approved' | 'rejected' {
  return user.approval_status === 'pending' || user.approval_status === 'rejected'
    ? user.approval_status
    : 'approved'
}
const DAY = 24 * 60 * 60 * 1000

function when(value: string | null): string {
  if (!value) return 'Never'
  const time = Date.parse(value)
  if (Number.isNaN(time)) return '—'
  const diff = Date.now() - time
  if (diff < 60_000) return 'Just now'
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} min ago`
  if (diff < DAY) return `${Math.floor(diff / (60 * 60_000))} h ago`
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} d ago`
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function fullDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never'
}

function lastSeen(user: AdminUser): number {
  return Math.max(
    user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0,
    user.last_activity ? Date.parse(user.last_activity) : 0,
  )
}

type PendingAction =
  | { kind: 'delete'; user: AdminUser }
  | { kind: 'suspend'; user: AdminUser }
  | null

export function AdminPage() {
  const isAdmin = useIsAdmin()
  const { user: me } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction>(null)
  const [confirmText, setConfirmText] = useState('')
  const [alerts, setAlerts] = useState<NotificationPermission | 'unsupported'>(() =>
    desktopAlertsSupported() ? Notification.permission : 'unsupported',
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setUsers(await adminApi.listUsers())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  const stats = useMemo(() => {
    const now = Date.now()
    return {
      total: users.length,
      newWeek: users.filter((u) => now - Date.parse(u.created_at) < 7 * DAY).length,
      activeWeek: users.filter((u) => now - lastSeen(u) < 7 * DAY).length,
      suspended: users.filter(isSuspended).length,
      unconfirmed: users.filter((u) => !u.email_confirmed_at).length,
      pending: users.filter((u) => approvalOf(u) === 'pending').length,
      trades: users.reduce((sum, u) => sum + u.trades, 0),
      plans: users.reduce((sum, u) => sum + u.plans, 0),
    }
  }, [users])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (q && !`${u.email ?? ''} ${u.full_name ?? ''}`.toLowerCase().includes(q)) return false
      if (filter === 'pending') return approvalOf(u) !== 'approved'
      if (filter === 'active') return !isSuspended(u) && Date.now() - lastSeen(u) < 7 * DAY
      if (filter === 'suspended') return isSuspended(u)
      if (filter === 'unconfirmed') return !u.email_confirmed_at
      if (filter === 'admins') return u.is_admin
      return true
    })
  }, [users, query, filter])

  const run = async (id: string, label: string, action: () => Promise<void>) => {
    setBusy(id)
    try {
      await action()
      toast(label, 'success')
      await load()
      window.dispatchEvent(new Event(APPROVALS_CHANGED))
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const exportCsv = () => {
    const header = [
      'email', 'name', 'sign_in', 'joined', 'last_sign_in', 'last_activity', 'email_confirmed',
      'suspended', 'admin', 'plans', 'trades', 'wins', 'losses', 'net_pnl', 'balance',
    ]
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = users.map((u) =>
      [
        u.email, u.full_name, u.provider, u.created_at, u.last_sign_in_at, u.last_activity,
        u.email_confirmed_at ? 'yes' : 'no', isSuspended(u) ? 'yes' : 'no', u.is_admin ? 'yes' : 'no',
        u.plans, u.trades, u.wins, u.losses, u.net_pnl.toFixed(2),
        u.starting_balance != null ? (u.starting_balance + u.net_pnl).toFixed(2) : '',
      ].map(escape).join(','),
    )
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `traders-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  if (isAdmin === null) {
    return <div className="py-20 text-center text-[12px] text-dim">Checking admin access…</div>
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ShieldCheck size={22} className="mx-auto text-dim" />
        <div className="mt-2 text-[14px] font-semibold text-fg">Admins only</div>
        <p className="mt-1 text-[12px] text-dim">This page is only available to the app administrator.</p>
      </div>
    )
  }

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: stats.total },
    { id: 'pending', label: 'Waiting approval', count: stats.pending },
    { id: 'active', label: 'Active 7d', count: stats.activeWeek },
    { id: 'suspended', label: 'Suspended', count: stats.suspended },
    { id: 'unconfirmed', label: 'Unconfirmed', count: stats.unconfirmed },
    { id: 'admins', label: 'Admins', count: users.filter((u) => u.is_admin).length },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Admin"
        title="Traders on the app"
        description="Every account, its sign-in details and summary numbers. New sign-ups wait here for your approval. You can suspend or restore logins, sign people out, confirm emails, send password resets and delete accounts. You cannot see anyone's password or the content of their plans and trades."
        actions={
          <>
            {alerts === 'default' ? (
              <Button
                variant="ghost"
                onClick={() =>
                  void Notification.requestPermission().then((result) => {
                    setAlerts(result)
                    toast(
                      result === 'granted'
                        ? 'Desktop alerts on. You will be notified of new sign-ups while the app is open.'
                        : 'Desktop alerts are blocked. You will still see alerts inside the app.',
                      result === 'granted' ? 'success' : 'info',
                    )
                  })
                }
              >
                <Bell size={14} /> Turn on sign-up alerts
              </Button>
            ) : null}
            <Button variant="ghost" onClick={exportCsv} disabled={users.length === 0}>
              <Download size={14} /> Export CSV
            </Button>
            <Button variant="soft" onClick={() => void load()} loading={loading}>
              <RefreshCw size={14} /> Refresh
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Traders" value={String(stats.total)} />
        <StatCard label="New this week" value={String(stats.newWeek)} />
        <StatCard label="Active this week" value={String(stats.activeWeek)} />
        <StatCard label="Suspended" value={String(stats.suspended)} />
        <StatCard label="Plans" value={String(stats.plans)} />
        <StatCard label="Trades logged" value={String(stats.trades)} />
      </div>

      {error ? (
        <InfoNote tone="red" icon={<Ban size={12} />}>
          Could not load accounts: {error}
        </InfoNote>
      ) : null}

      {stats.pending > 0 ? (
        <Card className="border-warn/40">
          <CardHeader
            title="Waiting for approval"
            subtitle={`${stats.pending} new sign-up${stats.pending === 1 ? '' : 's'} cannot use the journal until you approve`}
            icon={<Clock3 size={14} className="text-warn" />}
          />
          <div className="divide-y divide-line/70">
            {users
              .filter((u) => approvalOf(u) === 'pending')
              .map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold text-fg">
                        {u.full_name || u.email || 'No email'}
                      </span>
                      <Badge variant="slate">{u.provider === 'google' ? 'Google' : 'Email'}</Badge>
                      {!u.email_confirmed_at ? <Badge variant="amber">Email not confirmed</Badge> : null}
                    </div>
                    {u.full_name && u.email ? (
                      <div className="mt-0.5 truncate text-[11px] text-muted">{u.email}</div>
                    ) : null}
                    <div className="mt-0.5 text-[10px] text-dim" title={fullDate(u.approval_requested_at ?? u.created_at)}>
                      Signed up {when(u.approval_requested_at ?? u.created_at)}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="success"
                      disabled={busy === u.id}
                      onClick={() =>
                        void run(u.id, `${u.email ?? 'Account'} approved.`, () => adminApi.setApproval(u.id, true))
                      }
                    >
                      <Check size={13} /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === u.id}
                      onClick={() =>
                        void run(u.id, `${u.email ?? 'Account'} rejected.`, () => adminApi.setApproval(u.id, false))
                      }
                    >
                      <X size={13} /> Reject
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Accounts"
          subtitle={`${shown.length} of ${users.length} shown`}
          icon={<Users size={14} />}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <input
              className="input h-9 pl-8"
              placeholder="Search email or name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  'h-8 rounded-lg border px-2.5 text-[11px] font-medium transition',
                  filter === item.id
                    ? 'border-accent/40 bg-accent/10 text-accent-2'
                    : 'border-line text-muted hover:text-fg',
                )}
              >
                {item.label} <span className="font-mono text-dim">{item.count}</span>
              </button>
            ))}
          </div>
        </div>

        {loading && users.length === 0 ? (
          <p className="p-6 text-center text-[12px] text-dim">Loading accounts…</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-[12px] text-dim">No accounts match.</p>
        ) : (
          <div className="divide-y divide-line/70">
            {shown.map((u) => {
              const self = u.id === me?.id
              const suspended = isSuspended(u)
              const balance = u.starting_balance != null ? u.starting_balance + u.net_pnl : null
              const winRate = u.wins + u.losses > 0 ? Math.round((u.wins / (u.wins + u.losses)) * 100) : null
              return (
                <div key={u.id} className={cn('p-4', suspended && 'bg-loss/[0.03]')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-fg">
                          {u.full_name || u.email || 'No email'}
                        </span>
                        {self ? <Badge variant="blue">You</Badge> : null}
                        {u.is_admin ? <Badge variant="blue">Admin</Badge> : null}
                        {approvalOf(u) === 'pending' ? (
                          <Badge variant="amber">Waiting approval</Badge>
                        ) : approvalOf(u) === 'rejected' ? (
                          <Badge variant="red">Rejected</Badge>
                        ) : null}
                        {suspended ? (
                          <Badge variant="red">Suspended</Badge>
                        ) : u.email_confirmed_at ? (
                          <Badge variant="green">Active</Badge>
                        ) : (
                          <Badge variant="amber">Email not confirmed</Badge>
                        )}
                        <Badge variant="slate">{u.provider === 'google' ? 'Google' : 'Email'}</Badge>
                      </div>
                      {u.full_name && u.email ? (
                        <div className="mt-0.5 truncate text-[11px] text-muted">{u.email}</div>
                      ) : null}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-dim">
                        <span title={fullDate(u.created_at)}>Joined {when(u.created_at)}</span>
                        <span title={fullDate(u.last_sign_in_at)}>Last sign-in {when(u.last_sign_in_at)}</span>
                        <span title={fullDate(u.last_activity)}>Last activity {when(u.last_activity)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3 text-right font-mono text-[11px]">
                      <Num label="Plans" value={String(u.plans)} />
                      <Num label="Trades" value={String(u.trades)} />
                      <Num label="Win rate" value={winRate == null ? '—' : `${winRate}%`} />
                      <Num
                        label="Net P/L"
                        value={moneySigned(u.net_pnl)}
                        tone={u.net_pnl > 0 ? 'profit' : u.net_pnl < 0 ? 'loss' : undefined}
                        hint={balance != null ? `Bal ${money(balance)}` : undefined}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {!self && approvalOf(u) !== 'approved' ? (
                      <Button
                        size="sm"
                        variant="success"
                        disabled={busy === u.id}
                        onClick={() =>
                          void run(u.id, `${u.email ?? 'Account'} approved.`, () => adminApi.setApproval(u.id, true))
                        }
                      >
                        <Check size={13} /> Approve
                      </Button>
                    ) : null}
                    {!self && !u.is_admin && approvalOf(u) === 'pending' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === u.id}
                        onClick={() =>
                          void run(u.id, `${u.email ?? 'Account'} rejected.`, () => adminApi.setApproval(u.id, false))
                        }
                      >
                        <X size={13} /> Reject
                      </Button>
                    ) : null}
                    {u.email ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === u.id}
                        onClick={() =>
                          void run(u.id, `Password reset email sent to ${u.email}.`, () =>
                            adminApi.sendPasswordReset(u.email as string),
                          )
                        }
                      >
                        <KeyRound size={13} /> Send password reset
                      </Button>
                    ) : null}
                    {!u.email_confirmed_at ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === u.id}
                        onClick={() =>
                          void run(u.id, 'Email marked as confirmed.', () => adminApi.confirmEmail(u.id))
                        }
                      >
                        <MailCheck size={13} /> Confirm email
                      </Button>
                    ) : null}
                    {!self ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === u.id}
                        onClick={() =>
                          void run(u.id, 'Signed out of all devices (within the hour).', () =>
                            adminApi.signOutUser(u.id),
                          )
                        }
                      >
                        <LogOut size={13} /> Sign out everywhere
                      </Button>
                    ) : null}
                    {!self ? (
                      suspended ? (
                        <Button
                          size="sm"
                          variant="success"
                          disabled={busy === u.id}
                          onClick={() =>
                            void run(u.id, 'Login restored.', () => adminApi.setSuspended(u.id, false))
                          }
                        >
                          <UserCheck size={13} /> Allow login
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === u.id}
                          onClick={() => {
                            setConfirmText('')
                            setPending({ kind: 'suspend', user: u })
                          }}
                        >
                          <Ban size={13} /> Suspend login
                        </Button>
                      )
                    ) : null}
                    {!self && !u.is_admin ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy === u.id}
                        onClick={() => {
                          setConfirmText('')
                          setPending({ kind: 'delete', user: u })
                        }}
                      >
                        <Trash2 size={13} /> Delete account
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <InfoNote tone="blue" icon={<ShieldCheck size={12} />}>
        Every action here is checked by the database against the admins list, so nobody else can
        use it even with the public key. Suspending or signing someone out ends their sessions;
        a device that is already open can stay signed in for up to an hour until its access
        expires.
      </InfoNote>

      <Modal
        open={pending != null}
        onClose={() => setPending(null)}
        title={pending?.kind === 'delete' ? 'Delete this account?' : 'Suspend this login?'}
        description={pending?.user.email ?? undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            {pending?.kind === 'delete' ? (
              <Button
                variant="danger"
                disabled={confirmText.trim().toLowerCase() !== (pending.user.email ?? '').toLowerCase()}
                loading={busy === pending.user.id}
                onClick={() => {
                  const target = pending.user
                  setPending(null)
                  void run(target.id, `${target.email} deleted.`, () => adminApi.deleteUser(target.id))
                }}
              >
                <Trash2 size={14} /> Delete permanently
              </Button>
            ) : pending ? (
              <Button
                variant="danger"
                onClick={() => {
                  const target = pending.user
                  setPending(null)
                  void run(target.id, `${target.email} suspended.`, () =>
                    adminApi.setSuspended(target.id, true),
                  )
                }}
              >
                <Ban size={14} /> Suspend login
              </Button>
            ) : null}
          </>
        }
      >
        {pending?.kind === 'delete' ? (
          <div className="space-y-3 text-[12px] text-muted">
            <p>
              This permanently removes the account and every plan, trade, checklist and note it
              owns ({pending.user.plans} plans, {pending.user.trades} trades). It cannot be undone.
            </p>
            <div>
              <label className="label" htmlFor="admin-confirm-delete">
                Type the email to confirm
              </label>
              <input
                id="admin-confirm-delete"
                className="input"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={pending.user.email ?? ''}
                autoComplete="off"
              />
            </div>
          </div>
        ) : pending ? (
          <p className="text-[12px] text-muted">
            They will be signed out and unable to sign in until you choose <b>Allow login</b>.
            Their journal is kept.
          </p>
        ) : null}
      </Modal>
    </div>
  )
}

function Num({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone?: 'profit' | 'loss'
  hint?: string
}) {
  return (
    <div>
      <div className="font-sans text-[9px] uppercase tracking-[0.08em] text-dim">{label}</div>
      <div
        className={cn(
          'font-semibold',
          tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-fg',
        )}
      >
        {value}
      </div>
      {hint ? <div className="text-[9px] text-dim">{hint}</div> : null}
    </div>
  )
}

