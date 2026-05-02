'use client'

import type { ReactNode } from 'react'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { dashboardFetch } from '@/lib/client/dashboard-fetch'

type DashboardWorkspace = { id: string; name: string }

type DashboardShellProps = {
  children: ReactNode
  actions?: ReactNode
  workspaces?: DashboardWorkspace[]
  workspaceId?: string
  projectId?: string
  onWorkspaceChange?: (workspaceId: string) => void
}

export function DashboardShell({
  children,
  actions,
  workspaces,
  workspaceId,
  projectId,
  onWorkspaceChange,
}: DashboardShellProps) {
  async function logout() {
    await dashboardFetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    window.location.href = '/login'
  }

  return (
    <main className="tw-dashboard">
      <header className="tw-header">
        <div className="tw-header-left">
          <span className="tw-logo">TokenWatcher</span>
          <span className="tw-tagline">LLM Cost Auditor</span>
          <DashboardNav
            workspaces={workspaces}
            workspaceId={workspaceId}
            projectId={projectId}
            onWorkspaceChange={onWorkspaceChange}
          />
        </div>
        <div className="tw-header-right">
          {actions}
          <div className="tw-logout-form">
            <button className="tw-logout-btn" type="button" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      {children}
    </main>
  )
}
