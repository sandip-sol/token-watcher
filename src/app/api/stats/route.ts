// src/app/api/stats/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') ?? '30')
  const groupBy = searchParams.get('groupBy') ?? 'day' // 'day' | 'model' | 'provider' | 'tag'
  const tagKey = searchParams.get('tagKey') ?? null

  const safeDays = Math.min(Math.max(1, days), 365)
  const since = new Date()
  since.setDate(since.getDate() - safeDays)

  // ── Overview stats ───────────────────────────────────────
  const overview = await prisma.lLMEvent.aggregate({
    where: { createdAt: { gte: since } },
    _sum: {
      totalCostUsd: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
    },
    _avg: { latencyMs: true },
    _count: { id: true },
  })

  // ── Cost by model ────────────────────────────────────────
  const byModel = await prisma.lLMEvent.groupBy({
    by: ['provider', 'model'],
    where: { createdAt: { gte: since } },
    _sum: { totalCostUsd: true, totalTokens: true, inputTokens: true, outputTokens: true },
    _count: { id: true },
    _avg: { latencyMs: true },
    orderBy: { _sum: { totalCostUsd: 'desc' } },
  })

  // ── Daily cost trend (raw SQL for date truncation) ───────
  const dailyTrend = await prisma.$queryRaw<Array<{
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
    GROUP BY DATE_TRUNC('day', "createdAt")
    ORDER BY date ASC
  `

  // ── Tag breakdown (if requested) ─────────────────────────
  let tagBreakdown: Array<{ tagValue: string; totalCost: number; totalTokens: number }> = []

  if (tagKey) {
    const tagRows = await prisma.$queryRaw<Array<{
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
    prisma.lLMEvent.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { totalCostUsd: true, totalTokens: true },
      _count: { id: true },
    }),
    prisma.lLMEvent.aggregate({
      where: { createdAt: { gte: yesterday, lt: today } },
      _sum: { totalCostUsd: true, totalTokens: true },
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
    },
    today: {
      totalCostUsd: todayStats._sum.totalCostUsd ?? 0,
      totalTokens: todayStats._sum.totalTokens ?? 0,
      callCount: todayStats._count.id,
    },
    yesterday: {
      totalCostUsd: yesterdayStats._sum.totalCostUsd ?? 0,
      totalTokens: yesterdayStats._sum.totalTokens ?? 0,
      callCount: yesterdayStats._count.id,
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
  })
}
