import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDashboardAuth, requireDashboardWrite } from '@/server/auth/dashboard-api'
import { generateApiKey } from '@/server/auth/api-keys'
import { prisma } from '@/lib/prisma'
import { resolveWorkspaceSelection } from '@/server/workspaces/service'
import { badRequest, handleApiError, jsonError, jsonOk, notFound } from '@/server/security/errors'

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
    const { searchParams } = new URL(req.url)
    const selection = await resolveWorkspaceSelection({
      workspaceId: searchParams.get('workspaceId'),
      projectId: searchParams.get('projectId'),
    })

    if (selection.ok === false) {
      return jsonError(selection.status, selection.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST', selection.error)
    }

    const apiKeys = await prisma.apiKey.findMany({
      where: {
        workspaceId: selection.workspaceId,
        ...(selection.projectId ? { projectId: selection.projectId } : {}),
      },
      select: apiKeySelect,
      orderBy: { createdAt: 'desc' },
    })

    return jsonOk({ apiKeys })
  } catch (error) {
    return handleApiError(error, 'API key list failed')
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  try {
    const parsed = CreateApiKeySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return badRequest()
    }

    const { rawKey, keyHash, keyPrefix } = generateApiKey(parsed.data.environment)
    const workspace = await prisma.workspace.findUnique({
      where: { id: parsed.data.workspaceId },
      select: { id: true },
    })

    if (!workspace) {
      return notFound('Workspace not found')
    }

    if (parsed.data.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: parsed.data.projectId, workspaceId: parsed.data.workspaceId },
        select: { id: true },
      })

      if (!project) {
        return badRequest('Project not found in workspace')
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

    return jsonOk(
      {
        apiKey,
        rawKey,
        warning: 'Copy this key now. You will not be able to see it again.',
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error, 'API key creation failed')
  }
}
