import type { TrackOptions, UsageExtractionResult } from '../types'
import { extractAnthropicUsage } from './anthropic'
import { extractGeminiUsage } from './gemini'
import { extractOllamaUsage } from './ollama'
import { extractOpenAIUsage } from './openai'

export function extractUsage(response: unknown, options: TrackOptions): UsageExtractionResult | null {
  if (Number.isFinite(options.inputTokens) || Number.isFinite(options.outputTokens)) {
    return {
      inputTokens: options.inputTokens ?? 0,
      outputTokens: options.outputTokens ?? 0,
      totalTokens: (options.inputTokens ?? 0) + (options.outputTokens ?? 0),
    }
  }

  const provider = options.provider.toLowerCase()
  const providerExtractor =
    provider === 'openai' ? extractOpenAIUsage :
    provider === 'anthropic' ? extractAnthropicUsage :
    provider === 'gemini' || provider === 'google' ? extractGeminiUsage :
    provider === 'ollama' ? extractOllamaUsage :
    null

  return providerExtractor?.(response)
    ?? extractOpenAIUsage(response)
    ?? extractAnthropicUsage(response)
    ?? extractGeminiUsage(response)
    ?? extractOllamaUsage(response)
}
