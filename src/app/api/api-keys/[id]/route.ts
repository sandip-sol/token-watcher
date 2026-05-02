import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDashboardWrite } from '@/server/auth/dashboard-api'
import { prisma } from '@/lib/prisma'
import { badRequest, handleApiError, jsonOk } from '@/server/security/errors'

const UpdateApiKeySchema = z.object({
  name: z.string().trim().max(100).nullable().optional(),
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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  try {
    const parsed = UpdateApiKeySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return badRequest()
    }

    const apiKey = await prisma.apiKey.update({
      where: { id: params.id },
      data: { name: parsed.data.name || null },
      select: apiKeySelect,
    })

    return jsonOk({ apiKey })
  } catch (error) {
    return handleApiError(error, 'API key update failed')
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  try {
    const apiKey = await prisma.apiKey.update({
      where: { id: params.id },
      data: { isActive: false, revokedAt: new Date() },
      select: apiKeySelect,
    })

    return jsonOk({ apiKey })
  } catch (error) {
    return handleApiError(error, 'API key revoke failed')
  }
}
