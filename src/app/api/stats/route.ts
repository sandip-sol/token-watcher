// src/app/api/stats/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { ROLLUP_ALL } from '@/lib/rollups'
import { resolveWorkspaceSelection } from '@/lib/workspaces'

const db = prisma as any

export async function GET(req: NextRequest) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') ?? '30')
    const groupBy = searchParams.get('groupBy') ?? 'day' // 'day' | 'model' | 'provider' | 'tag'
    const tagKey = searchParams.get('tagKey') ?? null
    const provider = searchParams.get('provider')?.trim() || null
    const model = searchParams.get('model')?.trim() || null
    const requestedRollups = searchParams.get('useRollups')
    const useRollups = process.env.ROLLUPS_ENABLED !== 'false' && requestedRollups !== 'false'
    const selection = await resolveWorkspaceSelection({
      workspaceId: searchParams.get('workspaceId'),
      projectId: searchParams.get('projectId'),
    })

    if (selection.ok === false) {
      return NextResponse.json({ error: selection.error }, { status: selection.status })
    }

    const safeDays = Math.min(Math.max(1, days), 365)
    const since = new Date()
    since.setDate(since.getDate() - safeDays)
    const scopeWhere = {
      workspaceId: selection.workspaceId,
      ...(selection.projectId ? { projectId: selection.projectId } : {}),
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
    }

    if (useRollups && !tagKey) {
      const rollupWhere = {
        workspaceId: selection.workspaceId,
        projectId: selection.projectId ?? ROLLUP_ALL,
        date: { gte: startOfUtcDay(since) },
        provider: provider ?? ROLLUP_ALL,
        model: model ?? ROLLUP_ALL,
      }
      if (!db.dailyUsageRollup) {
        return NextResponse.json(await getRawSqlRollupStats({
          workspaceId: selection.workspaceId,
          projectId: selection.projectId ?? ROLLUP_ALL,
          since: startOfUtcDay(since),
          provider: provider ?? ROLLUP_ALL,
          model: model ?? ROLLUP_ALL,
        }))
      }
      const rollupOverview = await db.dailyUsageRollup.aggregate({
        where: rollupWhere,
        _sum: {
          totalCostUsd: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          requestCount: true,
          errorCount: true,
          totalLatencyMs: true,
        },
      })
      const rollupByModel = await db.dailyUsageRollup.groupBy({
        by: ['provider', 'model'],
        where: {
          workspaceId: selection.workspaceId,
          projectId: selection.projectId ?? ROLLUP_ALL,
          date: { gte: startOfUtcDay(since) },
          provider: provider ?? { not: ROLLUP_ALL },
          model: model ?? { not: ROLLUP_ALL },
        },
        _sum: {
          totalCostUsd: true,
          totalTokens: true,
          inputTokens: true,
          outputTokens: true,
          requestCount: true,
          errorCount: true,
          totalLatencyMs: true,
        },
        orderBy: { _sum: { totalCostUsd: 'desc' } },
      })
      const rollupDailyTrend = await db.dailyUsageRollup.groupBy({
        by: ['date'],
        where: rollupWhere,
        _sum: {
          totalCostUsd: true,
          totalTokens: true,
          requestCount: true,
          errorCount: true,
        },
        orderBy: { date: 'asc' },
      })

      const today = startOfUtcDay(new Date())
      const yesterday = new Date(today)
      yesterday.setUTCDate(yesterday.getUTCDate() - 1)
      const [todayStats, yesterdayStats] = await Promise.all([
        db.dailyUsageRollup.aggregate({
          where: { ...rollupWhere, date: today },
          _sum: { totalCostUsd: true, totalTokens: true, requestCount: true, errorCount: true },
        }),
        db.dailyUsageRollup.aggregate({
          where: { ...rollupWhere, date: yesterday },
          _sum: { totalCostUsd: true, totalTokens: true, requestCount: true, errorCount: true },
        }),
      ])

      const totalLatencyMs = rollupOverview._sum.totalLatencyMs ?? 0
      const requestCount = rollupOverview._sum.requestCount ?? 0

      return NextResponse.json({
        overview: {
          totalCostUsd: rollupOverview._sum.totalCostUsd ?? 0,
          totalInputTokens: rollupOverview._sum.inputTokens ?? 0,
          totalOutputTokens: rollupOverview._sum.outputTokens ?? 0,
          totalTokens: rollupOverview._sum.totalTokens ?? 0,
          avgLatencyMs: requestCount > 0 ? Math.round(totalLatencyMs / requestCount) : 0,
          callCount: requestCount,
          errorCount: rollupOverview._sum.errorCount ?? 0,
        },
        today: {
          totalCostUsd: todayStats._sum.totalCostUsd ?? 0,
          totalTokens: todayStats._sum.totalTokens ?? 0,
          callCount: todayStats._sum.requestCount ?? 0,
          errorCount: todayStats._sum.errorCount ?? 0,
        },
        yesterday: {
          totalCostUsd: yesterdayStats._sum.totalCostUsd ?? 0,
          totalTokens: yesterdayStats._sum.totalTokens ?? 0,
          callCount: yesterdayStats._sum.requestCount ?? 0,
          errorCount: yesterdayStats._sum.errorCount ?? 0,
        },
        byModel: rollupByModel.map(m => {
          const calls = m._sum.requestCount ?? 0
          return {
            provider: m.provider,
            model: m.model,
            totalCostUsd: m._sum.totalCostUsd ?? 0,
            totalTokens: m._sum.totalTokens ?? 0,
            inputTokens: m._sum.inputTokens ?? 0,
            outputTokens: m._sum.outputTokens ?? 0,
            callCount: calls,
            errorCount: m._sum.errorCount ?? 0,
            avgLatencyMs: calls > 0 ? Math.round((m._sum.totalLatencyMs ?? 0) / calls) : 0,
          }
        }),
        dailyTrend: rollupDailyTrend.map(d => ({
          date: d.date,
          totalCost: d._sum.totalCostUsd ?? 0,
          totalTokens: d._sum.totalTokens ?? 0,
          callCount: d._sum.requestCount ?? 0,
          errorCount: d._sum.errorCount ?? 0,
        })),
        tagBreakdown: [],
        meta: { dataSource: 'rollups' },
      })
    }

    // ── Overview stats ───────────────────────────────────────
    const overview = await db.lLMEvent.aggregate({
      where: { ...scopeWhere, createdAt: { gte: since } },
      _sum: {
        totalCostUsd: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
      _avg: { latencyMs: true },
      _count: { id: true },
    })
    const errorOverview = await db.lLMEvent.aggregate({
      where: { ...scopeWhere, createdAt: { gte: since }, eventType: 'error' },
      _count: { id: true },
    })

  // ── Cost by model ────────────────────────────────────────
  const byModel = await db.lLMEvent.groupBy({
    by: ['provider', 'model'],
    where: { ...scopeWhere, createdAt: { gte: since } },
    _sum: { totalCostUsd: true, totalTokens: true, inputTokens: true, outputTokens: true },
    _count: { id: true },
    _avg: { latencyMs: true },
    orderBy: { _sum: { totalCostUsd: 'desc' } },
  })

  // ── Daily cost trend (raw SQL for date truncation) ───────
  const dailyTrend = await db.$queryRaw<Array<{
    date: string
    total_cost: number
    total_tokens: bigint
    call_count: bigint
  }>>`
    SELECT
      DATE_TRUNC('day', "createdAt") AS date,
      SUM("totalCostUsd") AS total_cost,
      SUM("totalTokens") AS total_tokens,
      COUNT(*) AS call_count
    FROM "LLMEvent"
    WHERE "createdAt" >= ${since}
      AND "workspaceId" = ${selection.workspaceId}
      AND (${selection.projectId}::text IS NULL OR "projectId" = ${selection.projectId})
      AND (${provider}::text IS NULL OR "provider" = ${provider})
      AND (${model}::text IS NULL OR "model" = ${model})
    GROUP BY DATE_TRUNC('day', "createdAt")
    ORDER BY date ASC
  `

  // ── Tag breakdown (if requested) ─────────────────────────
  let tagBreakdown: Array<{ tagValue: string; totalCost: number; totalTokens: number }> = []

  if (tagKey) {
    const tagRows = await db.$queryRaw<Array<{
      tag_value: string
      total_cost: number
      total_tokens: bigint
    }>>`
      SELECT
        tags->>${tagKey} AS tag_value,
        SUM("totalCostUsd") AS total_cost,
        SUM("totalTokens") AS total_tokens
      FROM "LLMEvent"
      WHERE "createdAt" >= ${since}
        AND "workspaceId" = ${selection.workspaceId}
        AND (${selection.projectId}::text IS NULL OR "projectId" = ${selection.projectId})
        AND (${provider}::text IS NULL OR "provider" = ${provider})
        AND (${model}::text IS NULL OR "model" = ${model})
        AND tags->>${tagKey} IS NOT NULL
      GROUP BY tags->>${tagKey}
      ORDER BY total_cost DESC
    `

    tagBreakdown = tagRows.map(row => ({
      tagValue: row.tag_value,
      totalCost: Number(row.total_cost),
      totalTokens: Number(row.total_tokens),
    }))
  }

  // ── Today vs yesterday ───────────────────────────────────
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const [todayStats, yesterdayStats] = await Promise.all([
    db.lLMEvent.aggregate({
      where: { ...scopeWhere, createdAt: { gte: today } },
      _sum: { totalCostUsd: true, totalTokens: true },
      _count: { id: true },
    }),
    db.lLMEvent.aggregate({
      where: { ...scopeWhere, createdAt: { gte: yesterday, lt: today } },
      _sum: { totalCostUsd: true, totalTokens: true },
      _count: { id: true },
    }),
  ])
  const [todayErrors, yesterdayErrors] = await Promise.all([
    db.lLMEvent.aggregate({
      where: { ...scopeWhere, createdAt: { gte: today }, eventType: 'error' },
      _count: { id: true },
    }),
    db.lLMEvent.aggregate({
      where: { ...scopeWhere, createdAt: { gte: yesterday, lt: today }, eventType: 'error' },
      _count: { id: true },
    }),
  ])

    return NextResponse.json({
      overview: {
        totalCostUsd: overview._sum.totalCostUsd ?? 0,
        totalInputTokens: overview._sum.inputTokens ?? 0,
        totalOutputTokens: overview._sum.outputTokens ?? 0,
        totalTokens: overview._sum.totalTokens ?? 0,
        avgLatencyMs: Math.round(overview._avg.latencyMs ?? 0),
        callCount: overview._count.id,
        errorCount: errorOverview?._count?.id ?? 0,
      },
      today: {
        totalCostUsd: todayStats?._sum?.totalCostUsd ?? 0,
        totalTokens: todayStats?._sum?.totalTokens ?? 0,
        callCount: todayStats?._count?.id ?? 0,
        errorCount: todayErrors?._count?.id ?? 0,
      },
      yesterday: {
        totalCostUsd: yesterdayStats?._sum?.totalCostUsd ?? 0,
        totalTokens: yesterdayStats?._sum?.totalTokens ?? 0,
        callCount: yesterdayStats?._count?.id ?? 0,
        errorCount: yesterdayErrors?._count?.id ?? 0,
      },
      byModel: byModel.map(m => ({
        provider: m.provider,
        model: m.model,
        totalCostUsd: m._sum.totalCostUsd ?? 0,
        totalTokens: m._sum.totalTokens ?? 0,
        inputTokens: m._sum.inputTokens ?? 0,
        outputTokens: m._sum.outputTokens ?? 0,
        callCount: m._count.id,
        avgLatencyMs: Math.round(m._avg.latencyMs ?? 0),
      })),
      dailyTrend: dailyTrend.map(d => ({
        date: d.date,
        totalCost: Number(d.total_cost),
        totalTokens: Number(d.total_tokens),
        callCount: Number(d.call_count),
      })),
      tagBreakdown,
      meta: { dataSource: 'raw' },
    })
  } catch (error) {
    console.error('[TokenWatcher] Stats failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

async function getRawSqlRollupStats(input: {
  workspaceId: string
  projectId: string
  since: Date
  provider: string
  model: string
}) {
  const [overview] = await db.$queryRaw<Array<{
    total_cost: number | null
    input_tokens: number | bigint | null
    output_tokens: number | bigint | null
    total_tokens: number | bigint | null
    request_count: number | bigint | null
    error_count: number | bigint | null
    latency_ms: number | bigint | null
  }>>`
    SELECT
      SUM("totalCostUsd") AS total_cost,
      SUM("inputTokens") AS input_tokens,
      SUM("outputTokens") AS output_tokens,
      SUM("totalTokens") AS total_tokens,
      SUM("requestCount") AS request_count,
      SUM("errorCount") AS error_count,
      SUM("totalLatencyMs") AS latency_ms
    FROM "DailyUsageRollup"
    WHERE "workspaceId" = ${input.workspaceId}
      AND "projectId" = ${input.projectId}
      AND "date" >= ${input.since}
      AND "provider" = ${input.provider}
      AND "model" = ${input.model}
  `

  const byModel = await db.$queryRaw<Array<{
    provider: string
    model: string
    total_cost: number | null
    total_tokens: number | bigint | null
    input_tokens: number | bigint | null
    output_tokens: number | bigint | null
    request_count: number | bigint | null
    error_count: number | bigint | null
    latency_ms: number | bigint | null
  }>>`
    SELECT
      "provider",
      "model",
      SUM("totalCostUsd") AS total_cost,
      SUM("totalTokens") AS total_tokens,
      SUM("inputTokens") AS input_tokens,
      SUM("outputTokens") AS output_tokens,
      SUM("requestCount") AS request_count,
      SUM("errorCount") AS error_count,
      SUM("totalLatencyMs") AS latency_ms
    FROM "DailyUsageRollup"
    WHERE "workspaceId" = ${input.workspaceId}
      AND "projectId" = ${input.projectId}
      AND "date" >= ${input.since}
      AND (${input.provider} = ${ROLLUP_ALL} OR "provider" = ${input.provider})
      AND (${input.model} = ${ROLLUP_ALL} OR "model" = ${input.model})
      AND "provider" <> ${ROLLUP_ALL}
      AND "model" <> ${ROLLUP_ALL}
    GROUP BY "provider", "model"
    ORDER BY SUM("totalCostUsd") DESC
  `

  const dailyTrend = await db.$queryRaw<Array<{
    date: Date
    total_cost: number | null
    total_tokens: number | bigint | null
    request_count: number | bigint | null
    error_count: number | bigint | null
  }>>`
    SELECT
      "date",
      SUM("totalCostUsd") AS total_cost,
      SUM("totalTokens") AS total_tokens,
      SUM("requestCount") AS request_count,
      SUM("errorCount") AS error_count
    FROM "DailyUsageRollup"
    WHERE "workspaceId" = ${input.workspaceId}
      AND "projectId" = ${input.projectId}
      AND "date" >= ${input.since}
      AND "provider" = ${input.provider}
      AND "model" = ${input.model}
    GROUP BY "date"
    ORDER BY "date" ASC
  `

  const today = startOfUtcDay(new Date())
  const yesterday = new Date(today)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const [todayStats, yesterdayStats] = await Promise.all([
    rollupDaySummary(input, today),
    rollupDaySummary(input, yesterday),
  ])
  const calls = Number(overview?.request_count ?? 0)

  return {
    overview: {
      totalCostUsd: Number(overview?.total_cost ?? 0),
      totalInputTokens: Number(overview?.input_tokens ?? 0),
      totalOutputTokens: Number(overview?.output_tokens ?? 0),
      totalTokens: Number(overview?.total_tokens ?? 0),
      avgLatencyMs: calls > 0 ? Math.round(Number(overview?.latency_ms ?? 0) / calls) : 0,
      callCount: calls,
      errorCount: Number(overview?.error_count ?? 0),
    },
    today: todayStats,
    yesterday: yesterdayStats,
    byModel: byModel.map(row => {
      const rowCalls = Number(row.request_count ?? 0)
      return {
        provider: row.provider,
        model: row.model,
        totalCostUsd: Number(row.total_cost ?? 0),
        totalTokens: Number(row.total_tokens ?? 0),
        inputTokens: Number(row.input_tokens ?? 0),
        outputTokens: Number(row.output_tokens ?? 0),
        callCount: rowCalls,
        errorCount: Number(row.error_count ?? 0),
        avgLatencyMs: rowCalls > 0 ? Math.round(Number(row.latency_ms ?? 0) / rowCalls) : 0,
      }
    }),
    dailyTrend: dailyTrend.map(row => ({
      date: row.date,
      totalCost: Number(row.total_cost ?? 0),
      totalTokens: Number(row.total_tokens ?? 0),
      callCount: Number(row.request_count ?? 0),
      errorCount: Number(row.error_count ?? 0),
    })),
    tagBreakdown: [],
    meta: { dataSource: 'rollups' },
  }
}

async function rollupDaySummary(input: {
  workspaceId: string
  projectId: string
  provider: string
  model: string
}, date: Date) {
  const [row] = await db.$queryRaw<Array<{
    total_cost: number | null
    total_tokens: number | bigint | null
    request_count: number | bigint | null
    error_count: number | bigint | null
  }>>`
    SELECT
      SUM("totalCostUsd") AS total_cost,
      SUM("totalTokens") AS total_tokens,
      SUM("requestCount") AS request_count,
      SUM("errorCount") AS error_count
    FROM "DailyUsageRollup"
    WHERE "workspaceId" = ${input.workspaceId}
      AND "projectId" = ${input.projectId}
      AND "date" = ${date}
      AND "provider" = ${input.provider}
      AND "model" = ${input.model}
  `

  return {
    totalCostUsd: Number(row?.total_cost ?? 0),
    totalTokens: Number(row?.total_tokens ?? 0),
    callCount: Number(row?.request_count ?? 0),
    errorCount: Number(row?.error_count ?? 0),
  }
}
