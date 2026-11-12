// My Trading Journal — emails the admins when new traders sign up and wait for approval.
//
// Deploy in Supabase: Edge Functions → signup-alert, with "Verify JWT" turned OFF
// (the database calls it without a key). It is safe to call by anyone: it only emails
// about pending accounts that have not been emailed yet, then marks them as emailed.
//
// Needs one secret: RESEND_API_KEY (Edge Functions → Secrets).
// Optional: ALERT_FROM (e.g. "My Trading Journal <alerts@yourdomain.com>") once you verify
// a domain in Resend; without it, Resend's test sender is used, which can only email the
// address you signed up to Resend with.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const APP_URL = 'https://mytradingjournal-app.netlify.app/#/admin'

interface Pending {
  user_id: string
  email: string | null
  full_name: string | null
  provider: string
  requested_at: string
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async () => {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return json({ error: 'RESEND_API_KEY is not set' }, 500)

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  const { data: pending, error: claimError } = await db.rpc('signup_alerts_claim')
  if (claimError) return json({ error: claimError.message }, 500)
  const rows = (pending ?? []) as Pending[]
  if (rows.length === 0) return json({ sent: 0 })

  const release = () =>
    db.rpc('signup_alerts_release', { ids: rows.map((row) => row.user_id) })

  const { data: recipients, error: recipientError } = await db.rpc('signup_alert_recipients')
  const to = ((recipients ?? []) as { email: string }[]).map((row) => row.email).filter(Boolean)
  if (recipientError || to.length === 0) {
    await release()
    return json({ error: recipientError?.message ?? 'No admin email found' }, 500)
  }

  const { data: total } = await db.rpc('signup_alerts_pending_total')
  const waiting = typeof total === 'number' ? total : rows.length

  const subject =
    rows.length === 1
      ? `New sign-up to approve: ${rows[0].email ?? 'new trader'}`
      : `${rows.length} new sign-ups to approve`

  const list = rows
    .map((row) => {
      const name = row.full_name ? `${escapeHtml(row.full_name)} — ` : ''
      const via = row.provider === 'google' ? 'Google' : 'email'
      const when = new Date(row.requested_at).toUTCString()
      return `<li style="margin:0 0 6px">${name}<b>${escapeHtml(row.email ?? 'no email')}</b> <span style="color:#64748b">(${via}, ${when})</span></li>`
    })
    .join('')

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">
    <p style="margin:0 0 12px">${rows.length === 1 ? 'A new trader has' : `${rows.length} new traders have`} signed up to <b>My Trading Journal</b> and ${rows.length === 1 ? 'is' : 'are'} waiting for your approval:</p>
    <ul style="margin:0 0 14px;padding-left:18px">${list}</ul>
    <p style="margin:0 0 16px">${waiting} sign-up${waiting === 1 ? '' : 's'} waiting in total. They cannot use the journal until you approve them.</p>
    <p style="margin:0 0 20px"><a href="${APP_URL}" style="background:#2563eb;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open Admin to approve</a></p>
    <p style="margin:0;color:#64748b;font-size:12px">You get this email because you are an admin of My Trading Journal.</p>
  </div>`

  const text = `${rows.length === 1 ? 'A new trader has' : `${rows.length} new traders have`} signed up and ${rows.length === 1 ? 'is' : 'are'} waiting for your approval:\n${rows
    .map((row) => `- ${row.full_name ? `${row.full_name} — ` : ''}${row.email ?? 'no email'}`)
    .join('\n')}\n\n${waiting} waiting in total. Approve them here: ${APP_URL}`

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('ALERT_FROM') ?? 'My Trading Journal <onboarding@resend.dev>',
      to,
      subject,
      html,
      text,
    }),
  })

  if (!response.ok) {
    await release()
    return json({ error: `Resend ${response.status}: ${await response.text()}` }, 502)
  }
  return json({ sent: rows.length, to: to.length })
})
