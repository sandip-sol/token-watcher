import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireDashboardAuth } from '@/lib/api-auth'
import { createSlug } from '@/lib/workspaces'
import { prisma } from '@/lib/prisma'

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
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const parsed = UpdateWorkspaceSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const nextSlug = parsed.data.slug ? createSlug(parsed.data.slug) : undefined
    if (nextSlug) {
      const existing = await prisma.workspace.findUnique({
        where: { slug: nextSlug },
        select: { id: true },
      })
      if (existing && existing.id !== params.id) {
        return NextResponse.json({ error: 'Workspace slug already exists' }, { status: 409 })
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

    return NextResponse.json({ workspace })
  } catch (error) {
    console.error('[TokenWatcher] Workspace update failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const counts = await prisma.workspace.findUnique({
      where: { id: params.id },
      select: { _count: { select: { projects: true, apiKeys: true, events: true, alerts: true } } },
    })

    if (!counts) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (
      counts._count.projects > 0 ||
      counts._count.apiKeys > 0 ||
      counts._count.events > 0 ||
      counts._count.alerts > 0
    ) {
      return NextResponse.json(
        { error: 'Workspace has data and cannot be deleted in Phase 3' },
        { status: 409 }
      )
    }

    await prisma.workspace.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[TokenWatcher] Workspace delete failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
