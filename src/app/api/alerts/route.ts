import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/api-auth'
import { CreateAlertRuleSchema } from '@/lib/alert-validation'
import { prisma } from '@/lib/prisma'
import { resolveWorkspaceSelection } from '@/lib/workspaces'

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
      return NextResponse.json({ error: selection.error }, { status: selection.status })
    }

    const alerts = await prisma.alertRule.findMany({
      where: {
        workspaceId: selection.workspaceId,
        ...(selection.projectId ? { projectId: selection.projectId } : {}),
      },
      select: alertRuleSelect,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ alerts })
  } catch (error) {
    console.error('[TokenWatcher] Alert list failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const parsed = CreateAlertRuleSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const data = parsed.data
    const workspace = await prisma.workspace.findUnique({
      where: { id: data.workspaceId },
      select: { id: true },
    })

    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    if (data.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: data.projectId, workspaceId: data.workspaceId },
        select: { id: true },
      })

      if (!project) {
        return NextResponse.json({ error: 'Project not found in workspace' }, { status: 400 })
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

    return NextResponse.json({ alert }, { status: 201 })
  } catch (error) {
    console.error('[TokenWatcher] Alert creation failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
