// src/app/api/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { calculateCost } from '@/lib/pricing'
import { validateApiKey } from '@/lib/auth'

const IngestSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  latencyMs: z.number().int().min(0).optional(),
  tags: z.record(z.string()).optional().default({}),
  // Optional: store prompt/completion for debugging
  prompt: z.string().optional(),
  completion: z.string().optional(),
  // Optional: override cost if you already calculated it
  totalCostUsd: z.number().optional(),
})

export async function POST(req: NextRequest) {
  // API key auth
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
  }

  const apiKey = authHeader.slice(7)
  const valid = await validateApiKey(apiKey)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  // Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = IngestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const data = parsed.data
  const totalTokens = data.inputTokens + data.outputTokens

  // Calculate cost
  const cost = calculateCost(data.provider, data.model, data.inputTokens, data.outputTokens)

  // Store event
  const event = await prisma.lLMEvent.create({
    data: {
      provider: data.provider,
      model: data.model,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens,
      inputCostUsd: cost.inputCostUsd,
      outputCostUsd: cost.outputCostUsd,
      totalCostUsd: data.totalCostUsd ?? cost.totalCostUsd,
      latencyMs: data.latencyMs,
      tags: data.tags,
      prompt: data.prompt,
      completion: data.completion,
    },
  })

  // Fire alert check asynchronously (don't block the response)
  checkAlerts(data.provider, data.model, data.tags).catch(console.error)

  return NextResponse.json({
    success: true,
    eventId: event.id,
    cost: {
      inputCostUsd: cost.inputCostUsd,
      outputCostUsd: cost.outputCostUsd,
      totalCostUsd: cost.totalCostUsd,
    },
  })
}

// Lightweight alert check — runs async after response is sent
async function checkAlerts(provider: string, model: string, tags: Record<string, string>) {
  const alerts = await prisma.alertRule.findMany({
    where: { enabled: true },
  })

  if (alerts.length === 0) return

  const now = new Date()

  for (const alert of alerts) {
    // Skip if triggered recently (cooldown: 1 hour)
    if (alert.lastTriggeredAt) {
      const msSince = now.getTime() - alert.lastTriggeredAt.getTime()
      if (msSince < 60 * 60 * 1000) continue
    }

    // Apply filters
    if (alert.provider && alert.provider !== provider) continue
    if (alert.model && alert.model !== model) continue
    if (alert.tagKey && tags[alert.tagKey] !== alert.tagValue) continue

    // Calculate metric in window
    const windowStart = new Date(now.getTime() - alert.windowHours * 60 * 60 * 1000)

    let metricValue = 0

    if (alert.metricType === 'daily_cost' || alert.metricType === 'hourly_cost') {
      const agg = await prisma.lLMEvent.aggregate({
        where: {
          createdAt: { gte: windowStart },
          ...(alert.provider ? { provider: alert.provider } : {}),
          ...(alert.model ? { model: alert.model } : {}),
        },
        _sum: { totalCostUsd: true },
      })
      metricValue = agg._sum.totalCostUsd ?? 0
    } else if (alert.metricType === 'total_tokens') {
      const agg = await prisma.lLMEvent.aggregate({
        where: {
          createdAt: { gte: windowStart },
          ...(alert.provider ? { provider: alert.provider } : {}),
          ...(alert.model ? { model: alert.model } : {}),
        },
        _sum: { totalTokens: true },
      })
      metricValue = agg._sum.totalTokens ?? 0
    }

    if (metricValue >= alert.threshold) {
      await fireAlert(alert, metricValue)
      await prisma.alertRule.update({
        where: { id: alert.id },
        data: { lastTriggeredAt: now },
      })
    }
  }
}

async function fireAlert(alert: { name: string; slackWebhook?: string | null; webhookUrl?: string | null; metricType: string; threshold: number; windowHours: number }, value: number) {
  const message = `🚨 TokenWatcher Alert: "${alert.name}"\n${alert.metricType} = ${value.toFixed(4)} exceeded threshold ${alert.threshold} in the last ${alert.windowHours}h`

  if (alert.slackWebhook) {
    await fetch(alert.slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    }).catch(console.error)
  }

  if (alert.webhookUrl) {
    await fetch(alert.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert: alert.name, metricType: alert.metricType, value, threshold: alert.threshold }),
    }).catch(console.error)
  }
}
