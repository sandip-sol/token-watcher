import { NextRequest } from 'next/server'
import { requireDashboardWriteOrCron } from '@/server/auth/dashboard-api'
import { rebuildRollupsForDateRange } from '@/server/rollups/service'
import { parseUtcDateInput } from '@/server/time/utc'
import { handleApiError, jsonOk } from '@/server/security/errors'

export async function POST(req: NextRequest) {
  const authError = isValidRollupSecret(req) ? null : await requireDashboardWriteOrCron(req)
  if (authError) return authError

  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const workspaceId = searchParams.get('workspaceId') || undefined

    await rebuildRollupsForDateRange({
      from: from ? parseUtcDateInput(from) : undefined,
      to: to ? parseUtcDateInput(to, true) : undefined,
      workspaceId,
    })

    return jsonOk({ success: true })
  } catch (error) {
    return handleApiError(error, 'Manual rollup rebuild failed')
  }
}

function isValidRollupSecret(req: NextRequest): boolean {
  const secret = process.env.ROLLUP_REBUILD_SECRET
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
