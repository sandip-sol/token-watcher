# 🔍 TokenWatcher

<div align="center">

**The open-source LLM cost & token usage auditor for teams and indie hackers.**

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![GitHub Stars](https://img.shields.io/github/stars/yourusername/tokenwatcher?style=social)](https://github.com/yourusername/tokenwatcher)

[**Live Demo**](https://tokenwatcher.dev) · [**Docs**](https://docs.tokenwatcher.dev) · [**Discord**](https://discord.gg/tokenwatcher) · [**Report Bug**](https://github.com/yourusername/tokenwatcher/issues)

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
git clone https://github.com/yourusername/tokenwatcher.git
cd tokenwatcher
cp .env.example .env
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) — done.

### Option 2: Manual

```bash
git clone https://github.com/yourusername/tokenwatcher.git
cd tokenwatcher

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL

# Set up database
npx prisma migrate dev

# Start dev server
npm run dev
```

---

## SDK Usage

### Install

```bash
npm install @tokenwatcher/sdk
```

### Configure

```typescript
// tokenwatcher.ts
import { TokenWatcher } from '@tokenwatcher/sdk'

export const tw = new TokenWatcher({
  endpoint: 'http://localhost:3000',  // your self-hosted instance
  apiKey: process.env.TOKENWATCHER_API_KEY,
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

# Auth (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# API key for SDK authentication
TOKENWATCHER_API_KEY="your-api-key-here"

# Alerts (optional)
SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="alerts@example.com"
SMTP_PASS="your-smtp-password"
```

---

## Roadmap

- [x] Core ingest API
- [x] PostgreSQL persistence via Prisma
- [x] Dashboard with cost breakdown
- [x] TypeScript SDK
- [x] Budget alerts (Slack + webhook)
- [ ] Per-user cost attribution
- [ ] Prompt diff tracking (detect prompt growth over time)
- [ ] Multi-workspace support
- [ ] Grafana datasource plugin
- [ ] Python SDK
- [ ] AI-powered cost optimization suggestions

---

## Contributing

We love contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

Good first issues are tagged [`help wanted`](https://github.com/yourusername/tokenwatcher/issues?q=label%3A%22help+wanted%22).

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
