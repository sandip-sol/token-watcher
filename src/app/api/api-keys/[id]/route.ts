import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireDashboardAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

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
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const parsed = UpdateApiKeySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const apiKey = await prisma.apiKey.update({
      where: { id: params.id },
      data: { name: parsed.data.name || null },
      select: apiKeySelect,
    })

    return NextResponse.json({ apiKey })
  } catch (error) {
    console.error('[TokenWatcher] API key update failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const apiKey = await prisma.apiKey.update({
      where: { id: params.id },
      data: { isActive: false, revokedAt: new Date() },
      select: apiKeySelect,
    })

    return NextResponse.json({ apiKey })
  } catch (error) {
    console.error('[TokenWatcher] API key revoke failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
