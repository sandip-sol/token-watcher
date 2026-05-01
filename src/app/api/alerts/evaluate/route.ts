import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuthOrCron } from '@/lib/api-auth'
import { evaluateAlerts } from '@/lib/alerts'
import { resolveWorkspaceSelection } from '@/lib/workspaces'

export async function POST(req: NextRequest) {
  const authError = await requireDashboardAuthOrCron(req)
  if (authError) return authError

  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const projectId = searchParams.get('projectId')

    if (workspaceId || projectId) {
      const selection = await resolveWorkspaceSelection({ workspaceId, projectId })
      if (selection.ok === false) {
        return NextResponse.json({ error: selection.error }, { status: selection.status })
      }
      await evaluateAlerts({ workspaceId: selection.workspaceId, projectId: selection.projectId })
    } else {
      await evaluateAlerts()
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[TokenWatcher] Manual alert evaluation failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
