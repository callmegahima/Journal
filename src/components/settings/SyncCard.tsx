import { useState } from 'react'
import { Cloud, ExternalLink, Eye, EyeOff, Info, RefreshCw, ShieldCheck, Unplug } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { useToast } from '@/store/ToastContext'
import { Badge, Button, Card, CardHeader, InfoNote } from '@/components/ui/primitives'
import { formatDateTime } from '@/lib/dates'

const TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=gist&description=PA%20Trading%20Journal%20sync'

export function SyncCard() {
  const { data, sync, connectSync, disconnectSync, syncNow } = useData()
  const { toast } = useToast()
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  const connect = async () => {
    setBusy(true)
    try {
      await connectSync(token, password)
      setToken('')
      setPassword('')
      toast('Sync connected. This device is now in sync.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not connect sync.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const runNow = async () => {
    const ok = await syncNow()
    toast(ok ? 'Synced.' : 'Sync failed — see the message on the card.', ok ? 'success' : 'error')
  }

  return (
    <Card>
      <CardHeader
        title="Sync between phone and computer"
        subtitle="Keeps every device in step through one encrypted, secret GitHub Gist."
        icon={<Cloud size={14} />}
        action={
          <Badge variant={!sync.configured ? 'slate' : sync.error ? 'red' : 'green'}>
            {!sync.configured ? 'Off' : sync.syncing ? 'Syncing…' : sync.error ? 'Error' : 'On'}
          </Badge>
        }
      />
      <div className="space-y-3 p-4">
        {sync.configured ? (
          <>
            <div className="grid gap-1 text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-dim">Last synced</span>
                <span className="font-mono text-fg">
                  {sync.lastSyncAt
                    ? formatDateTime(sync.lastSyncAt, data.settings.timezone, 'dd MMM · HH:mm:ss')
                    : 'Not yet'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-dim">Runs</span>
                <span className="text-fg">
                  On open, after every change, when you return to the app, every 2 min
                </span>
              </div>
            </div>
            {sync.error ? (
              <InfoNote tone="red" icon={<Info size={12} />}>
                {sync.error}
              </InfoNote>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void runNow()} loading={sync.syncing}>
                <RefreshCw size={14} /> Sync now
              </Button>
              <Button variant="ghost" onClick={disconnectSync}>
                <Unplug size={14} /> Disconnect this device
              </Button>
            </div>
            <p className="text-[10px] leading-relaxed text-dim">
              Disconnecting only stops syncing on this device. Your journal stays here and in the
              gist.
            </p>
          </>
        ) : (
          <>
            <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-muted">
              <li>
                <a
                  href={TOKEN_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-accent-2 underline-offset-2 hover:underline"
                >
                  Create a GitHub token <ExternalLink size={11} />
                </a>{' '}
                with only the <span className="font-mono">gist</span> box ticked, then copy it.
              </li>
              <li>Choose a sync password and paste both below.</li>
              <li>On your other device, open the journal and enter the same token and password.</li>
            </ol>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="sync-token">
                  GitHub token
                </label>
                <input
                  id="sync-token"
                  className="input font-mono"
                  type={show ? 'text' : 'password'}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="ghp_…"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div>
                <label className="label" htmlFor="sync-password">
                  Sync password
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="sync-password"
                    className="input"
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShow((value) => !value)}
                    aria-label={show ? 'Hide' : 'Show'}
                  >
                    {show ? <EyeOff size={14} /> : <Eye size={14} />}
                  </Button>
                </div>
              </div>
            </div>
            <Button
              variant="primary"
              onClick={() => void connect()}
              loading={busy}
              disabled={!token.trim() || password.length < 8}
            >
              <Cloud size={14} /> Connect and sync
            </Button>
            <InfoNote tone="slate" icon={<ShieldCheck size={12} />}>
              Your journal is encrypted on this device with the sync password before upload, so the
              gist only holds unreadable data. Use the same password on every device — it cannot be
              recovered. The token and password are remembered on this device only. The passcode
              lock is not synced; set it on each device.
            </InfoNote>
          </>
        )}
      </div>
    </Card>
  )
}
