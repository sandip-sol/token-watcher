import type { UsageExtractionResult } from '../types'
import { numberOrUndefined } from '../utils/tokens'

export function extractGeminiUsage(response: unknown): UsageExtractionResult | null {
  const usage = response && typeof response === 'object'
    ? (response as { usageMetadata?: unknown }).usageMetadata
    : null
  if (!usage || typeof usage !== 'object') return null

  const values = usage as Record<string, unknown>
  const inputTokens = numberOrUndefined(values.promptTokenCount)
  const outputTokens = numberOrUndefined(values.candidatesTokenCount)
  const totalTokens = numberOrUndefined(values.totalTokenCount)

  if (inputTokens === undefined && outputTokens === undefined) return null

  return {
    inputTokens: inputTokens ?? Math.max(0, (totalTokens ?? 0) - (outputTokens ?? 0)),
    outputTokens: outputTokens ?? Math.max(0, (totalTokens ?? 0) - (inputTokens ?? 0)),
    totalTokens,
  }
}
