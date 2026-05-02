import { EmptyState } from './EmptyState'
import { LoadingState } from './LoadingState'

export type ProjectRow = {
  id: string
  workspaceId: string
  name: string
  slug: string
  description: string | null
  environment: string | null
  _count?: { apiKeys: number; events: number; alerts: number }
}

type ProjectTableProps = {
  projects: ProjectRow[]
  loading: boolean
}

export function ProjectTable({ projects, loading }: ProjectTableProps) {
  return (
    <div className="tw-table-card">
      <h2 className="tw-chart-title">Projects</h2>
      {loading ? (
        <LoadingState>Loading projects...</LoadingState>
      ) : projects.length === 0 ? (
        <EmptyState>No projects yet</EmptyState>
      ) : (
        <div className="tw-table-wrap">
          <table className="tw-model-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Environment</th>
                <th>API Keys</th>
                <th>Events</th>
                <th>Alerts</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(project => (
                <tr key={project.id}>
                  <td className="tw-model-name">{project.name}</td>
                  <td><code>{project.slug}</code></td>
                  <td>{project.environment || 'Unspecified'}</td>
                  <td>{project._count?.apiKeys ?? 0}</td>
                  <td>{project._count?.events ?? 0}</td>
                  <td>{project._count?.alerts ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
