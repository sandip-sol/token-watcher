import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireDashboardAuth } from '@/lib/api-auth'
import { createSlug, ensureDefaultWorkspaceAndProject, ensureUniqueWorkspaceSlug } from '@/lib/workspaces'
import { prisma } from '@/lib/prisma'

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

    return NextResponse.json({ workspaces })
  } catch (error) {
    console.error('[TokenWatcher] Workspace list failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const parsed = WorkspaceSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
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

    return NextResponse.json({ workspace }, { status: 201 })
  } catch (error) {
    console.error('[TokenWatcher] Workspace creation failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
