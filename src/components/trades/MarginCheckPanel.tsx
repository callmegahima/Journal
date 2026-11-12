import { AlertTriangle, Gauge } from 'lucide-react'
import type { MarginCheck } from '@/lib/calc'
import { lots as formatLots, money, price } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  check: MarginCheck
  lots: number
  balance: number
  leverage: number
  stopOutPct: number
  decimals: number
  /** Called with the max lot size when the user taps "Use max". */
  onUseMax?: (lots: number) => void
  className?: string
}

/** MT5 margin read-out: margin needed, biggest lot size the balance allows, stop out price. */
export function MarginCheckPanel({
  check,
  lots,
  balance,
  leverage,
  stopOutPct,
  decimals,
  onUseMax,
  className,
}: Props) {
  if (!(check.marginPerLot > 0)) return null
  const warn = check.insufficient || check.stopOutBeforeSl

  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        warn ? 'border-loss/30 bg-loss/[0.05]' : 'border-line bg-ink/40',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-fg">
          <Gauge size={13} className="text-accent-2" /> Margin (full margin check)
        </span>
        <span className="text-[9px] text-dim">
          1:{leverage} · stop out {stopOutPct}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Max lots by margin"
          value={check.maxLots > 0 ? `${formatLots(check.maxLots)} lots` : 'None'}
          tone={check.maxLots > 0 ? 'default' : 'loss'}
          extra={
            onUseMax && check.maxLots > 0 && Math.abs(check.maxLots - lots) > 1e-9 ? (
              <button
                type="button"
                className="font-medium text-accent-2 underline-offset-2 hover:underline"
                onClick={() => onUseMax(check.maxLots)}
              >
                Use max
              </button>
            ) : (
              `${money(check.marginPerLot)} per 1.00 lot`
            )
          }
        />
        <Stat
          label="Margin needed"
          value={check.marginRequired > 0 ? money(check.marginRequired) : '—'}
          tone={check.insufficient ? 'loss' : 'default'}
          extra={
            check.marginRequired > 0 && balance > 0
              ? `${Math.round((check.marginRequired / balance) * 100)}% of ${money(balance)}`
              : undefined
          }
        />
        <Stat
          label="Margin level"
          value={check.marginLevel != null ? `${Math.round(check.marginLevel)}%` : '—'}
          tone={
            check.marginLevel == null
              ? 'default'
              : check.marginLevel < 100
                ? 'loss'
                : check.marginLevel < 200
                  ? 'warn'
                  : 'default'
          }
          extra="Equity ÷ margin at entry"
        />
        <Stat
          label="Stop out price"
          value={check.stopOutPrice != null ? price(check.stopOutPrice, decimals) : '—'}
          tone={check.stopOutBeforeSl ? 'loss' : 'default'}
          extra={check.stopOutBeforeSl ? 'Before your stop loss' : 'MT5 closes the trade here'}
        />
      </div>

      {check.insufficient ? (
        <Warning>
          Not enough margin: {formatLots(lots)} lots needs {money(check.marginRequired)} but your
          balance is {money(balance)}. MT5 would reject it ("Not enough money").
          {check.maxLots > 0
            ? ` The most you can open is ${formatLots(check.maxLots)} lots.`
            : ' Even the minimum lot size needs more margin than you have.'}
        </Warning>
      ) : check.stopOutBeforeSl ? (
        <Warning>
          MT5 would stop you out at {price(check.stopOutPrice, decimals)}, before your stop loss is
          reached. Use a smaller lot size or a closer stop loss.
        </Warning>
      ) : null}

      <p className="mt-2 text-[9px] leading-relaxed text-dim">
        Assumes no other trades are open (free margin = balance). Leverage and stop out level are
        in Settings → Risk rules; check them in MT5.
      </p>
    </div>
  )
}

function Stat({
  label,
  value,
  extra,
  tone = 'default',
}: {
  label: string
  value: string
  extra?: React.ReactNode
  tone?: 'default' | 'warn' | 'loss'
}) {
  return (
    <div className="rounded-lg border border-line/70 bg-ink/35 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-[0.08em] text-dim">{label}</div>
      <div
        className={cn(
          'mt-0.5 font-mono text-[13px] font-semibold',
          tone === 'loss' ? 'text-loss' : tone === 'warn' ? 'text-warn' : 'text-fg',
        )}
      >
        {value}
      </div>
      {extra ? <div className="mt-0.5 text-[9px] text-dim">{extra}</div> : null}
    </div>
  )
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-loss/25 bg-loss/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-loss">
      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
