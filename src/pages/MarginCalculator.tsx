import { useMemo, useState } from 'react'
import { Gauge, RotateCcw, Scale } from 'lucide-react'
import type { Direction } from '@/types'
import { DIRECTIONS } from '@/types'
import { useData } from '@/store/DataContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader } from '@/components/ui/primitives'
import { NumberField } from '@/components/ui/form'
import { MarginCheckPanel } from '@/components/trades/MarginCheckPanel'
import { checkMargin, conversionPair, quoteCurrencyOf } from '@/lib/calc'
import { decimalsForTick, lots as formatLots, money } from '@/lib/format'
import { cn } from '@/lib/utils'

const LEVERAGES = [30, 50, 100, 200, 300, 500, 1000]

/** Work out margin before planning a trade: how much a size needs and how big you can go. */
export function MarginCalculatorPage() {
  const { data } = useData()
  const { settings, trades } = data
  const instruments = settings.instruments
  const equity = useMemo(
    () => settings.startingBalance + trades.reduce((sum, trade) => sum + trade.pnl, 0),
    [settings.startingBalance, trades],
  )

  const [instrumentId, setInstrumentId] = useState(
    settings.activeInstrumentId || instruments[0]?.id || '',
  )
  const spec = instruments.find((item) => item.id === instrumentId) ?? instruments[0]
  const [direction, setDirection] = useState<Direction>('BUY')
  const [balance, setBalance] = useState<number | null>(Math.round(equity * 100) / 100)
  const [leverage, setLeverage] = useState<number | null>(settings.leverage)
  const [stopOutPct, setStopOutPct] = useState<number | null>(settings.stopOutPct)
  const [entry, setEntry] = useState<number | null>(null)
  const [sl, setSl] = useState<number | null>(null)
  const [lotsInput, setLotsInput] = useState<number | null>(null)
  const crossPair = spec ? conversionPair(spec) : null
  const [rateInput, setRateInput] = useState<number | null>(null)
  const conversionRate = crossPair ? (rateInput ?? spec?.conversionRate ?? null) : null

  const freeMargin = Math.max(0, balance ?? 0)
  const lev = leverage ?? 0
  const stopOut = stopOutPct ?? 0
  const digits = spec ? decimalsForTick(spec.tickSize) : 2
  const unit = spec ? quoteCurrencyOf(spec) : 'USD'

  const base = useMemo(
    () =>
      spec
        ? checkMargin({
            direction,
            entry,
            sl,
            lots: 0,
            balance: freeMargin,
            spec,
            leverage: lev,
            stopOutPct: stopOut,
            conversionRate,
          })
        : null,
    [spec, direction, entry, sl, freeMargin, lev, stopOut, conversionRate],
  )
  // Blank lot size = look at the biggest size the margin allows.
  const lots = lotsInput != null && lotsInput > 0 ? lotsInput : (base?.maxLots ?? 0)
  const check = useMemo(
    () =>
      spec
        ? checkMargin({
            direction,
            entry,
            sl,
            lots,
            balance: freeMargin,
            spec,
            leverage: lev,
            stopOutPct: stopOut,
            conversionRate,
          })
        : null,
    [spec, direction, entry, sl, lots, freeMargin, lev, stopOut, conversionRate],
  )

  const sizeRows = useMemo(() => {
    if (!spec || !base || !(base.marginPerLot > 0)) return []
    const sizes = new Set<number>([spec.minLot, 0.05, 0.1, 0.5, 1])
    if (base.maxLots > 0) sizes.add(base.maxLots)
    return [...sizes]
      .filter((size) => size >= spec.minLot && size <= spec.maxLot)
      .sort((a, b) => a - b)
      .map((size) => {
        const margin = Math.round(base.marginPerLot * size * 100) / 100
        return {
          size,
          margin,
          share: freeMargin > 0 ? (margin / freeMargin) * 100 : null,
          level: margin > 0 ? (freeMargin / margin) * 100 : null,
          fits: margin <= freeMargin,
          isMax: size === base.maxLots,
        }
      })
  }, [spec, base, freeMargin])

  const leverageRows = useMemo(() => {
    if (!spec || entry == null || !(entry > 0)) return []
    return LEVERAGES.map((value) => {
      const result = checkMargin({
        direction,
        entry,
        sl: null,
        lots: 0,
        balance: freeMargin,
        spec,
        leverage: value,
        stopOutPct: stopOut,
        conversionRate,
      })
      return { leverage: value, perLot: result.marginPerLot, maxLots: result.maxLots }
    })
  }, [spec, entry, direction, freeMargin, stopOut, conversionRate])

  const reset = () => {
    setDirection('BUY')
    setBalance(Math.round(equity * 100) / 100)
    setLeverage(settings.leverage)
    setStopOutPct(settings.stopOutPct)
    setEntry(null)
    setSl(null)
    setLotsInput(null)
    setRateInput(null)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Margin Calculator"
        title="Check margin before you plan"
        description="See how much margin a lot size needs, the biggest size your balance can open and where MT5 would stop you out. Uses the MT5 formula: lots × contract size × price ÷ leverage."
        actions={
          <Button variant="ghost" onClick={reset}>
            <RotateCcw size={14} /> Reset
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Inputs"
            subtitle="Prefilled from your balance and Settings. Changes here are not saved."
            icon={<Gauge size={14} />}
          />
          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <label className="label" htmlFor="margin-instrument">
                  Instrument
                </label>
                <select
                  id="margin-instrument"
                  className="input"
                  value={instrumentId}
                  onChange={(event) => {
                    setInstrumentId(event.target.value)
                    setEntry(null)
                    setSl(null)
                    setRateInput(null)
                  }}
                >
                  {instruments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.symbol} — {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label">Direction</span>
                <div className="segmented h-10">
                  {DIRECTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      data-active={direction === item}
                      onClick={() => setDirection(item)}
                      className={cn(
                        'h-full px-4',
                        direction === item && item === 'BUY'
                          ? 'text-profit'
                          : direction === item && item === 'SELL'
                            ? 'text-loss'
                            : '',
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                label="Balance (free margin)"
                value={balance}
                onChange={setBalance}
                prefix="$"
                min={0}
                hint={
                  <button
                    type="button"
                    className="font-medium text-accent-2 underline-offset-2 hover:underline"
                    onClick={() => setBalance(Math.round(equity * 100) / 100)}
                  >
                    Use journal balance {money(equity)}
                  </button>
                }
              />
              <NumberField
                label="Leverage"
                value={leverage}
                onChange={setLeverage}
                prefix="1:"
                min={1}
                step={1}
                hint={`Settings: 1:${settings.leverage}`}
              />
              <NumberField
                label="Stop out level"
                value={stopOutPct}
                onChange={setStopOutPct}
                suffix="%"
                min={0}
                step={1}
                hint={`Settings: ${settings.stopOutPct}%`}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                label="Entry price"
                value={entry}
                onChange={setEntry}
                suffix={unit}
                min={0}
                placeholder="Current price"
              />
              <NumberField
                label="Lot size"
                value={lotsInput}
                onChange={(value) => setLotsInput(value != null && value > 0 ? value : null)}
                suffix="lots"
                min={0}
                step={spec?.lotStep ?? 0.01}
                placeholder={base && base.maxLots > 0 ? `${formatLots(base.maxLots)} (max)` : 'Max'}
                hint="Leave empty to check the biggest size."
              />
              <NumberField
                label="Stop loss (optional)"
                value={sl}
                onChange={setSl}
                suffix={unit}
                min={0}
                hint="Checks whether stop out comes first."
              />
            </div>

            {crossPair ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <NumberField
                  label={`${crossPair.symbol} rate`}
                  value={conversionRate}
                  onChange={setRateInput}
                  min={0}
                  step={0.00001}
                  placeholder="Current price"
                  error={conversionRate == null ? `Needed to convert ${unit} to USD.` : null}
                />
              </div>
            ) : null}

            {entry == null ? (
              <p className="text-[11px] text-dim">Enter the entry price to see the margin.</p>
            ) : check ? (
              <MarginCheckPanel
                check={check}
                lots={lots}
                balance={freeMargin}
                leverage={lev}
                stopOutPct={stopOut}
                decimals={digits}
                onUseMax={(value) => setLotsInput(value)}
              />
            ) : null}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Margin by lot size"
              subtitle={`${spec?.symbol ?? ''} at ${entry != null ? entry : '—'} with ${money(freeMargin)} and 1:${lev}`}
              icon={<Scale size={14} />}
            />
            {sizeRows.length === 0 ? (
              <p className="p-4 text-[11px] text-dim">Enter the entry price to fill this table.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[9px] uppercase tracking-[0.08em] text-dim">
                      <th className="px-4 py-2 font-medium">Lots</th>
                      <th className="px-2 py-2 text-right font-medium">Margin</th>
                      <th className="px-2 py-2 text-right font-medium">Of balance</th>
                      <th className="px-2 py-2 text-right font-medium">Margin level</th>
                      <th className="px-4 py-2 text-right font-medium">Can open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizeRows.map((row) => (
                      <tr
                        key={row.size}
                        className={cn(
                          'cursor-pointer border-b border-line/60 font-mono transition hover:bg-panel-2/50',
                          row.isMax && 'bg-accent/[0.05]',
                        )}
                        onClick={() => setLotsInput(row.size)}
                        title="Check this size"
                      >
                        <td className="px-4 py-2 text-fg">
                          {formatLots(row.size)}
                          {row.isMax ? (
                            <span className="ml-1.5 font-sans text-[9px] text-accent-2">max</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-right text-fg">{money(row.margin)}</td>
                        <td className="px-2 py-2 text-right text-muted">
                          {row.share != null ? `${Math.round(row.share)}%` : '—'}
                        </td>
                        <td
                          className={cn(
                            'px-2 py-2 text-right',
                            row.level == null
                              ? 'text-muted'
                              : row.level < 100
                                ? 'text-loss'
                                : row.level < 200
                                  ? 'text-warn'
                                  : 'text-muted',
                          )}
                        >
                          {row.level != null ? `${Math.round(row.level)}%` : '—'}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-2 text-right font-sans font-semibold',
                            row.fits ? 'text-profit' : 'text-loss',
                          )}
                        >
                          {row.fits ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-4 py-2.5 text-[9px] text-dim">
                  Tap a row to check that size. Margin level under 100% means MT5 rejects the order.
                </p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Max lots by leverage"
              subtitle="Same balance and price — how leverage changes the biggest size."
              icon={<Gauge size={14} />}
            />
            {leverageRows.length === 0 ? (
              <p className="p-4 text-[11px] text-dim">Enter the entry price to fill this table.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[9px] uppercase tracking-[0.08em] text-dim">
                      <th className="px-4 py-2 font-medium">Leverage</th>
                      <th className="px-2 py-2 text-right font-medium">Margin per 1.00 lot</th>
                      <th className="px-4 py-2 text-right font-medium">Max lots</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leverageRows.map((row) => (
                      <tr
                        key={row.leverage}
                        className={cn(
                          'border-b border-line/60 font-mono',
                          row.leverage === lev && 'bg-accent/[0.05]',
                        )}
                      >
                        <td className="px-4 py-2 text-fg">
                          1:{row.leverage}
                          {row.leverage === lev ? (
                            <span className="ml-1.5 font-sans text-[9px] text-accent-2">yours</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-right text-muted">
                          {row.perLot > 0 ? money(row.perLot) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-fg">
                          {row.maxLots > 0 ? formatLots(row.maxLots) : 'None'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
