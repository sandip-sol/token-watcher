import { NextRequest } from 'next/server'
import { requireDashboardWrite } from '@/server/auth/dashboard-api'
import { UpdateAlertRuleSchema } from '@/server/alerts/schema'
import { prisma } from '@/lib/prisma'
import { badRequest, handleApiError, jsonOk, notFound } from '@/server/security/errors'

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
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  try {
    const parsed = UpdateAlertRuleSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return badRequest()
    }

    if (parsed.data.projectId) {
      const existing = await prisma.alertRule.findUnique({
        where: { id: params.id },
        select: { workspaceId: true },
      })
      if (!existing) return notFound()

      const project = await prisma.project.findFirst({
        where: {
          id: parsed.data.projectId,
          workspaceId: parsed.data.workspaceId || existing.workspaceId,
        },
        select: { id: true },
      })

      if (!project) {
        return badRequest('Project not found in workspace')
      }
    }

    const alert = await prisma.alertRule.update({
      where: { id: params.id },
      data: parsed.data,
      select: alertRuleSelect,
    })

    return jsonOk({ alert })
  } catch (error) {
    return handleApiError(error, 'Alert update failed')
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  try {
    const alert = await prisma.alertRule.update({
      where: { id: params.id },
      data: { isActive: false },
      select: alertRuleSelect,
    })

    return jsonOk({ alert })
  } catch (error) {
    return handleApiError(error, 'Alert deactivate failed')
  }
}
