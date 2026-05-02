'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/api-keys', label: 'API Keys' },
  { href: '/dashboard/alerts', label: 'Alerts' },
  { href: '/dashboard/projects', label: 'Projects / Settings' },
]

export function DashboardNav() {
  const pathname = usePathname()

  return (
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
  )
}
