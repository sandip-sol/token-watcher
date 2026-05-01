'use client'

import { FormEvent, useEffect, useState } from 'react'
import { DashboardShell } from '@/components/ui/DashboardShell'

type Workspace = {
  id: string
  name: string
  slug: string
  _count?: { projects: number; apiKeys: number; events: number; alerts: number }
}

type Project = {
  id: string
  workspaceId: string
  name: string
  slug: string
  description: string | null
  environment: string | null
  _count?: { apiKeys: number; events: number; alerts: number }
}

export default function ProjectsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectEnvironment, setProjectEnvironment] = useState('production')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadWorkspaces()
  }, [])

  useEffect(() => {
    if (workspaceId) loadProjects(workspaceId)
  }, [workspaceId])

  async function loadWorkspaces() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/workspaces')
      if (response.status === 401) {
        window.location.href = '/login'
        return
      }
      if (!response.ok) throw new Error('Unable to load workspaces')
      const body = await response.json()
      setWorkspaces(body.workspaces || [])
      if (!workspaceId && body.workspaces?.[0]) setWorkspaceId(body.workspaces[0].id)
    } catch {
      setError('Workspaces could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  async function loadProjects(nextWorkspaceId = workspaceId) {
    try {
      const response = await fetch(`/api/projects?workspaceId=${encodeURIComponent(nextWorkspaceId)}`)
      if (!response.ok) throw new Error('Unable to load projects')
      const body = await response.json()
      setProjects(body.projects || [])
    } catch {
      setError('Projects could not be loaded.')
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName }),
      })
      if (!response.ok) throw new Error('Unable to create workspace')
      const body = await response.json()
      setWorkspaceName('')
      setMessage('Workspace created.')
      await loadWorkspaces()
      setWorkspaceId(body.workspace.id)
    } catch {
      setError('Workspace could not be created.')
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name: projectName,
          environment: projectEnvironment,
        }),
      })
      if (!response.ok) throw new Error('Unable to create project')
      setProjectName('')
      setProjectEnvironment('production')
      setMessage('Project created.')
      await loadProjects()
    } catch {
      setError('Project could not be created.')
    }
  }

  return (
    <DashboardShell>
      <section className="tw-management-layout">
        <div className="tw-panel">
          <h1 className="tw-page-title">Projects / Settings</h1>
          <p className="tw-page-copy">
            Use workspaces for teams or products, then projects for apps, environments, or major features.
          </p>

          <div className="tw-settings-grid">
            <form className="tw-form-grid" onSubmit={createWorkspace}>
              <label className="tw-field">
                New workspace
                <input required maxLength={100} value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} placeholder="Acme AI" />
              </label>
              <button className="tw-primary-btn" type="submit">Create workspace</button>
            </form>

            <form className="tw-form-grid" onSubmit={createProject}>
              <label className="tw-field">
                Workspace
                <select required value={workspaceId} onChange={event => setWorkspaceId(event.target.value)}>
                  {workspaces.map(workspace => (
                    <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                  ))}
                </select>
              </label>
              <label className="tw-field">
                New project
                <input required maxLength={100} value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="Production app" />
              </label>
              <label className="tw-field">
                Environment
                <select value={projectEnvironment} onChange={event => setProjectEnvironment(event.target.value)}>
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                  <option value="test">Test</option>
                </select>
              </label>
              <button className="tw-primary-btn" type="submit">Create project</button>
            </form>
          </div>

          {message ? <p className="tw-inline-success">{message}</p> : null}
          {error ? <p className="tw-form-error">{error}</p> : null}
        </div>

        <div className="tw-table-card">
          <h2 className="tw-chart-title">Projects</h2>
          {loading ? (
            <div className="tw-empty-state">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="tw-empty-state">No projects yet</div>
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
      </section>
    </DashboardShell>
  )
}
