import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { resolveWorkspaceSelection } from '@/lib/workspaces'

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
      return NextResponse.json({ error: selection.error }, { status: selection.status })
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

    return NextResponse.json({ history })
  } catch (error) {
    console.error('[TokenWatcher] Alert history failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
