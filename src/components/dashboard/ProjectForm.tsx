'use client'

import type { FormEvent } from 'react'
import type { DashboardWorkspace } from './WorkspaceProjectSelector'

type ProjectFormProps = {
  workspaces: DashboardWorkspace[]
  workspaceId: string
  projectName: string
  projectEnvironment: string
  onWorkspaceChange: (workspaceId: string) => void
  onProjectNameChange: (name: string) => void
  onProjectEnvironmentChange: (environment: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ProjectForm(props: ProjectFormProps) {
  return (
    <form className="tw-form-grid" onSubmit={props.onSubmit}>
      <label className="tw-field">
        Workspace
        <select required value={props.workspaceId} onChange={event => props.onWorkspaceChange(event.target.value)}>
          <option value="">Select workspace</option>
          {props.workspaces.map(workspace => (
            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
          ))}
        </select>
      </label>
      <label className="tw-field">
        New project
        <input required maxLength={100} value={props.projectName} onChange={event => props.onProjectNameChange(event.target.value)} placeholder="Production app" />
      </label>
      <label className="tw-field">
        Environment
        <select value={props.projectEnvironment} onChange={event => props.onProjectEnvironmentChange(event.target.value)}>
          <option value="production">Production</option>
          <option value="staging">Staging</option>
          <option value="development">Development</option>
          <option value="test">Test</option>
        </select>
      </label>
      <button className="tw-primary-btn" type="submit">Create project</button>
    </form>
  )
}
