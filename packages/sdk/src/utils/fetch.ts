import type { IngestPayload, SendOptions } from '../types'
import { backoffDelayMs, shouldRetryStatus, sleep } from './retry'

export class TokenWatcherSendError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'TokenWatcherSendError'
    this.status = status
  }
}

export async function sendEvents(events: IngestPayload[], options: SendOptions): Promise<void> {
  const endpoint = events.length === 1 ? options.endpoint : getBatchEndpoint(options.endpoint)
  const body = events.length === 1 ? JSON.stringify(events[0]) : JSON.stringify({ events })
  const maskedKey = maskApiKey(options.apiKey)

  let lastError: unknown

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body,
      }, options.timeoutMs, options.fetchImpl)

      if (response.ok) return

      if (!shouldRetryStatus(response.status)) {
        throw new TokenWatcherSendError(`TokenWatcher ingest failed with HTTP ${response.status}`, response.status)
      }

      lastError = new TokenWatcherSendError(`TokenWatcher ingest failed with HTTP ${response.status}`, response.status)
    } catch (error) {
      if (error instanceof TokenWatcherSendError && error.status && !shouldRetryStatus(error.status)) {
        if (options.debug) console.warn(`[TokenWatcher] ingest rejected for key ${maskedKey}: ${error.message}`)
        throw error
      }

      lastError = error
    }

    if (attempt < options.maxRetries) {
      await sleep(backoffDelayMs(attempt))
    }
  }

  if (options.debug) {
    const message = lastError instanceof Error ? lastError.message : 'Unknown send failure'
    console.warn(`[TokenWatcher] dropped ${events.length} event(s) after retries for key ${maskedKey}: ${message}`)
  }

  throw lastError instanceof Error ? lastError : new TokenWatcherSendError('TokenWatcher ingest failed')
}

export function normalizeEndpoint(endpoint?: string): string {
  const value = (endpoint || 'http://localhost:3000/api/ingest').replace(/\/$/, '')
  return value.endsWith('/api/ingest') ? value : `${value}/api/ingest`
}

export function getBatchEndpoint(endpoint: string): string {
  return endpoint.replace(/\/api\/ingest$/, '/api/ingest/batch')
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 12) return `${apiKey.slice(0, 4)}...masked`
  return `${apiKey.slice(0, 12)}...masked`
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}
