'use client'

import { FormEvent, useEffect, useState } from 'react'
import { DashboardShell } from '@/components/ui/DashboardShell'

type ApiKey = {
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

type Workspace = { id: string; name: string }
type Project = { id: string; workspaceId: string; name: string; environment: string | null }

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [name, setName] = useState('')
  const [environment, setEnvironment] = useState('live')
  const [rawKey, setRawKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    fetch(`/api/projects?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(response => response.json())
      .then(body => setProjects(body.projects || []))
      .catch(() => setProjects([]))
  }, [workspaceId])

  async function loadInitialData() {
    await Promise.all([loadApiKeys(), loadWorkspaces()])
  }

  async function loadWorkspaces() {
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
    }
  }

  async function loadApiKeys() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/api-keys')
      if (response.status === 401) {
        window.location.href = '/login'
        return
      }

      if (!response.ok) throw new Error('Unable to load API keys')
      const body = await response.json()
      setApiKeys(body.apiKeys)
    } catch {
      setError('API keys could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  async function createApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    setRawKey('')

    try {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, environment, workspaceId, projectId: projectId || null }),
      })

      if (!response.ok) throw new Error('Unable to create API key')
      const body = await response.json()
      setRawKey(body.rawKey)
      setMessage('API key created.')
      setName('')
      setEnvironment('live')
      setProjectId('')
      await loadApiKeys()
    } catch {
      setError('API key could not be created.')
    } finally {
      setSaving(false)
    }
  }

  async function revokeApiKey(id: string) {
    if (!window.confirm('Revoke this API key? Existing clients using it will stop ingesting events.')) return

    setError('')
    setMessage('')

    try {
      const response = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Unable to revoke API key')
      setMessage('API key revoked.')
      await loadApiKeys()
    } catch {
      setError('API key could not be revoked.')
    }
  }

  return (
    <DashboardShell>
      <section className="tw-management-layout">
        <div className="tw-panel">
          <h1 className="tw-page-title">API Keys</h1>
          <p className="tw-page-copy">
            Create DB-backed keys for ingest clients. The environment variable key still works as a local fallback.
          </p>

          <form className="tw-form-grid" onSubmit={createApiKey}>
            <label className="tw-field">
              Workspace
              <select required value={workspaceId} onChange={event => {
                setWorkspaceId(event.target.value)
                setProjectId('')
              }}>
                {workspaces.map(workspace => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
            </label>
            <label className="tw-field">
              Project scope
              <select value={projectId} onChange={event => setProjectId(event.target.value)}>
                <option value="">All projects</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            <label className="tw-field">
              Name
              <input value={name} maxLength={100} onChange={event => setName(event.target.value)} placeholder="Production app" />
            </label>
            <label className="tw-field">
              Environment
              <select value={environment} onChange={event => setEnvironment(event.target.value)}>
                <option value="live">Live</option>
                <option value="test">Test</option>
                <option value="dev">Dev</option>
              </select>
            </label>
            <button className="tw-primary-btn" type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create new key'}
            </button>
          </form>

          {rawKey ? (
            <div className="tw-once-panel" role="status">
              <strong>Copy this key now. You will not be able to see it again.</strong>
              <code>{rawKey}</code>
              <button className="tw-secondary-btn" type="button" onClick={() => navigator.clipboard.writeText(rawKey)}>
                Copy key
              </button>
            </div>
          ) : null}

          {message ? <p className="tw-inline-success">{message}</p> : null}
          {error ? <p className="tw-form-error">{error}</p> : null}
        </div>

        <div className="tw-table-card">
          <h2 className="tw-chart-title">Existing Keys</h2>
          {loading ? (
            <div className="tw-empty-state">Loading API keys...</div>
          ) : apiKeys.length === 0 ? (
            <div className="tw-empty-state">No API keys yet</div>
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
                        <button
                          className="tw-danger-btn"
                          type="button"
                          disabled={!apiKey.isActive}
                          onClick={() => revokeApiKey(apiKey.id)}
                        >
                          Revoke
                        </button>
                      </td>
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

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}
