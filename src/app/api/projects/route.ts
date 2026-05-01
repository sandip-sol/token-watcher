import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireDashboardAuth } from '@/lib/api-auth'
import { createSlug, ensureDefaultWorkspaceAndProject, ensureUniqueProjectSlug } from '@/lib/workspaces'
import { prisma } from '@/lib/prisma'

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

    return NextResponse.json({ projects })
  } catch (error) {
    console.error('[TokenWatcher] Project list failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const parsed = ProjectSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: parsed.data.workspaceId },
      select: { id: true },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
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

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    console.error('[TokenWatcher] Project creation failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
