import type { UsageExtractionResult } from '../types.js'
import { numberOrUndefined } from '../utils/tokens.js'

export function extractOllamaUsage(response: unknown): UsageExtractionResult | null {
  if (!response || typeof response !== 'object') return null

  const values = response as Record<string, unknown>
  const inputTokens = numberOrUndefined(values.prompt_eval_count)
  const outputTokens = numberOrUndefined(values.eval_count)

  if (inputTokens === undefined && outputTokens === undefined) return null

  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0),
  }
}
