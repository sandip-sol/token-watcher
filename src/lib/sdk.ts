// sdk/src/index.ts
// @tokenwatcher/sdk — Drop-in LLM usage tracking for OpenAI, Anthropic, Google, Ollama

export interface TokenWatcherConfig {
  /** URL of your self-hosted TokenWatcher instance */
  endpoint: string
  /** API key from your TokenWatcher dashboard */
  apiKey: string
  /** Disable tracking (useful for local dev / tests) */
  disabled?: boolean
  /** Log errors to console instead of silently swallowing them */
  debug?: boolean
}

export interface TrackOptions {
  /** LLM provider: "openai" | "anthropic" | "google" | "ollama" | "custom" */
  provider: string
  /** Model name e.g. "gpt-4o", "claude-sonnet-4-20250514" */
  model: string
  /** Arbitrary key-value tags for filtering: feature, userId, env, etc. */
  tags?: Record<string, string>
  /** Optionally store the prompt (disabled by default for privacy) */
  storePrompt?: boolean
}

export interface IngestPayload {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs?: number
  tags?: Record<string, string>
  prompt?: string
  completion?: string
}

// ── Response type helpers ─────────────────────────────────────────────────────

// OpenAI-compatible usage shape
interface OpenAIUsage {
  prompt_tokens?: number
  completion_tokens?: number
  input_tokens?: number
  output_tokens?: number
}

interface WithUsage {
  usage?: OpenAIUsage | null
}

// Anthropic-compatible usage shape
interface AnthropicUsage {
  input_tokens?: number
  output_tokens?: number
}

interface WithAnthropicUsage {
  usage?: AnthropicUsage | null
}

// ── Main SDK class ────────────────────────────────────────────────────────────

export class TokenWatcher {
  private config: TokenWatcherConfig

  constructor(config: TokenWatcherConfig) {
    this.config = config
  }

  /**
   * Wrap any LLM API call to automatically track token usage and cost.
   *
   * @example
   * const response = await tw.track(
   *   () => openai.chat.completions.create({ model: 'gpt-4o', messages }),
   *   { provider: 'openai', model: 'gpt-4o', tags: { feature: 'chat' } }
   * )
   */
  async track<T>(fn: () => Promise<T>, options: TrackOptions): Promise<T> {
    if (this.config.disabled) {
      return fn()
    }

    const start = Date.now()
    let result: T

    try {
      result = await fn()
    } catch (err) {
      // Don't swallow LLM errors — re-throw after logging the failure
      throw err
    }

    const latencyMs = Date.now() - start

    // Extract token usage from common response shapes (fire-and-forget)
    this.extractAndSend(result, latencyMs, options).catch(err => {
      if (this.config.debug) console.error('[TokenWatcher]', err)
    })

    return result
  }

  /**
   * Manually ingest a usage event (useful when you already have token counts).
   */
  async ingest(payload: IngestPayload): Promise<void> {
    if (this.config.disabled) return

    await this.send(payload)
  }

  private async extractAndSend<T>(result: T, latencyMs: number, options: TrackOptions) {
    const payload: IngestPayload = {
      provider: options.provider,
      model: options.model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      tags: options.tags,
    }

    // ── Anthropic response shape ─────────────────────────────
    if (
      result &&
      typeof result === 'object' &&
      (options.provider === 'anthropic' || ('content' in result && 'usage' in result))
    ) {
      const r = result as WithAnthropicUsage
      if (r.usage) {
        payload.inputTokens = r.usage.input_tokens ?? 0
        payload.outputTokens = r.usage.output_tokens ?? 0
      }

      if (options.storePrompt && 'content' in result) {
        const content = (result as { content?: Array<{ text?: string }> }).content
        payload.completion = content?.[0]?.text ?? undefined
      }
    }
    // ── OpenAI response shape ────────────────────────────────
    else if (result && typeof result === 'object' && 'usage' in result) {
      const r = result as WithUsage
      if (r.usage) {
        payload.inputTokens = r.usage.prompt_tokens ?? r.usage.input_tokens ?? 0
        payload.outputTokens = r.usage.completion_tokens ?? r.usage.output_tokens ?? 0
      }

      // Extract prompt/completion text if requested
      if (options.storePrompt && 'choices' in result) {
        const choices = (result as { choices?: Array<{ message?: { content?: string } }> }).choices
        payload.completion = choices?.[0]?.message?.content ?? undefined
      }
    }

    if (payload.inputTokens === 0 && payload.outputTokens === 0) {
      if (this.config.debug) {
        console.warn('[TokenWatcher] Could not extract token counts from response. Use tw.ingest() to manually provide them.')
      }
      return
    }

    await this.send(payload)
  }

  private async send(payload: IngestPayload): Promise<void> {
    const url = `${this.config.endpoint.replace(/\/$/, '')}/api/ingest`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok && this.config.debug) {
      const text = await res.text()
      console.error(`[TokenWatcher] Ingest failed (${res.status}):`, text)
    }
  }
}

// ── Convenience factory ───────────────────────────────────────────────────────

let _defaultInstance: TokenWatcher | null = null

export function createTokenWatcher(config: TokenWatcherConfig): TokenWatcher {
  return new TokenWatcher(config)
}

/**
 * Initialize a global singleton instance.
 * Call this once in your app's entry point.
 */
export function init(config: TokenWatcherConfig): TokenWatcher {
  _defaultInstance = new TokenWatcher(config)
  return _defaultInstance
}

/**
 * Track using the global singleton (call init() first).
 */
export async function track<T>(fn: () => Promise<T>, options: TrackOptions): Promise<T> {
  if (!_defaultInstance) throw new Error('[TokenWatcher] Call init() before using track()')
  return _defaultInstance.track(fn, options)
}

export default TokenWatcher
