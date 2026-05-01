import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireDashboardAuth } from '@/lib/api-auth'
import { generateApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CreateApiKeySchema = z.object({
  workspaceId: z.string().trim().min(1).max(100),
  projectId: z.string().trim().max(100).optional().nullable().transform(value => value || null),
  name: z.string().trim().max(100).optional().or(z.literal('')),
  environment: z.enum(['live', 'test', 'dev']).optional().default('live'),
})

const apiKeySelect = {
  id: true,
  workspaceId: true,
  projectId: true,
  name: true,
  keyPrefix: true,
  environment: true,
  isActive: true,
  lastUsedAt: true,
  createdAt: true,
  revokedAt: true,
  workspace: { select: { id: true, name: true, slug: true } },
  project: { select: { id: true, name: true, slug: true, environment: true } },
}

export async function GET(req: NextRequest) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const apiKeys = await prisma.apiKey.findMany({
      select: apiKeySelect,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ apiKeys })
  } catch (error) {
    console.error('[TokenWatcher] API key list failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const parsed = CreateApiKeySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { rawKey, keyHash, keyPrefix } = generateApiKey(parsed.data.environment)
    const workspace = await prisma.workspace.findUnique({
      where: { id: parsed.data.workspaceId },
      select: { id: true },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    if (parsed.data.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: parsed.data.projectId, workspaceId: parsed.data.workspaceId },
        select: { id: true },
      })

      if (!project) {
        return NextResponse.json({ error: 'Project not found in workspace' }, { status: 400 })
      }
    }

    const apiKey = await prisma.apiKey.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        projectId: parsed.data.projectId,
        name: parsed.data.name || null,
        environment: parsed.data.environment,
        keyHash,
        keyPrefix,
      },
      select: apiKeySelect,
    })

    return NextResponse.json(
      {
        apiKey,
        rawKey,
        warning: 'Copy this key now. You will not be able to see it again.',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[TokenWatcher] API key creation failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
