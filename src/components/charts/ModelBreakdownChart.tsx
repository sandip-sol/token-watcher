'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

interface ModelBreakdownItem {
  model: string
  provider: string
  totalCostUsd: number
}

interface ModelBreakdownChartProps {
  data: ModelBreakdownItem[]
  loading?: boolean
}

const providerColors: Record<string, string> = {
  openai: '#378ADD',
  anthropic: '#D85A30',
  google: '#639922',
  ollama: '#888780',
}

export function ModelBreakdownChart({ data, loading = false }: ModelBreakdownChartProps) {
  if (loading) {
    return <div className="tw-chart-skeleton tw-skeleton" aria-label="Loading model breakdown chart" />
  }

  const chartData = data.filter(item => item.totalCostUsd > 0)

  if (chartData.length === 0) {
    return <div className="tw-empty-state">No model spend yet</div>
  }

  return (
    <div className="tw-chart-frame">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="totalCostUsd"
            nameKey="model"
            innerRadius="60%"
            outerRadius="82%"
            paddingAngle={2}
          >
            {chartData.map(item => (
              <Cell
                key={`${item.provider}-${item.model}`}
                fill={providerColors[item.provider.toLowerCase()] ?? '#6B7280'}
              />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
