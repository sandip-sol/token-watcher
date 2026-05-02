type RateLimitBucket = {
  count: number
  resetAt: number
}

type RateLimitResult = {
  allowed: boolean
}

const buckets = new Map<string, RateLimitBucket>()

export function isIngestRateLimitEnabled(): boolean {
  return process.env.INGEST_RATE_LIMIT_ENABLED !== 'false'
}

export function checkIngestRateLimit(identity: string): RateLimitResult {
  if (!isIngestRateLimitEnabled()) return { allowed: true }

  const windowSeconds = getPositiveInteger(process.env.INGEST_RATE_LIMIT_WINDOW_SECONDS, 60)
  const maxRequests = getPositiveInteger(process.env.INGEST_RATE_LIMIT_MAX_REQUESTS, 120)
  const now = Date.now()
  const resetAt = now + windowSeconds * 1000
  const bucket = buckets.get(identity)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(identity, { count: 1, resetAt })
    cleanupExpiredBuckets(now)
    return { allowed: true }
  }

  if (bucket.count >= maxRequests) {
    return { allowed: false }
  }

  bucket.count += 1
  return { allowed: true }
}

export function resetIngestRateLimit() {
  buckets.clear()
}

function cleanupExpiredBuckets(now: number) {
  if (buckets.size < 1000) return

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

function getPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return parsed
}
