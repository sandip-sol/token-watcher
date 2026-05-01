import type { LLMEvent } from '@prisma/client'
import { prisma } from './prisma'

const db = prisma as any

export const ROLLUP_ALL = '__all__'
export const ROLLUP_NONE = '__none__'

type RollupEvent = Pick<
  LLMEvent,
  | 'workspaceId'
  | 'projectId'
  | 'provider'
  | 'model'
  | 'createdAt'
  | 'totalCostUsd'
  | 'inputTokens'
  | 'outputTokens'
  | 'totalTokens'
  | 'latencyMs'
> & {
  eventType?: string | null
}

export async function updateRollupsForEvent(event: RollupEvent): Promise<void> {
  if (process.env.ROLLUPS_ENABLED === 'false') return

  const date = startOfUtcDay(event.createdAt)
  const hour = startOfUtcHour(event.createdAt)
  const dimensions = rollupDimensions(event)

  await Promise.all(
    dimensions.flatMap(dimension => [
      upsertDailyRollup(event, dimension, date),
      upsertHourlyRollup(event, dimension, hour),
    ])
  )
}

export async function rebuildDailyRollups(options: RebuildRollupOptions = {}): Promise<void> {
  await rebuildRollups({ ...options, granularity: 'daily' })
}

export async function rebuildHourlyRollups(options: RebuildRollupOptions = {}): Promise<void> {
  await rebuildRollups({ ...options, granularity: 'hourly' })
}

export async function rebuildRollupsForDateRange(options: RebuildRollupOptions = {}): Promise<void> {
  await rebuildDailyRollups(options)
  await rebuildHourlyRollups(options)
}

export type RebuildRollupOptions = {
  from?: Date
  to?: Date
  workspaceId?: string
  chunkSize?: number
}

async function rebuildRollups(options: RebuildRollupOptions & { granularity: 'daily' | 'hourly' }): Promise<void> {
  const where = {
    ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    ...(options.from || options.to
      ? {
          createdAt: {
            ...(options.from ? { gte: options.from } : {}),
            ...(options.to ? { lt: options.to } : {}),
          },
        }
      : {}),
  }

  const deleteWhere = {
    ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    ...(options.from || options.to
      ? options.granularity === 'daily'
        ? {
            date: {
              ...(options.from ? { gte: startOfUtcDay(options.from) } : {}),
              ...(options.to ? { lt: startOfUtcDay(options.to) } : {}),
            },
          }
        : {
            hour: {
              ...(options.from ? { gte: startOfUtcHour(options.from) } : {}),
              ...(options.to ? { lt: startOfUtcHour(options.to) } : {}),
            },
          }
      : {}),
  }

  if (options.granularity === 'daily' && db.dailyUsageRollup) {
    await db.dailyUsageRollup.deleteMany({ where: deleteWhere })
  } else if (options.granularity === 'hourly' && db.hourlyUsageRollup) {
    await db.hourlyUsageRollup.deleteMany({ where: deleteWhere })
  } else {
    await deleteRollupsWithRawSql(options)
  }

  const chunkSize = options.chunkSize ?? 1000
  let cursor: string | undefined

  while (true) {
    const events = await db.lLMEvent.findMany({
      where,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: chunkSize,
    })

    if (events.length === 0) break

    for (const event of events) {
      const time = options.granularity === 'daily'
        ? { date: startOfUtcDay(event.createdAt) }
        : { hour: startOfUtcHour(event.createdAt) }

      await Promise.all(
        rollupDimensions(event).map(dimension => {
          if (options.granularity === 'daily') {
            return db.dailyUsageRollup
              ? db.dailyUsageRollup.upsert({
              where: {
                workspaceId_projectId_date_provider_model: {
                  workspaceId: event.workspaceId,
                  projectId: dimension.projectId,
                  date: time.date!,
                  provider: dimension.provider,
                  model: dimension.model,
                },
              },
              create: rollupCreateData(event, dimension, { date: time.date! }),
              update: rollupIncrementData(event),
              })
              : upsertDailyRollup(event, dimension, time.date!)
          }

          return db.hourlyUsageRollup
            ? db.hourlyUsageRollup.upsert({
              where: {
                workspaceId_projectId_hour_provider_model: {
                  workspaceId: event.workspaceId,
                  projectId: dimension.projectId,
                  hour: time.hour!,
                  provider: dimension.provider,
                  model: dimension.model,
                },
              },
              create: rollupCreateData(event, dimension, { hour: time.hour! }),
              update: rollupIncrementData(event),
            })
            : upsertHourlyRollup(event, dimension, time.hour!)
        })
      )
    }

    cursor = events[events.length - 1].id
  }
}

async function upsertDailyRollup(
  event: RollupEvent,
  dimension: { projectId: string; provider: string; model: string },
  date: Date
) {
  if (db.dailyUsageRollup) {
    return db.dailyUsageRollup.upsert({
      where: {
        workspaceId_projectId_date_provider_model: {
          workspaceId: event.workspaceId,
          projectId: dimension.projectId,
          date,
          provider: dimension.provider,
          model: dimension.model,
        },
      },
      create: rollupCreateData(event, dimension, { date }),
      update: rollupIncrementData(event),
    })
  }

  return upsertRollupWithRawSql('DailyUsageRollup', 'date', event, dimension, date)
}

async function upsertHourlyRollup(
  event: RollupEvent,
  dimension: { projectId: string; provider: string; model: string },
  hour: Date
) {
  if (db.hourlyUsageRollup) {
    return db.hourlyUsageRollup.upsert({
      where: {
        workspaceId_projectId_hour_provider_model: {
          workspaceId: event.workspaceId,
          projectId: dimension.projectId,
          hour,
          provider: dimension.provider,
          model: dimension.model,
        },
      },
      create: rollupCreateData(event, dimension, { hour }),
      update: rollupIncrementData(event),
    })
  }

  return upsertRollupWithRawSql('HourlyUsageRollup', 'hour', event, dimension, hour)
}

async function upsertRollupWithRawSql(
  table: 'DailyUsageRollup' | 'HourlyUsageRollup',
  timeColumn: 'date' | 'hour',
  event: RollupEvent,
  dimension: { projectId: string; provider: string; model: string },
  time: Date
) {
  const id = `${table}_${event.workspaceId}_${dimension.projectId}_${time.toISOString()}_${dimension.provider}_${dimension.model}`
  const values = rollupValues(event)

  if (table === 'DailyUsageRollup') {
    return db.$executeRaw`
      INSERT INTO "DailyUsageRollup" (
        "id", "workspaceId", "projectId", "date", "provider", "model",
        "totalCostUsd", "inputTokens", "outputTokens", "totalTokens", "requestCount", "errorCount", "totalLatencyMs"
      )
      VALUES (
        ${id}, ${event.workspaceId}, ${dimension.projectId}, ${time}, ${dimension.provider}, ${dimension.model},
        ${values.totalCostUsd}, ${values.inputTokens}, ${values.outputTokens}, ${values.totalTokens},
        ${values.requestCount}, ${values.errorCount}, ${values.totalLatencyMs}
      )
      ON CONFLICT ("workspaceId", "projectId", "date", "provider", "model")
      DO UPDATE SET
        "totalCostUsd" = "DailyUsageRollup"."totalCostUsd" + EXCLUDED."totalCostUsd",
        "inputTokens" = "DailyUsageRollup"."inputTokens" + EXCLUDED."inputTokens",
        "outputTokens" = "DailyUsageRollup"."outputTokens" + EXCLUDED."outputTokens",
        "totalTokens" = "DailyUsageRollup"."totalTokens" + EXCLUDED."totalTokens",
        "requestCount" = "DailyUsageRollup"."requestCount" + EXCLUDED."requestCount",
        "errorCount" = "DailyUsageRollup"."errorCount" + EXCLUDED."errorCount",
        "totalLatencyMs" = "DailyUsageRollup"."totalLatencyMs" + EXCLUDED."totalLatencyMs",
        "updatedAt" = CURRENT_TIMESTAMP
    `
  }

  return db.$executeRaw`
    INSERT INTO "HourlyUsageRollup" (
      "id", "workspaceId", "projectId", "hour", "provider", "model",
      "totalCostUsd", "inputTokens", "outputTokens", "totalTokens", "requestCount", "errorCount", "totalLatencyMs"
    )
    VALUES (
      ${id}, ${event.workspaceId}, ${dimension.projectId}, ${time}, ${dimension.provider}, ${dimension.model},
      ${values.totalCostUsd}, ${values.inputTokens}, ${values.outputTokens}, ${values.totalTokens},
      ${values.requestCount}, ${values.errorCount}, ${values.totalLatencyMs}
    )
    ON CONFLICT ("workspaceId", "projectId", "hour", "provider", "model")
    DO UPDATE SET
      "totalCostUsd" = "HourlyUsageRollup"."totalCostUsd" + EXCLUDED."totalCostUsd",
      "inputTokens" = "HourlyUsageRollup"."inputTokens" + EXCLUDED."inputTokens",
      "outputTokens" = "HourlyUsageRollup"."outputTokens" + EXCLUDED."outputTokens",
      "totalTokens" = "HourlyUsageRollup"."totalTokens" + EXCLUDED."totalTokens",
      "requestCount" = "HourlyUsageRollup"."requestCount" + EXCLUDED."requestCount",
      "errorCount" = "HourlyUsageRollup"."errorCount" + EXCLUDED."errorCount",
      "totalLatencyMs" = "HourlyUsageRollup"."totalLatencyMs" + EXCLUDED."totalLatencyMs",
      "updatedAt" = CURRENT_TIMESTAMP
  `
}

async function deleteRollupsWithRawSql(options: RebuildRollupOptions & { granularity: 'daily' | 'hourly' }) {
  if (options.granularity === 'daily') {
    return db.$executeRaw`
      DELETE FROM "DailyUsageRollup"
      WHERE (${options.workspaceId ?? null}::text IS NULL OR "workspaceId" = ${options.workspaceId ?? null})
        AND (${options.from ?? null}::timestamp IS NULL OR "date" >= ${options.from ?? null})
        AND (${options.to ?? null}::timestamp IS NULL OR "date" < ${options.to ?? null})
    `
  }

  return db.$executeRaw`
    DELETE FROM "HourlyUsageRollup"
    WHERE (${options.workspaceId ?? null}::text IS NULL OR "workspaceId" = ${options.workspaceId ?? null})
      AND (${options.from ?? null}::timestamp IS NULL OR "hour" >= ${options.from ?? null})
      AND (${options.to ?? null}::timestamp IS NULL OR "hour" < ${options.to ?? null})
  `
}

function rollupDimensions(event: RollupEvent): Array<{ projectId: string; provider: string; model: string }> {
  const projectIds = [ROLLUP_ALL]
  if (event.projectId) projectIds.push(event.projectId)
  else projectIds.push(ROLLUP_NONE)

  const dimensions: Array<{ projectId: string; provider: string; model: string }> = []

  for (const projectId of projectIds) {
    dimensions.push({ projectId, provider: ROLLUP_ALL, model: ROLLUP_ALL })
    dimensions.push({ projectId, provider: event.provider, model: ROLLUP_ALL })
    dimensions.push({ projectId, provider: event.provider, model: event.model })
  }

  return dimensions
}

function rollupCreateData(
  event: RollupEvent,
  dimension: { projectId: string; provider: string; model: string },
  time: { date: Date } | { hour: Date }
) {
  const values = rollupValues(event)

  return {
    workspaceId: event.workspaceId,
    projectId: dimension.projectId,
    provider: dimension.provider,
    model: dimension.model,
    ...time,
    ...values,
  }
}

function rollupIncrementData(event: RollupEvent) {
  const values = rollupValues(event)

  return {
    totalCostUsd: { increment: values.totalCostUsd },
    inputTokens: { increment: values.inputTokens },
    outputTokens: { increment: values.outputTokens },
    totalTokens: { increment: values.totalTokens },
    requestCount: { increment: values.requestCount },
    errorCount: { increment: values.errorCount },
    totalLatencyMs: { increment: values.totalLatencyMs },
  }
}

function rollupValues(event: RollupEvent) {
  const isError = event.eventType === 'error'

  return {
    totalCostUsd: isError ? 0 : event.totalCostUsd,
    inputTokens: isError ? 0 : event.inputTokens,
    outputTokens: isError ? 0 : event.outputTokens,
    totalTokens: isError ? 0 : event.totalTokens,
    requestCount: 1,
    errorCount: isError ? 1 : 0,
    totalLatencyMs: event.latencyMs ?? 0,
  }
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function startOfUtcHour(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()))
}
