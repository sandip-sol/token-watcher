import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireDashboardAuth } from '@/lib/api-auth'
import { createSlug } from '@/lib/workspaces'
import { prisma } from '@/lib/prisma'

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
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const parsed = UpdateProjectSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const existingProject = parsed.data.slug
      ? await prisma.project.findUnique({
          where: { id: params.id },
          select: { id: true, workspaceId: true },
        })
      : null
    const nextSlug = parsed.data.slug ? createSlug(parsed.data.slug) : undefined

    if (nextSlug) {
      if (!existingProject) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const existingSlug = await prisma.project.findUnique({
        where: { workspaceId_slug: { workspaceId: existingProject.workspaceId, slug: nextSlug } },
        select: { id: true },
      })
      if (existingSlug && existingSlug.id !== params.id) {
        return NextResponse.json({ error: 'Project slug already exists in workspace' }, { status: 409 })
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

    return NextResponse.json({ project })
  } catch (error) {
    console.error('[TokenWatcher] Project update failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const counts = await prisma.project.findUnique({
      where: { id: params.id },
      select: { _count: { select: { apiKeys: true, events: true, alerts: true } } },
    })

    if (!counts) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (counts._count.apiKeys > 0 || counts._count.events > 0 || counts._count.alerts > 0) {
      return NextResponse.json(
        { error: 'Project has data and cannot be deleted in Phase 3' },
        { status: 409 }
      )
    }

    await prisma.project.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[TokenWatcher] Project delete failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
