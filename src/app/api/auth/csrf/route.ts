import { NextRequest } from 'next/server'
import { requireDashboardAuth } from '@/server/auth/dashboard-api'
import { createCsrfToken, setCsrfCookie } from '@/server/auth/csrf'
import { getDashboardSessionCookieName } from '@/server/auth/dashboard-session'
import { jsonOk } from '@/server/security/errors'

export async function GET(req: NextRequest) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  const sessionValue = req.cookies.get(getDashboardSessionCookieName())?.value || ''
  const csrfToken = await createCsrfToken(sessionValue)
  const response = jsonOk({ csrfToken })
  setCsrfCookie(response, csrfToken)

  return response
}
