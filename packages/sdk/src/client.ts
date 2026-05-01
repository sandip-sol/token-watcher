import type {
  ErrorUsageEvent,
  IngestPayload,
  ManualUsageEvent,
  TokenWatcherOptions,
  TokenWatcherTags,
  TrackOptions,
  TrackStreamOptions,
} from './types'
import { extractUsage } from './providers/generic'
import { EventQueue } from './utils/queue'
import { normalizeEndpoint, sendEvents } from './utils/fetch'

const DEFAULTS = {
  endpoint: 'http://localhost:3000/api/ingest',
  timeoutMs: 5000,
  maxRetries: 2,
  batch: false,
  flushIntervalMs: 5000,
  maxBatchSize: 20,
  trackErrors: true,
}

export class TokenWatcher {
  private readonly options: Required<Omit<TokenWatcherOptions, 'projectId' | 'projectSlug' | 'environment' | 'defaultTags'>> &
    Pick<TokenWatcherOptions, 'projectId' | 'projectSlug' | 'environment' | 'defaultTags'>
  private readonly queue: EventQueue | null

  constructor(options: TokenWatcherOptions) {
    if (!options.apiKey && !options.disabled) {
      throw new Error('[TokenWatcher] apiKey is required')
    }

    this.options = {
      apiKey: options.apiKey,
      endpoint: normalizeEndpoint(options.endpoint ?? DEFAULTS.endpoint),
      projectId: options.projectId,
      projectSlug: options.projectSlug,
      environment: options.environment,
      defaultTags: options.defaultTags,
      debug: options.debug ?? false,
      timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
      maxRetries: options.maxRetries ?? DEFAULTS.maxRetries,
      batch: options.batch ?? DEFAULTS.batch,
      flushIntervalMs: options.flushIntervalMs ?? DEFAULTS.flushIntervalMs,
      maxBatchSize: options.maxBatchSize ?? DEFAULTS.maxBatchSize,
      trackErrors: options.trackErrors ?? DEFAULTS.trackErrors,
      disabled: options.disabled ?? false,
    }

    this.queue = this.options.batch
      ? new EventQueue({
          apiKey: this.options.apiKey,
          endpoint: this.options.endpoint,
          timeoutMs: this.options.timeoutMs,
          maxRetries: this.options.maxRetries,
          debug: this.options.debug,
          flushIntervalMs: this.options.flushIntervalMs,
          maxBatchSize: this.options.maxBatchSize,
        })
      : null
  }

  async track<T>(fn: () => Promise<T>, options: TrackOptions): Promise<T> {
    if (this.options.disabled) return fn()

    const startedAt = Date.now()

    try {
      const result = await fn()
      const latencyMs = Date.now() - startedAt
      const usage = extractUsage(result, options)

      if (!usage) {
        if (this.options.debug) {
          console.warn('[TokenWatcher] Could not extract token counts from response. Use trackManual() for this call.')
        }
        return result
      }

      await this.trackManual({
        ...this.baseEventFields(options),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        latencyMs: usage.latencyMs ?? latencyMs,
        prompt: options.storePrompt ? options.prompt : undefined,
        completion: options.storePrompt ? options.completion : undefined,
      })

      return result
    } catch (error) {
      const latencyMs = Date.now() - startedAt

      if (this.options.trackErrors) {
        await this.trackError({
          ...this.baseEventFields(options),
          errorType: getErrorType(error),
          errorMessage: sanitizeErrorMessage(error),
          latencyMs,
        }).catch(sendError => {
          if (this.options.debug) {
            const message = sendError instanceof Error ? sendError.message : 'Unknown error tracking failure'
            console.warn(`[TokenWatcher] failed to track error event: ${message}`)
          }
        })
      }

      throw error
    }
  }

  async trackManual(event: ManualUsageEvent): Promise<void> {
    if (this.options.disabled) return

    await this.enqueueOrSend({
      eventType: 'usage',
      ...this.withDefaults(event),
      inputTokens: Math.max(0, Math.round(event.inputTokens)),
      outputTokens: Math.max(0, Math.round(event.outputTokens)),
    })
  }

  async ingest(event: ManualUsageEvent): Promise<void> {
    await this.trackManual(event)
  }

  async trackError(errorEvent: ErrorUsageEvent): Promise<void> {
    if (this.options.disabled) return

    await this.enqueueOrSend({
      eventType: 'error',
      status: 'error',
      ...this.withDefaults(errorEvent),
      errorType: errorEvent.errorType.slice(0, 120),
      errorMessage: errorEvent.errorMessage ? sanitizePlainMessage(errorEvent.errorMessage) : undefined,
      inputTokens: 0,
      outputTokens: 0,
    })
  }

  async trackStream<T>(fn: () => Promise<T>, options: TrackStreamOptions): Promise<T> {
    const startedAt = Date.now()
    const result = await this.track(fn, {
      ...options,
      inputTokens: options.inputTokens ?? options.estimatedInputTokens,
      outputTokens: options.outputTokens ?? options.estimatedOutputTokens,
    })

    if (options.onUsageFinal && (options.estimatedInputTokens !== undefined || options.estimatedOutputTokens !== undefined)) {
      await options.onUsageFinal({
        inputTokens: options.estimatedInputTokens ?? 0,
        outputTokens: options.estimatedOutputTokens ?? 0,
        latencyMs: Date.now() - startedAt,
      })
    }

    return result
  }

  async flush(): Promise<void> {
    await this.queue?.flush()
  }

  async shutdown(): Promise<void> {
    await this.queue?.shutdown()
  }

  private async enqueueOrSend(event: IngestPayload): Promise<void> {
    if (this.queue) {
      await this.queue.enqueue(event)
      return
    }

    await sendEvents([event], {
      apiKey: this.options.apiKey,
      endpoint: this.options.endpoint,
      timeoutMs: this.options.timeoutMs,
      maxRetries: this.options.maxRetries,
      debug: this.options.debug,
    })
  }

  private baseEventFields(options: TrackOptions) {
    return {
      provider: options.provider,
      model: options.model,
      projectId: options.projectId,
      projectSlug: options.projectSlug,
      requestId: options.requestId,
      userId: options.userId,
      tags: options.tags,
      metadata: options.metadata,
    }
  }

  private withDefaults<T extends { projectId?: string; projectSlug?: string; tags?: TokenWatcherTags }>(event: T): T {
    return {
      ...event,
      projectId: event.projectId ?? this.options.projectId,
      projectSlug: event.projectSlug ?? this.options.projectSlug,
      tags: {
        ...(this.options.environment ? { environment: this.options.environment } : {}),
        ...(this.options.defaultTags ?? {}),
        ...(event.tags ?? {}),
      },
    }
  }
}

function getErrorType(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
    return error.name.slice(0, 120)
  }

  return 'Error'
}

function sanitizeErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return sanitizePlainMessage(error.message)
  if (typeof error === 'string') return sanitizePlainMessage(error)
  return undefined
}

function sanitizePlainMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/tw_(live|test|dev)_[A-Za-z0-9._~+/=-]+/g, 'tw_$1_[redacted]')
    .slice(0, 1000)
}
