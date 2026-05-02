import type { UsageExtractionResult } from '../types.js'
import { numberOrUndefined } from '../utils/tokens.js'

export function extractAnthropicUsage(response: unknown): UsageExtractionResult | null {
  const usage = response && typeof response === 'object' ? (response as { usage?: unknown }).usage : null
  if (!usage || typeof usage !== 'object') return null

  const values = usage as Record<string, unknown>
  const inputTokens = numberOrUndefined(values.input_tokens)
  const outputTokens = numberOrUndefined(values.output_tokens)

  if (inputTokens === undefined && outputTokens === undefined) return null

  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0),
  }
}
