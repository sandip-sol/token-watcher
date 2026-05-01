export type TokenWatcherTagValue = string | number | boolean | null
export type TokenWatcherTags = Record<string, TokenWatcherTagValue>

export interface TokenWatcherOptions {
  apiKey: string
  endpoint?: string
  projectId?: string
  projectSlug?: string
  environment?: string
  defaultTags?: TokenWatcherTags
  debug?: boolean
  timeoutMs?: number
  maxRetries?: number
  batch?: boolean
  flushIntervalMs?: number
  maxBatchSize?: number
  trackErrors?: boolean
  disabled?: boolean
}

export interface TrackOptions {
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama' | string
  model: string
  projectId?: string
  projectSlug?: string
  requestId?: string
  userId?: string
  tags?: TokenWatcherTags
  storePrompt?: boolean
  prompt?: string
  completion?: string
  metadata?: Record<string, unknown>
  inputTokens?: number
  outputTokens?: number
}

export interface UsageExtractionResult {
  inputTokens: number
  outputTokens: number
  totalTokens?: number
  latencyMs?: number
}

export interface ManualUsageEvent {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs?: number
  projectId?: string
  projectSlug?: string
  requestId?: string
  userId?: string
  tags?: TokenWatcherTags
  metadata?: Record<string, unknown>
  prompt?: string
  completion?: string
}

export interface ErrorUsageEvent {
  provider: string
  model: string
  errorType: string
  errorMessage?: string
  latencyMs?: number
  projectId?: string
  projectSlug?: string
  requestId?: string
  userId?: string
  tags?: TokenWatcherTags
  metadata?: Record<string, unknown>
}

export interface TrackStreamOptions extends TrackOptions {
  estimatedInputTokens?: number
  estimatedOutputTokens?: number
  onUsageFinal?: (usage: UsageExtractionResult) => void | Promise<void>
}

export type IngestUsagePayload = ManualUsageEvent & {
  eventType: 'usage'
}

export type IngestErrorPayload = ErrorUsageEvent & {
  eventType: 'error'
  status: 'error'
  inputTokens: 0
  outputTokens: 0
}

export type IngestPayload = IngestUsagePayload | IngestErrorPayload

export interface SendOptions {
  apiKey: string
  endpoint: string
  timeoutMs: number
  maxRetries: number
  debug?: boolean
  fetchImpl?: typeof fetch
}
