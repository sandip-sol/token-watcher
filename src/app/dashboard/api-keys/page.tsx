'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { ApiKeyCreatedPanel } from '@/components/dashboard/ApiKeyCreatedPanel'
import { ApiKeyForm } from '@/components/dashboard/ApiKeyForm'
import { ApiKeyTable, type ApiKeyRow } from '@/components/dashboard/ApiKeyTable'
import { ErrorMessage } from '@/components/dashboard/ErrorMessage'
import { DashboardShell } from '@/components/ui/DashboardShell'
import { deleteJson, getJson, postJson } from '@/lib/client/dashboard-fetch'

type Workspace = { id: string; name: string }
type Project = { id: string; workspaceId: string; name: string; environment: string | null }

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([])
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
    if (!workspaceId) return
    getJson<{ projects: Project[] }>(`/api/projects?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(body => setProjects(body.projects || []))
      .catch(() => setProjects([]))
  }, [workspaceId])

  const loadApiKeys = useCallback(async function loadApiKeys() {
    setLoading(true)
    setError('')

    try {
      const body = await getJson<{ apiKeys: ApiKeyRow[] }>('/api/api-keys')
      setApiKeys(body.apiKeys)
    } catch {
      setError('API keys could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadWorkspaces = useCallback(async function loadWorkspaces() {
    try {
      const body = await getJson<{ workspaces: Workspace[] }>('/api/workspaces')
      setWorkspaces(body.workspaces || [])
      setWorkspaceId(current => current || body.workspaces?.[0]?.id || '')
    } catch {
      setError('Workspaces could not be loaded.')
    }
  }, [])

  const loadInitialData = useCallback(async function loadInitialData() {
    await Promise.all([loadApiKeys(), loadWorkspaces()])
  }, [loadApiKeys, loadWorkspaces])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  async function createApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    setRawKey('')

    try {
      const body = await postJson<{ rawKey: string }>('/api/api-keys', {
        name,
        environment,
        workspaceId,
        projectId: projectId || null,
      })
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
    setError('')
    setMessage('')

    try {
      await deleteJson(`/api/api-keys/${id}`)
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

          <ApiKeyForm
            workspaces={workspaces}
            projects={projects}
            workspaceId={workspaceId}
            projectId={projectId}
            name={name}
            environment={environment}
            saving={saving}
            onWorkspaceChange={nextWorkspaceId => {
              setWorkspaceId(nextWorkspaceId)
              setProjectId('')
            }}
            onProjectChange={setProjectId}
            onNameChange={setName}
            onEnvironmentChange={setEnvironment}
            onSubmit={createApiKey}
          />

          <ApiKeyCreatedPanel rawKey={rawKey} />
          {message ? <p className="tw-inline-success">{message}</p> : null}
          <ErrorMessage message={error} />
        </div>

        <ApiKeyTable apiKeys={apiKeys} loading={loading} onRevoke={revokeApiKey} />
      </section>
    </DashboardShell>
  )
}
