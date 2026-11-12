import { ShieldCheck } from 'lucide-react'

/** Plain-language privacy notice, shown from the sign-in screen and from Settings. */
export function PrivacyNotice() {
  const sections: { title: string; body: string[] }[] = [
    {
      title: 'What we store',
      body: [
        'Your email address and a securely hashed password, so you can sign in.',
        'If you use “Continue with Google”, Google shares your name, email address and profile picture with us. We never see your Google password.',
        'The journal content you enter: plans, trades, checklists, psychology notes, calendar events, weekly reviews, settings and any chart screenshots you upload.',
        'A copy of your journal is also kept in this browser so the app works offline and loads quickly.',
      ],
    },
    {
      title: 'Who can see your trades',
      body: [
        'Only you. Every record is tied to your account, and the database itself refuses any request for another person’s records (Row Level Security). Other users cannot see, search, or change your data, and you cannot see theirs.',
        'There are no public profiles, leaderboards or sharing features.',
      ],
    },
    {
      title: 'Where it is stored',
      body: [
        'Accounts and journal data are hosted by Supabase (database and sign-in service). Data is sent over encrypted HTTPS connections and encrypted at rest by the provider.',
        'The app itself is a static website served by GitHub Pages; it does not receive your journal data.',
      ],
    },
    {
      title: 'What we do not do',
      body: [
        'No advertising, no tracking or analytics scripts, no selling or sharing of your data.',
        'The app never connects to a broker and never places trades.',
      ],
    },
    {
      title: 'Your choices',
      body: [
        'Export: Settings → Backup & data → Export backup gives you all your data as a file at any time.',
        'Delete: Settings → Profile & account → Delete account permanently removes your account and every journal record stored on the server. Data saved in a browser can be cleared from that browser.',
        'You can change your password or sign out of a device at any time.',
      ],
    },
    {
      title: 'Keeping your account safe',
      body: [
        'Use a unique password. Sign out on shared devices. You can also set a device passcode in Settings for extra protection on your phone.',
      ],
    },
  ]

  return (
    <article className="space-y-4">
      <header className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-accent-2" />
        <h2 className="text-base font-semibold text-fg">Privacy notice</h2>
      </header>
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="text-[12px] font-semibold text-fg">{section.title}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted">
            {section.body.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  )
}
