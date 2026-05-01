import type { UsageExtractionResult } from '../types'
import { numberOrUndefined } from '../utils/tokens'

export function extractOpenAIUsage(response: unknown): UsageExtractionResult | null {
  const usage = response && typeof response === 'object' ? (response as { usage?: unknown }).usage : null
  if (!usage || typeof usage !== 'object') return null

  const values = usage as Record<string, unknown>
  const inputTokens = numberOrUndefined(values.prompt_tokens) ?? numberOrUndefined(values.input_tokens)
  const outputTokens = numberOrUndefined(values.completion_tokens) ?? numberOrUndefined(values.output_tokens)
  const totalTokens = numberOrUndefined(values.total_tokens)

  if (inputTokens === undefined && outputTokens === undefined) return null

  return {
    inputTokens: inputTokens ?? Math.max(0, (totalTokens ?? 0) - (outputTokens ?? 0)),
    outputTokens: outputTokens ?? Math.max(0, (totalTokens ?? 0) - (inputTokens ?? 0)),
    totalTokens,
  }
}
