import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDashboardAuth, requireDashboardWrite } from '@/server/auth/dashboard-api'
import { createSlug, ensureDefaultWorkspaceAndProject, ensureUniqueProjectSlug } from '@/server/workspaces/service'
import { prisma } from '@/lib/prisma'
import { badRequest, handleApiError, jsonOk, notFound } from '@/server/security/errors'

const environments = ['production', 'staging', 'development', 'test'] as const

const ProjectSchema = z.object({
  workspaceId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().max(100).optional().or(z.literal('')),
  description: z.string().trim().max(500).optional().nullable().transform(value => value || null),
  environment: z.enum(environments).optional().nullable().transform(value => value || null),
})

const projectSelect = {
  id: true,
  workspaceId: true,
  name: true,
  slug: true,
  description: true,
  environment: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { apiKeys: true, events: true, alerts: true } },
}

export async function GET(req: NextRequest) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    await ensureDefaultWorkspaceAndProject()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')?.trim()
    const where = workspaceId ? { workspaceId } : {}
    const projects = await prisma.project.findMany({
      where,
      select: projectSelect,
      orderBy: [{ slug: 'asc' }, { createdAt: 'asc' }],
    })

    return jsonOk({ projects })
  } catch (error) {
    return handleApiError(error, 'Project list failed')
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  try {
    const parsed = ProjectSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return badRequest()
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: parsed.data.workspaceId },
      select: { id: true },
    })

    if (!workspace) {
      return notFound('Workspace not found')
    }

    const slug = await ensureUniqueProjectSlug(
      parsed.data.workspaceId,
      createSlug(parsed.data.slug || parsed.data.name)
    )
    const project = await prisma.project.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        name: parsed.data.name,
        slug,
        description: parsed.data.description,
        environment: parsed.data.environment,
      },
      select: projectSelect,
    })

    return jsonOk({ project }, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Project creation failed')
  }
}
