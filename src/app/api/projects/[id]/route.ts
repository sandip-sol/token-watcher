import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDashboardWrite } from '@/server/auth/dashboard-api'
import { createSlug } from '@/server/workspaces/service'
import { prisma } from '@/lib/prisma'
import { badRequest, conflict, handleApiError, jsonOk, notFound } from '@/server/security/errors'

const environments = ['production', 'staging', 'development', 'test'] as const

const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  slug: z.string().trim().max(100).optional(),
  description: z.string().trim().max(500).optional().nullable().transform(value => (value === undefined ? undefined : value || null)),
  environment: z.enum(environments).optional().nullable().transform(value => (value === undefined ? undefined : value || null)),
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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  try {
    const parsed = UpdateProjectSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return badRequest()
    }

    const existingProject = parsed.data.slug
      ? await prisma.project.findUnique({
          where: { id: params.id },
          select: { id: true, workspaceId: true },
        })
      : null
    const nextSlug = parsed.data.slug ? createSlug(parsed.data.slug) : undefined

    if (nextSlug) {
      if (!existingProject) return notFound()
      const existingSlug = await prisma.project.findUnique({
        where: { workspaceId_slug: { workspaceId: existingProject.workspaceId, slug: nextSlug } },
        select: { id: true },
      })
      if (existingSlug && existingSlug.id !== params.id) {
        return conflict('Project slug already exists in workspace')
      }
    }

    const project = await prisma.project.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(nextSlug ? { slug: nextSlug } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.environment !== undefined ? { environment: parsed.data.environment } : {}),
      },
      select: projectSelect,
    })

    return jsonOk({ project })
  } catch (error) {
    return handleApiError(error, 'Project update failed')
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  try {
    const counts = await prisma.project.findUnique({
      where: { id: params.id },
      select: { _count: { select: { apiKeys: true, events: true, alerts: true } } },
    })

    if (!counts) return notFound()

    if (counts._count.apiKeys > 0 || counts._count.events > 0 || counts._count.alerts > 0) {
      return conflict('Project has data and cannot be deleted in Phase 3')
    }

    await prisma.project.delete({ where: { id: params.id } })
    return jsonOk({ success: true })
  } catch (error) {
    return handleApiError(error, 'Project delete failed')
  }
}
