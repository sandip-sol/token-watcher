'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type DashboardNavWorkspace = { id: string; name: string }

type DashboardNavProps = {
  workspaces?: DashboardNavWorkspace[]
  workspaceId?: string
  projectId?: string
  onWorkspaceChange?: (workspaceId: string) => void
}

const navItems = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/api-keys', label: 'API Keys' },
  { href: '/dashboard/alerts', label: 'Alerts' },
  { href: '/dashboard/projects', label: 'Projects / Settings' },
]

export function DashboardNav({ workspaces = [], workspaceId = '', projectId = '', onWorkspaceChange }: DashboardNavProps) {
  const pathname = usePathname()
  const scopedQuery = workspaceId
    ? `?${new URLSearchParams({
        workspaceId,
        ...(projectId ? { projectId } : {}),
      }).toString()}`
    : ''

  return (
    <nav className="tw-dashboard-nav" aria-label="Dashboard navigation">
      {navItems.map(item => (
        <Link
          key={item.href}
          className={`tw-nav-link ${pathname === item.href ? 'active' : ''}`}
          href={`${item.href}${scopedQuery}`}
        >
          {item.label}
        </Link>
      ))}
      {workspaces.length > 1 && onWorkspaceChange ? (
        <select
          aria-label="Workspace"
          className="tw-nav-workspace-select"
          value={workspaceId}
          onChange={event => onWorkspaceChange(event.target.value)}
        >
          <option value="">Select workspace</option>
          {workspaces.map(workspace => (
            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
          ))}
        </select>
      ) : null}
    </nav>
  )
}
