import { ConfirmButton } from './ConfirmButton'
import { EmptyState } from './EmptyState'
import { LoadingState } from './LoadingState'

export type AlertRuleRow = {
  id: string
  workspaceId: string
  projectId: string | null
  name: string
  type: string
  threshold: number
  provider: string | null
  model: string | null
  webhookUrl: string | null
  isActive: boolean
  lastTriggeredAt: string | null
  createdAt: string
  workspace: { name: string } | null
  project: { name: string } | null
}

const alertTypeLabels: Record<string, string> = {
  daily_cost: 'Daily cost',
  monthly_cost: 'Monthly cost',
  daily_tokens: 'Daily tokens',
  model_daily_cost: 'Per-model daily cost',
}

type AlertTableProps = {
  alerts: AlertRuleRow[]
  loading: boolean
  onToggle: (alert: AlertRuleRow) => void
  onTest: (id: string) => void
  onDeactivate: (id: string) => void
}

export function AlertTable({ alerts, loading, onToggle, onTest, onDeactivate }: AlertTableProps) {
  return (
    <div className="tw-table-card">
      <h2 className="tw-chart-title">Alert Rules</h2>
      {loading ? (
        <LoadingState>Loading alerts...</LoadingState>
      ) : alerts.length === 0 ? (
        <EmptyState>No alerts configured</EmptyState>
      ) : (
        <div className="tw-table-wrap">
          <table className="tw-model-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Threshold</th>
                <th>Filter</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Last Triggered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map(alert => (
                <tr key={alert.id}>
                  <td className="tw-model-name">{alert.name}</td>
                  <td>{alertTypeLabels[alert.type] || alert.type}</td>
                  <td>{alert.threshold}</td>
                  <td>{formatFilter(alert)}</td>
                  <td>{alert.workspace?.name || alert.workspaceId} / {alert.project?.name || 'All projects'}</td>
                  <td>{alert.isActive ? 'Active' : 'Inactive'}</td>
                  <td>{alert.lastTriggeredAt ? formatDate(alert.lastTriggeredAt) : 'Never'}</td>
                  <td className="tw-action-cell">
                    <button className="tw-secondary-btn" type="button" onClick={() => onToggle(alert)}>
                      {alert.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button className="tw-secondary-btn" type="button" onClick={() => onTest(alert.id)}>
                      Test
                    </button>
                    <ConfirmButton
                      className="tw-danger-btn"
                      confirmMessage="Deactivate this alert? It will stop sending webhook notifications."
                      onConfirm={() => onDeactivate(alert.id)}
                    >
                      Delete
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function getAlertTypeLabel(type: string): string {
  return alertTypeLabels[type] || type
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

function formatFilter(alert: AlertRuleRow): string {
  const parts = [alert.provider, alert.model].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : 'All traffic'
}
