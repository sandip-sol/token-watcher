'use client'

export type DashboardWorkspace = { id: string; name: string }
export type DashboardProject = { id: string; workspaceId: string; name: string }

type WorkspaceProjectSelectorProps = {
  workspaces: DashboardWorkspace[]
  projects: DashboardProject[]
  workspaceId: string
  projectId: string
  onWorkspaceChange: (workspaceId: string) => void
  onProjectChange: (projectId: string) => void
  projectLabel?: string
}

export function WorkspaceProjectSelector({
  workspaces,
  projects,
  workspaceId,
  projectId,
  onWorkspaceChange,
  onProjectChange,
  projectLabel = 'Project',
}: WorkspaceProjectSelectorProps) {
  return (
    <div className="tw-scope-selector">
      <select
        aria-label="Workspace"
        value={workspaceId}
        onChange={event => onWorkspaceChange(event.target.value)}
      >
        <option value="">Select workspace</option>
        {workspaces.map(workspace => (
          <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
        ))}
      </select>
      <select
        aria-label={projectLabel}
        value={projectId}
        onChange={event => onProjectChange(event.target.value)}
      >
        <option value="">All projects</option>
        {projects.map(project => (
          <option key={project.id} value={project.id}>{project.name}</option>
        ))}
      </select>
    </div>
  )
}
