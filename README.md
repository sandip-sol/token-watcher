# 🔍 TokenWatcher

<div align="center">

**The open-source LLM cost & token usage auditor for teams and indie hackers.**

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![GitHub Stars](https://img.shields.io/github/stars/sandip-sol/token-watcher?style=social)](https://github.com/sandip-sol/token-watcher)

[**Docs**](https://docs.tokenwatcher.dev) · [**Report Bug**](https://github.com/sandip-sol/token-watcher/issues)

![TokenWatcher Dashboard](./docs/assets/dashboard-preview.png)

</div>

---

## The Problem

You're spending money on LLM APIs but have **no idea**:
- Which feature, route, or user is burning the most tokens
- When your spend is spiking (before the bill arrives)
- Which model is giving you the best cost/quality ratio
- Whether your prompts have quietly gotten 3x longer over the past month

Every team using OpenAI, Anthropic, Gemini, or local models (Ollama) faces this. The only "solutions" are expensive SaaS dashboards that require you to route your API calls through their servers — sending your prompts to a third party.

**TokenWatcher is self-hosted, privacy-first, and completely open source.**

---

## Features

- 📊 **Real-time dashboard** — Token usage, cost, and latency per model, route, user, and tag
- 🚨 **Budget alerts** — Slack, email, or webhook notifications when spend crosses your threshold
- 🔌 **Drop-in SDK** — Wrap any LLM call in one line. Works with OpenAI, Anthropic, Gemini, Ollama
- 🏷️ **Tagging system** — Tag calls by feature, user, session, environment, or anything you want
- 📈 **Trend analysis** — See token usage over time, spot prompt drift, compare models
- 🔒 **100% self-hosted** — Your prompts never leave your infrastructure
- 🐳 **Docker-first** — One command to run locally or in production
- 🌐 **REST API** — Ingest from any language or framework via HTTP

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Application                        │
│                                                             │
│   import { track } from '@tokenwatcher/sdk'                 │
│                                                             │
│   const result = await track(                               │
│     () => openai.chat.completions.create({...}),            │
│     { model: 'gpt-4o', tags: { feature: 'chat' } }         │
│   )                                                         │
└─────────────────────┬───────────────────────────────────────┘
                      │  HTTP POST /api/ingest
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  TokenWatcher Server                        │
│                                                             │
│   ┌──────────────┐   ┌──────────────┐   ┌───────────────┐  │
│   │  Ingest API  │──▶│  PostgreSQL  │──▶│  Dashboard    │  │
│   │  (Next.js)   │   │  + Prisma    │   │  (Next.js)    │  │
│   └──────────────┘   └──────────────┘   └───────────────┘  │
│                              │                              │
│                   ┌──────────▼──────────┐                  │
│                   │   Alert Engine      │                  │
│                   │  (cron + webhooks)  │                  │
│                   └─────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Option 1: Docker (Recommended)

```bash
git clone https://github.com/sandip-sol/token-watcher.git
cd tokenwatcher
cp .env.example .env
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) — done.

The dashboard is protected by default. Sign in with the values from your `.env`:

```env
DASHBOARD_USERNAME="admin"
DASHBOARD_PASSWORD="change_me_in_production"
```

### Option 2: Manual

```bash
git clone https://github.com/sandip-sol/token-watcher.git
cd tokenwatcher

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL and DIRECT_URL

# Set up database
npx prisma migrate dev

# Start dev server
npm run dev
```

---

## Development Commands

App:

```bash
npm run dev
npm run build
npm run test
npm run typecheck
```

SDK:

```bash
npm run build:sdk
npm run test:sdk
npm run typecheck:sdk
```

Full repo:

```bash
npm run build:all
npm run test:all
npm run typecheck:all
```

Database:

```bash
npx prisma migrate dev
npx prisma generate
npm run db:backfill:workspaces
npm run db:rebuild-rollups
```

The TypeScript SDK lives in `packages/sdk` and is configured as the `@tokenwatcher/sdk` npm workspace package. `src/lib/sdk.ts` remains only as a local compatibility shim for older internal imports.

Backend/domain code lives under `src/server` by responsibility: dashboard auth and CSRF in `src/server/auth`, ingest in `src/server/ingest`, alerts in `src/server/alerts`, rollups in `src/server/rollups`, workspace/project helpers in `src/server/workspaces`, pricing in `src/server/pricing`, and security/time utilities in `src/server/security` and `src/server/time`. Dashboard UI pieces live in `src/components/dashboard`. `src/lib` is kept small for Prisma, SDK compatibility, and temporary re-export shims.

For local SDK workspace development from the repo root:

```bash
npm install
npm run build:sdk
npm run test:sdk
```

The root workspace resolves `@tokenwatcher/sdk` for local development.

---

## SDK Usage

The SDK lives in `packages/sdk`. External apps should import from `@tokenwatcher/sdk`; local imports from `src/lib/sdk.ts` are kept only for compatibility.

### Install

```bash
npm install @tokenwatcher/sdk
```

### Configure

```typescript
// tokenwatcher.ts
import { TokenWatcher } from '@tokenwatcher/sdk'

export const tw = new TokenWatcher({
  endpoint: 'http://localhost:3000/api/ingest',
  apiKey: process.env.TOKENWATCHER_API_KEY!,
  projectSlug: 'production-app',
  environment: 'production',
  timeoutMs: 5000,
  maxRetries: 2,
})
```

### Track OpenAI calls

```typescript
import { tw } from './tokenwatcher'
import OpenAI from 'openai'

const openai = new OpenAI()

// Wrap any LLM call — TokenWatcher captures tokens, cost, and latency automatically
const response = await tw.track(
  () => openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello!' }],
  }),
  {
    model: 'gpt-4o',
    provider: 'openai',
    tags: {
      feature: 'chat',
      userId: 'user_123',
      environment: 'production',
    }
  }
)
```

### Error tracking, batching, and manual events

`track()` returns the original provider response unchanged. On success it extracts usage for OpenAI, Anthropic, Gemini, Ollama, and compatible response shapes. On failure it records a sanitized error event by default and rethrows the original error unchanged.

```typescript
const tw = new TokenWatcher({
  apiKey: process.env.TOKENWATCHER_API_KEY!,
  endpoint: 'https://tokenwatcher.example.com/api/ingest',
  batch: true,
  flushIntervalMs: 5000,
  maxBatchSize: 20,
  defaultTags: { service: 'api' },
})

await tw.trackManual({
  provider: 'ollama',
  model: 'llama3.1',
  inputTokens: 120,
  outputTokens: 80,
  latencyMs: 900,
})

await tw.flush()
await tw.shutdown()
```

Streaming usage varies by provider. For streams, prefer reporting final counts with `trackManual()` after the stream completes, or pass estimated counts to `trackStream()` when exact provider usage is unavailable. Prompts and completions are not sent unless you explicitly pass them with `storePrompt: true`; the server still discards them when `STORE_PROMPTS` is not `"true"`.

Gemini:

```typescript
await tw.track(
  () => model.generateContent('Summarize this'),
  { provider: 'gemini', model: 'gemini-2.5-flash', tags: { feature: 'summary' } }
)
```

Ollama/manual:

```typescript
const response = await ollama.chat({ model: 'llama3.1', messages })
await tw.trackManual({
  provider: 'ollama',
  model: 'llama3.1',
  inputTokens: response.prompt_eval_count ?? 0,
  outputTokens: response.eval_count ?? 0,
})
```

### Track Anthropic calls

```typescript
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

const response = await tw.track(
  () => anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello!' }],
  }),
  {
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    tags: { feature: 'summarizer' }
  }
)
```

### Track via REST API (any language)

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-4o",
    "provider": "openai",
    "inputTokens": 512,
    "outputTokens": 128,
    "latencyMs": 1240,
    "tags": { "feature": "chat", "userId": "user_123" }
  }'
```

---

## Dashboard

The dashboard gives you:

| View | What you see |
|------|-------------|
| **Overview** | Total spend, token volume, avg latency — today vs yesterday |
| **By Model** | Cost breakdown per model, token efficiency comparison |
| **By Tag** | Which features/users/routes cost the most |
| **Trends** | 30-day spend and token usage over time |
| **Alerts** | Budget rules — get notified before you're surprised |

Dashboard aggregate stats use rollups by default when `ROLLUPS_ENABLED` is not `"false"`. Pass `useRollups=false` to `/api/stats` to compare against raw events. Recent detailed debugging and tag breakdowns continue to use raw events.

## Rollups

Phase 4 adds `DailyUsageRollup` and `HourlyUsageRollup`. Ingest updates rollups in the background after events are committed and never fails an accepted event if rollup updates fail. Raw `LLMEvent` rows remain the source of truth.

TokenWatcher uses UTC day, hour, and month boundaries for usage aggregation, rollups, stats, and alerts. This avoids server timezone drift and keeps dashboard totals consistent across deployments.

Rebuild rollups from raw events:

```bash
npm run db:rebuild-rollups -- --from=2026-05-01 --to=2026-05-31
```

Useful flags and env vars:

```bash
--workspaceId=workspace_id
ROLLUPS_ENABLED=false
ALERT_USE_ROLLUPS=false
INGEST_MAX_BATCH_SIZE=100
ALLOW_INGEST_COST_OVERRIDE=false
```

For large installs, run a nightly rollup rebuild and alert evaluation every 5-15 minutes. See [OPERATIONS.md](./OPERATIONS.md).

### Dashboard Login

TokenWatcher uses a lightweight self-hosted dashboard login for the MVP. Configure it with:

```env
DASHBOARD_AUTH_ENABLED="true"
DASHBOARD_USERNAME="admin"
DASHBOARD_PASSWORD="use-a-strong-password"
DASHBOARD_SESSION_SECRET="generate-a-long-random-secret"
DASHBOARD_SESSION_COOKIE_NAME="tokenwatcher_session"
CSRF_SECRET=""
```

Generate a strong session secret with:

```bash
openssl rand -base64 32
```

The session is stored in an HTTP-only signed cookie. Disable dashboard auth only for trusted local development by setting `DASHBOARD_AUTH_ENABLED="false"`.

Dashboard write APIs also require CSRF protection because they use cookie auth. The dashboard obtains a token from `GET /api/auth/csrf` and sends it as `X-CSRF-Token` on `POST`, `PATCH`, `PUT`, and `DELETE` requests. `CSRF_SECRET` is optional; when it is empty TokenWatcher signs CSRF tokens with `DASHBOARD_SESSION_SECRET`.

### API Keys

Create ingest API keys from **Dashboard → API Keys**. Choose a workspace, then choose either **All projects** for a workspace-level key or one project for a project-level key. TokenWatcher shows the raw key only once after creation:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tw_live_your_generated_key" \
  -d '{
    "model": "gpt-4o",
    "provider": "openai",
    "inputTokens": 512,
    "outputTokens": 128
  }'
```

Raw API keys are never stored. The database stores a SHA-256 hash plus a short prefix such as `tw_live_abcd...` for display. Copy the key immediately after creation; after refresh, only the prefix remains visible. Revoke leaked or retired keys from **Dashboard → API Keys**. Revoked keys cannot call `/api/ingest`.

`TOKENWATCHER_API_KEY` is still supported as a fallback for local development and simple self-hosting, but DB-backed keys are recommended for production.

### Workspaces and Projects

A workspace is the top-level scope for a company, team, product line, or self-hosted install. A project belongs to one workspace and is intended for an app, environment, major feature, or product surface.

Recommended usage:

- Use one workspace for a team or company.
- Use projects for production, staging, development, or separate apps.
- Prefer project-level API keys for production services.
- Use workspace-level API keys only when a client legitimately needs to report traffic for multiple projects.

Create workspaces and projects from **Dashboard → Projects / Settings**. Fresh installs and migrated installs get `Default Workspace` and `Default Project` records with the slug `default`.

Project-aware ingest can send either `projectId` or `projectSlug`:

```typescript
await tw.track(
  () => openai.chat.completions.create({ model: 'gpt-4o-mini', messages }),
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    projectSlug: 'production-app',
    tags: { feature: 'chat', environment: 'production' },
  }
)
```

If an API key is project-scoped, the server uses the key's project and ignores any different incoming project value. If an API key is workspace-scoped, incoming `projectId` or `projectSlug` must belong to that same workspace. Calls without project info continue to work and fall back to the workspace default project when present.

Dashboard stats are filtered by `workspaceId` and optional `projectId` query parameters, for example `/dashboard?workspaceId=...&projectId=...`.

Alerts are also scoped. Workspace alerts evaluate all projects in that workspace. Project alerts evaluate only that project. Alert history stores the same workspace/project scope.

### Migration Notes

Phase 3 adds `Workspace` and `Project` tables and backfills existing API keys, LLM events, alert rules, and alert history into the default workspace. Existing LLM events are assigned to the default project where possible.

For existing deployments:

```bash
npm run db:deploy
npm run db:backfill:workspaces
```

The backfill script is idempotent and safe to run more than once. If migration fails, restore from your latest database backup, verify the default workspace/project rows can be created, then rerun the backfill before starting normal ingest traffic.

### Alerts

Create alert rules from **Dashboard → Alerts**. Phase 2 supports:

| Type | Meaning |
|------|---------|
| `daily_cost` | Today's total USD cost is greater than or equal to the threshold |
| `monthly_cost` | Current UTC month USD cost is greater than or equal to the threshold |
| `daily_tokens` | Today's total token count is greater than or equal to the threshold |
| `model_daily_cost` | Today's USD cost for a specific model, optionally filtered by provider |

Daily and monthly windows use UTC boundaries. After each successful ingest, TokenWatcher evaluates active alerts in the background. You can also run evaluation manually:

```bash
curl -X POST http://localhost:3000/api/alerts/evaluate \
  -H "Authorization: Bearer $CRON_SECRET"
```

Webhook deliveries are `POST` requests with JSON:

```json
{
  "event": "tokenwatcher.alert.triggered",
  "alertId": "clv...",
  "alertName": "Daily OpenAI budget",
  "type": "daily_cost",
  "threshold": 25,
  "value": 31.45,
  "workspaceId": "clw...",
  "projectId": "clp...",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "triggeredAt": "2026-05-01T00:00:00.000Z"
}
```

`ALERT_COOLDOWN_MINUTES` defaults to `60` to avoid repeated webhook spam. `ALERT_WEBHOOK_TIMEOUT_MS` defaults to `5000`. Successful and failed deliveries are recorded in alert history with workspace and project scope.

Cron examples:

```bash
# GitHub Actions or any external scheduler
curl -X POST https://your-tokenwatcher.example.com/api/alerts/evaluate \
  -H "Authorization: Bearer $CRON_SECRET"

# Linux cron, every 15 minutes
*/15 * * * * curl -fsS -X POST https://your-tokenwatcher.example.com/api/alerts/evaluate -H "Authorization: Bearer your_cron_secret"
```

For Vercel Cron, configure a scheduled request to `/api/alerts/evaluate` and include `Authorization: Bearer <CRON_SECRET>`. Webhook delivery currently has no retry queue, and production SSRF protection blocks obvious private/local URLs but does not yet do DNS resolution before delivery.

### Prompt Storage

`STORE_PROMPTS` controls whether `prompt` and `completion` are stored:

```env
STORE_PROMPTS="false"
```

When this is not exactly `"true"`, TokenWatcher discards prompt and completion text before writing to the database, even if a client sends those fields. Keep it disabled unless you truly need prompt debugging and have reviewed your privacy requirements.

### Ingest Rate Limiting

`POST /api/ingest` has a lightweight in-memory rate limiter:

```env
INGEST_RATE_LIMIT_ENABLED="true"
INGEST_RATE_LIMIT_WINDOW_SECONDS="60"
INGEST_RATE_LIMIT_MAX_REQUESTS="120"
```

Limits are applied by API key identity when possible, otherwise by client IP. This is suitable for single-instance deployments only. Use Redis or another shared store before running multiple app instances.

Note: the in-memory rate limiter works correctly for Docker/VPS deployments.
If deploying to serverless platforms (Vercel, AWS Lambda), set
INGEST_RATE_LIMIT_ENABLED=false as each function instance has its own memory.
Redis-backed rate limiting is on the roadmap.

### Ingest Cost Integrity

TokenWatcher calculates `totalCostUsd` server-side from provider, model, input tokens, and output tokens by default. Public ingest clients may send `totalCostUsd` for backward compatibility, but it is ignored unless `ALLOW_INGEST_COST_OVERRIDE="true"`.

Keep `ALLOW_INGEST_COST_OVERRIDE="false"` for public deployments. Enabling it lets clients write cost values and is intended only for trusted internal debugging or controlled imports.

Batch ingest is all-or-nothing: if any event in a batch is invalid or references an invalid project, no events from that batch are stored. Rollups and alerts run only after the batch commit succeeds.

### CORS for Ingest

Server-to-server SDK calls work without CORS configuration. For browser-based clients, set comma-separated allowed origins:

```env
INGEST_ALLOWED_ORIGINS="https://app.example.com,https://admin.example.com"
```

Leave it empty to allow same-origin browser requests and server-to-server requests by default.

### Security Headers and CSP

TokenWatcher sets security headers for app and dashboard routes, including `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and Content Security Policy.

Production CSP is intentionally strict: `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, same-origin scripts, inline styles for the current Next.js styling path, and same-origin connections plus any explicit `CSP_CONNECT_SRC` entries. Development adds the script allowances Next.js needs locally. Set `CSP_REPORT_ONLY="true"` to test a deployment before enforcing CSP.

---

## Supported Providers & Models

| Provider | Models | Cost Data |
|----------|--------|-----------|
| OpenAI | GPT-4o, GPT-4o-mini, o1, o3 | ✅ Auto-calculated |
| Anthropic | Claude Opus, Sonnet, Haiku | ✅ Auto-calculated |
| Google | Gemini 1.5 Pro, Flash | ✅ Auto-calculated |
| Ollama | Any local model | ✅ (estimated, configurable) |
| Custom | Any model | ✅ Set price per 1M tokens |

Cost data is kept up to date by the community. Submit a PR to add new models!

---

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/tokenwatcher"
# For Prisma migrations. With local Postgres this can match DATABASE_URL.
# With Supabase, use the Direct connection URL instead of the pooler URL.
DIRECT_URL="postgresql://user:password@localhost:5432/tokenwatcher"

# Auth (generate with: openssl rand -base64 32)
DASHBOARD_AUTH_ENABLED="true"
DASHBOARD_USERNAME="admin"
DASHBOARD_PASSWORD="use-a-strong-password"
DASHBOARD_SESSION_SECRET="your-long-random-secret"
DASHBOARD_SESSION_COOKIE_NAME="tokenwatcher_session"
CSRF_SECRET=""
NEXTAUTH_URL="http://localhost:3000"

# API key for SDK authentication
TOKENWATCHER_API_KEY="your-api-key-here"

# Ingest security
INGEST_RATE_LIMIT_ENABLED="true"
INGEST_RATE_LIMIT_WINDOW_SECONDS="60"
INGEST_RATE_LIMIT_MAX_REQUESTS="120"
INGEST_MAX_BATCH_SIZE="100"
INGEST_ALLOWED_ORIGINS=""
CSP_REPORT_ONLY="false"
CSP_CONNECT_SRC=""

# Prompt privacy
STORE_PROMPTS="false"
ROLLUPS_ENABLED="true"

# Alerts (optional)
CRON_SECRET="generate-a-secret-for-scheduled-alert-evaluation"
ALERT_COOLDOWN_MINUTES="60"
ALERT_WEBHOOK_TIMEOUT_MS="5000"
ALERT_USE_ROLLUPS="true"
SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="alerts@example.com"
SMTP_PASS="your-smtp-password"
```

## Production Security Checklist

- Keep `DASHBOARD_AUTH_ENABLED="true"` when the dashboard is reachable from any network you do not fully trust.
- Replace the default dashboard password and generate a strong `DASHBOARD_SESSION_SECRET`.
- Keep dashboard CSRF protection enabled; set `CSRF_SECRET` only if you want a separate signing secret.
- Use HTTPS in production so dashboard session cookies are sent securely.
- Rotate `TOKENWATCHER_API_KEY` immediately if it is leaked.
- Prefer DB-backed hashed API keys for production ingest traffic.
- Revoke leaked dashboard-created API keys from the API Keys page.
- Keep `STORE_PROMPTS="false"` unless prompt retention is explicitly required.
- Avoid sending PII in tags, metadata, prompts, or completions.
- Configure `INGEST_ALLOWED_ORIGINS` for browser clients.
- Validate CSP in report-only mode, then enforce it without wildcard production origins.
- Use HTTPS webhook URLs in production and validate payloads on the receiving service.
- Replace the in-memory rate limiter with a shared store before scaling beyond one instance.
- Keep PostgreSQL backups and Prisma migrations under version control.

---

## Roadmap

- [x] Core ingest API
- [x] PostgreSQL persistence via Prisma
- [x] Dashboard with cost breakdown
- [x] TypeScript SDK
- [x] Budget alerts (Slack + webhook)
- [ ] Per-user cost attribution
- [ ] Prompt diff tracking (detect prompt growth over time)
- [x] Workspace and project support
- [ ] Grafana datasource plugin
- [ ] Python SDK
- [ ] AI-powered cost optimization suggestions

---

## Contributing

We love contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

Good first issues are tagged [`help wanted`](https://github.com/sandip-sol/token-watcher/issues?q=label%3A%22help+wanted%22).

---

## Self-hosting in Production

See the [deployment guide](docs/deployment.md) for instructions on deploying to:
- **Railway** (one click)
- **Render**
- **Fly.io**
- **Your own VPS** (Docker Compose)

---

## License

MIT — use it however you want. See [LICENSE](LICENSE).

---

<div align="center">

Built with ❤️ by the community. If TokenWatcher saves you money, please ⭐ the repo!

</div>
