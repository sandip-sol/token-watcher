import type { TrackOptions, UsageExtractionResult } from '../types.js'
import { extractAnthropicUsage } from './anthropic.js'
import { extractGeminiUsage } from './gemini.js'
import { extractOllamaUsage } from './ollama.js'
import { extractOpenAIUsage } from './openai.js'

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
