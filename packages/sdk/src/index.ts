export { TokenWatcher } from './client'
export type {
  ErrorUsageEvent,
  ManualUsageEvent,
  TokenWatcherOptions,
  TokenWatcherTags,
  TrackOptions,
  TrackStreamOptions,
  UsageExtractionResult,
} from './types'

import { TokenWatcher } from './client'
import type { TokenWatcherOptions, TrackOptions } from './types'

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
