import { NextRequest, NextResponse } from 'next/server'
import {
  getDashboardSessionCookieName,
  isDashboardAuthEnabled,
  verifyDashboardSessionToken,
} from './dashboard-auth'

export async function requireDashboardAuth(req: NextRequest): Promise<NextResponse | null> {
  if (!isDashboardAuthEnabled()) return null

  const validSession = await verifyDashboardSessionToken(
    req.cookies.get(getDashboardSessionCookieName())?.value
  )

  if (!validSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

export async function requireDashboardAuthOrCron(req: NextRequest): Promise<NextResponse | null> {
  if (isValidCronRequest(req)) return null
  return requireDashboardAuth(req)
}

function isValidCronRequest(req: NextRequest): boolean {
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
