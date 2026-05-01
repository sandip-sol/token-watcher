# @tokenwatcher/sdk

Typed SDK for sending LLM usage and sanitized error events to a self-hosted TokenWatcher instance.

```ts
import { TokenWatcher } from '@tokenwatcher/sdk'

const tw = new TokenWatcher({
  apiKey: process.env.TOKENWATCHER_API_KEY!,
  endpoint: 'https://your-tokenwatcher.com/api/ingest',
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
