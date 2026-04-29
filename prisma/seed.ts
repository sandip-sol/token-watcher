// prisma/seed.ts
// Run with: npm run db:seed

import { PrismaClient } from '@prisma/client'
import { calculateCost } from '../src/lib/pricing'

const prisma = new PrismaClient()

const SAMPLE_MODELS = [
  { provider: 'openai', model: 'gpt-4o', inputBase: 800, outputBase: 300 },
  { provider: 'openai', model: 'gpt-4o-mini', inputBase: 400, outputBase: 150 },
  { provider: 'anthropic', model: 'claude-sonnet-4-6', inputBase: 600, outputBase: 250 },
  { provider: 'google', model: 'gemini-1.5-flash', inputBase: 500, outputBase: 200 },
  { provider: 'ollama', model: 'llama3.1', inputBase: 300, outputBase: 120 },
]

const FEATURES = ['chat', 'summarizer', 'embeddings', 'code-review', 'search']

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

async function main() {
  console.log('🌱 Seeding TokenWatcher with 30 days of sample data...')

  // Seed API key
  await prisma.apiKey.upsert({
    where: { keyHash: 'dev-seed-hash' },
    update: {},
    create: {
      name: 'Development Key',
      keyHash: 'dev-seed-hash',
      enabled: true,
    },
  })

  // Seed model pricing
  for (const m of SAMPLE_MODELS) {
    await prisma.modelPricing.upsert({
      where: { provider_model: { provider: m.provider, model: m.model } },
      update: {},
      create: {
        provider: m.provider,
        model: m.model,
        inputPer1MTokens: 2.5,
        outputPer1MTokens: 10.0,
      },
    })
  }

  // Seed 30 days of LLM events
  const events = []
  const now = new Date()

  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const day = new Date(now)
    day.setDate(day.getDate() - dayOffset)

    // 200-600 events per day
    const eventsPerDay = randomBetween(200, 600)

    for (let i = 0; i < eventsPerDay; i++) {
      const model = SAMPLE_MODELS[Math.floor(Math.random() * SAMPLE_MODELS.length)]
      const inputTokens = randomBetween(model.inputBase * 0.5, model.inputBase * 2)
      const outputTokens = randomBetween(model.outputBase * 0.5, model.outputBase * 2)
      const totalTokens = inputTokens + outputTokens
      const cost = calculateCost(model.provider, model.model, inputTokens, outputTokens)

      const eventTime = new Date(day)
      eventTime.setHours(randomBetween(0, 23), randomBetween(0, 59))

      events.push({
        provider: model.provider,
        model: model.model,
        inputTokens,
        outputTokens,
        totalTokens,
        inputCostUsd: cost.inputCostUsd,
        outputCostUsd: cost.outputCostUsd,
        totalCostUsd: cost.totalCostUsd,
        latencyMs: randomBetween(400, 3000),
        tags: {
          feature: FEATURES[Math.floor(Math.random() * FEATURES.length)],
          environment: Math.random() > 0.1 ? 'production' : 'staging',
          userId: `user_${randomBetween(1, 50)}`,
        },
        createdAt: eventTime,
      })
    }
  }

  // Batch insert for speed
  const batchSize = 500
  for (let i = 0; i < events.length; i += batchSize) {
    await prisma.lLMEvent.createMany({
      data: events.slice(i, i + batchSize),
    })
    process.stdout.write(`  ${Math.min(i + batchSize, events.length)}/${events.length} events\r`)
  }

  // Seed a sample alert
  await prisma.alertRule.create({
    data: {
      name: 'Daily spend > $20',
      metricType: 'daily_cost',
      threshold: 20.0,
      windowHours: 24,
      enabled: true,
    },
  })

  console.log(`\n✅ Seeded ${events.length} events across 30 days`)
  console.log('   Open http://localhost:3000 to see your dashboard')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
