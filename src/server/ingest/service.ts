import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { calculateCostWithPricing } from '@/server/pricing/service'
import { evaluateAlerts } from '@/server/alerts/service'
import { updateRollupsForEvent } from '@/server/rollups/service'
import { getProjectForIngest } from '@/server/workspaces/service'

const db = prisma as any

export const MAX_BODY_BYTES = 1_000_000
export const MAX_PROMPT_CHARS = 20_000

const primitiveValueSchema = z.union([
  z.string().max(300),
  z.number().finite(),
  z.boolean(),
  z.null(),
])

export const limitedObjectSchema = z
  .record(z.string().max(60), primitiveValueSchema)
  .refine(value => Object.keys(value).length <= 20, 'Too many keys')

export const IngestSchema = z
  .object({
    eventType: z.enum(['usage', 'error']).optional().default('usage'),
    status: z.enum(['success', 'error']).optional(),
    provider: z.string().min(1).max(50),
    model: z.string().min(1).max(100),
    inputTokens: z.number().int().min(0).max(50_000_000).optional(),
    outputTokens: z.number().int().min(0).max(50_000_000).optional(),
    latencyMs: z.number().int().min(0).max(3_600_000).optional(),
    requestId: z.string().max(200).optional(),
    userId: z.string().max(200).optional(),
    projectId: z.string().trim().max(100).optional(),
    projectSlug: z.string().trim().max(100).optional(),
    tags: limitedObjectSchema.optional().default({}),
    metadata: limitedObjectSchema.optional(),
    prompt: z.string().max(MAX_PROMPT_CHARS).optional(),
    completion: z.string().max(MAX_PROMPT_CHARS).optional(),
    totalCostUsd: z.number().finite().min(0).max(1_000_000).optional(),
    errorType: z.string().trim().min(1).max(120).optional(),
    errorMessage: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.eventType === 'usage') {
      if (data.inputTokens === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['inputTokens'], message: 'inputTokens is required' })
      }
      if (data.outputTokens === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outputTokens'], message: 'outputTokens is required' })
      }
    }

    if (data.eventType === 'error' && !data.errorType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['errorType'], message: 'errorType is required' })
    }
  })

export type ParsedIngestEvent = z.infer<typeof IngestSchema>

export type PreparedIngestEvent = {
  data: {
    workspaceId: string
    projectId: string | null
    eventType: string
    status: string
    errorType?: string | null
    errorMessage?: string | null
    provider: string
    model: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    inputCostUsd: number
    outputCostUsd: number
    totalCostUsd: number
    latencyMs?: number
    requestId?: string
    userId?: string
    tags: Record<string, unknown>
    prompt?: string | null
    completion?: string | null
  }
  cost: {
    inputCostUsd: number
    outputCostUsd: number
    totalCostUsd: number
  }
  isError: boolean
}

export async function prepareIngestEvent(input: {
  workspaceId: string
  apiKeyProjectId?: string | null
  event: ParsedIngestEvent
}) {
  const data = input.event
  const projectResult = await getProjectForIngest({
    workspaceId: input.workspaceId,
    projectId: data.projectId,
    projectSlug: data.projectSlug,
    apiKeyProjectId: input.apiKeyProjectId,
  })

  if (projectResult.ok === false) {
    return { ok: false as const, status: 400 as const, error: projectResult.error }
  }

  const isError = data.eventType === 'error'
  const inputTokens = isError ? 0 : data.inputTokens ?? 0
  const outputTokens = isError ? 0 : data.outputTokens ?? 0
  const totalTokens = inputTokens + outputTokens
  const cost = isError
    ? { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0 }
    : await calculateCostWithPricing(data.provider, data.model, inputTokens, outputTokens)
  const storedCost = applyCostOverride(cost, data)
  const shouldStorePrompts = process.env.STORE_PROMPTS === 'true'

  const eventData = {
    workspaceId: input.workspaceId,
    projectId: projectResult.projectId,
    eventType: data.eventType,
    status: isError ? 'error' : data.status ?? 'success',
    errorType: isError ? data.errorType : null,
    errorMessage: isError ? data.errorMessage ?? null : null,
    provider: data.provider,
    model: data.model,
    inputTokens,
    outputTokens,
    totalTokens,
    inputCostUsd: storedCost.inputCostUsd,
    outputCostUsd: storedCost.outputCostUsd,
    totalCostUsd: storedCost.totalCostUsd,
    latencyMs: data.latencyMs,
    requestId: data.requestId,
    userId: data.userId,
    tags: data.tags,
    prompt: shouldStorePrompts && !isError ? data.prompt : null,
    completion: shouldStorePrompts && !isError ? data.completion : null,
  }

  return {
    ok: true as const,
    prepared: {
      data: eventData,
      cost: storedCost,
      isError,
    } satisfies PreparedIngestEvent,
  }
}

export async function storeIngestEvent(input: {
  workspaceId: string
  apiKeyProjectId?: string | null
  event: ParsedIngestEvent
}) {
  const prepared = await prepareIngestEvent(input)
  if (prepared.ok === false) return prepared

  const event = await createPreparedEvent(prepared.prepared)
  runPostCommitIngestEffects([event])

  return {
    ok: true as const,
    event,
    cost: prepared.prepared.cost,
  }
}

export async function storePreparedIngestEventsTransaction(preparedEvents: PreparedIngestEvent[]) {
  const events = await db.$transaction(async (tx: any) => {
    const inserted = []

    for (const prepared of preparedEvents) {
      inserted.push(await createPreparedEvent(prepared, tx))
    }

    return inserted
  })

  runPostCommitIngestEffects(events)
  return events
}

async function createPreparedEvent(prepared: PreparedIngestEvent, client: any = db) {
  const created = hasModelField('LLMEvent', 'eventType')
    ? client.lLMEvent.create({ data: prepared.data })
    : createEventWithRawSql(prepared.data, client)
  const event = await created

  return {
    ...prepared.data,
    ...event,
  }
}

async function createEventWithRawSql(data: PreparedIngestEvent['data'], client: any = db) {
  const id = crypto.randomUUID()
  const rows = await client.$queryRaw<Array<Record<string, unknown>>>`
    INSERT INTO "LLMEvent" (
      "id", "workspaceId", "projectId", "eventType", "status", "errorType", "errorMessage",
      "provider", "model", "inputTokens", "outputTokens", "totalTokens",
      "inputCostUsd", "outputCostUsd", "totalCostUsd", "latencyMs",
      "requestId", "userId", "tags", "prompt", "completion"
    )
    VALUES (
      ${id}, ${data.workspaceId}, ${data.projectId}, ${data.eventType}, ${data.status}, ${data.errorType}, ${data.errorMessage},
      ${data.provider}, ${data.model}, ${data.inputTokens}, ${data.outputTokens}, ${data.totalTokens},
      ${data.inputCostUsd}, ${data.outputCostUsd}, ${data.totalCostUsd}, ${data.latencyMs ?? null},
      ${data.requestId ?? null}, ${data.userId ?? null}, ${JSON.stringify(data.tags)}::jsonb, ${data.prompt ?? null}, ${data.completion ?? null}
    )
    RETURNING *
  `

  return rows[0]
}

function applyCostOverride(
  serverCost: { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number },
  data: ParsedIngestEvent
) {
  // Client-provided cost is disabled by default because cost must be server-owned for audit integrity.
  if (process.env.ALLOW_INGEST_COST_OVERRIDE !== 'true' || data.totalCostUsd === undefined) {
    return serverCost
  }

  if (!Number.isFinite(data.totalCostUsd) || data.totalCostUsd < 0 || data.totalCostUsd > 1_000_000) {
    throw new Error('Invalid ingest cost override')
  }

  return {
    ...serverCost,
    totalCostUsd: data.totalCostUsd,
  }
}

function runPostCommitIngestEffects(events: Array<PreparedIngestEvent['data'] & { id?: string }>) {
  for (const event of events) {
    updateRollupsForEvent({
      ...event,
      createdAt: (event as { createdAt?: Date }).createdAt ?? new Date(),
      latencyMs: event.latencyMs ?? null,
    }).catch(error => {
      console.error('[TokenWatcher] Rollup update failed:', safeLogError(error, event.requestId))
    })
  }

  const alertScopes = new Set<string>()
  for (const event of events) {
    if (event.eventType === 'error') continue
    alertScopes.add(`${event.workspaceId}:${event.projectId ?? ''}`)
  }

  for (const scope of alertScopes) {
    const [workspaceId, projectId] = scope.split(':')
    evaluateAlerts({
      workspaceId,
      projectId: projectId || null,
    }).catch(error => {
      console.error('[TokenWatcher] Alert evaluation failed:', safeLogError(error))
    })
  }
}

function hasModelField(model: string, field: string): boolean {
  const runtimeModel = db._runtimeDataModel?.models?.[model]
  if (!runtimeModel) return true

  return runtimeModel.fields?.some((candidate: { name?: string }) => candidate.name === field) ?? true
}

export function getMaxBatchSize(): number {
  const parsed = Number(process.env.INGEST_MAX_BATCH_SIZE || '100')
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 1000) : 100
}

export function safeLogError(error: unknown, requestId?: string) {
  return {
    requestId,
    error: error instanceof Error ? error.message : 'Unknown error',
  }
}
