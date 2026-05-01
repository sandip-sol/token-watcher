import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/api-auth'
import { UpdateAlertRuleSchema } from '@/lib/alert-validation'
import { prisma } from '@/lib/prisma'

const alertRuleSelect = {
  id: true,
  workspaceId: true,
  projectId: true,
  name: true,
  type: true,
  threshold: true,
  provider: true,
  model: true,
  webhookUrl: true,
  isActive: true,
  lastTriggeredAt: true,
  createdAt: true,
  updatedAt: true,
  workspace: { select: { id: true, name: true, slug: true } },
  project: { select: { id: true, name: true, slug: true, environment: true } },
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const parsed = UpdateAlertRuleSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    if (parsed.data.projectId) {
      const existing = await prisma.alertRule.findUnique({
        where: { id: params.id },
        select: { workspaceId: true },
      })
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const project = await prisma.project.findFirst({
        where: {
          id: parsed.data.projectId,
          workspaceId: parsed.data.workspaceId || existing.workspaceId,
        },
        select: { id: true },
      })

      if (!project) {
        return NextResponse.json({ error: 'Project not found in workspace' }, { status: 400 })
      }
    }

    const alert = await prisma.alertRule.update({
      where: { id: params.id },
      data: parsed.data,
      select: alertRuleSelect,
    })

    return NextResponse.json({ alert })
  } catch (error) {
    console.error('[TokenWatcher] Alert update failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const alert = await prisma.alertRule.update({
      where: { id: params.id },
      data: { isActive: false },
      select: alertRuleSelect,
    })

    return NextResponse.json({ alert })
  } catch (error) {
    console.error('[TokenWatcher] Alert deactivate failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
