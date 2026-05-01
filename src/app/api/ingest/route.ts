// src/app/api/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '@/lib/auth'
import { checkIngestRateLimit } from '@/lib/rate-limit'
import { IngestSchema, MAX_BODY_BYTES, safeLogError, storeIngestEvent } from '@/lib/ingest'

export async function OPTIONS(req: NextRequest) {
  const cors = getCorsHeaders(req)

  if (!cors.allowed) {
    return json({ error: 'Forbidden' }, 403)
  }

  return new NextResponse(null, {
    status: 204,
    headers: cors.headers,
  })
}

export async function POST(req: NextRequest) {
  const cors = getCorsHeaders(req)
  if (!cors.allowed) {
    return json({ error: 'Forbidden' }, 403)
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      if (!checkIngestRateLimit(`ip:${getClientIp(req)}`).allowed) {
        return json({ error: 'Rate limit exceeded' }, 429, cors.headers)
      }

      return json({ error: 'Unauthorized' }, 401, cors.headers)
    }

    const apiKey = authHeader.slice(7).trim()
    const apiKeyResult = await verifyApiKey(apiKey)
    const rateLimitIdentity = apiKeyResult.valid
      ? `api:${apiKeyResult.apiKeyId || 'env'}`
      : `ip:${getClientIp(req)}`

    if (!checkIngestRateLimit(rateLimitIdentity).allowed) {
      return json({ error: 'Rate limit exceeded' }, 429, cors.headers)
    }

    if (!apiKeyResult.valid) {
      return json({ error: 'Unauthorized' }, 401, cors.headers)
    }

    const bodyResult = await readJsonWithLimit(req, MAX_BODY_BYTES)
    if (bodyResult.ok === false) {
      return json({ error: bodyResult.status === 413 ? 'Payload too large' : 'Invalid request' }, bodyResult.status, cors.headers)
    }

    const parsed = IngestSchema.safeParse(bodyResult.value)
    if (!parsed.success) {
      return json({ error: 'Invalid request' }, 400, cors.headers)
    }

    if (!apiKeyResult.workspaceId) {
      return json({ error: 'Invalid API key scope' }, 401, cors.headers)
    }

    const stored = await storeIngestEvent({
      workspaceId: apiKeyResult.workspaceId,
      apiKeyProjectId: apiKeyResult.projectId,
      event: parsed.data,
    })

    if (stored.ok === false) return json({ error: stored.error }, stored.status, cors.headers)

    return json(
      {
        success: true,
        eventId: stored.event.id,
        cost: {
          inputCostUsd: stored.cost.inputCostUsd,
          outputCostUsd: stored.cost.outputCostUsd,
          totalCostUsd: stored.cost.totalCostUsd,
        },
      },
      200,
      cors.headers
    )
  } catch (error) {
    console.error('[TokenWatcher] Ingest failed:', safeLogError(error))
    return json({ error: 'Internal server error' }, 500, cors.headers)
  }
}

async function readJsonWithLimit(
  req: NextRequest,
  maxBytes: number
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const reader = req.body?.getReader()
  if (!reader) return { ok: false, status: 400 }

  const chunks: Uint8Array[] = []
  let receivedBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    receivedBytes += value.byteLength
    if (receivedBytes > maxBytes) {
      return { ok: false, status: 413 }
    }

    chunks.push(value)
  }

  try {
    const text = new TextDecoder().decode(concatChunks(chunks, receivedBytes))
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, status: 400 }
  }
}

function concatChunks(chunks: Uint8Array[], length: number): Uint8Array {
  const output = new Uint8Array(length)
  let offset = 0

  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }

  return output
}

function json(body: unknown, status: number, headers?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...headers,
      'Cache-Control': 'no-store',
    },
  })
}

function getCorsHeaders(req: NextRequest): { allowed: boolean; headers: Record<string, string> } {
  const origin = req.headers.get('origin')
  const allowedOrigins = parseAllowedOrigins()
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }

  if (!origin) return { allowed: true, headers }

  const requestOrigin = new URL(req.url).origin
  const allowsWildcard = allowedOrigins.includes('*')
  const allowed =
    allowedOrigins.length > 0
      ? allowsWildcard || allowedOrigins.includes(origin)
      : origin === requestOrigin

  if (!allowed) return { allowed: false, headers }

  headers['Access-Control-Allow-Origin'] = allowsWildcard ? '*' : origin

  return { allowed: true, headers }
}

function parseAllowedOrigins(): string[] {
  const value = process.env.INGEST_ALLOWED_ORIGINS || ''

  if (process.env.NODE_ENV === 'production' && value.split(',').map(origin => origin.trim()).includes('*')) {
    console.warn('[TokenWatcher] INGEST_ALLOWED_ORIGINS includes "*" in production.')
  }

  return value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || req.headers.get('x-real-ip') || 'unknown'
}
