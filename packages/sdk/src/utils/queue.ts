import type { IngestPayload, SendOptions } from '../types.js'
import { sendEvents } from './fetch.js'

export class EventQueue {
  private events: IngestPayload[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private flushing: Promise<void> | null = null

  constructor(
    private readonly options: SendOptions & {
      flushIntervalMs: number
      maxBatchSize: number
    }
  ) {
    this.timer = setInterval(() => {
      this.flush().catch(() => {})
    }, options.flushIntervalMs)
    this.timer.unref?.()
  }

  enqueue(event: IngestPayload): Promise<void> {
    this.events.push(event)
    if (this.events.length >= this.options.maxBatchSize) {
      return this.flush()
    }
    return Promise.resolve()
  }

  async flush(): Promise<void> {
    if (this.flushing) return this.flushing
    if (this.events.length === 0) return

    const batch = this.events.splice(0, this.options.maxBatchSize)
    this.flushing = sendEvents(batch, this.options)
      .catch(error => {
        if (this.options.debug) {
          const message = error instanceof Error ? error.message : 'Unknown batch failure'
          console.warn(`[TokenWatcher] batch flush failed; dropping ${batch.length} event(s): ${message}`)
        }
      })
      .finally(() => {
        this.flushing = null
      })

    await this.flushing
  }

  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    await this.flush()
  }

  size(): number {
    return this.events.length
  }
}
