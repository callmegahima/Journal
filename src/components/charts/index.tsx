import type { ReactNode } from 'react'
import { BarChart3 } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DailyPoint, EquityPoint, GroupStat, MonthlyPoint, RDistributionPoint } from '@/lib/metrics'
import { money, moneyCompact, moneySigned, pct } from '@/lib/format'
import { cn } from '@/lib/utils'

const axis = {
  tick: { fill: '#64748b', fontSize: 10 },
  axisLine: false,
  tickLine: false,
} as const

const gridStroke = '#1e293b'

function TipBox({
  title,
  rows,
}: {
  title: ReactNode
  rows: { label: string; value: ReactNode; tone?: 'profit' | 'loss' | 'muted' }[]
}) {
  return (
    <div className="rounded-lg border border-line-2 bg-[#0d1526]/95 px-3 py-2 text-[11px] shadow-xl shadow-black/40 backdrop-blur">
      <div className="mb-1.5 font-semibold text-fg">{title}</div>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-5">
            <span className="text-muted">{row.label}</span>
            <span
              className={cn(
                'font-mono font-medium tabular-nums',
                row.tone === 'profit'
                  ? 'text-profit'
                  : row.tone === 'loss'
                    ? 'text-loss'
                    : 'text-fg',
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function toneFor(value: number): 'profit' | 'loss' | undefined {
  if (value > 0) return 'profit'
  if (value < 0) return 'loss'
  return undefined
}

export function ChartEmpty({
  message,
  height = 220,
}: {
  message: string
  height?: number
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-2/70 text-center"
      style={{ height }}
    >
      <BarChart3 size={20} className="text-dim" />
      <p className="max-w-[260px] text-[11px] leading-relaxed text-dim">{message}</p>
    </div>
  )
}

export function EquityChart({
  points,
  startingBalance,
  height = 260,
}: {
  points: EquityPoint[]
  startingBalance: number
  height?: number
}) {
  if (points.length === 0) {
    return <ChartEmpty message="Your equity curve will appear after your first closed trade." height={height} />
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" {...axis} minTickGap={26} interval="preserveStartEnd" />
          <YAxis
            {...axis}
            width={56}
            tickFormatter={(value: number) => moneyCompact(value)}
            domain={['auto', 'auto']}
          />
          <Tooltip
            cursor={{ stroke: '#334155', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const point = payload[0]?.payload as EquityPoint | undefined
              if (!point) return null
              return (
                <TipBox
                  title={point.fullLabel}
                  rows={[
                    { label: 'Equity', value: money(point.equity) },
                    { label: 'Day P/L', value: moneySigned(point.pnl), tone: toneFor(point.pnl) },
                    { label: 'Trades', value: point.trades },
                  ]}
                />
              )
            }}
          />
          <ReferenceLine
            y={startingBalance}
            stroke="#475569"
            strokeDasharray="4 4"
            strokeOpacity={0.7}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#equityFill)"
            activeDot={{ r: 3.5, fill: '#60a5fa', stroke: '#0b1120', strokeWidth: 2 }}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DailyPnlChart({
  data,
  height = 220,
}: {
  data: DailyPoint[]
  height?: number
}) {
  const hasTrades = data.some((point) => point.trades > 0)
  if (!hasTrades) {
    return <ChartEmpty message="Daily results will appear here after you log trades." height={height} />
  }
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axis} width={52} tickFormatter={(value: number) => moneyCompact(value)} />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.05)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const point = payload[0]?.payload as DailyPoint | undefined
              if (!point) return null
              return (
                <TipBox
                  title={point.date}
                  rows={[
                    { label: 'Net P/L', value: moneySigned(point.pnl), tone: toneFor(point.pnl) },
                    { label: 'Trades', value: point.trades },
                  ]}
                />
              )
            }}
          />
          <ReferenceLine y={0} stroke="#334155" />
          <Bar dataKey="pnl" radius={[4, 4, 2, 2]} maxBarSize={24}>
            {data.map((point) => (
              <Cell
                key={point.date}
                fill={point.pnl > 0 ? '#22c55e' : point.pnl < 0 ? '#ef4444' : '#334155'}
                fillOpacity={0.9}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function MonthlyPnlChart({
  data,
  height = 220,
}: {
  data: MonthlyPoint[]
  height?: number
}) {
  const hasTrades = data.some((point) => point.trades > 0)
  if (!hasTrades) {
    return <ChartEmpty message="Monthly performance will appear after your first trade." height={height} />
  }
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" {...axis} interval={0} minTickGap={10} />
          <YAxis {...axis} width={52} tickFormatter={(value: number) => moneyCompact(value)} />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.05)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const point = payload[0]?.payload as MonthlyPoint | undefined
              if (!point) return null
              return (
                <TipBox
                  title={point.label}
                  rows={[
                    { label: 'Net P/L', value: moneySigned(point.pnl), tone: toneFor(point.pnl) },
                    { label: 'Trades', value: point.trades },
                  ]}
                />
              )
            }}
          />
          <ReferenceLine y={0} stroke="#334155" />
          <Bar dataKey="pnl" radius={[4, 4, 2, 2]} maxBarSize={30}>
            {data.map((point) => (
              <Cell
                key={point.month}
                fill={point.pnl > 0 ? '#22c55e' : point.pnl < 0 ? '#ef4444' : '#334155'}
                fillOpacity={0.9}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function WinLossDonut({
  wins,
  losses,
  breakeven,
  height = 200,
}: {
  wins: number
  losses: number
  breakeven: number
  height?: number
}) {
  const total = wins + losses + breakeven
  if (total === 0) {
    return <ChartEmpty message="Win / loss distribution appears after your first trade." height={height} />
  }
  const data = [
    { name: 'Wins', value: wins, color: '#22c55e' },
    { name: 'Losses', value: losses, color: '#ef4444' },
    { name: 'Breakeven', value: breakeven, color: '#475569' },
  ].filter((entry) => entry.value > 0)
  const decided = wins + losses
  const winRate = decided > 0 ? (wins / decided) * 100 : null

  return (
    <div className="flex items-center gap-4">
      <div style={{ height, width: height }} className="relative shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const entry = payload[0]?.payload as { name: string; value: number } | undefined
                if (!entry) return null
                return (
                  <TipBox
                    title={entry.name}
                    rows={[
                      { label: 'Trades', value: entry.value },
                      { label: 'Share', value: pct((entry.value / total) * 100, 1) },
                    ]}
                  />
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-semibold text-fg">
            {winRate == null ? '—' : `${winRate.toFixed(0)}%`}
          </span>
          <span className="text-[9px] uppercase tracking-wider text-dim">Win rate</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {[
          { label: 'Wins', value: wins, color: 'bg-profit' },
          { label: 'Losses', value: losses, color: 'bg-loss' },
          { label: 'Breakeven', value: breakeven, color: 'bg-slate-600' },
        ].map((entry) => (
          <div key={entry.label} className="flex items-center justify-between gap-3 text-[11px]">
            <span className="flex items-center gap-1.5 text-muted">
              <span className={cn('h-1.5 w-1.5 rounded-full', entry.color)} />
              {entry.label}
            </span>
            <span className="font-mono tabular-nums text-fg">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HorizontalPerformanceChart({
  stats,
  height = 240,
  emptyMessage,
}: {
  stats: GroupStat[]
  height?: number
  emptyMessage: string
}) {
  if (stats.length === 0) return <ChartEmpty message={emptyMessage} height={height} />
  const data = stats.map((stat) => ({ ...stat, label: stat.key }))
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 20, left: 4, bottom: 4 }}
        >
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" {...axis} tickFormatter={(value: number) => moneyCompact(value)} />
          <YAxis
            type="category"
            dataKey="label"
            {...axis}
            width={118}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
          />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.05)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const stat = payload[0]?.payload as GroupStat | undefined
              if (!stat) return null
              return (
                <TipBox
                  title={stat.key}
                  rows={[
                    { label: 'Net P/L', value: moneySigned(stat.net), tone: toneFor(stat.net) },
                    { label: 'Trades', value: stat.trades },
                    { label: 'Win rate', value: pct(stat.winRate) },
                    { label: 'Avg R', value: stat.avgR == null ? '—' : `${stat.avgR.toFixed(2)}R` },
                  ]}
                />
              )
            }}
          />
          <ReferenceLine x={0} stroke="#334155" />
          <Bar dataKey="net" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((stat) => (
              <Cell
                key={stat.key}
                fill={stat.net > 0 ? '#22c55e' : stat.net < 0 ? '#ef4444' : '#334155'}
                fillOpacity={0.88}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function RMultipleChart({
  data,
  height = 220,
}: {
  data: RDistributionPoint[]
  height?: number
}) {
  const total = data.reduce((sum, point) => sum + point.count, 0)
  if (total === 0) {
    return <ChartEmpty message="R-multiple distribution appears after your first trade." height={height} />
  }
  const positive = new Set(['0 to 1R', '1R to 2R', '2R to 3R', '3R+'])
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="range" {...axis} interval={0} tick={{ fill: '#64748b', fontSize: 9 }} />
          <YAxis {...axis} width={30} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.05)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const point = payload[0]?.payload as RDistributionPoint | undefined
              if (!point) return null
              return (
                <TipBox
                  title={point.range}
                  rows={[
                    { label: 'Trades', value: point.count },
                    { label: 'Share', value: pct((point.count / total) * 100, 1) },
                  ]}
                />
              )
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 2, 2]} maxBarSize={34}>
            {data.map((point) => (
              <Cell
                key={point.range}
                fill={
                  point.range === 'Breakeven'
                    ? '#475569'
                    : positive.has(point.range)
                      ? '#22c55e'
                      : '#ef4444'
                }
                fillOpacity={0.88}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
