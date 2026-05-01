// test-sdk.ts
import { TokenWatcher } from './src/lib/sdk.ts'
import { existsSync, readFileSync } from 'node:fs'

loadDotEnv()

const tw = new TokenWatcher({
  endpoint: process.env.TOKENWATCHER_ENDPOINT ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
  apiKey: process.env.TOKENWATCHER_API_KEY ?? 'tw_dev_key_change_me',
  debug: true,
})

// Simulate a tracked call (no real OpenAI key needed)
await tw.ingest({
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  inputTokens: 1200,
  outputTokens: 400,
  projectSlug: 'default',
  latencyMs: 1100,
  tags: { feature: 'summarizer', env: 'test' },
})

console.log('Event sent! Check your dashboard.')

function loadDotEnv() {
  if (!existsSync('.env')) return

  const lines = readFileSync('.env', 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, '')

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}
