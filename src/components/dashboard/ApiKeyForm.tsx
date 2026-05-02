'use client'

import type { FormEvent } from 'react'
import type { DashboardProject, DashboardWorkspace } from './WorkspaceProjectSelector'

type ApiKeyFormProps = {
  workspaces: DashboardWorkspace[]
  projects: DashboardProject[]
  workspaceId: string
  projectId: string
  name: string
  environment: string
  saving: boolean
  onWorkspaceChange: (workspaceId: string) => void
  onProjectChange: (projectId: string) => void
  onNameChange: (name: string) => void
  onEnvironmentChange: (environment: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ApiKeyForm(props: ApiKeyFormProps) {
  return (
    <form className="tw-form-grid" onSubmit={props.onSubmit}>
      <label className="tw-field">
        Workspace
        <select required value={props.workspaceId} onChange={event => props.onWorkspaceChange(event.target.value)}>
          {props.workspaces.map(workspace => (
            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
          ))}
        </select>
      </label>
      <label className="tw-field">
        Project scope
        <select value={props.projectId} onChange={event => props.onProjectChange(event.target.value)}>
          <option value="">All projects</option>
          {props.projects.map(project => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </label>
      <label className="tw-field">
        Name
        <input value={props.name} maxLength={100} onChange={event => props.onNameChange(event.target.value)} placeholder="Production app" />
      </label>
      <label className="tw-field">
        Environment
        <select value={props.environment} onChange={event => props.onEnvironmentChange(event.target.value)}>
          <option value="live">Live</option>
          <option value="test">Test</option>
          <option value="dev">Dev</option>
        </select>
      </label>
      <button className="tw-primary-btn" type="submit" disabled={props.saving}>
        {props.saving ? 'Creating...' : 'Create new key'}
      </button>
    </form>
  )
}
