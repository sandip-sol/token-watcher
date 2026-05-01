import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/api-auth'
import { sendWebhookAlert, type AlertType } from '@/lib/alerts'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireDashboardAuth(req)
  if (authError) return authError

  try {
    const rule = await prisma.alertRule.findUnique({ where: { id: params.id } })
    if (!rule) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[TokenWatcher] Test alert webhook failed:', error)
    return NextResponse.json({ error: 'Webhook test failed' }, { status: 502 })
  }
}
