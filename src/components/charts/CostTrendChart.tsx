'use client'

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

interface CostTrendPoint {
  date: string
  totalCost: number
  callCount: number
}

interface CostTrendChartProps {
  data: CostTrendPoint[]
  loading?: boolean
}

export function CostTrendChart({ data, loading = false }: CostTrendChartProps) {
  if (loading) {
    return <div className="tw-chart-skeleton tw-skeleton" aria-label="Loading cost trend chart" />
  }

  return (
    <div className="tw-chart-frame">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 20, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={formatCurrency}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              name === 'totalCost' ? formatCurrency(value) : value.toLocaleString(),
              name === 'totalCost' ? 'Cost' : 'Calls',
            ]}
            labelFormatter={formatDate}
          />
          <Line
            type="monotone"
            dataKey="totalCost"
            stroke="#1D9E75"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function formatCurrency(value: number) {
  return `$${value.toFixed(value < 1 ? 4 : 2)}`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
