import { afterEach, describe, expect, it, vi } from 'vitest'
import { TokenWatcher } from '../src/client'
import { extractAnthropicUsage } from '../src/providers/anthropic'
import { extractGeminiUsage } from '../src/providers/gemini'
import { extractOllamaUsage } from '../src/providers/ollama'
import { extractOpenAIUsage } from '../src/providers/openai'
import { sendEvents } from '../src/utils/fetch'

function okResponse(status = 200) {
  return { ok: status >= 200 && status < 300, status } as Response
}

describe('provider usage extraction', () => {
  it('extracts OpenAI token usage shapes', () => {
    expect(extractOpenAIUsage({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })
    expect(extractOpenAIUsage({ usage: { input_tokens: 7, output_tokens: 3 } })).toMatchObject({
      inputTokens: 7,
      outputTokens: 3,
    })
  })

  it('extracts Anthropic token usage', () => {
    expect(extractAnthropicUsage({ usage: { input_tokens: 12, output_tokens: 8 } })).toMatchObject({
      inputTokens: 12,
      outputTokens: 8,
    })
  })

  it('extracts Gemini token usage', () => {
    expect(extractGeminiUsage({
      usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4, totalTokenCount: 13 },
    })).toEqual({
      inputTokens: 9,
      outputTokens: 4,
      totalTokens: 13,
    })
  })

  it('extracts Ollama token usage', () => {
    expect(extractOllamaUsage({ prompt_eval_count: 11, eval_count: 6 })).toMatchObject({
      inputTokens: 11,
      outputTokens: 6,
    })
  })
})

describe('TokenWatcher client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('returns the original response and sends usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const tw = new TokenWatcher({ apiKey: 'tw_live_secret', endpoint: 'http://localhost:3000' })
    const response = { id: 'cmpl_1', usage: { prompt_tokens: 10, completion_tokens: 5 } }

    const result = await tw.track(() => Promise.resolve(response), {
      provider: 'openai',
      model: 'gpt-4o-mini',
      tags: { feature: 'chat' },
    })

    expect(result).toBe(response)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      eventType: 'usage',
      provider: 'openai',
      model: 'gpt-4o-mini',
      inputTokens: 10,
      outputTokens: 5,
    })
  })

  it('supports generic/manual tracking', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const tw = new TokenWatcher({ apiKey: 'tw_live_secret' })

    await tw.trackManual({
      provider: 'custom',
      model: 'local-model',
      inputTokens: 3,
      outputTokens: 4,
    })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      provider: 'custom',
      inputTokens: 3,
      outputTokens: 4,
    })
  })

  it('rethrows the original error and sends a sanitized error event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const tw = new TokenWatcher({ apiKey: 'tw_live_secret', trackErrors: true })
    const original = new Error('bad key tw_live_super_secret_value')

    await expect(tw.track(() => Promise.reject(original), {
      provider: 'openai',
      model: 'gpt-4o',
    })).rejects.toBe(original)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      eventType: 'error',
      status: 'error',
      errorType: 'Error',
      inputTokens: 0,
      outputTokens: 0,
    })
    expect(body.errorMessage).toContain('tw_live_[redacted]')
    expect(body.errorMessage).not.toContain('super_secret')
  })

  it('does not retry 400/401/403 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(401))

    await expect(sendEvents([usageEvent()], {
      apiKey: 'tw_live_secret',
      endpoint: 'http://localhost:3000/api/ingest',
      timeoutMs: 100,
      maxRetries: 2,
      fetchImpl: fetchMock,
    })).rejects.toThrow(/HTTP 401/)

    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('retries retryable responses', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(500))
      .mockResolvedValueOnce(okResponse())

    const promise = sendEvents([usageEvent()], {
      apiKey: 'tw_live_secret',
      endpoint: 'http://localhost:3000/api/ingest',
      timeoutMs: 100,
      maxRetries: 1,
      fetchImpl: fetchMock,
    })

    await vi.advanceTimersByTimeAsync(2000)
    await expect(promise).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('flushes batch events and clears the queue on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const tw = new TokenWatcher({
      apiKey: 'tw_live_secret',
      batch: true,
      maxBatchSize: 2,
      flushIntervalMs: 10_000,
    })

    await tw.trackManual({ provider: 'openai', model: 'gpt-4o', inputTokens: 1, outputTokens: 1 })
    await tw.trackManual({ provider: 'openai', model: 'gpt-4o', inputTokens: 2, outputTokens: 2 })
    await tw.flush()
    await tw.shutdown()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/api/ingest/batch')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).events).toHaveLength(2)
  })

  it('masks API keys in debug logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue(okResponse(500))

    await expect(sendEvents([usageEvent()], {
      apiKey: 'tw_live_abcdef123456789',
      endpoint: 'http://localhost:3000/api/ingest',
      timeoutMs: 100,
      maxRetries: 0,
      debug: true,
      fetchImpl: fetchMock,
    })).rejects.toThrow()

    expect(warn.mock.calls.join(' ')).toContain('tw_live_abcd...masked')
    expect(warn.mock.calls.join(' ')).not.toContain('abcdef123456789')
  })
})

function usageEvent() {
  return {
    eventType: 'usage' as const,
    provider: 'openai',
    model: 'gpt-4o',
    inputTokens: 1,
    outputTokens: 1,
  }
}
