import { NextRequest } from 'next/server'
import { requireDashboardWriteOrCron } from '@/server/auth/dashboard-api'
import { evaluateAlerts } from '@/server/alerts/service'
import { resolveWorkspaceSelection } from '@/server/workspaces/service'
import { handleApiError, jsonError, jsonOk } from '@/server/security/errors'

export async function POST(req: NextRequest) {
  const authError = await requireDashboardWriteOrCron(req)
  if (authError) return authError

  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const projectId = searchParams.get('projectId')

    if (workspaceId || projectId) {
      const selection = await resolveWorkspaceSelection({ workspaceId, projectId })
      if (selection.ok === false) {
        return jsonError(selection.status, selection.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST', selection.error)
      }
      await evaluateAlerts({ workspaceId: selection.workspaceId, projectId: selection.projectId })
    } else {
      await evaluateAlerts()
    }

    return jsonOk({ success: true })
  } catch (error) {
    return handleApiError(error, 'Manual alert evaluation failed')
  }
}
