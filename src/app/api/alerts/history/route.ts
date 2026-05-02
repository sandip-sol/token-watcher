import { NextRequest } from 'next/server'
import { requireDashboardAuth } from '@/server/auth/dashboard-api'
import { prisma } from '@/lib/prisma'
import { resolveWorkspaceSelection } from '@/server/workspaces/service'
import { handleApiError, jsonError, jsonOk } from '@/server/security/errors'

export async function GET(req: NextRequest) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || '50'), 1), 100)
    const selection = await resolveWorkspaceSelection({
      workspaceId: searchParams.get('workspaceId'),
      projectId: searchParams.get('projectId'),
    })

    if (selection.ok === false) {
      return jsonError(selection.status, selection.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST', selection.error)
    }

    const history = await prisma.alertHistory.findMany({
      where: {
        workspaceId: selection.workspaceId,
        ...(selection.projectId ? { projectId: selection.projectId } : {}),
      },
      take: limit,
      orderBy: { triggeredAt: 'desc' },
      include: {
        alertRule: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    })

    return jsonOk({ history })
  } catch (error) {
    return handleApiError(error, 'Alert history failed')
  }
}
