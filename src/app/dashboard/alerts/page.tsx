'use client'

import { FormEvent, useEffect, useState } from 'react'
import { DashboardShell } from '@/components/ui/DashboardShell'

type AlertRule = {
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

type AlertHistory = {
  id: string
  triggeredAt: string
  type: string
  value: number
  threshold: number
  status: string
  error: string | null
  alertRule: { name: string; type: string } | null
}

type Workspace = { id: string; name: string }
type Project = { id: string; workspaceId: string; name: string }

const alertTypeLabels: Record<string, string> = {
  daily_cost: 'Daily cost',
  monthly_cost: 'Monthly cost',
  daily_tokens: 'Daily tokens',
  model_daily_cost: 'Per-model daily cost',
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRule[]>([])
  const [history, setHistory] = useState<AlertHistory[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    type: 'daily_cost',
    threshold: '',
    provider: '',
    model: '',
    webhookUrl: '',
    projectId: '',
    isActive: true,
  })

  useEffect(() => {
    loadWorkspaces()
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    fetch(`/api/projects?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(response => response.json())
      .then(body => setProjects(body.projects || []))
      .catch(() => setProjects([]))
    loadAlerts(workspaceId, projectId)
  }, [workspaceId, projectId])

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
      if (body.workspaces?.[0]) setWorkspaceId(body.workspaces[0].id)
    } catch {
      setError('Workspaces could not be loaded.')
    }
  }

  async function loadAlerts(nextWorkspaceId = workspaceId, nextProjectId = projectId) {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({ workspaceId: nextWorkspaceId })
      if (nextProjectId) params.set('projectId', nextProjectId)
      const [alertsResponse, historyResponse] = await Promise.all([
        fetch(`/api/alerts?${params.toString()}`),
        fetch(`/api/alerts/history?${params.toString()}`),
      ])

      if (alertsResponse.status === 401 || historyResponse.status === 401) {
        window.location.href = '/login'
        return
      }

      if (!alertsResponse.ok || !historyResponse.ok) throw new Error('Unable to load alerts')

      const alertsBody = await alertsResponse.json()
      const historyBody = await historyResponse.json()
      setAlerts(alertsBody.alerts)
      setHistory(historyBody.history)
    } catch {
      setError('Alerts could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  async function createAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          workspaceId,
          projectId: form.projectId || null,
          threshold: Number(form.threshold),
          provider: form.provider || null,
          model: form.model || null,
          webhookUrl: form.webhookUrl || null,
        }),
      })

      if (!response.ok) throw new Error('Unable to create alert')
      setMessage('Alert created.')
      setForm({
        name: '',
        type: 'daily_cost',
        threshold: '',
        provider: '',
        model: '',
        webhookUrl: '',
        projectId: '',
        isActive: true,
      })
      await loadAlerts()
    } catch {
      setError('Alert could not be created. Check the type, threshold, model, and webhook URL.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleAlert(alert: AlertRule) {
    await updateAlert(alert.id, { isActive: !alert.isActive }, alert.isActive ? 'Alert deactivated.' : 'Alert activated.')
  }

  async function deactivateAlert(id: string) {
    if (!window.confirm('Deactivate this alert? It will stop sending webhook notifications.')) return
    await updateAlert(id, null, 'Alert deactivated.', 'DELETE')
  }

  async function testAlert(id: string) {
    setError('')
    setMessage('')

    try {
      const response = await fetch(`/api/alerts/${id}/test`, { method: 'POST' })
      if (!response.ok) throw new Error('Unable to send test webhook')
      setMessage('Test webhook sent.')
    } catch {
      setError('Test webhook could not be sent.')
    }
  }

  async function runEvaluation() {
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/alerts/evaluate', { method: 'POST' })
      if (!response.ok) throw new Error('Unable to evaluate alerts')
      setMessage('Alert evaluation completed.')
      await loadAlerts()
    } catch {
      setError('Alert evaluation could not be completed.')
    }
  }

  async function updateAlert(id: string, body: unknown, success: string, method = 'PATCH') {
    setError('')
    setMessage('')

    try {
      const response = await fetch(`/api/alerts/${id}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })

      if (!response.ok) throw new Error('Unable to update alert')
      setMessage(success)
      await loadAlerts()
    } catch {
      setError('Alert could not be updated.')
    }
  }

  return (
    <DashboardShell actions={<button className="tw-secondary-btn" type="button" onClick={runEvaluation}>Run evaluation</button>}>
      <section className="tw-management-layout">
        <div className="tw-panel">
          <h1 className="tw-page-title">Alerts</h1>
          <p className="tw-page-copy">
            Send webhook notifications when cost or token thresholds are crossed. Daily and monthly windows use UTC.
          </p>

          <form className="tw-form-grid" onSubmit={createAlert}>
            <label className="tw-field">
              Workspace
              <select required value={workspaceId} onChange={event => {
                setWorkspaceId(event.target.value)
                setProjectId('')
                setForm({ ...form, projectId: '' })
              }}>
                {workspaces.map(workspace => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
            </label>
            <label className="tw-field">
              Project scope
              <select value={form.projectId} onChange={event => setForm({ ...form, projectId: event.target.value })}>
                <option value="">All projects</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            <label className="tw-field">
              Alert name
              <input required maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
            </label>
            <label className="tw-field">
              Alert type
              <select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}>
                <option value="daily_cost">Daily cost</option>
                <option value="monthly_cost">Monthly cost</option>
                <option value="daily_tokens">Daily tokens</option>
                <option value="model_daily_cost">Per-model daily cost</option>
              </select>
            </label>
            <label className="tw-field">
              Threshold
              <input required min="0" step="0.0001" type="number" value={form.threshold} onChange={event => setForm({ ...form, threshold: event.target.value })} />
            </label>
            <label className="tw-field">
              Provider
              <input maxLength={50} value={form.provider} onChange={event => setForm({ ...form, provider: event.target.value })} placeholder="openai" />
            </label>
            <label className="tw-field">
              Model
              <input maxLength={100} value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} placeholder="gpt-4o-mini" />
            </label>
            <label className="tw-field">
              Webhook URL
              <input value={form.webhookUrl} onChange={event => setForm({ ...form, webhookUrl: event.target.value })} placeholder="https://example.com/tokenwatcher" />
            </label>
            <label className="tw-check-field">
              <input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} />
              Active
            </label>
            <button className="tw-primary-btn" type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create alert'}
            </button>
          </form>

          {message ? <p className="tw-inline-success">{message}</p> : null}
          {error ? <p className="tw-form-error">{error}</p> : null}
        </div>

        <div className="tw-table-card">
          <h2 className="tw-chart-title">Alert Rules</h2>
          {loading ? (
            <div className="tw-empty-state">Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div className="tw-empty-state">No alerts configured</div>
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
                        <button className="tw-secondary-btn" type="button" onClick={() => toggleAlert(alert)}>
                          {alert.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button className="tw-secondary-btn" type="button" onClick={() => testAlert(alert.id)}>
                          Test
                        </button>
                        <button className="tw-danger-btn" type="button" onClick={() => deactivateAlert(alert.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="tw-table-card">
          <h2 className="tw-chart-title">Alert History</h2>
          {loading ? (
            <div className="tw-empty-state">Loading alert history...</div>
          ) : history.length === 0 ? (
            <div className="tw-empty-state">No alert history yet</div>
          ) : (
            <div className="tw-table-wrap">
              <table className="tw-model-table">
                <thead>
                  <tr>
                    <th>Triggered</th>
                    <th>Alert</th>
                    <th>Value</th>
                    <th>Threshold</th>
                    <th>Status</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(item => (
                    <tr key={item.id}>
                      <td>{formatDate(item.triggeredAt)}</td>
                      <td>{item.alertRule?.name || alertTypeLabels[item.type] || item.type}</td>
                      <td>{item.value.toFixed(4)}</td>
                      <td>{item.threshold}</td>
                      <td>{item.status}</td>
                      <td>{item.error ? item.error.slice(0, 120) : ''}</td>
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

function formatFilter(alert: AlertRule): string {
  const parts = [alert.provider, alert.model].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : 'All traffic'
}
