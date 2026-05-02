import { NextRequest, NextResponse } from 'next/server'
import {
  getDashboardSessionCookieName,
  isDashboardAuthEnabled,
  verifyDashboardSessionToken,
} from '@/server/auth/dashboard-session'
import { forbidden, unauthorized } from '@/server/security/errors'
import { requireCsrf } from '@/server/auth/csrf'

export async function requireDashboardAuth(req: NextRequest): Promise<NextResponse | null> {
  if (!isDashboardAuthEnabled()) return null

  const validSession = await verifyDashboardSessionToken(
    req.cookies.get(getDashboardSessionCookieName())?.value
  )

  if (!validSession) {
    return unauthorized()
  }

  return null
}

export async function requireDashboardWrite(req: NextRequest): Promise<NextResponse | null> {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  const csrfError = await requireCsrf(req)
  if (csrfError) return forbidden('CSRF_INVALID', 'Invalid CSRF token')

  return null
}

export async function requireDashboardAuthOrCron(req: NextRequest): Promise<NextResponse | null> {
  if (isValidCronRequest(req)) return null
  return requireDashboardAuth(req)
}

export async function requireDashboardWriteOrCron(req: NextRequest): Promise<NextResponse | null> {
  if (isValidCronRequest(req)) return null
  return requireDashboardWrite(req)
}

export function isValidCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const authorization = req.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return false

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
