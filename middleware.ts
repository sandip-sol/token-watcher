import { NextRequest, NextResponse } from 'next/server'
import {
  getDashboardSessionCookieName,
  isDashboardAuthEnabled,
  verifyDashboardSessionToken,
} from '@/lib/dashboard-auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  let response: NextResponse

  if (isDashboardAuthEnabled() && pathname.startsWith('/dashboard')) {
    const validSession = await verifyDashboardSessionToken(
      req.cookies.get(getDashboardSessionCookieName())?.value
    )

    if (!validSession) {
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('next', pathname)
      response = NextResponse.redirect(loginUrl)
      applySecurityHeaders(response)
      return response
    }
  }

  if (isDashboardAuthEnabled() && isProtectedDashboardApi(pathname) && !isCronEvaluateRequest(req)) {
    const validSession = await verifyDashboardSessionToken(
      req.cookies.get(getDashboardSessionCookieName())?.value
    )

    if (!validSession) {
      response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      applySecurityHeaders(response)
      return response
    }
  }

  response = NextResponse.next()
  applySecurityHeaders(response)

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)'
  )
  // TODO: Add a nonce-based CSP before public deployment. A strict CSP is
  // intentionally deferred so Next.js dev mode and dashboard charts keep working.
}

function isProtectedDashboardApi(pathname: string): boolean {
  return (
    pathname.startsWith('/api/stats') ||
    pathname.startsWith('/api/api-keys') ||
    pathname.startsWith('/api/alerts') ||
    pathname.startsWith('/api/workspaces') ||
    pathname.startsWith('/api/projects')
  )
}

function isCronEvaluateRequest(req: NextRequest): boolean {
  if (req.nextUrl.pathname !== '/api/alerts/evaluate') return false

  const secret = process.env.CRON_SECRET
  const authorization = req.headers.get('authorization') || ''
  if (!secret || !authorization.startsWith('Bearer ')) return false

  return timingSafeStringEqual(authorization.slice(7).trim(), secret)
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  let result = 0
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return result === 0
}
