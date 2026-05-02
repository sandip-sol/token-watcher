import { CostTrendChart } from '@/components/charts/CostTrendChart'
import { ModelBreakdownChart } from '@/components/charts/ModelBreakdownChart'

type ModelSpend = {
  provider: string
  model: string
  totalCostUsd: number
  totalTokens: number
  callCount: number
  avgLatencyMs: number
}

type DailyTrendPoint = {
  date: string
  totalCost: number
  totalTokens: number
  callCount: number
}

type UsageChartsProps = {
  byModel: ModelSpend[]
  dailyTrend: DailyTrendPoint[]
  loading: boolean
}

export function UsageCharts({ byModel, dailyTrend, loading }: UsageChartsProps) {
  return (
    <div className="tw-grid-charts">
      <div className="tw-chart-card tw-chart-wide">
        <h2 className="tw-chart-title">Cost Over Time</h2>
        <CostTrendChart data={dailyTrend} loading={loading} />
      </div>
      <div className="tw-chart-card">
        <h2 className="tw-chart-title">Spend by Model</h2>
        <ModelBreakdownChart data={byModel} loading={loading} />
      </div>
    </div>
  )
}
