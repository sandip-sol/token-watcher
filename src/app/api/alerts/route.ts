import { NextRequest } from 'next/server'
import { requireDashboardAuth, requireDashboardWrite } from '@/server/auth/dashboard-api'
import { CreateAlertRuleSchema } from '@/server/alerts/schema'
import { prisma } from '@/lib/prisma'
import { resolveWorkspaceSelection } from '@/server/workspaces/service'
import { badRequest, handleApiError, jsonError, jsonOk, notFound } from '@/server/security/errors'

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

export async function GET(req: NextRequest) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const { searchParams } = new URL(req.url)
    const selection = await resolveWorkspaceSelection({
      workspaceId: searchParams.get('workspaceId'),
      projectId: searchParams.get('projectId'),
    })

    if (selection.ok === false) {
      return jsonError(selection.status, selection.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST', selection.error)
    }

    const alerts = await prisma.alertRule.findMany({
      where: {
        workspaceId: selection.workspaceId,
        ...(selection.projectId ? { projectId: selection.projectId } : {}),
      },
      select: alertRuleSelect,
      orderBy: { createdAt: 'desc' },
    })

    return jsonOk({ alerts })
  } catch (error) {
    return handleApiError(error, 'Alert list failed')
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  try {
    const parsed = CreateAlertRuleSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return badRequest()
    }

    const data = parsed.data
    const workspace = await prisma.workspace.findUnique({
      where: { id: data.workspaceId },
      select: { id: true },
    })

    if (!workspace) return notFound('Workspace not found')

    if (data.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: data.projectId, workspaceId: data.workspaceId },
        select: { id: true },
      })

      if (!project) {
        return badRequest('Project not found in workspace')
      }
    }

    const alert = await prisma.alertRule.create({
      data: {
        workspaceId: data.workspaceId,
        projectId: data.projectId,
        name: data.name,
        type: data.type,
        threshold: data.threshold,
        provider: data.provider,
        model: data.model,
        webhookUrl: data.webhookUrl,
        isActive: data.isActive,
      },
      select: alertRuleSelect,
    })

    return jsonOk({ alert }, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Alert creation failed')
  }
}
