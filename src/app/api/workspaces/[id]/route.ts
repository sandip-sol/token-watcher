import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDashboardWrite } from '@/server/auth/dashboard-api'
import { createSlug } from '@/server/workspaces/service'
import { prisma } from '@/lib/prisma'
import { badRequest, conflict, handleApiError, jsonOk, notFound } from '@/server/security/errors'

const UpdateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  slug: z.string().trim().max(100).optional(),
})

const workspaceSelect = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { projects: true, apiKeys: true, events: true, alerts: true } },
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  try {
    const parsed = UpdateWorkspaceSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return badRequest()
    }

    const nextSlug = parsed.data.slug ? createSlug(parsed.data.slug) : undefined
    if (nextSlug) {
      const existing = await prisma.workspace.findUnique({
        where: { slug: nextSlug },
        select: { id: true },
      })
      if (existing && existing.id !== params.id) {
        return conflict('Workspace slug already exists')
      }
    }

    const workspace = await prisma.workspace.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(nextSlug ? { slug: nextSlug } : {}),
      },
      select: workspaceSelect,
    })

    return jsonOk({ workspace })
  } catch (error) {
    return handleApiError(error, 'Workspace update failed')
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  try {
    const counts = await prisma.workspace.findUnique({
      where: { id: params.id },
      select: { _count: { select: { projects: true, apiKeys: true, events: true, alerts: true } } },
    })

    if (!counts) return notFound()

    if (
      counts._count.projects > 0 ||
      counts._count.apiKeys > 0 ||
      counts._count.events > 0 ||
      counts._count.alerts > 0
    ) {
      return conflict('Workspace has data and cannot be deleted in Phase 3')
    }

    await prisma.workspace.delete({ where: { id: params.id } })
    return jsonOk({ success: true })
  } catch (error) {
    return handleApiError(error, 'Workspace delete failed')
  }
}
