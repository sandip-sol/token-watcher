'use client'
// src/app/dashboard/page.tsx

import { useEffect, useState } from 'react'
import { CostTrendChart } from '@/components/charts/CostTrendChart'
import { ModelBreakdownChart } from '@/components/charts/ModelBreakdownChart'
import { StatCard } from '@/components/ui/StatCard'
import { ModelTable } from '@/components/ui/ModelTable'

interface StatsData {
  overview: {
    totalCostUsd: number
    totalTokens: number
    avgLatencyMs: number
    callCount: number
  }
  today: { totalCostUsd: number; totalTokens: number; callCount: number }
  yesterday: { totalCostUsd: number; totalTokens: number; callCount: number }
  byModel: Array<{
    provider: string
    model: string
    totalCostUsd: number
    totalTokens: number
    callCount: number
    avgLatencyMs: number
  }>
  dailyTrend: Array<{ date: string; totalCost: number; totalTokens: number; callCount: number }>
}

export default function DashboardPage() {
  const [data, setData] = useState<StatsData | null>(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/stats?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [days])

  const todayChange = data
    ? data.yesterday.totalCostUsd > 0
      ? ((data.today.totalCostUsd - data.yesterday.totalCostUsd) / data.yesterday.totalCostUsd) * 100
      : 0
    : 0

  return (
    <main className="tw-dashboard">
      <header className="tw-header">
        <div className="tw-header-left">
          <span className="tw-logo">⬡ TokenWatcher</span>
          <span className="tw-tagline">LLM Cost Auditor</span>
        </div>
        <div className="tw-header-right">
          <div className="tw-period-selector">
            {[7, 14, 30, 90].map(d => (
              <button
                key={d}
                className={`tw-period-btn ${days === d ? 'active' : ''}`}
                onClick={() => setDays(d)}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="tw-grid-stats">
        <StatCard
          label="Today's Spend"
          value={`$${(data?.today.totalCostUsd ?? 0).toFixed(4)}`}
          subLabel={`${todayChange > 0 ? '+' : ''}${todayChange.toFixed(1)}% vs yesterday`}
          trend={todayChange > 0 ? 'up' : todayChange < 0 ? 'down' : 'neutral'}
          loading={loading}
          accent="amber"
        />
        <StatCard
          label={`Total Spend (${days}d)`}
          value={`$${(data?.overview.totalCostUsd ?? 0).toFixed(2)}`}
          subLabel={`${(data?.overview.callCount ?? 0).toLocaleString()} API calls`}
          loading={loading}
          accent="emerald"
        />
        <StatCard
          label="Total Tokens"
          value={formatTokens(data?.overview.totalTokens ?? 0)}
          subLabel={`${(data?.overview.callCount ?? 0).toLocaleString()} requests`}
          loading={loading}
          accent="sky"
        />
        <StatCard
          label="Avg Latency"
          value={`${(data?.overview.avgLatencyMs ?? 0).toLocaleString()}ms`}
          subLabel="across all models"
          loading={loading}
          accent="violet"
        />
      </div>

      <div className="tw-grid-charts">
        <div className="tw-chart-card tw-chart-wide">
          <h2 className="tw-chart-title">Cost Over Time</h2>
          <CostTrendChart data={data?.dailyTrend ?? []} loading={loading} />
        </div>
        <div className="tw-chart-card">
          <h2 className="tw-chart-title">Spend by Model</h2>
          <ModelBreakdownChart data={data?.byModel ?? []} loading={loading} />
        </div>
      </div>

      <div className="tw-table-card">
        <h2 className="tw-chart-title">Model Breakdown</h2>
        <ModelTable data={data?.byModel ?? []} loading={loading} />
      </div>
    </main>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
