'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { AlertForm, type AlertFormState } from '@/components/dashboard/AlertForm'
import { AlertHistoryTable, type AlertHistoryRow } from '@/components/dashboard/AlertHistoryTable'
import { AlertTable, type AlertRuleRow } from '@/components/dashboard/AlertTable'
import { ErrorMessage } from '@/components/dashboard/ErrorMessage'
import { DashboardShell } from '@/components/ui/DashboardShell'
import { dashboardFetch, deleteJson, getJson, patchJson, postJson } from '@/lib/client/dashboard-fetch'

type Workspace = { id: string; name: string }
type Project = { id: string; workspaceId: string; name: string }

const initialForm: AlertFormState = {
  name: '',
  type: 'daily_cost',
  threshold: '',
  provider: '',
  model: '',
  webhookUrl: '',
  projectId: '',
  isActive: true,
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRuleRow[]>([])
  const [history, setHistory] = useState<AlertHistoryRow[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState<AlertFormState>(initialForm)

  const loadWorkspaces = useCallback(async function loadWorkspaces() {
    try {
      const body = await getJson<{ workspaces: Workspace[] }>('/api/workspaces')
      setWorkspaces(body.workspaces || [])
      setWorkspaceId(current => current || body.workspaces?.[0]?.id || '')
    } catch {
      setError('Workspaces could not be loaded.')
    }
  }, [])

  const loadAlerts = useCallback(async function loadAlerts(nextWorkspaceId = workspaceId, nextProjectId = projectId) {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({ workspaceId: nextWorkspaceId })
      if (nextProjectId) params.set('projectId', nextProjectId)
      const [alertsBody, historyBody] = await Promise.all([
        getJson<{ alerts: AlertRuleRow[] }>(`/api/alerts?${params.toString()}`),
        getJson<{ history: AlertHistoryRow[] }>(`/api/alerts/history?${params.toString()}`),
      ])

      setAlerts(alertsBody.alerts)
      setHistory(historyBody.history)
    } catch {
      setError('Alerts could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [projectId, workspaceId])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  useEffect(() => {
    if (!workspaceId) return
    getJson<{ projects: Project[] }>(`/api/projects?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(body => setProjects(body.projects || []))
      .catch(() => setProjects([]))
    loadAlerts(workspaceId, projectId)
  }, [workspaceId, projectId, loadAlerts])

  async function createAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    try {
      await postJson('/api/alerts', {
        ...form,
        workspaceId,
        projectId: form.projectId || null,
        threshold: Number(form.threshold),
        provider: form.provider || null,
        model: form.model || null,
        webhookUrl: form.webhookUrl || null,
      })
      setMessage('Alert created.')
      setForm(initialForm)
      await loadAlerts()
    } catch {
      setError('Alert could not be created. Check the type, threshold, model, and webhook URL.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleAlert(alert: AlertRuleRow) {
    await updateAlert(alert.id, { isActive: !alert.isActive }, alert.isActive ? 'Alert deactivated.' : 'Alert activated.')
  }

  async function deactivateAlert(id: string) {
    await updateAlert(id, null, 'Alert deactivated.', 'DELETE')
  }

  async function testAlert(id: string) {
    setError('')
    setMessage('')

    try {
      await dashboardFetch(`/api/alerts/${id}/test`, { method: 'POST' })
      setMessage('Test webhook sent.')
    } catch {
      setError('Test webhook could not be sent.')
    }
  }

  async function runEvaluation() {
    setError('')
    setMessage('')

    try {
      await dashboardFetch('/api/alerts/evaluate', { method: 'POST' })
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
      if (method === 'DELETE') {
        await deleteJson(`/api/alerts/${id}`)
      } else {
        await patchJson(`/api/alerts/${id}`, body)
      }
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

          <AlertForm
            workspaces={workspaces}
            projects={projects}
            workspaceId={workspaceId}
            form={form}
            saving={saving}
            onWorkspaceChange={nextWorkspaceId => {
              setWorkspaceId(nextWorkspaceId)
              setProjectId('')
              setForm({ ...form, projectId: '' })
            }}
            onFormChange={setForm}
            onSubmit={createAlert}
          />

          {message ? <p className="tw-inline-success">{message}</p> : null}
          <ErrorMessage message={error} />
        </div>

        <AlertTable
          alerts={alerts}
          loading={loading}
          onToggle={toggleAlert}
          onTest={testAlert}
          onDeactivate={deactivateAlert}
        />
        <AlertHistoryTable history={history} loading={loading} />
      </section>
    </DashboardShell>
  )
}
