import { ConfirmButton } from './ConfirmButton'
import { EmptyState } from './EmptyState'
import { LoadingState } from './LoadingState'

export type ApiKeyRow = {
  id: string
  workspaceId: string
  projectId: string | null
  name: string | null
  keyPrefix: string
  environment: string
  isActive: boolean
  lastUsedAt: string | null
  createdAt: string
  revokedAt: string | null
  workspace: { name: string } | null
  project: { name: string; environment: string | null } | null
}

type ApiKeyTableProps = {
  apiKeys: ApiKeyRow[]
  loading: boolean
  onRevoke: (id: string) => void
}

export function ApiKeyTable({ apiKeys, loading, onRevoke }: ApiKeyTableProps) {
  return (
    <div className="tw-table-card">
      <h2 className="tw-chart-title">Existing Keys</h2>
      {loading ? (
        <LoadingState>Loading API keys...</LoadingState>
      ) : apiKeys.length === 0 ? (
        <EmptyState>No API keys yet</EmptyState>
      ) : (
        <div className="tw-table-wrap">
          <table className="tw-model-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Workspace</th>
                <th>Project</th>
                <th>Environment</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Used</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map(apiKey => (
                <tr key={apiKey.id}>
                  <td className="tw-model-name">{apiKey.name || 'Untitled key'}</td>
                  <td><code>{apiKey.keyPrefix}...</code></td>
                  <td>{apiKey.workspace?.name || apiKey.workspaceId}</td>
                  <td>{apiKey.project?.name || 'All projects'}</td>
                  <td><span className="tw-provider-badge">{apiKey.environment}</span></td>
                  <td>{apiKey.isActive ? 'Active' : 'Revoked'}</td>
                  <td>{formatDate(apiKey.createdAt)}</td>
                  <td>{apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : 'Never'}</td>
                  <td>
                    <ConfirmButton
                      className="tw-danger-btn"
                      disabled={!apiKey.isActive}
                      confirmMessage="Revoke this API key? Existing clients using it will stop ingesting events."
                      onConfirm={() => onRevoke(apiKey.id)}
                    >
                      Revoke
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

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}
