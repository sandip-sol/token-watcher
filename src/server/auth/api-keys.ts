// src/lib/auth.ts
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { ensureDefaultWorkspaceAndProject } from '@/server/workspaces/service'

let warnedAboutEnvApiKeyInProduction = false

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export function generateApiKey(environment: 'live' | 'test' | 'dev' = 'live'): {
  rawKey: string
  keyHash: string
  keyPrefix: string
} {
  const rawKey = `tw_${environment}_${crypto.randomBytes(32).toString('base64url')}`

  return {
    rawKey,
    keyHash: hashApiKey(rawKey),
    keyPrefix: rawKey.slice(0, 16),
  }
}

export async function verifyApiKey(key: string): Promise<{
  valid: boolean
  apiKeyId?: string
  workspaceId?: string
  projectId?: string | null
}> {
  const configuredEnvKey = process.env.TOKENWATCHER_API_KEY

  // TOKENWATCHER_API_KEY is intentionally kept for local development and
  // simple single-user self-hosting. For production, prefer DB-backed keys
  // created with generateApiKey() so only hashes are stored.
  if (configuredEnvKey && timingSafeEqual(key, configuredEnvKey)) {
    if (process.env.NODE_ENV === 'production' && !warnedAboutEnvApiKeyInProduction) {
      warnedAboutEnvApiKeyInProduction = true
      console.warn(
        '[TokenWatcher] TOKENWATCHER_API_KEY is enabled in production. Prefer DB-backed hashed API keys for production deployments.'
      )
    }

    const { workspace, project } = await ensureDefaultWorkspaceAndProject()
    return { valid: true, workspaceId: workspace.id, projectId: project.id }
  }

  const hash = hashApiKey(key)
  const found = await prisma.apiKey.findUnique({ where: { keyHash: hash } })

  if (!found || !found.isActive || found.revokedAt) return { valid: false }

  if (!found.workspaceId) {
    const { workspace, project } = await ensureDefaultWorkspaceAndProject()
    return {
      valid: true,
      apiKeyId: found.id,
      workspaceId: workspace.id,
      projectId: project.id,
    }
  }

  // Update last used (fire and forget)
  prisma.apiKey.update({
    where: { id: found.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {})

  return {
    valid: true,
    apiKeyId: found.id,
    workspaceId: found.workspaceId,
    projectId: found.projectId,
  }
}

export async function validateApiKey(key: string): Promise<boolean> {
  const result = await verifyApiKey(key)
  return result.valid
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)

  if (aBuffer.length !== bBuffer.length) return false

  return crypto.timingSafeEqual(aBuffer, bBuffer)
}
