import { ModelTable } from '@/components/ui/ModelTable'

type ModelSpend = {
  provider: string
  model: string
  totalCostUsd: number
  totalTokens: number
  callCount: number
  avgLatencyMs: number
}

type RecentEventsTableProps = {
  data: ModelSpend[]
  loading: boolean
}

export function RecentEventsTable({ data, loading }: RecentEventsTableProps) {
  return (
    <div className="tw-table-card">
      <h2 className="tw-chart-title">Model Breakdown</h2>
      <ModelTable data={data} loading={loading} />
    </div>
  )
}
