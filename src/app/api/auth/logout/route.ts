import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardWrite } from '@/server/auth/dashboard-api'
import { clearCsrfCookie } from '@/server/auth/csrf'
import {
  getDashboardSessionCookieName,
  getDashboardSessionCookieOptions,
} from '@/server/auth/dashboard-session'

export async function POST(req: NextRequest) {
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  const response = req.headers.get('accept')?.includes('text/html')
    ? NextResponse.redirect(new URL('/login', req.url), { status: 303 })
    : NextResponse.json({ success: true })

  response.cookies.set(getDashboardSessionCookieName(), '', {
    ...getDashboardSessionCookieOptions(),
    maxAge: 0,
  })
  clearCsrfCookie(response)

  return response
}
