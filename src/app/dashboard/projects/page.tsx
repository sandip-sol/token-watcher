'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { ErrorMessage } from '@/components/dashboard/ErrorMessage'
import { ProjectForm } from '@/components/dashboard/ProjectForm'
import { ProjectTable, type ProjectRow } from '@/components/dashboard/ProjectTable'
import { WorkspaceForm } from '@/components/dashboard/WorkspaceForm'
import { DashboardShell } from '@/components/ui/DashboardShell'
import { getJson, postJson } from '@/lib/client/dashboard-fetch'

type Workspace = {
  id: string
  name: string
  slug: string
  _count?: { projects: number; apiKeys: number; events: number; alerts: number }
}

export default function ProjectsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectEnvironment, setProjectEnvironment] = useState('production')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const loadWorkspaces = useCallback(async function loadWorkspaces() {
    setLoading(true)
    setError('')

    try {
      const body = await getJson<{ workspaces: Workspace[] }>('/api/workspaces')
      setWorkspaces(body.workspaces || [])
      setWorkspaceId(current => current || body.workspaces?.[0]?.id || '')
    } catch {
      setError('Workspaces could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadProjects = useCallback(async function loadProjects(nextWorkspaceId = workspaceId) {
    try {
      const body = await getJson<{ projects: ProjectRow[] }>(`/api/projects?workspaceId=${encodeURIComponent(nextWorkspaceId)}`)
      setProjects(body.projects || [])
    } catch {
      setError('Projects could not be loaded.')
    }
  }, [workspaceId])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  useEffect(() => {
    if (workspaceId) loadProjects(workspaceId)
  }, [workspaceId, loadProjects])

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')

    try {
      const body = await postJson<{ workspace: Workspace }>('/api/workspaces', { name: workspaceName })
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
      await postJson('/api/projects', {
        workspaceId,
        name: projectName,
        environment: projectEnvironment,
      })
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
            <WorkspaceForm
              workspaceName={workspaceName}
              onWorkspaceNameChange={setWorkspaceName}
              onSubmit={createWorkspace}
            />
            <ProjectForm
              workspaces={workspaces}
              workspaceId={workspaceId}
              projectName={projectName}
              projectEnvironment={projectEnvironment}
              onWorkspaceChange={setWorkspaceId}
              onProjectNameChange={setProjectName}
              onProjectEnvironmentChange={setProjectEnvironment}
              onSubmit={createProject}
            />
          </div>

          {message ? <p className="tw-inline-success">{message}</p> : null}
          <ErrorMessage message={error} />
        </div>

        <ProjectTable projects={projects} loading={loading} />
      </section>
    </DashboardShell>
  )
}
