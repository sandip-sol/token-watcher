import { z } from 'zod'
import { ALERT_TYPES, assertSafeWebhookUrl } from '@/server/alerts/service'

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform(value => value || null)

const optionalNullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform(value => (value === undefined ? undefined : value || null))

const nullableWebhookUrl = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform(value => value || null)
  .refine(value => {
    if (!value) return true
    try {
      assertSafeWebhookUrl(value)
      return true
    } catch {
      return false
    }
  }, 'Invalid webhook URL')

const optionalNullableWebhookUrl = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform(value => (value === undefined ? undefined : value || null))
  .refine(value => {
    if (!value) return true
    try {
      assertSafeWebhookUrl(value)
      return true
    } catch {
      return false
    }
  }, 'Invalid webhook URL')

export const CreateAlertRuleSchema = z
  .object({
    workspaceId: z.string().trim().min(1).max(100),
    projectId: z.string().trim().max(100).optional().nullable().transform(value => value || null),
    name: z.string().trim().min(1).max(100),
    type: z.enum(ALERT_TYPES),
    threshold: z.number().finite().positive(),
    provider: nullableText(50),
    model: nullableText(100),
    webhookUrl: nullableWebhookUrl,
    isActive: z.boolean().optional().default(true),
  })
  .refine(value => value.type !== 'model_daily_cost' || Boolean(value.model), {
    message: 'model is required for model_daily_cost alerts',
    path: ['model'],
  })

export const UpdateAlertRuleSchema = z
  .object({
    workspaceId: z.string().trim().min(1).max(100).optional(),
    projectId: optionalNullableText(100),
    name: z.string().trim().min(1).max(100).optional(),
    type: z.enum(ALERT_TYPES).optional(),
    threshold: z.number().finite().positive().optional(),
    provider: optionalNullableText(50),
    model: optionalNullableText(100),
    webhookUrl: optionalNullableWebhookUrl,
    isActive: z.boolean().optional(),
  })
  .refine(value => value.type !== 'model_daily_cost' || Boolean(value.model), {
    message: 'model is required for model_daily_cost alerts',
    path: ['model'],
  })
