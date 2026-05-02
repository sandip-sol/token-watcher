'use client'

import type { FormEvent } from 'react'
import type { DashboardProject, DashboardWorkspace } from './WorkspaceProjectSelector'

export type AlertFormState = {
  name: string
  type: string
  threshold: string
  provider: string
  model: string
  webhookUrl: string
  projectId: string
  isActive: boolean
}

type AlertFormProps = {
  workspaces: DashboardWorkspace[]
  projects: DashboardProject[]
  workspaceId: string
  form: AlertFormState
  saving: boolean
  onWorkspaceChange: (workspaceId: string) => void
  onFormChange: (form: AlertFormState) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function AlertForm({ workspaces, projects, workspaceId, form, saving, onWorkspaceChange, onFormChange, onSubmit }: AlertFormProps) {
  return (
    <form className="tw-form-grid" onSubmit={onSubmit}>
      <label className="tw-field">
        Workspace
        <select required value={workspaceId} onChange={event => onWorkspaceChange(event.target.value)}>
          {workspaces.map(workspace => (
            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
          ))}
        </select>
      </label>
      <label className="tw-field">
        Project scope
        <select value={form.projectId} onChange={event => onFormChange({ ...form, projectId: event.target.value })}>
          <option value="">All projects</option>
          {projects.map(project => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </label>
      <label className="tw-field">
        Alert name
        <input required maxLength={100} value={form.name} onChange={event => onFormChange({ ...form, name: event.target.value })} />
      </label>
      <label className="tw-field">
        Alert type
        <select value={form.type} onChange={event => onFormChange({ ...form, type: event.target.value })}>
          <option value="daily_cost">Daily cost</option>
          <option value="monthly_cost">Monthly cost</option>
          <option value="daily_tokens">Daily tokens</option>
          <option value="model_daily_cost">Per-model daily cost</option>
        </select>
      </label>
      <label className="tw-field">
        Threshold
        <input required min="0" step="0.0001" type="number" value={form.threshold} onChange={event => onFormChange({ ...form, threshold: event.target.value })} />
      </label>
      <label className="tw-field">
        Provider
        <input maxLength={50} value={form.provider} onChange={event => onFormChange({ ...form, provider: event.target.value })} placeholder="openai" />
      </label>
      <label className="tw-field">
        Model
        <input maxLength={100} value={form.model} onChange={event => onFormChange({ ...form, model: event.target.value })} placeholder="gpt-4o-mini" />
      </label>
      <label className="tw-field">
        Webhook URL
        <input value={form.webhookUrl} onChange={event => onFormChange({ ...form, webhookUrl: event.target.value })} placeholder="https://example.com/tokenwatcher" />
      </label>
      <label className="tw-check-field">
        <input type="checkbox" checked={form.isActive} onChange={event => onFormChange({ ...form, isActive: event.target.checked })} />
        Active
      </label>
      <button className="tw-primary-btn" type="submit" disabled={saving}>
        {saving ? 'Creating...' : 'Create alert'}
      </button>
    </form>
  )
}
