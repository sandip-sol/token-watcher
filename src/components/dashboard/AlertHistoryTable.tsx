import { EmptyState } from './EmptyState'
import { getAlertTypeLabel } from './AlertTable'
import { LoadingState } from './LoadingState'

export type AlertHistoryRow = {
  id: string
  triggeredAt: string
  type: string
  value: number
  threshold: number
  status: string
  error: string | null
  alertRule: { name: string; type: string } | null
}

type AlertHistoryTableProps = {
  history: AlertHistoryRow[]
  loading: boolean
}

export function AlertHistoryTable({ history, loading }: AlertHistoryTableProps) {
  return (
    <div className="tw-table-card">
      <h2 className="tw-chart-title">Alert History</h2>
      {loading ? (
        <LoadingState>Loading alert history...</LoadingState>
      ) : history.length === 0 ? (
        <EmptyState>No alert history yet</EmptyState>
      ) : (
        <div className="tw-table-wrap">
          <table className="tw-model-table">
            <thead>
              <tr>
                <th>Triggered</th>
                <th>Alert</th>
                <th>Value</th>
                <th>Threshold</th>
                <th>Status</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {history.map(item => (
                <tr key={item.id}>
                  <td>{formatDate(item.triggeredAt)}</td>
                  <td>{item.alertRule?.name || getAlertTypeLabel(item.type)}</td>
                  <td>{item.value.toFixed(4)}</td>
                  <td>{item.threshold}</td>
                  <td>{item.status}</td>
                  <td>{item.error ? item.error.slice(0, 120) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}
