'use client'

import { WorkspaceProjectSelector, type DashboardProject, type DashboardWorkspace } from './WorkspaceProjectSelector'

type DashboardFiltersProps = {
  workspaces: DashboardWorkspace[]
  projects: DashboardProject[]
  workspaceId: string
  projectId: string
  days: number
  provider: string
  model: string
  onWorkspaceChange: (workspaceId: string) => void
  onProjectChange: (projectId: string) => void
  onDaysChange: (days: number) => void
  onProviderChange: (provider: string) => void
  onModelChange: (model: string) => void
}

export function DashboardFilters(props: DashboardFiltersProps) {
  return (
    <>
      <WorkspaceProjectSelector
        workspaces={props.workspaces}
        projects={props.projects}
        workspaceId={props.workspaceId}
        projectId={props.projectId}
        onWorkspaceChange={props.onWorkspaceChange}
        onProjectChange={props.onProjectChange}
      />
      <div className="tw-period-selector">
        {dateRanges().map(range => (
          <button
            key={range.label}
            className={`tw-period-btn ${props.days === range.days ? 'active' : ''}`}
            onClick={() => props.onDaysChange(range.days)}
            type="button"
          >
            {range.label}
          </button>
        ))}
      </div>
      <div className="tw-scope-selector">
        <input
          aria-label="Provider filter"
          placeholder="Provider"
          value={props.provider}
          onChange={event => props.onProviderChange(event.target.value.trim())}
        />
        <input
          aria-label="Model filter"
          placeholder="Model"
          value={props.model}
          onChange={event => props.onModelChange(event.target.value.trim())}
        />
      </div>
    </>
  )
}

function dateRanges() {
  const now = new Date()
  return [
    { label: 'Today', days: 1 },
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'This month', days: now.getDate() },
  ]
}
