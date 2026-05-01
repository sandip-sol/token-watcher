'use client'
// src/app/dashboard/page.tsx

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CostTrendChart } from '@/components/charts/CostTrendChart'
import { ModelBreakdownChart } from '@/components/charts/ModelBreakdownChart'
import { StatCard } from '@/components/ui/StatCard'
import { ModelTable } from '@/components/ui/ModelTable'
import { DashboardShell } from '@/components/ui/DashboardShell'

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

    fetch('/api/workspaces')
      .then(r => {
        if (r.status === 401) {
          window.location.href = '/login'
          return null
        }
        return r.json()
      })
      .then(body => {
        if (!body?.workspaces) return
        setWorkspaces(body.workspaces)
        if (!queryWorkspaceId && body.workspaces[0]) setWorkspaceId(body.workspaces[0].id)
      })
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    fetch(`/api/projects?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(r => r.json())
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
    fetch(`/api/stats?${params.toString()}`)
      .then(r => {
        if (r.status === 401) {
          window.location.href = '/login'
          return null
        }

        return r.json()
      })
      .then(nextData => {
        if (nextData) setData(nextData)
      })
      .finally(() => setLoading(false))
  }, [days, workspaceId, projectId, provider, model, router])

  const todayChange = data
    ? data.yesterday.totalCostUsd > 0
      ? ((data.today.totalCostUsd - data.yesterday.totalCostUsd) / data.yesterday.totalCostUsd) * 100
      : 0
    : 0

  return (
    <DashboardShell
      actions={
        <>
          <div className="tw-scope-selector">
            <select
              aria-label="Workspace"
              value={workspaceId}
              onChange={event => {
                setWorkspaceId(event.target.value)
                setProjectId('')
              }}
            >
              {workspaces.map(workspace => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
            <select
              aria-label="Project"
              value={projectId}
              onChange={event => setProjectId(event.target.value)}
            >
              <option value="">All projects</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
          <div className="tw-period-selector">
            {dateRanges().map(range => (
              <button
                key={range.label}
                className={`tw-period-btn ${days === range.days ? 'active' : ''}`}
                onClick={() => setDays(range.days)}
              >
                {range.label}
              </button>
            ))}
          </div>
          <div className="tw-scope-selector">
            <input
              aria-label="Provider filter"
              placeholder="Provider"
              value={provider}
              onChange={event => setProvider(event.target.value.trim())}
            />
            <input
              aria-label="Model filter"
              placeholder="Model"
              value={model}
              onChange={event => setModel(event.target.value.trim())}
            />
          </div>
        </>
      }
    >

      <div className="tw-data-source">
        Using {data?.meta?.dataSource === 'raw' ? 'raw events' : 'rollups'}
      </div>

      <div className="tw-grid-stats">
        <StatCard
          label="Today's Spend"
          value={`$${(data?.today.totalCostUsd ?? 0).toFixed(4)}`}
          subLabel={`${todayChange > 0 ? '+' : ''}${todayChange.toFixed(1)}% vs yesterday`}
          trend={todayChange > 0 ? 'up' : todayChange < 0 ? 'down' : 'neutral'}
          loading={loading}
          accent="amber"
        />
        <StatCard
          label={`Total Spend (${days}d)`}
          value={`$${(data?.overview.totalCostUsd ?? 0).toFixed(2)}`}
          subLabel={`${(data?.overview.callCount ?? 0).toLocaleString()} API calls`}
          loading={loading}
          accent="emerald"
        />
        <StatCard
          label="Total Tokens"
          value={formatTokens(data?.overview.totalTokens ?? 0)}
          subLabel={`${(data?.overview.callCount ?? 0).toLocaleString()} requests`}
          loading={loading}
          accent="sky"
        />
        <StatCard
          label="Avg Latency"
          value={`${(data?.overview.avgLatencyMs ?? 0).toLocaleString()}ms`}
          subLabel="across all models"
          loading={loading}
          accent="violet"
        />
        <StatCard
          label="Recent Errors"
          value={`${(data?.overview.errorCount ?? 0).toLocaleString()}`}
          subLabel={`${(data?.today.errorCount ?? 0).toLocaleString()} today`}
          loading={loading}
          accent="amber"
        />
      </div>

      <div className="tw-grid-charts">
        <div className="tw-chart-card tw-chart-wide">
          <h2 className="tw-chart-title">Cost Over Time</h2>
          <CostTrendChart data={data?.dailyTrend ?? []} loading={loading} />
        </div>
        <div className="tw-chart-card">
          <h2 className="tw-chart-title">Spend by Model</h2>
          <ModelBreakdownChart data={data?.byModel ?? []} loading={loading} />
        </div>
      </div>

      <div className="tw-table-card">
        <h2 className="tw-chart-title">Model Breakdown</h2>
        <ModelTable data={data?.byModel ?? []} loading={loading} />
      </div>
    </DashboardShell>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function dateRanges() {
  const now = new Date()
  return [
    { label: 'Today', days: 1 },
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'This month', days: now.getDate() },
  ]
}
