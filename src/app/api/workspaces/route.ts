import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDashboardAuth, requireDashboardWrite } from '@/server/auth/dashboard-api'
import { createSlug, ensureDefaultWorkspaceAndProject, ensureUniqueWorkspaceSlug } from '@/server/workspaces/service'
import { prisma } from '@/lib/prisma'
import { badRequest, handleApiError, jsonOk } from '@/server/security/errors'

const WorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().max(100).optional().or(z.literal('')),
})

const workspaceSelect = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { projects: true, apiKeys: true, events: true, alerts: true } },
}

export async function GET(req: NextRequest) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    await ensureDefaultWorkspaceAndProject()
    const workspaces = await prisma.workspace.findMany({
      select: workspaceSelect,
      orderBy: [{ slug: 'asc' }, { createdAt: 'asc' }],
    })

    return jsonOk({ workspaces })
  } catch (error) {
    return handleApiError(error, 'Workspace list failed')
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  try {
    const parsed = WorkspaceSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return badRequest()
    }

    const slug = await ensureUniqueWorkspaceSlug(createSlug(parsed.data.slug || parsed.data.name))
    const workspace = await prisma.workspace.create({
      data: {
        name: parsed.data.name,
        slug,
        projects: {
          create: {
            name: 'Default Project',
            slug: 'default',
            environment: 'production',
          },
        },
      },
      select: workspaceSelect,
    })

    return jsonOk({ workspace }, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Workspace creation failed')
  }
}
