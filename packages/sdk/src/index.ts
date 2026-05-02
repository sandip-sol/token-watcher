export { TokenWatcher } from './client.js'
export type {
  ErrorUsageEvent,
  ManualUsageEvent,
  TokenWatcherOptions,
  TokenWatcherTags,
  TrackOptions,
  TrackStreamOptions,
  UsageExtractionResult,
} from './types.js'

import { TokenWatcher } from './client.js'
import type { TokenWatcherOptions, TrackOptions } from './types.js'

let defaultInstance: TokenWatcher | null = null

export function createTokenWatcher(options: TokenWatcherOptions): TokenWatcher {
  return new TokenWatcher(options)
}

export function init(options: TokenWatcherOptions): TokenWatcher {
  defaultInstance = new TokenWatcher(options)
  return defaultInstance
}

export async function track<T>(fn: () => Promise<T>, options: TrackOptions): Promise<T> {
  if (!defaultInstance) throw new Error('[TokenWatcher] Call init() before using track()')
  return defaultInstance.track(fn, options)
}

export default TokenWatcher
