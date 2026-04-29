# Contributing to TokenWatcher

First off — thank you! Every contribution, big or small, makes TokenWatcher better for everyone.

---

## Ways to Contribute

- 🐛 **Report bugs** — open an issue with reproduction steps
- 💡 **Suggest features** — open a discussion before building something big
- 📝 **Improve docs** — fix typos, add examples, clarify setup steps
- 💰 **Add model pricing** — update `src/lib/pricing.ts` with new models
- 🌍 **Add provider support** — help the SDK extract tokens from new providers
- 🔨 **Fix bugs or build features** — check `help wanted` issues

---

## Good First Issues

Look for issues tagged [`help wanted`](https://github.com/yourusername/tokenwatcher/issues?q=label%3A%22help+wanted%22) or [`good first issue`](https://github.com/yourusername/tokenwatcher/issues?q=label%3A%22good+first+issue%22).

Great beginner tasks:
- Adding a new model to `src/lib/pricing.ts`
- Writing a Python SDK equivalent of the TypeScript SDK
- Improving the README with better examples
- Adding a new chart to the dashboard

---

## Development Setup

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/tokenwatcher.git
cd tokenwatcher

# Install
npm install

# Set up env
cp .env.example .env

# Start database
docker compose up db -d

# Run migrations
npm run db:migrate

# Seed sample data (optional)
npm run db:seed

# Start dev server
npm run dev
```

Visit `http://localhost:3000`

---

## Project Structure

```
tokenwatcher/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ingest/route.ts   ← SDK sends data here
│   │   │   ├── stats/route.ts    ← Dashboard data API
│   │   │   └── alerts/route.ts   ← Alert CRUD
│   │   └── dashboard/            ← Dashboard UI
│   ├── components/               ← Reusable UI components
│   └── lib/
│       ├── pricing.ts            ← Model pricing data ← Easy to contribute!
│       ├── prisma.ts             ← DB client
│       └── auth.ts               ← API key validation
├── prisma/
│   └── schema.prisma             ← Database schema
└── sdk/                          ← TypeScript SDK
```

---

## Adding a New Model

The easiest contribution! Open `src/lib/pricing.ts` and add an entry:

```typescript
{ provider: 'openai', model: 'gpt-5', inputPer1M: 5.00, outputPer1M: 20.00 },
```

Pricing sources:
- OpenAI: https://openai.com/pricing
- Anthropic: https://anthropic.com/pricing
- Google: https://ai.google.dev/pricing

---

## Pull Request Guidelines

1. **One thing per PR** — smaller PRs get reviewed faster
2. **Describe the change** — what problem does it solve?
3. **Test your change** — run `npm run lint` before submitting
4. **Update the README** if you add a feature users need to know about

---

## Code Style

- TypeScript everywhere — no plain JavaScript
- Use Zod for input validation
- Keep API routes thin — business logic goes in `lib/`
- No `any` types without a comment explaining why

---

## Questions?

Open a [GitHub Discussion](https://github.com/yourusername/tokenwatcher/discussions) — we're friendly.
