# @tokenwatcher/sdk

Typed SDK for sending LLM usage and sanitized error events to a self-hosted TokenWatcher instance.

The SDK source lives in `packages/sdk` and is exposed in this repo as the `@tokenwatcher/sdk` npm workspace package. External apps should import from `@tokenwatcher/sdk`; `src/lib/sdk.ts` in the app remains only as a local compatibility shim.

```ts
import { TokenWatcher } from '@tokenwatcher/sdk'

const tw = new TokenWatcher({
  apiKey: process.env.TOKENWATCHER_API_KEY!,
  endpoint: 'https://your-tokenwatcher-domain.com/api/ingest',
  projectSlug: 'production-app',
  environment: 'production',
  batch: true,
})

const response = await tw.track(
  () => openai.chat.completions.create({ model: 'gpt-4o-mini', messages }),
  { provider: 'openai', model: 'gpt-4o-mini', tags: { feature: 'chat' } }
)
```

Supported automatic usage extraction covers OpenAI, Anthropic, Gemini, Ollama, and common compatible response shapes. For streaming or unsupported providers, use `trackManual()` after the stream completes.

Prompts and completions are not sent unless you explicitly pass them with `storePrompt: true`; the server still honors `STORE_PROMPTS=false`.

## Local Development

From the repo root:

```bash
npm install
npm run build:sdk
npm run test:sdk
npm run typecheck:sdk
```

The root workspace can resolve `@tokenwatcher/sdk` during local development.
