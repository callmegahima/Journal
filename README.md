# PA Trading Journal

A local-first manual trading plan and journal for XAUUSD (Gold), built around Price Action and
Support/Resistance. It is a planning and review tool only — it never connects to a broker, places
trades, or asks for broker credentials.

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL. A production build can be previewed with:

```bash
npm run build
npm run preview
```

## What it includes

- **Dashboard** — balance, P/L, win rate, profit factor, risk guard, open plans and journal prompts.
- **Trading Plan** — PA + S&R checklist with BUY/SELL sections, setup templates, mandatory/optional
  items, group scores and a READY / WAIT / NO TRADE decision validated against your numerical risk rules.
- **Trade Journal** — manual entry of real executions, calculated or actual P/L, R multiples,
  screenshots, mistake tags and lessons, linked plans and checklist snapshots.
- **Calendar** — user-created events, daily notes and weekly reflections in your display timezone.
- **Strategy & Setups** — editable setups, checklist items, templates and a trading playbook.
- **Risk Calculator** — position sizing from the configured contract specification, in points.
- **Psychology** — check-ins, discipline scoring, emotional patterns and rule breaks.
- **Analytics & Reports** — metrics computed only from recorded trades, with CSV export.
- **Settings** — profile, starting balance, risk limits, timezone, instrument specifications,
  passcode lock, backups and reset.

## Data and privacy

- Everything is stored in **IndexedDB in this browser**. There is no account, server or cloud sync.
- Export a JSON backup from **Settings → Backup & data** before clearing browser data or changing devices.
- The optional passcode is hashed locally with PBKDF2-SHA256. There is **no recovery** if you forget
  it — a backup restored on an unlocked device is the only fallback.
- Screenshots are stored locally with the trade.

## Important

- Instrument values (contract size, tick size, tick value, lot limits) are **templates only**. Verify
  them with your broker before trusting any position size.
- The default $50 balance and GMT+2 timezone are starting points, not recommendations.
- Statistics describe recorded history. They do not predict future results or guarantee an edge.
