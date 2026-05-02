import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'
import { createDashboardSessionToken } from '@/lib/dashboard-auth'
import { resetIngestRateLimit } from '@/lib/rate-limit'
import { createCsrfToken } from '@/server/auth/csrf'
import { buildContentSecurityPolicy } from '@/server/security/headers'
import { internalError, unauthorized } from '@/server/security/errors'
import { dashboardFetch } from '@/lib/client/dashboard-fetch'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    workspace: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    lLMEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    modelPricing: {
      findUnique: vi.fn(),
    },
    dailyUsageRollup: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    hourlyUsageRollup: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    alertRule: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    alertHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import { hashApiKey } from '@/lib/auth'
import { evaluateAlertRule } from '@/lib/alerts'
import { rebuildDailyRollups, updateRollupsForEvent } from '@/lib/rollups'
import { parseDateRangeUtc, startOfUtcDay, startOfUtcMonth } from '@/lib/date'
import { createSlug, ensureDefaultWorkspaceAndProject } from '@/lib/workspaces'
import { GET as apiKeysGet, POST as apiKeysPost } from '@/app/api/api-keys/route'
import { DELETE as apiKeyDelete } from '@/app/api/api-keys/[id]/route'
import { GET as alertsGet, POST as alertsPost } from '@/app/api/alerts/route'
import { DELETE as alertDelete } from '@/app/api/alerts/[id]/route'
import { GET as alertHistoryGet } from '@/app/api/alerts/history/route'
import { GET as projectsGet, POST as projectsPost } from '@/app/api/projects/route'
import { GET as workspacesGet, POST as workspacesPost } from '@/app/api/workspaces/route'
import { POST as ingestPost } from '@/app/api/ingest/route'
import { POST as batchIngestPost } from '@/app/api/ingest/batch/route'
import { POST as loginPost } from '@/app/api/auth/login/route'
import { GET as csrfGet } from '@/app/api/auth/csrf/route'
import { GET as statsGet } from '@/app/api/stats/route'

const mockedPrisma = prisma as unknown as {
  apiKey: {
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  workspace: {
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  project: {
    findUnique: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  lLMEvent: {
    create: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    aggregate: ReturnType<typeof vi.fn>
    groupBy: ReturnType<typeof vi.fn>
  }
  modelPricing: {
    findUnique: ReturnType<typeof vi.fn>
  }
  dailyUsageRollup: {
    aggregate: ReturnType<typeof vi.fn>
    groupBy: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  hourlyUsageRollup: {
    aggregate: ReturnType<typeof vi.fn>
    groupBy: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  alertRule: {
    findMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  alertHistory: {
    create: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
  }
  $queryRaw: ReturnType<typeof vi.fn>
  $transaction: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  process.env.ROLLUPS_ENABLED = 'false'
  process.env.ALERT_USE_ROLLUPS = 'false'
  process.env.ALLOW_INGEST_COST_OVERRIDE = 'false'
  process.env.INGEST_MAX_BATCH_SIZE = '100'
  mockedPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(mockedPrisma))
  mockedPrisma.apiKey.update.mockResolvedValue({} as never)
  mockedPrisma.modelPricing.findUnique.mockResolvedValue(null as never)
  mockedPrisma.dailyUsageRollup.aggregate.mockResolvedValue({ _sum: {} } as never)
  mockedPrisma.dailyUsageRollup.groupBy.mockResolvedValue([] as never)
  mockedPrisma.dailyUsageRollup.upsert.mockResolvedValue({} as never)
  mockedPrisma.dailyUsageRollup.deleteMany.mockResolvedValue({ count: 0 } as never)
  mockedPrisma.hourlyUsageRollup.upsert.mockResolvedValue({} as never)
  mockedPrisma.hourlyUsageRollup.deleteMany.mockResolvedValue({ count: 0 } as never)
})

function mockDefaultScope() {
  process.env.ROLLUPS_ENABLED = 'false'
  process.env.ALERT_USE_ROLLUPS = 'false'
  process.env.ALLOW_INGEST_COST_OVERRIDE = 'false'
  process.env.INGEST_MAX_BATCH_SIZE = '100'
  mockedPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(mockedPrisma))
  mockedPrisma.apiKey.update.mockResolvedValue({} as never)
  mockedPrisma.modelPricing.findUnique.mockResolvedValue(null as never)
  mockedPrisma.dailyUsageRollup.aggregate.mockResolvedValue({ _sum: {} } as never)
  mockedPrisma.dailyUsageRollup.groupBy.mockResolvedValue([] as never)
  mockedPrisma.dailyUsageRollup.upsert.mockResolvedValue({} as never)
  mockedPrisma.dailyUsageRollup.deleteMany.mockResolvedValue({ count: 0 } as never)
  mockedPrisma.hourlyUsageRollup.upsert.mockResolvedValue({} as never)
  mockedPrisma.hourlyUsageRollup.deleteMany.mockResolvedValue({ count: 0 } as never)
  mockedPrisma.workspace.upsert.mockResolvedValue({
    id: 'workspace_default',
    name: 'Default Workspace',
    slug: 'default',
  } as never)
  mockedPrisma.project.upsert.mockResolvedValue({
    id: 'project_default',
    workspaceId: 'workspace_default',
    name: 'Default Project',
    slug: 'default',
    environment: 'production',
  } as never)
  mockedPrisma.workspace.findMany.mockResolvedValue([
    { id: 'workspace_default', name: 'Default Workspace', slug: 'default' },
  ] as never)
  mockedPrisma.workspace.findUnique.mockResolvedValue({
    id: 'workspace_default',
    name: 'Default Workspace',
    slug: 'default',
  } as never)
  mockedPrisma.project.findFirst.mockResolvedValue({
    id: 'project_default',
    workspaceId: 'workspace_default',
    name: 'Default Project',
    slug: 'default',
  } as never)
  mockedPrisma.project.findMany.mockResolvedValue([
    { id: 'project_default', workspaceId: 'workspace_default', name: 'Default Project', slug: 'default' },
  ] as never)
}

describe('dashboard authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDefaultScope()
    process.env.DASHBOARD_AUTH_ENABLED = 'true'
    process.env.DASHBOARD_USERNAME = 'admin'
    process.env.DASHBOARD_PASSWORD = 'secret_password'
    process.env.DASHBOARD_SESSION_SECRET = 'test_secret_that_is_long_enough'
    process.env.DASHBOARD_SESSION_COOKIE_NAME = 'tokenwatcher_session'
  })

  it('redirects unauthenticated dashboard requests to login', async () => {
    const response = await middleware(new NextRequest('http://localhost:3000/dashboard'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })

  it('returns 401 JSON for unauthenticated stats requests', async () => {
    const response = await middleware(new NextRequest('http://localhost:3000/api/stats'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
  })

  it('sets a session cookie for correct login credentials', async () => {
    const response = await loginPost(
      jsonRequest('/api/auth/login', {
        username: 'admin',
        password: 'secret_password',
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('tokenwatcher_session=')
  })

  it('does not set a valid session for wrong login credentials', async () => {
    const response = await loginPost(
      jsonRequest('/api/auth/login', {
        username: 'admin',
        password: 'wrong',
      })
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
    await expect(response.json()).resolves.toEqual({ error: 'Invalid username or password' })
  })

  it('allows stats through middleware and returns data with a valid session', async () => {
    const token = await createDashboardSessionToken('admin')
    const middlewareResponse = await middleware(
      new NextRequest('http://localhost:3000/api/stats', {
        headers: { cookie: `tokenwatcher_session=${token}` },
      })
    )

    mockedPrisma.lLMEvent.aggregate
      .mockResolvedValueOnce({
        _sum: { totalCostUsd: 1, inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        _avg: { latencyMs: 100 },
        _count: { id: 1 },
      } as never)
      .mockResolvedValueOnce({
        _sum: { totalCostUsd: 1, totalTokens: 15 },
        _count: { id: 1 },
      } as never)
      .mockResolvedValueOnce({
        _sum: { totalCostUsd: 0, totalTokens: 0 },
        _count: { id: 0 },
      } as never)
    mockedPrisma.lLMEvent.groupBy.mockResolvedValue([] as never)
    mockedPrisma.$queryRaw.mockResolvedValue([] as never)

    const routeResponse = await statsGet(await authedRequest('/api/stats'))
    const body = await routeResponse.json()

    expect(middlewareResponse.status).toBe(200)
    expect(routeResponse.status).toBe(200)
    expect(body.overview.callCount).toBe(1)
  })
})

describe('dashboard csrf protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDefaultScope()
    process.env.DASHBOARD_AUTH_ENABLED = 'true'
    process.env.DASHBOARD_USERNAME = 'admin'
    process.env.DASHBOARD_PASSWORD = 'secret_password'
    process.env.DASHBOARD_SESSION_SECRET = 'test_secret_that_is_long_enough'
    process.env.DASHBOARD_SESSION_COOKIE_NAME = 'tokenwatcher_session'
  })

  it('requires dashboard auth for csrf token requests', async () => {
    const response = await csrfGet(new NextRequest('http://localhost:3000/api/auth/csrf'))

    expect(response.status).toBe(401)
  })

  it('returns a csrf token and non-httpOnly csrf cookie for authenticated sessions', async () => {
    const response = await csrfGet(await authedRequest('/api/auth/csrf'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.csrfToken).toMatch(/^[^.]+\.[^.]+$/)
    expect(response.headers.get('set-cookie')).toContain('tokenwatcher_csrf=')
  })

  it('rejects dashboard writes when csrf is missing or invalid', async () => {
    const session = await createDashboardSessionToken('admin')
    const missing = await workspacesPost(
      jsonRequestWithCookie('/api/workspaces', { name: 'Acme AI' }, `tokenwatcher_session=${session}`)
    )
    const invalid = await workspacesPost(
      jsonRequestWithCookie(
        '/api/workspaces',
        { name: 'Acme AI' },
        `tokenwatcher_session=${session}; tokenwatcher_csrf=invalid.token`,
        { 'x-csrf-token': 'invalid.token' }
      )
    )

    expect(missing.status).toBe(403)
    expect(invalid.status).toBe(403)
  })

  it('allows dashboard writes with a valid csrf token', async () => {
    mockedPrisma.workspace.findUnique.mockResolvedValue(null as never)
    mockedPrisma.workspace.create.mockResolvedValue({
      id: 'workspace_2',
      name: 'Acme AI',
      slug: 'acme-ai',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      _count: { projects: 1, apiKeys: 0, events: 0, alerts: 0 },
    } as never)

    const response = await workspacesPost(await authedJsonRequest('/api/workspaces', { name: 'Acme AI' }))

    expect(response.status).toBe(201)
  })

  it('does not require csrf for bearer-token ingest endpoints', async () => {
    const response = await ingestPost(ingestRequest(validPayload(), 'tw_live_valid'))

    expect(response.status).not.toBe(403)
  })
})

describe('security headers and safe errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDefaultScope()
    process.env.DASHBOARD_AUTH_ENABLED = 'false'
  })

  it('sets core security headers and a CSP with object-src none', async () => {
    const response = await middleware(new NextRequest('http://localhost:3000/'))
    const csp = response.headers.get('content-security-policy')

    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('keeps production CSP stricter than development CSP', () => {
    const production = buildContentSecurityPolicy('production')
    const development = buildContentSecurityPolicy('development')

    expect(production).toContain("script-src 'self'")
    expect(production).not.toContain("'unsafe-eval'")
    expect(development).toContain("'unsafe-eval'")
  })

  it('returns safe standardized API errors', async () => {
    await expect(unauthorized().json()).resolves.toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
    })
    await expect(internalError().json()).resolves.toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    })
  })
})

describe('dashboard fetch helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { location: { href: '' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds csrf to unsafe methods and not to GET requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf.valid' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await dashboardFetch('/api/workspaces', { method: 'POST', body: JSON.stringify({ name: 'Acme' }) })
    await dashboardFetch('/api/workspaces')

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/csrf', { credentials: 'same-origin' })
    expect(fetchMock.mock.calls[1][1].headers.get('x-csrf-token')).toBe('csrf.valid')
    expect(fetchMock.mock.calls[2][1].headers.has('x-csrf-token')).toBe(false)
  })

  it('parses standardized API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }), { status: 403 })
    ))

    await expect(dashboardFetch('/api/workspaces')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Forbidden',
    })
  })
})

describe('ingest security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDefaultScope()
    resetIngestRateLimit()
    process.env.TOKENWATCHER_API_KEY = 'tw_dev_test_secret'
    process.env.STORE_PROMPTS = 'false'
    process.env.INGEST_RATE_LIMIT_ENABLED = 'true'
    process.env.INGEST_RATE_LIMIT_WINDOW_SECONDS = '60'
    process.env.INGEST_RATE_LIMIT_MAX_REQUESTS = '120'
    process.env.INGEST_ALLOWED_ORIGINS = ''
    mockedPrisma.apiKey.findUnique.mockResolvedValue(null as never)
    mockedPrisma.lLMEvent.create.mockResolvedValue({ id: 'event_1' } as never)
    mockedPrisma.alertRule.findMany.mockResolvedValue([] as never)
  })

  it('returns 401 when the API key is missing', async () => {
    const response = await ingestPost(ingestRequest(validPayload()))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 when the API key is invalid', async () => {
    const response = await ingestPost(ingestRequest(validPayload(), 'wrong_key'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('allows a valid API key to ingest an event', async () => {
    const response = await ingestPost(ingestRequest(validPayload(), 'tw_dev_test_secret'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockedPrisma.lLMEvent.create).toHaveBeenCalledOnce()
  })

  it('ignores client totalCostUsd by default and stores server-calculated cost', async () => {
    const response = await ingestPost(
      ingestRequest({ ...validPayload(), totalCostUsd: 999 }, 'tw_dev_test_secret')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.cost.totalCostUsd).toBe(0.00075)
    expect(mockedPrisma.lLMEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inputCostUsd: 0.00025,
          outputCostUsd: 0.0005,
          totalCostUsd: 0.00075,
        }),
      })
    )
  })

  it('accepts a valid totalCostUsd override only when explicitly enabled', async () => {
    process.env.ALLOW_INGEST_COST_OVERRIDE = 'true'

    const response = await ingestPost(
      ingestRequest({ ...validPayload(), totalCostUsd: 12.34 }, 'tw_dev_test_secret')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.cost.totalCostUsd).toBe(12.34)
    expect(mockedPrisma.lLMEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inputCostUsd: 0.00025,
          outputCostUsd: 0.0005,
          totalCostUsd: 12.34,
        }),
      })
    )
  })

  it('rejects invalid totalCostUsd override values', async () => {
    process.env.ALLOW_INGEST_COST_OVERRIDE = 'true'

    const negative = await ingestPost(
      ingestRequest({ ...validPayload(), totalCostUsd: -1 }, 'tw_dev_test_secret')
    )
    const tooLarge = await ingestPost(
      ingestRequest({ ...validPayload(), totalCostUsd: 1_000_001 }, 'tw_dev_test_secret')
    )
    const notFinite = await ingestPost(
      ingestRequest({ ...validPayload(), totalCostUsd: Number.NaN }, 'tw_dev_test_secret')
    )

    expect(negative.status).toBe(400)
    expect(tooLarge.status).toBe(400)
    expect(notFinite.status).toBe(400)
    expect(mockedPrisma.lLMEvent.create).not.toHaveBeenCalled()
  })

  it('does not store prompt or completion when STORE_PROMPTS is false', async () => {
    await ingestPost(
      ingestRequest(
        {
          ...validPayload(),
          prompt: 'sensitive prompt',
          completion: 'sensitive completion',
        },
        'tw_dev_test_secret'
      )
    )

    expect(mockedPrisma.lLMEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          prompt: null,
          completion: null,
        }),
      })
    )
  })

  it('stores prompt and completion when STORE_PROMPTS is true', async () => {
    process.env.STORE_PROMPTS = 'true'

    await ingestPost(
      ingestRequest(
        {
          ...validPayload(),
          prompt: 'debug prompt',
          completion: 'debug completion',
        },
        'tw_dev_test_secret'
      )
    )

    expect(mockedPrisma.lLMEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          prompt: 'debug prompt',
          completion: 'debug completion',
        }),
      })
    )
  })

  it('rejects oversized prompt and completion values', async () => {
    const response = await ingestPost(
      ingestRequest({ ...validPayload(), prompt: 'x'.repeat(20_001) }, 'tw_dev_test_secret')
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid request' })
  })

  it('rejects invalid tag values', async () => {
    const response = await ingestPost(
      ingestRequest(
        {
          ...validPayload(),
          tags: { feature: { nested: 'nope' } },
        },
        'tw_dev_test_secret'
      )
    )

    expect(response.status).toBe(400)
  })

  it('rejects too many tags', async () => {
    const tags = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`k${index}`, 'v']))
    const response = await ingestPost(ingestRequest({ ...validPayload(), tags }, 'tw_dev_test_secret'))

    expect(response.status).toBe(400)
  })

  it('returns 429 when the ingest rate limit is exceeded', async () => {
    process.env.INGEST_RATE_LIMIT_MAX_REQUESTS = '1'

    const first = await ingestPost(ingestRequest(validPayload(), 'tw_dev_test_secret'))
    const second = await ingestPost(ingestRequest(validPayload(), 'tw_dev_test_secret'))

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
    await expect(second.json()).resolves.toEqual({ error: 'Rate limit exceeded' })
  })

  it('stores sanitized error events', async () => {
    const response = await ingestPost(
      ingestRequest(
        {
          eventType: 'error',
          provider: 'openai',
          model: 'gpt-4o',
          errorType: 'RateLimitError',
          errorMessage: 'Too many requests',
          latencyMs: 50,
        },
        'tw_dev_test_secret'
      )
    )

    expect(response.status).toBe(200)
    expect(mockedPrisma.lLMEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'error',
          status: 'error',
          errorType: 'RateLimitError',
          inputTokens: 0,
          outputTokens: 0,
          totalCostUsd: 0,
          prompt: null,
          completion: null,
        }),
      })
    )
    expect(mockedPrisma.alertRule.findMany).not.toHaveBeenCalled()
  })

  it('accepts valid batches and rejects oversized or invalid batches', async () => {
    process.env.INGEST_MAX_BATCH_SIZE = '2'

    const accepted = await batchIngestPost(batchIngestRequest({ events: [validPayload(), validPayload()] }, 'tw_dev_test_secret'))
    const tooLarge = await batchIngestPost(
      batchIngestRequest({ events: [validPayload(), validPayload(), validPayload()] }, 'tw_dev_test_secret')
    )
    const invalid = await batchIngestPost(
      batchIngestRequest({ events: [validPayload(), { ...validPayload(), inputTokens: -1 }] }, 'tw_dev_test_secret')
    )

    expect(accepted.status).toBe(200)
    await expect(accepted.json()).resolves.toMatchObject({ success: true, count: 2, accepted: 2 })
    expect(tooLarge.status).toBe(413)
    expect(invalid.status).toBe(400)
  })

  it('does not store any batch events when one payload is invalid', async () => {
    const response = await batchIngestPost(
      batchIngestRequest({ events: [validPayload(), { ...validPayload(), inputTokens: -1 }] }, 'tw_dev_test_secret')
    )

    expect(response.status).toBe(400)
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockedPrisma.lLMEvent.create).not.toHaveBeenCalled()
  })

  it('does not store any batch events when project resolution fails', async () => {
    const rawKey = 'tw_live_workspace_batch_key'
    mockedPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'key_workspace',
      keyHash: hashApiKey(rawKey),
      workspaceId: 'workspace_default',
      projectId: null,
      isActive: true,
      revokedAt: null,
    } as never)
    mockedPrisma.project.findFirst.mockResolvedValueOnce({ id: 'project_default' } as never)
    mockedPrisma.project.findFirst.mockResolvedValueOnce(null as never)

    const response = await batchIngestPost(
      batchIngestRequest({ events: [validPayload(), { ...validPayload(), projectSlug: 'missing-project' }] }, rawKey)
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Project not found' })
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockedPrisma.lLMEvent.create).not.toHaveBeenCalled()
  })

  it('does not store any batch events for cross-workspace project attempts', async () => {
    const rawKey = 'tw_live_workspace_cross_batch_key'
    mockedPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'key_workspace',
      keyHash: hashApiKey(rawKey),
      workspaceId: 'workspace_default',
      projectId: null,
      isActive: true,
      revokedAt: null,
    } as never)
    mockedPrisma.project.findFirst.mockResolvedValueOnce({ id: 'project_default' } as never)
    mockedPrisma.project.findFirst.mockResolvedValueOnce(null as never)

    const response = await batchIngestPost(
      batchIngestRequest({ events: [validPayload(), { ...validPayload(), projectId: 'other_workspace_project' }] }, rawKey)
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Project not found' })
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockedPrisma.lLMEvent.create).not.toHaveBeenCalled()
  })

  it('rolls back batch inserts when the transaction fails', async () => {
    mockedPrisma.$transaction.mockRejectedValueOnce(new Error('database unavailable') as never)

    const response = await batchIngestPost(
      batchIngestRequest({ events: [validPayload(), validPayload()] }, 'tw_dev_test_secret')
    )

    expect(response.status).toBe(500)
    expect(mockedPrisma.$transaction).toHaveBeenCalledOnce()
    expect(mockedPrisma.alertRule.findMany).not.toHaveBeenCalled()
    expect(mockedPrisma.dailyUsageRollup.upsert).not.toHaveBeenCalled()
  })

  it('runs batch rollups and alert evaluation only after a successful commit', async () => {
    process.env.ROLLUPS_ENABLED = 'true'
    mockedPrisma.lLMEvent.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: `event_${mockedPrisma.lLMEvent.create.mock.calls.length}`, createdAt: new Date('2026-05-01T12:34:00.000Z'), ...data })
    )
    mockedPrisma.alertRule.findMany.mockResolvedValue([] as never)

    const response = await batchIngestPost(
      batchIngestRequest({ events: [validPayload(), validPayload()] }, 'tw_dev_test_secret')
    )

    expect(response.status).toBe(200)
    expect(mockedPrisma.$transaction).toHaveBeenCalledOnce()
    expect(mockedPrisma.dailyUsageRollup.upsert).toHaveBeenCalled()
    expect(mockedPrisma.alertRule.findMany).toHaveBeenCalledOnce()
  })
})

describe('workspace and project management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDefaultScope()
    process.env.DASHBOARD_AUTH_ENABLED = 'true'
    process.env.DASHBOARD_SESSION_SECRET = 'test_secret_that_is_long_enough'
    process.env.DASHBOARD_SESSION_COOKIE_NAME = 'tokenwatcher_session'
  })

  it('sanitizes slugs and ensures the default workspace/project idempotently', async () => {
    const result = await ensureDefaultWorkspaceAndProject()

    expect(createSlug('Production App!')).toBe('production-app')
    expect(result.workspace.slug).toBe('default')
    expect(result.project.slug).toBe('default')
    expect(mockedPrisma.workspace.upsert).toHaveBeenCalledOnce()
    expect(mockedPrisma.project.upsert).toHaveBeenCalledOnce()
  })

  it('lists and creates workspaces behind dashboard auth', async () => {
    mockedPrisma.workspace.findUnique.mockResolvedValueOnce(null as never)
    mockedPrisma.workspace.create.mockResolvedValue({
      id: 'workspace_acme',
      name: 'Acme AI',
      slug: 'acme-ai',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      _count: { projects: 1, apiKeys: 0, events: 0, alerts: 0 },
    } as never)

    const listResponse = await workspacesGet(await authedRequest('/api/workspaces'))
    const createResponse = await workspacesPost(await authedJsonRequest('/api/workspaces', { name: 'Acme AI' }))
    const createBody = await createResponse.json()

    expect(listResponse.status).toBe(200)
    expect(createResponse.status).toBe(201)
    expect(createBody.workspace.slug).toBe('acme-ai')
  })

  it('creates projects with slugs unique inside a workspace', async () => {
    mockedPrisma.project.findUnique.mockResolvedValueOnce({ id: 'existing_project' } as never)
    mockedPrisma.project.findUnique.mockResolvedValueOnce(null as never)
    mockedPrisma.project.create.mockResolvedValue({
      id: 'project_2',
      workspaceId: 'workspace_default',
      name: 'Production App',
      slug: 'production-app-2',
      description: null,
      environment: 'production',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      _count: { apiKeys: 0, events: 0, alerts: 0 },
    } as never)

    const listResponse = await projectsGet(await authedRequest('/api/projects?workspaceId=workspace_default'))
    const createResponse = await projectsPost(
      await authedJsonRequest('/api/projects', {
        workspaceId: 'workspace_default',
        name: 'Production App',
        environment: 'production',
      })
    )
    const createBody = await createResponse.json()

    expect(listResponse.status).toBe(200)
    expect(createResponse.status).toBe(201)
    expect(createBody.project.slug).toBe('production-app-2')
  })
})

describe('workspace-scoped stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDefaultScope()
    process.env.DASHBOARD_AUTH_ENABLED = 'true'
    process.env.DASHBOARD_SESSION_SECRET = 'test_secret_that_is_long_enough'
    process.env.DASHBOARD_SESSION_COOKIE_NAME = 'tokenwatcher_session'
    mockedPrisma.lLMEvent.aggregate.mockResolvedValue({
      _sum: { totalCostUsd: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      _avg: { latencyMs: 0 },
      _count: { id: 0 },
    } as never)
    mockedPrisma.lLMEvent.groupBy.mockResolvedValue([] as never)
    mockedPrisma.$queryRaw.mockResolvedValue([] as never)
  })

  it('filters every aggregate by workspace and project', async () => {
    const response = await statsGet(
      await authedRequest('/api/stats?workspaceId=workspace_default&projectId=project_default')
    )

    expect(response.status).toBe(200)
    expect(mockedPrisma.lLMEvent.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace_default',
          projectId: 'project_default',
        }),
      })
    )
  })

  it('can serve stats from rollups with workspace and project filters', async () => {
    process.env.ROLLUPS_ENABLED = 'true'
    mockedPrisma.dailyUsageRollup.aggregate
      .mockResolvedValueOnce({
        _sum: {
          totalCostUsd: 2,
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          requestCount: 1,
          errorCount: 0,
          totalLatencyMs: 100,
        },
      } as never)
      .mockResolvedValueOnce({ _sum: { totalCostUsd: 1, totalTokens: 10, requestCount: 1, errorCount: 0 } } as never)
      .mockResolvedValueOnce({ _sum: { totalCostUsd: 0, totalTokens: 0, requestCount: 0, errorCount: 0 } } as never)
    mockedPrisma.dailyUsageRollup.groupBy
      .mockResolvedValueOnce([
        {
          provider: 'openai',
          model: 'gpt-4o',
          _sum: {
            totalCostUsd: 2,
            totalTokens: 15,
            inputTokens: 10,
            outputTokens: 5,
            requestCount: 1,
            errorCount: 0,
            totalLatencyMs: 100,
          },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          date: new Date('2026-05-01T00:00:00.000Z'),
          _sum: { totalCostUsd: 2, totalTokens: 15, requestCount: 1, errorCount: 0 },
        },
      ] as never)

    const response = await statsGet(
      await authedRequest('/api/stats?workspaceId=workspace_default&projectId=project_default')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.meta.dataSource).toBe('rollups')
    expect(body.overview.totalCostUsd).toBe(2)
    expect(mockedPrisma.dailyUsageRollup.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace_default',
          projectId: 'project_default',
        }),
      })
    )
  })
})

describe('rollups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDefaultScope()
    process.env.ROLLUPS_ENABLED = 'true'
  })

  it('updates daily and hourly rollups for usage and error events', async () => {
    await updateRollupsForEvent({
      workspaceId: 'workspace_default',
      projectId: 'project_default',
      provider: 'openai',
      model: 'gpt-4o',
      createdAt: new Date('2026-05-01T12:34:00.000Z'),
      totalCostUsd: 1,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      latencyMs: 200,
      eventType: 'usage',
    })
    await updateRollupsForEvent({
      workspaceId: 'workspace_default',
      projectId: 'project_default',
      provider: 'openai',
      model: 'gpt-4o',
      createdAt: new Date('2026-05-01T12:35:00.000Z'),
      totalCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs: 30,
      eventType: 'error',
    })

    expect(mockedPrisma.dailyUsageRollup.upsert).toHaveBeenCalled()
    expect(mockedPrisma.hourlyUsageRollup.upsert).toHaveBeenCalled()
    expect(mockedPrisma.dailyUsageRollup.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          errorCount: { increment: 1 },
          totalCostUsd: { increment: 0 },
        }),
      })
    )
  })

  it('rebuilds daily rollups from raw events in chunks', async () => {
    mockedPrisma.lLMEvent.findMany
      .mockResolvedValueOnce([
        {
          id: 'event_1',
          workspaceId: 'workspace_default',
          projectId: 'project_default',
          provider: 'openai',
          model: 'gpt-4o',
          createdAt: new Date('2026-05-01T12:34:00.000Z'),
          totalCostUsd: 1,
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          latencyMs: 200,
          eventType: 'usage',
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    await rebuildDailyRollups({ from: new Date('2026-05-01'), to: new Date('2026-05-02') })

    expect(mockedPrisma.dailyUsageRollup.deleteMany).toHaveBeenCalled()
    expect(mockedPrisma.dailyUsageRollup.upsert).toHaveBeenCalled()
  })
})

describe('UTC date boundaries', () => {
  it('calculates UTC day and month starts', () => {
    const date = new Date('2026-05-02T23:45:10.123+05:30')

    expect(startOfUtcDay(date).toISOString()).toBe('2026-05-02T00:00:00.000Z')
    expect(startOfUtcMonth(date).toISOString()).toBe('2026-05-01T00:00:00.000Z')
  })

  it('uses UTC starts for stats date ranges', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-02T18:30:00.000Z'))

    const range = parseDateRangeUtc({ days: '7' })

    expect(range.from.toISOString()).toBe('2026-04-26T00:00:00.000Z')
    expect(range.to.toISOString()).toBe('2026-05-02T18:30:00.000Z')

    vi.useRealTimers()
  })
})

describe('api key management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDefaultScope()
    resetIngestRateLimit()
    process.env.DASHBOARD_AUTH_ENABLED = 'true'
    process.env.DASHBOARD_SESSION_SECRET = 'test_secret_that_is_long_enough'
    process.env.DASHBOARD_SESSION_COOKIE_NAME = 'tokenwatcher_session'
    delete process.env.TOKENWATCHER_API_KEY
    mockedPrisma.lLMEvent.create.mockResolvedValue({ id: 'event_1' } as never)
    mockedPrisma.alertRule.findMany.mockResolvedValue([] as never)
  })

  it('creates an API key for an authenticated dashboard session and returns raw key only once', async () => {
    mockedPrisma.apiKey.create.mockImplementation(({ data, select }) =>
      Promise.resolve({
        id: 'key_1',
        name: data.name,
        keyPrefix: data.keyPrefix,
        environment: data.environment,
        isActive: true,
        lastUsedAt: null,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        revokedAt: null,
      })
    )

    const response = await apiKeysPost(
      await authedJsonRequest('/api/api-keys', {
        workspaceId: 'workspace_default',
        name: 'Production',
        environment: 'live',
      })
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.rawKey).toMatch(/^tw_live_/)
    expect(body.apiKey.keyHash).toBeUndefined()
    expect(body.apiKey.keyPrefix).toMatch(/^tw_live_/)
  })

  it('lists API keys without exposing hashes or raw keys', async () => {
    mockedPrisma.apiKey.findMany.mockResolvedValue([
      {
        id: 'key_1',
        name: 'Production',
        keyPrefix: 'tw_live_abc12345',
        environment: 'live',
        isActive: true,
        lastUsedAt: null,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        revokedAt: null,
      },
    ] as never)

    const response = await apiKeysGet(await authedRequest('/api/api-keys'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.apiKeys[0].keyHash).toBeUndefined()
    expect(body.apiKeys[0].rawKey).toBeUndefined()
  })

  it('revokes an API key without deleting it', async () => {
    mockedPrisma.apiKey.update.mockResolvedValue({
      id: 'key_1',
      name: 'Production',
      keyPrefix: 'tw_live_abc12345',
      environment: 'live',
      isActive: false,
      lastUsedAt: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      revokedAt: new Date('2026-05-01T01:00:00.000Z'),
    } as never)

    const response = await apiKeyDelete(await authedRequest('/api/api-keys/key_1', { method: 'DELETE' }), {
      params: { id: 'key_1' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.apiKey.isActive).toBe(false)
    expect(mockedPrisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'key_1' },
        data: expect.objectContaining({ isActive: false }),
      })
    )
  })

  it('allows an active DB-backed key to ingest and updates lastUsedAt', async () => {
    const rawKey = 'tw_live_active_key'
    mockedPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'key_1',
      keyHash: hashApiKey(rawKey),
      workspaceId: 'workspace_default',
      projectId: 'project_default',
      isActive: true,
      revokedAt: null,
    } as never)
    mockedPrisma.apiKey.update.mockResolvedValue({} as never)

    const response = await ingestPost(ingestRequest(validPayload(), rawKey))

    expect(response.status).toBe(200)
    expect(mockedPrisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'key_1' },
        data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      })
    )
  })

  it('allows a workspace-level key to ingest into a project in the same workspace', async () => {
    const rawKey = 'tw_live_workspace_key'
    mockedPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'key_workspace',
      keyHash: hashApiKey(rawKey),
      workspaceId: 'workspace_default',
      projectId: null,
      isActive: true,
      revokedAt: null,
    } as never)
    mockedPrisma.project.findFirst.mockResolvedValueOnce({ id: 'project_prod' } as never)

    const response = await ingestPost(
      ingestRequest({ ...validPayload(), projectSlug: 'production-app' }, rawKey)
    )

    expect(response.status).toBe(200)
    expect(mockedPrisma.lLMEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace_default',
          projectId: 'project_prod',
        }),
      })
    )
  })

  it('forces a project-level key to its assigned project', async () => {
    const rawKey = 'tw_live_project_key'
    mockedPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'key_project',
      keyHash: hashApiKey(rawKey),
      workspaceId: 'workspace_default',
      projectId: 'project_locked',
      isActive: true,
      revokedAt: null,
    } as never)
    mockedPrisma.project.findFirst.mockResolvedValueOnce({ id: 'project_locked' } as never)

    const response = await ingestPost(
      ingestRequest({ ...validPayload(), projectId: 'different_project' }, rawKey)
    )

    expect(response.status).toBe(200)
    expect(mockedPrisma.lLMEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: 'project_locked' }),
      })
    )
  })

  it('rejects project assignment outside the API key workspace', async () => {
    const rawKey = 'tw_live_cross_workspace_key'
    mockedPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'key_workspace',
      keyHash: hashApiKey(rawKey),
      workspaceId: 'workspace_default',
      projectId: null,
      isActive: true,
      revokedAt: null,
    } as never)
    mockedPrisma.project.findFirst.mockResolvedValueOnce(null as never)

    const response = await ingestPost(
      ingestRequest({ ...validPayload(), projectId: 'project_other_workspace' }, rawKey)
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Project not found' })
  })

  it('rejects a revoked DB-backed key', async () => {
    mockedPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'key_1',
      isActive: false,
      revokedAt: new Date(),
    } as never)

    const response = await ingestPost(ingestRequest(validPayload(), 'tw_live_revoked_key'))

    expect(response.status).toBe(401)
  })
})

describe('alert management and evaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDefaultScope()
    process.env.DASHBOARD_AUTH_ENABLED = 'true'
    process.env.DASHBOARD_SESSION_SECRET = 'test_secret_that_is_long_enough'
    process.env.DASHBOARD_SESSION_COOKIE_NAME = 'tokenwatcher_session'
    process.env.ALERT_COOLDOWN_MINUTES = '60'
    process.env.ALERT_WEBHOOK_TIMEOUT_MS = '5000'
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
  })

  it('rejects unauthenticated alert list requests', async () => {
    const response = await alertsGet(new NextRequest('http://localhost:3000/api/alerts'))

    expect(response.status).toBe(401)
  })

  it('creates an authenticated alert rule', async () => {
    mockedPrisma.alertRule.create.mockResolvedValue({
      id: 'alert_1',
      workspaceId: 'workspace_default',
      projectId: null,
      name: 'Daily budget',
      type: 'daily_cost',
      threshold: 10,
      provider: null,
      model: null,
      webhookUrl: 'https://example.com/webhook',
      isActive: true,
      lastTriggeredAt: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    } as never)

    const response = await alertsPost(
      await authedJsonRequest('/api/alerts', {
        workspaceId: 'workspace_default',
        name: 'Daily budget',
        type: 'daily_cost',
        threshold: 10,
        webhookUrl: 'https://example.com/webhook',
      })
    )

    expect(response.status).toBe(201)
  })

  it('rejects invalid alert type and invalid webhook URLs', async () => {
    const invalidType = await alertsPost(
      await authedJsonRequest('/api/alerts', {
        name: 'Bad alert',
        type: 'hourly_cost',
        threshold: 10,
      })
    )
    const invalidWebhook = await alertsPost(
      await authedJsonRequest('/api/alerts', {
        name: 'Bad webhook',
        type: 'daily_cost',
        threshold: 10,
        webhookUrl: 'javascript:alert(1)',
      })
    )

    expect(invalidType.status).toBe(400)
    expect(invalidWebhook.status).toBe(400)
  })

  it('deactivates an alert and fetches history', async () => {
    mockedPrisma.alertRule.update.mockResolvedValue({ id: 'alert_1', isActive: false } as never)
    mockedPrisma.alertHistory.findMany.mockResolvedValue([
      {
        id: 'history_1',
        alertRuleId: 'alert_1',
        triggeredAt: new Date('2026-05-01T00:00:00.000Z'),
        type: 'daily_cost',
        value: 12,
        threshold: 10,
        status: 'success',
        error: null,
        alertRule: { id: 'alert_1', name: 'Daily budget', type: 'daily_cost' },
      },
    ] as never)

    const deactivateResponse = await alertDelete(await authedRequest('/api/alerts/alert_1', { method: 'DELETE' }), {
      params: { id: 'alert_1' },
    })
    const historyResponse = await alertHistoryGet(await authedRequest('/api/alerts/history'))

    expect(deactivateResponse.status).toBe(200)
    expect(historyResponse.status).toBe(200)
  })

  it('triggers daily_cost alerts, records success, and respects cooldown', async () => {
    mockedPrisma.lLMEvent.aggregate.mockResolvedValue({ _sum: { totalCostUsd: 12 } } as never)
    mockedPrisma.alertHistory.create.mockResolvedValue({} as never)
    mockedPrisma.alertRule.update.mockResolvedValue({} as never)

    const triggered = await evaluateAlertRule(alertRule({ threshold: 10 }))
    const cooledDown = await evaluateAlertRule(
      alertRule({ threshold: 10, lastTriggeredAt: new Date() })
    )

    expect(triggered.triggered).toBe(true)
    expect(mockedPrisma.alertHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'success' }) })
    )
    expect(cooledDown.skippedByCooldown).toBe(true)
  })

  it('does not trigger below threshold and supports monthly, token, and model filters', async () => {
    mockedPrisma.lLMEvent.aggregate
      .mockResolvedValueOnce({ _sum: { totalCostUsd: 5 } } as never)
      .mockResolvedValueOnce({ _sum: { totalCostUsd: 20 } } as never)
      .mockResolvedValueOnce({ _sum: { totalTokens: 2000 } } as never)
      .mockResolvedValueOnce({ _sum: { totalCostUsd: 15 } } as never)

    const below = await evaluateAlertRule(alertRule({ threshold: 10 }))
    const monthly = await evaluateAlertRule(alertRule({ type: 'monthly_cost', threshold: 10 }))
    const tokens = await evaluateAlertRule(alertRule({ type: 'daily_tokens', threshold: 1000 }))
    const model = await evaluateAlertRule(
      alertRule({ type: 'model_daily_cost', threshold: 10, provider: 'openai', model: 'gpt-4o' })
    )

    expect(below.triggered).toBe(false)
    expect(monthly.triggered).toBe(true)
    expect(tokens.triggered).toBe(true)
    expect(model.triggered).toBe(true)
    expect(mockedPrisma.lLMEvent.aggregate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ provider: 'openai', model: 'gpt-4o' }),
      })
    )
  })

  it('evaluates daily and monthly alerts with UTC boundaries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-02T18:30:00.000Z'))
    mockedPrisma.lLMEvent.aggregate
      .mockResolvedValueOnce({ _sum: { totalCostUsd: 5 } } as never)
      .mockResolvedValueOnce({ _sum: { totalCostUsd: 5 } } as never)

    await evaluateAlertRule(alertRule({ threshold: 10 }))
    await evaluateAlertRule(alertRule({ type: 'monthly_cost', threshold: 10 }))

    expect(mockedPrisma.lLMEvent.aggregate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: new Date('2026-05-02T00:00:00.000Z'),
            lte: new Date('2026-05-02T18:30:00.000Z'),
          }),
        }),
      })
    )
    expect(mockedPrisma.lLMEvent.aggregate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: new Date('2026-05-01T00:00:00.000Z'),
            lte: new Date('2026-05-02T18:30:00.000Z'),
          }),
        }),
      })
    )

    vi.useRealTimers()
  })

  it('records failed webhook delivery without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    mockedPrisma.lLMEvent.aggregate.mockResolvedValue({ _sum: { totalCostUsd: 12 } } as never)
    mockedPrisma.alertHistory.create.mockResolvedValue({} as never)

    const result = await evaluateAlertRule(alertRule({ threshold: 10 }))

    expect(result.triggered).toBe(true)
    expect(mockedPrisma.alertHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) })
    )
  })

  it('evaluates project alerts only against matching project data and stores history scope', async () => {
    mockedPrisma.lLMEvent.aggregate.mockResolvedValue({ _sum: { totalCostUsd: 25 } } as never)
    mockedPrisma.alertHistory.create.mockResolvedValue({} as never)
    mockedPrisma.alertRule.update.mockResolvedValue({} as never)

    const result = await evaluateAlertRule(
      alertRule({ threshold: 20, workspaceId: 'workspace_default', projectId: 'project_default' })
    )

    expect(result.triggered).toBe(true)
    expect(mockedPrisma.lLMEvent.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace_default',
          projectId: 'project_default',
        }),
      })
    )
    expect(mockedPrisma.alertHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace_default',
          projectId: 'project_default',
        }),
      })
    )
  })

  it('can evaluate alerts from rollups and falls back to raw aggregates', async () => {
    process.env.ALERT_USE_ROLLUPS = 'true'
    mockedPrisma.dailyUsageRollup.aggregate.mockResolvedValueOnce({
      _sum: { totalCostUsd: 25 },
    } as never)
    mockedPrisma.alertHistory.create.mockResolvedValue({} as never)
    mockedPrisma.alertRule.update.mockResolvedValue({} as never)

    const rollupResult = await evaluateAlertRule(alertRule({ threshold: 20 }))

    mockedPrisma.dailyUsageRollup.aggregate.mockRejectedValueOnce(new Error('rollups unavailable') as never)
    mockedPrisma.lLMEvent.aggregate.mockResolvedValueOnce({ _sum: { totalCostUsd: 30 } } as never)

    const fallbackResult = await evaluateAlertRule(alertRule({ threshold: 20 }))

    expect(rollupResult.triggered).toBe(true)
    expect(fallbackResult.triggered).toBe(true)
    expect(mockedPrisma.lLMEvent.aggregate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventType: 'usage' }),
      })
    )
  })
})

function jsonRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function jsonRequestWithCookie(
  path: string,
  body: unknown,
  cookie: string,
  extraHeaders: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  })
}

async function authedRequest(path: string, init: RequestInit = {}): Promise<NextRequest> {
  const token = await createDashboardSessionToken('admin')
  const method = (init.method || 'GET').toUpperCase()
  const csrfToken = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
    ? await createCsrfToken(token)
    : null
  const headers = new Headers(init.headers)
  headers.set(
    'cookie',
    csrfToken
      ? `tokenwatcher_session=${token}; tokenwatcher_csrf=${csrfToken}`
      : `tokenwatcher_session=${token}`
  )
  if (csrfToken) headers.set('x-csrf-token', csrfToken)

  return new NextRequest(`http://localhost:3000${path}`, {
    ...init,
    headers,
  })
}

async function authedJsonRequest(path: string, body: unknown): Promise<NextRequest> {
  return authedRequest(path, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function ingestRequest(body: unknown, apiKey?: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

function batchIngestRequest(body: unknown, apiKey?: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/ingest/batch', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

function alertRule(overrides: Partial<{
  workspaceId: string
  projectId: string | null
  type: string
  threshold: number
  provider: string | null
  model: string | null
  webhookUrl: string | null
  lastTriggeredAt: Date | null
}> = {}) {
  return {
    id: 'alert_1',
    workspaceId: overrides.workspaceId ?? 'workspace_default',
    projectId: overrides.projectId ?? null,
    name: 'Daily budget',
    type: overrides.type ?? 'daily_cost',
    threshold: overrides.threshold ?? 10,
    provider: overrides.provider ?? null,
    model: overrides.model ?? null,
    webhookUrl: overrides.webhookUrl ?? 'https://example.com/webhook',
    isActive: true,
    lastTriggeredAt: overrides.lastTriggeredAt ?? null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  }
}

function validPayload() {
  return {
    provider: 'openai',
    model: 'gpt-4o',
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 250,
    tags: { feature: 'chat' },
  }
}
