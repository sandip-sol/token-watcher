const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])

export function shouldRetryStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status)
}

export function backoffDelayMs(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 10_000)
  const jitter = Math.floor(Math.random() * 250)
  return base + jitter
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
