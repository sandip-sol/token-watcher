import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { calculateCostWithPricing } from '@/lib/pricing'
import { evaluateAlerts } from '@/lib/alerts'
import { updateRollupsForEvent } from '@/lib/rollups'
import { getProjectForIngest } from '@/lib/workspaces'

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

export async function storeIngestEvent(input: {
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
    inputCostUsd: cost.inputCostUsd,
    outputCostUsd: cost.outputCostUsd,
    totalCostUsd: data.totalCostUsd ?? cost.totalCostUsd,
    latencyMs: data.latencyMs,
    requestId: data.requestId,
    userId: data.userId,
    tags: data.tags,
    prompt: shouldStorePrompts && !isError ? data.prompt : null,
    completion: shouldStorePrompts && !isError ? data.completion : null,
  }

  const event = hasModelField('LLMEvent', 'eventType')
    ? await db.lLMEvent.create({ data: eventData })
    : await createEventWithRawSql(eventData)

  updateRollupsForEvent(event).catch(error => {
    console.error('[TokenWatcher] Rollup update failed:', safeLogError(error, data.requestId))
  })

  if (!isError) {
    evaluateAlerts({
      workspaceId: input.workspaceId,
      projectId: projectResult.projectId,
    }).catch(error => {
      console.error('[TokenWatcher] Alert evaluation failed:', safeLogError(error, data.requestId))
    })
  }

  return {
    ok: true as const,
    event,
    cost,
  }
}

async function createEventWithRawSql(data: {
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
}) {
  const id = crypto.randomUUID()
  const rows = await db.$queryRaw<Array<Record<string, unknown>>>`
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
