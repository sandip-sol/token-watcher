import { StatCard } from '@/components/ui/StatCard'

type StatCardsProps = {
  loading: boolean
  days: number
  todayCost: number
  yesterdayCost: number
  totalCost: number
  totalTokens: number
  callCount: number
  avgLatencyMs: number
  errorCount: number
  todayErrorCount: number
}

export function StatCards({
  loading,
  days,
  todayCost,
  yesterdayCost,
  totalCost,
  totalTokens,
  callCount,
  avgLatencyMs,
  errorCount,
  todayErrorCount,
}: StatCardsProps) {
  const todayChange = yesterdayCost > 0 ? ((todayCost - yesterdayCost) / yesterdayCost) * 100 : 0

  return (
    <div className="tw-grid-stats">
      <StatCard
        label="Today's Spend"
        value={`$${todayCost.toFixed(4)}`}
        subLabel={`${todayChange > 0 ? '+' : ''}${todayChange.toFixed(1)}% vs yesterday`}
        trend={todayChange > 0 ? 'up' : todayChange < 0 ? 'down' : 'neutral'}
        loading={loading}
        accent="amber"
      />
      <StatCard
        label={`Total Spend (${days}d)`}
        value={`$${totalCost.toFixed(2)}`}
        subLabel={`${callCount.toLocaleString()} API calls`}
        loading={loading}
        accent="emerald"
      />
      <StatCard
        label="Total Tokens"
        value={formatTokens(totalTokens)}
        subLabel={`${callCount.toLocaleString()} requests`}
        loading={loading}
        accent="sky"
      />
      <StatCard
        label="Avg Latency"
        value={`${avgLatencyMs.toLocaleString()}ms`}
        subLabel="across all models"
        loading={loading}
        accent="violet"
      />
      <StatCard
        label="Recent Errors"
        value={`${errorCount.toLocaleString()}`}
        subLabel={`${todayErrorCount.toLocaleString()} today`}
        loading={loading}
        accent="amber"
      />
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
