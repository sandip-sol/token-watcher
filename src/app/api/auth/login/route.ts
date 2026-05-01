import { NextRequest, NextResponse } from 'next/server'
import {
  createDashboardSessionToken,
  getDashboardCredentials,
  getDashboardSessionCookieName,
  getDashboardSessionCookieOptions,
  hasUsableDashboardSessionSecret,
  isDashboardAuthEnabled,
} from '@/lib/dashboard-auth'

export async function POST(req: NextRequest) {
  try {
    if (!isDashboardAuthEnabled()) {
      return respondSuccess(req)
    }

    if (!hasUsableDashboardSessionSecret()) {
      console.error('[TokenWatcher] DASHBOARD_SESSION_SECRET is required when dashboard auth is enabled.')
      return respondError(req, 'Authentication is not configured', 500)
    }

    const { username, password } = await parseCredentials(req)
    const expected = getDashboardCredentials()

    if (!expected.password || username !== expected.username || password !== expected.password) {
      return respondError(req, 'Invalid username or password', 401)
    }

    const token = await createDashboardSessionToken(username)
    const response = respondSuccess(req)
    response.cookies.set(getDashboardSessionCookieName(), token, getDashboardSessionCookieOptions())

    return response
  } catch (error) {
    console.error('[TokenWatcher] Dashboard login failed:', error)
    return respondError(req, 'Invalid request', 400)
  }
}

async function parseCredentials(req: NextRequest): Promise<{ username: string; password: string }> {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await req.json()
    return {
      username: String(body?.username || ''),
      password: String(body?.password || ''),
    }
  }

  const formData = await req.formData()
  return {
    username: String(formData.get('username') || ''),
    password: String(formData.get('password') || ''),
  }
}

function respondSuccess(req: NextRequest): NextResponse {
  if (wantsHtml(req)) {
    return NextResponse.redirect(new URL('/dashboard', req.url), { status: 303 })
  }

  return NextResponse.json({ success: true, redirectTo: '/dashboard' })
}

function respondError(req: NextRequest, message: string, status: number): NextResponse {
  if (wantsHtml(req)) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('error', status === 401 ? 'invalid' : 'config')
    return NextResponse.redirect(loginUrl, { status: 303 })
  }

  return NextResponse.json({ error: message }, { status })
}

function wantsHtml(req: NextRequest): boolean {
  return req.headers.get('accept')?.includes('text/html') ?? false
}
