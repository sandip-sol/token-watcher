'use client'
// src/app/dashboard/page.tsx

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardShell } from '@/components/ui/DashboardShell'
import { DashboardFilters } from '@/components/dashboard/DashboardFilters'
import { RecentEventsTable } from '@/components/dashboard/RecentEventsTable'
import { StatCards } from '@/components/dashboard/StatCards'
import { UsageCharts } from '@/components/dashboard/UsageCharts'
import { getJson } from '@/lib/client/dashboard-fetch'

interface StatsData {
  overview: {
    totalCostUsd: number
    totalTokens: number
    avgLatencyMs: number
    callCount: number
    errorCount?: number
  }
  today: { totalCostUsd: number; totalTokens: number; callCount: number; errorCount?: number }
  yesterday: { totalCostUsd: number; totalTokens: number; callCount: number; errorCount?: number }
  byModel: Array<{
    provider: string
    model: string
    totalCostUsd: number
    totalTokens: number
    callCount: number
    avgLatencyMs: number
  }>
  dailyTrend: Array<{ date: string; totalCost: number; totalTokens: number; callCount: number }>
  meta?: { dataSource?: 'rollups' | 'raw' }
}

type Workspace = { id: string; name: string; slug: string }
type Project = { id: string; workspaceId: string; name: string; slug: string; environment: string | null }

export default function DashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<StatsData | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [days, setDays] = useState(30)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const queryWorkspaceId = params.get('workspaceId') || ''
    const queryProjectId = params.get('projectId') || ''
    if (queryWorkspaceId) setWorkspaceId(queryWorkspaceId)
    if (queryProjectId) setProjectId(queryProjectId)

    getJson<{ workspaces: Workspace[] }>('/api/workspaces')
      .then(body => {
        setWorkspaces(body.workspaces)
        if (!queryWorkspaceId && body.workspaces[0]) setWorkspaceId(body.workspaces[0].id)
      })
      .catch(() => null)
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    getJson<{ projects: Project[] }>(`/api/projects?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(body => setProjects(body.projects || []))
      .catch(() => setProjects([]))
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return

    const params = new URLSearchParams()
    params.set('workspaceId', workspaceId)
    if (projectId) params.set('projectId', projectId)
    if (provider) params.set('provider', provider)
    if (model) params.set('model', model)
    router.replace(`/dashboard?${params.toString()}`)

    setLoading(true)
    params.set('days', String(days))
    getJson<StatsData>(`/api/stats?${params.toString()}`)
      .then(nextData => setData(nextData))
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [days, workspaceId, projectId, provider, model, router])

  return (
    <DashboardShell
      actions={
        <DashboardFilters
          workspaces={workspaces}
          projects={projects}
          workspaceId={workspaceId}
          projectId={projectId}
          days={days}
          provider={provider}
          model={model}
          onWorkspaceChange={nextWorkspaceId => {
            setWorkspaceId(nextWorkspaceId)
            setProjectId('')
          }}
          onProjectChange={setProjectId}
          onDaysChange={setDays}
          onProviderChange={setProvider}
          onModelChange={setModel}
        />
      }
    >

      <div className="tw-data-source">
        Using {data?.meta?.dataSource === 'raw' ? 'raw events' : 'rollups'}
      </div>

      <StatCards
        loading={loading}
        days={days}
        todayCost={data?.today.totalCostUsd ?? 0}
        yesterdayCost={data?.yesterday.totalCostUsd ?? 0}
        totalCost={data?.overview.totalCostUsd ?? 0}
        totalTokens={data?.overview.totalTokens ?? 0}
        callCount={data?.overview.callCount ?? 0}
        avgLatencyMs={data?.overview.avgLatencyMs ?? 0}
        errorCount={data?.overview.errorCount ?? 0}
        todayErrorCount={data?.today.errorCount ?? 0}
      />

      <UsageCharts byModel={data?.byModel ?? []} dailyTrend={data?.dailyTrend ?? []} loading={loading} />
      <RecentEventsTable data={data?.byModel ?? []} loading={loading} />
    </DashboardShell>
  )
}
