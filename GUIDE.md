# TokenWatcher Code and Testing Guide

TokenWatcher is a self-hosted LLM usage auditor. Your app sends token usage events to this project, the server stores them in PostgreSQL, and the dashboard shows spend, token volume, latency, and model breakdowns.

Important: TokenWatcher does not automatically fetch usage from your OpenAI, Anthropic, Gemini, or Ollama account. The dashboard gets data only when an app sends usage events to `POST /api/ingest`. If the dashboard is empty, it means there are no `LLMEvent` rows in the database yet.

If you already have `npm run dev` running, keep it running and open a second terminal. Then use one of these options:

```bash
# Option A: send one fake SDK event
npm run test:sdk
```

```bash
# Option B: send one event manually with curl
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tw_dev_key_change_me" \
  -d '{
    "provider": "openai",
    "model": "gpt-4o-mini",
    "inputTokens": 1200,
    "outputTokens": 350,
    "latencyMs": 900,
    "tags": {
      "feature": "manual-test",
      "env": "local"
    }
  }'
```

After either option, refresh:

```text
http://localhost:3000/dashboard
```

## How the Project Fits Together

```text
Your app or SDK test
  -> POST /api/ingest
  -> validate API key
  -> validate request body
  -> calculate model cost
  -> save LLMEvent in PostgreSQL
  -> /api/stats aggregates saved events
  -> /dashboard renders charts and tables
```

The most important table is `LLMEvent`. Every row means "one LLM call happened". The dashboard is just a visual report over those rows.

Example event:

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "inputTokens": 1200,
  "outputTokens": 350,
  "latencyMs": 900,
  "tags": {
    "feature": "chat",
    "userId": "user_123",
    "env": "production"
  }
}
```

TokenWatcher receives that event, calculates cost using `src/lib/pricing.ts`, stores it in PostgreSQL, and then `/api/stats` sums it for the dashboard.

## Important Files

| File | What it does |
| --- | --- |
| `src/app/page.tsx` | Redirects `/` to `/dashboard`. |
| `src/app/dashboard/page.tsx` | Client dashboard. Fetches `/api/stats`, controls the selected date range, and renders stat cards, charts, and the model table. |
| `src/app/api/ingest/route.ts` | Main ingest endpoint. Accepts LLM usage events, checks the bearer API key, validates JSON with Zod, calculates cost, stores the event, and checks alert rules. |
| `src/app/api/stats/route.ts` | Dashboard stats endpoint. Aggregates total spend, tokens, latency, today/yesterday comparisons, model totals, daily trends, and optional tag breakdowns. |
| `src/lib/sdk.ts` | Local TypeScript SDK. Wraps LLM calls with `track()` or sends manual usage with `ingest()`. |
| `src/lib/pricing.ts` | Static model pricing table and cost calculation helpers. |
| `src/lib/auth.ts` | API key hashing, generation, and validation. In development it accepts `TOKENWATCHER_API_KEY` directly from `.env`. |
| `src/lib/prisma.ts` | Shared Prisma client. Reuses the client during development hot reloads. |
| `prisma/schema.prisma` | Database schema for events, model pricing, alert rules, and API keys. |
| `prisma/seed.ts` | Creates sample dashboard data for the last 30 days. |
| `test-sdk.ts` | Small local script that sends one fake LLM event without needing a real OpenAI or Anthropic key. |

## Code Explanation in Detail

### 1. Dashboard Route

`src/app/page.tsx` is tiny:

```ts
redirect('/dashboard')
```

So when you visit `http://localhost:3000`, Next.js sends you to `http://localhost:3000/dashboard`.

`src/app/dashboard/page.tsx` is a client component. It keeps three pieces of state:

- `data`: the stats returned by `/api/stats`
- `days`: selected period, such as 7, 14, 30, or 90 days
- `loading`: whether the dashboard is currently fetching data

This part fetches stats whenever `days` changes:

```ts
useEffect(() => {
  setLoading(true)
  fetch(`/api/stats?days=${days}`)
    .then(r => r.json())
    .then(setData)
    .finally(() => setLoading(false))
}, [days])
```

Then it passes the returned data into:

- `StatCard` for spend, tokens, latency, and call count
- `CostTrendChart` for spend over time
- `ModelBreakdownChart` for model spend share
- `ModelTable` for per-model totals

### 2. Ingest API

`src/app/api/ingest/route.ts` is where usage data enters the system.

It expects a bearer token:

```http
Authorization: Bearer your_tokenwatcher_key
```

The key is checked by `validateApiKey()` from `src/lib/auth.ts`. In local development, if the sent key equals `TOKENWATCHER_API_KEY` from `.env`, the request is accepted.

Then Zod validates the JSON body. Required fields are:

- `provider`
- `model`
- `inputTokens`
- `outputTokens`

Optional fields are:

- `latencyMs`
- `tags`
- `prompt`
- `completion`
- `totalCostUsd`

After validation, the route calculates:

```ts
totalTokens = inputTokens + outputTokens
```

Then it calls:

```ts
calculateCost(provider, model, inputTokens, outputTokens)
```

That function looks up the model price in `src/lib/pricing.ts`. Finally, Prisma writes one row into `LLMEvent`.

### 3. Stats API

`src/app/api/stats/route.ts` reads events from PostgreSQL and aggregates them.

It returns:

- `overview`: total cost, total tokens, average latency, total calls
- `today`: today's cost, tokens, and calls
- `yesterday`: yesterday's cost, tokens, and calls
- `byModel`: grouped totals per provider/model
- `dailyTrend`: day-by-day spend and usage
- `tagBreakdown`: optional grouped totals by tag

The dashboard does not calculate these totals itself. It asks `/api/stats` for already-aggregated data.

### 4. SDK

`src/lib/sdk.ts` gives you two ways to send data.

Use `ingest()` when you already know token counts:

```ts
await tw.ingest({
  provider: 'openai',
  model: 'gpt-4o-mini',
  inputTokens: 1200,
  outputTokens: 350,
  latencyMs: 900,
  tags: { feature: 'chat' },
})
```

Use `track()` when you want to wrap a real LLM request:

```ts
const response = await tw.track(
  () => openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
  }),
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    tags: { feature: 'chat' },
  }
)
```

The SDK does not estimate tokens itself. It reads token usage from the LLM provider response, usually from a field called `usage`. If a provider response does not include usage, use `tw.ingest()` and pass token counts manually.

## Database Models

`LLMEvent` is the main table. Every tracked LLM call becomes one row with provider, model, input/output tokens, calculated cost, latency, tags, and optional prompt/completion text.

`ModelPricing` stores pricing rows, but the current ingest code calculates cost from `src/lib/pricing.ts`, not this table.

`AlertRule` defines budget or token thresholds. The ingest endpoint checks enabled rules after each event and can send Slack or webhook alerts.

`ApiKey` stores hashed API keys for production-style authentication. During local development, `TOKENWATCHER_API_KEY` in `.env` is also accepted directly.

## Local Setup

Prerequisites:

- Node.js 20+
- npm
- PostgreSQL, or Docker for a local PostgreSQL container

Install dependencies:

```bash
npm install
```

Create environment variables:

```bash
cp .env.example .env
```

For a normal local Docker database, these values are fine:

```env
DATABASE_URL="postgresql://tokenwatcher:tokenwatcher@localhost:5432/tokenwatcher"
DIRECT_URL="postgresql://tokenwatcher:tokenwatcher@localhost:5432/tokenwatcher"
TOKENWATCHER_API_KEY="tw_dev_key_change_me"
NEXTAUTH_URL="http://localhost:3000"
```

Start only PostgreSQL with Docker:

```bash
docker compose up -d db
```

Apply the database migration:

```bash
npm run db:migrate
```

Optional: add sample dashboard data:

```bash
npm run db:seed
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/dashboard
```

If the dashboard opens but shows zero data, that is normal for a fresh database. Send events using `npm run test:sdk`, `curl`, or a real wrapped LLM call.

## Test It for Real

### 1. Verify the App Builds

```bash
npm run build
```

Expected result: Next.js compiles successfully and lists these routes:

- `/`
- `/dashboard`
- `/api/ingest`
- `/api/stats`

### 2. Test With Seed Data

Run:

```bash
npm run db:seed
npm run dev
```

Then open `/dashboard`. You should see non-zero spend, token counts, charts, and model breakdown rows.

### 3. Test the Ingest API Directly

With the app running, send one event:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tw_dev_key_change_me" \
  -d '{
    "provider": "openai",
    "model": "gpt-4o-mini",
    "inputTokens": 1200,
    "outputTokens": 350,
    "latencyMs": 900,
    "tags": {
      "feature": "manual-curl",
      "env": "local"
    }
  }'
```

Expected response:

```json
{
  "success": true,
  "eventId": "...",
  "cost": {
    "inputCostUsd": 0.00018,
    "outputCostUsd": 0.00021,
    "totalCostUsd": 0.00039
  }
}
```

Refresh `/dashboard`; the call count and spend should increase.

### 4. Test With the Local SDK Script

Make sure the app is running, then run:

```bash
npm run test:sdk
```

Expected output:

```text
Event sent! Check your dashboard.
```

The script sends a fake Anthropic usage event, so you do not need a real Anthropic key. It reads `TOKENWATCHER_API_KEY` from `.env`; if that key is missing, it falls back to `tw_dev_key_change_me`.

If your `.env` has a different app URL, you can also set:

```env
TOKENWATCHER_ENDPOINT="http://localhost:3000"
```

### 5. Test a Real LLM Call From Another App

Use the SDK pattern from `src/lib/sdk.ts`. This is the real way to fetch token use from your AI usage: wrap the actual AI call, let the provider return usage data, and let TokenWatcher save it.

```ts
import { TokenWatcher } from './src/lib/sdk'

const tw = new TokenWatcher({
  endpoint: 'http://localhost:3000',
  apiKey: process.env.TOKENWATCHER_API_KEY!,
  debug: true,
})

const response = await tw.track(
  () => openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
  }),
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    tags: {
      feature: 'real-openai-test',
      env: 'local',
    },
  }
)
```

The SDK returns the original LLM response immediately after the LLM call completes. Tracking is sent to TokenWatcher afterward.

For OpenAI responses, the SDK tries to read:

- `usage.prompt_tokens`
- `usage.completion_tokens`

For Anthropic-style responses, it tries to read:

- `usage.input_tokens`
- `usage.output_tokens`

If those fields exist, your dashboard will update after the event is sent.

## How to Get Data on the Dashboard

Use this checklist:

1. PostgreSQL is running.
2. `.env` has `DATABASE_URL`, `DIRECT_URL`, and `TOKENWATCHER_API_KEY`.
3. Migrations have been applied with `npm run db:migrate`.
4. App is running with `npm run dev`.
5. At least one event has been sent to `/api/ingest`.
6. Open or refresh `http://localhost:3000/dashboard`.

Fastest local test:

```bash
npm run test:sdk
```

Then confirm the raw stats:

```bash
curl http://localhost:3000/api/stats?days=30
```

If `overview.callCount` is greater than `0`, the dashboard has data to show.

## Useful Debugging Checks

Check whether the stats API sees data:

```bash
curl http://localhost:3000/api/stats?days=30
```

Open Prisma Studio:

```bash
npm run db:studio
```

Look at the `LLMEvent` table to confirm events are being inserted.

Common problems:

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `401 Missing API key` | No bearer token was sent. | Add `Authorization: Bearer <TOKENWATCHER_API_KEY>`. |
| `401 Invalid API key` | Request key does not match `.env`. | Use the same value as `TOKENWATCHER_API_KEY`. |
| Dashboard is empty | No events exist yet. | Run `npm run db:seed` or send a curl/SDK event. |
| Cost is `$0` | Provider/model is missing from `src/lib/pricing.ts`. | Add the model price or pass `totalCostUsd` manually. |
| Database connection error | PostgreSQL is not running or URLs are wrong. | Start `docker compose up -d db` and confirm `DATABASE_URL`. |

## Production Notes

- Use a strong `TOKENWATCHER_API_KEY`.
- Generate a real `NEXTAUTH_SECRET` with `openssl rand -base64 32`.
- Keep `STORE_PROMPTS=false` unless you explicitly want to store prompt/completion text.
- Use `npm run db:deploy` for production migrations.
- Put the app behind HTTPS before sending production traffic.
