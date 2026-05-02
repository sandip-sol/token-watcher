import { NextRequest, NextResponse } from 'next/server'
import {
  getDashboardSessionCookieName,
  isDashboardAuthEnabled,
  verifyDashboardSessionToken,
} from '@/server/auth/dashboard-session'
import { applySecurityHeaders } from '@/server/security/headers'

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
      response = NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
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
