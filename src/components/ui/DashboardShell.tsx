'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

type DashboardShellProps = {
  children: ReactNode
  actions?: ReactNode
}

const navItems = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/api-keys', label: 'API Keys' },
  { href: '/dashboard/alerts', label: 'Alerts' },
  { href: '/dashboard/projects', label: 'Projects / Settings' },
]

export function DashboardShell({ children, actions }: DashboardShellProps) {
  const pathname = usePathname()

  return (
    <main className="tw-dashboard">
      <header className="tw-header">
        <div className="tw-header-left">
          <span className="tw-logo">TokenWatcher</span>
          <span className="tw-tagline">LLM Cost Auditor</span>
          <nav className="tw-dashboard-nav" aria-label="Dashboard navigation">
            {navItems.map(item => (
              <Link
                key={item.href}
                className={`tw-nav-link ${pathname === item.href ? 'active' : ''}`}
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="tw-header-right">
          {actions}
          <form className="tw-logout-form" action="/api/auth/logout" method="post">
            <button className="tw-logout-btn" type="submit">
              Logout
            </button>
          </form>
        </div>
      </header>

      {children}
    </main>
  )
}
