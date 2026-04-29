// src/lib/auth.ts
import crypto from 'crypto'
import { prisma } from './prisma'

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export async function validateApiKey(key: string): Promise<boolean> {
  // In development with no DB, accept env var key directly
  if (process.env.TOKENWATCHER_API_KEY && key === process.env.TOKENWATCHER_API_KEY) {
    return true
  }

  const hash = hashApiKey(key)
  const found = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
  })

  if (!found || !found.enabled) return false

  // Update last used (fire and forget)
  prisma.apiKey.update({
    where: { id: found.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {})

  return true
}

export function generateApiKey(): string {
  return `tw_${crypto.randomBytes(32).toString('hex')}`
}
