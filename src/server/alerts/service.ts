import type { AlertRule } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ROLLUP_ALL } from '@/server/rollups/service'
import { startOfUtcDay, startOfUtcMonth } from '@/server/time/utc'

const db = prisma as any

export const ALERT_TYPES = ['daily_cost', 'monthly_cost', 'daily_tokens', 'model_daily_cost'] as const

export type AlertType = (typeof ALERT_TYPES)[number]

export type AlertEvaluationResult = {
  alertId: string
  alertName: string
  type: AlertType
  threshold: number
  value: number
  provider?: string | null
  model?: string | null
  workspaceId: string
  projectId?: string | null
  triggered: boolean
  skippedByCooldown: boolean
  triggeredAt: Date
}

export async function evaluateAlerts(context: { workspaceId?: string; projectId?: string | null } = {}): Promise<void> {
  const rules = await prisma.alertRule.findMany({
    where: {
      isActive: true,
      ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
      ...(context.projectId
        ? { OR: [{ projectId: null }, { projectId: context.projectId }] }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
  })

  for (const rule of rules) {
    try {
      await evaluateAlertRule(rule)
    } catch (error) {
      console.error('[TokenWatcher] Alert evaluation failed:', {
        alertRuleId: rule.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}

export async function evaluateAlertRule(rule: AlertRule): Promise<AlertEvaluationResult> {
  const now = new Date()
  const type = normalizeAlertType(rule.type)
  const value = await calculateAlertValue(rule, type, now)
  const triggered = rule.isActive && value >= rule.threshold
  const skippedByCooldown = triggered && isInCooldown(rule.lastTriggeredAt, now)

  const result: AlertEvaluationResult = {
    alertId: rule.id,
    alertName: rule.name,
    type,
    threshold: rule.threshold,
    value,
    provider: rule.provider,
    model: rule.model,
    workspaceId: rule.workspaceId,
    projectId: rule.projectId,
    triggered,
    skippedByCooldown,
    triggeredAt: now,
  }

  if (!triggered || skippedByCooldown) return result

  try {
    await sendWebhookAlert(rule, result)
    await prisma.alertHistory.create({
      data: {
        alertRuleId: rule.id,
        workspaceId: rule.workspaceId,
        projectId: rule.projectId,
        type,
        value,
        threshold: rule.threshold,
        status: 'success',
        message: rule.webhookUrl
          ? `Alert "${rule.name}" delivered to webhook.`
          : `Alert "${rule.name}" triggered. No webhook URL is configured.`,
      },
    })
    await prisma.alertRule.update({
      where: { id: rule.id },
      data: { lastTriggeredAt: now },
    })
  } catch (error) {
    await prisma.alertHistory.create({
      data: {
        alertRuleId: rule.id,
        workspaceId: rule.workspaceId,
        projectId: rule.projectId,
        type,
        value,
        threshold: rule.threshold,
        status: 'failed',
        message: `Alert "${rule.name}" triggered but webhook delivery failed.`,
        error: truncateError(error),
      },
    })
  }

  return result
}

export async function sendWebhookAlert(rule: AlertRule, result: AlertEvaluationResult): Promise<void> {
  if (!rule.webhookUrl) return
  assertSafeWebhookUrl(rule.webhookUrl)

  // TODO: Add queued retries with backoff once TokenWatcher has a background worker.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), getWebhookTimeoutMs())

  try {
    const response = await fetch(rule.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'tokenwatcher.alert.triggered',
        alertId: rule.id,
        alertName: rule.name,
        type: result.type,
        threshold: rule.threshold,
        value: result.value,
        provider: rule.provider,
        model: rule.model,
        workspaceId: rule.workspaceId,
        projectId: rule.projectId,
        triggeredAt: result.triggeredAt.toISOString(),
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Webhook returned HTTP ${response.status}`)
    }
  } finally {
    clearTimeout(timeout)
  }
}

export function assertSafeWebhookUrl(value: string): void {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new Error('Invalid webhook URL')
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Webhook URL must use http or https')
  }

  // TODO: Resolve DNS before delivery and block private/link-local targets even
  // when they are reached through a public-looking hostname.
  if (process.env.NODE_ENV === 'production' && isLocalOrPrivateHostname(url.hostname)) {
    throw new Error('Webhook URL points to a private or local address')
  }
}

function normalizeAlertType(type: string): AlertType {
  if ((ALERT_TYPES as readonly string[]).includes(type)) return type as AlertType
  return 'daily_cost'
}

async function calculateAlertValue(rule: AlertRule, type: AlertType, now: Date): Promise<number> {
  if (process.env.ALERT_USE_ROLLUPS === 'true') {
    const value = await calculateAlertValueFromRollups(rule, type, now)
    if (value !== null) return value
  }

  if (type === 'daily_tokens') {
    const aggregate = await db.lLMEvent.aggregate({
      where: {
        createdAt: { gte: startOfUtcDay(now), lte: now },
        workspaceId: rule.workspaceId,
        eventType: 'usage',
        ...(rule.projectId ? { projectId: rule.projectId } : {}),
        ...(rule.provider ? { provider: rule.provider } : {}),
        ...(rule.model ? { model: rule.model } : {}),
      },
      _sum: { totalTokens: true },
    })

    return aggregate._sum.totalTokens ?? 0
  }

  const start = type === 'monthly_cost' ? startOfUtcMonth(now) : startOfUtcDay(now)
  const aggregate = await db.lLMEvent.aggregate({
    where: {
      createdAt: { gte: start, lte: now },
      workspaceId: rule.workspaceId,
      eventType: 'usage',
      ...(rule.projectId ? { projectId: rule.projectId } : {}),
      ...(rule.provider ? { provider: rule.provider } : {}),
      ...(type === 'model_daily_cost' && rule.model ? { model: rule.model } : {}),
      ...(type !== 'model_daily_cost' && rule.model ? { model: rule.model } : {}),
    },
    _sum: { totalCostUsd: true },
  })

  return aggregate._sum.totalCostUsd ?? 0
}

async function calculateAlertValueFromRollups(rule: AlertRule, type: AlertType, now: Date): Promise<number | null> {
  if (rule.model && !rule.provider) return null

  const start = type === 'monthly_cost' ? startOfUtcMonth(now) : startOfUtcDay(now)

  try {
    if (!db.dailyUsageRollup) {
      const metricSql = type === 'daily_tokens'
        ? Prisma.sql`SUM("totalTokens")`
        : Prisma.sql`SUM("totalCostUsd")`
      const [row] = await db.$queryRaw<Array<{ total: number | bigint | null }>>`
        SELECT ${metricSql} AS total
        FROM "DailyUsageRollup"
        WHERE "workspaceId" = ${rule.workspaceId}
          AND "projectId" = ${rule.projectId ?? ROLLUP_ALL}
          AND "date" >= ${start}
          AND "date" <= ${startOfUtcDay(now)}
          AND "provider" = ${rule.provider ?? ROLLUP_ALL}
          AND "model" = ${rule.model ?? ROLLUP_ALL}
      `

      return Number(row?.total ?? 0)
    }

    const aggregate = await db.dailyUsageRollup.aggregate({
      where: {
        workspaceId: rule.workspaceId,
        projectId: rule.projectId ?? ROLLUP_ALL,
        date: { gte: start, lte: startOfUtcDay(now) },
        provider: rule.provider ?? ROLLUP_ALL,
        model: rule.model ?? ROLLUP_ALL,
      },
      _sum: type === 'daily_tokens'
        ? { totalTokens: true }
        : { totalCostUsd: true },
    })

    if (type === 'daily_tokens') return aggregate._sum.totalTokens ?? 0
    return aggregate._sum.totalCostUsd ?? 0
  } catch (error) {
    console.error('[TokenWatcher] Alert rollup lookup failed:', {
      alertRuleId: rule.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}

function isInCooldown(lastTriggeredAt: Date | null, now: Date): boolean {
  if (!lastTriggeredAt) return false

  return now.getTime() - lastTriggeredAt.getTime() < getAlertCooldownMinutes() * 60 * 1000
}

function getAlertCooldownMinutes(): number {
  const parsed = Number(process.env.ALERT_COOLDOWN_MINUTES || '60')
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60
}

function getWebhookTimeoutMs(): number {
  const parsed = Number(process.env.ALERT_WEBHOOK_TIMEOUT_MS || '5000')
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000
}

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error'
  return message.slice(0, 500)
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true

  const parts = normalized.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const [a, b] = parts
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  )
}
