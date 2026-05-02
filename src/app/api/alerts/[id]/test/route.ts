import { NextRequest } from 'next/server'
import { requireDashboardWrite } from '@/server/auth/dashboard-api'
import { sendWebhookAlert, type AlertType } from '@/server/alerts/service'
import { prisma } from '@/lib/prisma'
import { jsonError, jsonOk, notFound } from '@/server/security/errors'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardWrite(req)
  if (authError) return authError

  try {
    const rule = await prisma.alertRule.findUnique({ where: { id: params.id } })
    if (!rule) {
      return notFound()
    }

    await sendWebhookAlert(rule, {
      alertId: rule.id,
      alertName: rule.name,
      type: rule.type as AlertType,
      threshold: rule.threshold,
      value: rule.threshold,
      provider: rule.provider,
      model: rule.model,
      workspaceId: rule.workspaceId,
      projectId: rule.projectId,
      triggered: true,
      skippedByCooldown: false,
      triggeredAt: new Date(),
    })

    return jsonOk({ success: true })
  } catch (error) {
    console.error('[TokenWatcher] Test alert webhook failed:', error instanceof Error ? error.message : 'Unknown error')
    return jsonError(502, 'WEBHOOK_TEST_FAILED', 'Webhook test failed')
  }
}
