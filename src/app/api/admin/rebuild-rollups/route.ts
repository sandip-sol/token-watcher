import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuthOrCron } from '@/lib/api-auth'
import { rebuildRollupsForDateRange } from '@/lib/rollups'

export async function POST(req: NextRequest) {
  const authError = isValidRollupSecret(req) ? null : await requireDashboardAuthOrCron(req)
  if (authError) return authError

  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const workspaceId = searchParams.get('workspaceId') || undefined

    await rebuildRollupsForDateRange({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      workspaceId,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[TokenWatcher] Manual rollup rebuild failed:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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
