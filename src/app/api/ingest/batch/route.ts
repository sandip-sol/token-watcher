import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '@/lib/auth'
import { IngestSchema, MAX_BODY_BYTES, getMaxBatchSize, safeLogError, storeIngestEvent } from '@/lib/ingest'
import { checkIngestRateLimit } from '@/lib/rate-limit'

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
  if (!cors.allowed) return json({ error: 'Forbidden' }, 403)

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      if (!checkIngestRateLimit(`ip:${getClientIp(req)}:batch`).allowed) {
        return json({ error: 'Rate limit exceeded' }, 429, cors.headers)
      }

      return json({ error: 'Unauthorized' }, 401, cors.headers)
    }

    const apiKey = authHeader.slice(7).trim()
    const apiKeyResult = await verifyApiKey(apiKey)
    const rateLimitIdentity = apiKeyResult.valid
      ? `api:${apiKeyResult.apiKeyId || 'env'}:batch`
      : `ip:${getClientIp(req)}:batch`

    if (!checkIngestRateLimit(rateLimitIdentity).allowed) {
      return json({ error: 'Rate limit exceeded' }, 429, cors.headers)
    }

    if (!apiKeyResult.valid) return json({ error: 'Unauthorized' }, 401, cors.headers)
    if (!apiKeyResult.workspaceId) return json({ error: 'Invalid API key scope' }, 401, cors.headers)

    const bodyResult = await readJsonWithLimit(req, MAX_BODY_BYTES)
    if (bodyResult.ok === false) {
      return json({ error: bodyResult.status === 413 ? 'Payload too large' : 'Invalid request' }, bodyResult.status, cors.headers)
    }

    const body = bodyResult.value
    const events = body && typeof body === 'object' && Array.isArray((body as { events?: unknown }).events)
      ? (body as { events: unknown[] }).events
      : null

    if (!events) return json({ error: 'Invalid request' }, 400, cors.headers)
    if (events.length > getMaxBatchSize()) return json({ error: 'Batch too large' }, 413, cors.headers)

    const parsedEvents = []
    for (const event of events) {
      const parsed = IngestSchema.safeParse(event)
      if (!parsed.success) return json({ error: 'Invalid request' }, 400, cors.headers)
      parsedEvents.push(parsed.data)
    }

    const results = []
    for (const event of parsedEvents) {
      const stored = await storeIngestEvent({
        workspaceId: apiKeyResult.workspaceId,
        apiKeyProjectId: apiKeyResult.projectId,
        event,
      })

      if (stored.ok === false) return json({ error: stored.error }, stored.status, cors.headers)
      results.push(stored)
    }

    return json({
      success: true,
      accepted: results.length,
      eventIds: results.map(result => result.event.id),
    }, 200, cors.headers)
  } catch (error) {
    console.error('[TokenWatcher] Batch ingest failed:', safeLogError(error))
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
    if (receivedBytes > maxBytes) return { ok: false, status: 413 }
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
  const allowed = allowedOrigins.length > 0
    ? allowsWildcard || allowedOrigins.includes(origin)
    : origin === requestOrigin

  if (!allowed) return { allowed: false, headers }
  headers['Access-Control-Allow-Origin'] = allowsWildcard ? '*' : origin

  return { allowed: true, headers }
}

function parseAllowedOrigins(): string[] {
  return (process.env.INGEST_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || req.headers.get('x-real-ip') || 'unknown'
}
