// src/lib/pricing.ts
// Community-maintained pricing data. Submit a PR to update!
// All prices in USD per 1,000,000 tokens.

export interface ModelPrice {
  provider: string
  model: string
  inputPer1M: number   // USD per 1M input tokens
  outputPer1M: number  // USD per 1M output tokens
}

export const MODEL_PRICING: ModelPrice[] = [
  // ─── OpenAI ───────────────────────────────────────────────
  { provider: 'openai', model: 'gpt-4.1',              inputPer1M: 2.00,   outputPer1M: 8.00   },
  { provider: 'openai', model: 'gpt-4.1-mini',         inputPer1M: 0.40,   outputPer1M: 1.60   },
  { provider: 'openai', model: 'gpt-4o',                inputPer1M: 2.50,   outputPer1M: 10.00  },
  { provider: 'openai', model: 'gpt-4o-mini',           inputPer1M: 0.15,   outputPer1M: 0.60   },
  { provider: 'openai', model: 'gpt-4-turbo',           inputPer1M: 10.00,  outputPer1M: 30.00  },
  { provider: 'openai', model: 'gpt-4',                 inputPer1M: 30.00,  outputPer1M: 60.00  },
  { provider: 'openai', model: 'gpt-3.5-turbo',         inputPer1M: 0.50,   outputPer1M: 1.50   },
  { provider: 'openai', model: 'o1',                    inputPer1M: 15.00,  outputPer1M: 60.00  },
  { provider: 'openai', model: 'o1-mini',               inputPer1M: 3.00,   outputPer1M: 12.00  },
  { provider: 'openai', model: 'o3',                    inputPer1M: 10.00,  outputPer1M: 40.00  },
  { provider: 'openai', model: 'o3-mini',               inputPer1M: 1.10,   outputPer1M: 4.40   },

  // ─── Anthropic ────────────────────────────────────────────
  { provider: 'anthropic', model: 'claude-opus-4-5',          inputPer1M: 15.00, outputPer1M: 75.00 },
  { provider: 'anthropic', model: 'claude-sonnet-4-5',        inputPer1M: 3.00,  outputPer1M: 15.00 },
  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001',inputPer1M: 0.80,  outputPer1M: 4.00  },
  { provider: 'anthropic', model: 'claude-opus-4-6',          inputPer1M: 15.00, outputPer1M: 75.00 },
  { provider: 'anthropic', model: 'claude-sonnet-4-6',        inputPer1M: 3.00,  outputPer1M: 15.00 },

  // ─── Google ───────────────────────────────────────────────
  { provider: 'google', model: 'gemini-2.5-pro',       inputPer1M: 1.25,  outputPer1M: 10.00  },
  { provider: 'google', model: 'gemini-2.5-flash',     inputPer1M: 0.15,  outputPer1M: 0.60   },
  { provider: 'google', model: 'gemini-1.5-pro',         inputPer1M: 3.50,  outputPer1M: 10.50  },
  { provider: 'google', model: 'gemini-1.5-flash',       inputPer1M: 0.075, outputPer1M: 0.30   },
  { provider: 'google', model: 'gemini-1.5-flash-8b',    inputPer1M: 0.0375,outputPer1M: 0.15   },
  { provider: 'google', model: 'gemini-2.0-flash',       inputPer1M: 0.10,  outputPer1M: 0.40   },

  // ─── Ollama (estimated, free to run — costs are $0) ───────
  { provider: 'ollama', model: 'llama3',                 inputPer1M: 0,     outputPer1M: 0      },
  { provider: 'ollama', model: 'llama3.1',               inputPer1M: 0,     outputPer1M: 0      },
  { provider: 'ollama', model: 'mistral',                inputPer1M: 0,     outputPer1M: 0      },
  { provider: 'ollama', model: 'phi3',                   inputPer1M: 0,     outputPer1M: 0      },
  { provider: 'ollama', model: 'gemma2',                 inputPer1M: 0,     outputPer1M: 0      },
  { provider: 'ollama', model: 'codestral',              inputPer1M: 0,     outputPer1M: 0      },
]

const pricingMap = new Map(
  MODEL_PRICING.map(p => [`${p.provider}:${p.model}`, p])
)

export function getModelPrice(provider: string, model: string): ModelPrice | null {
  // Exact match first
  const exact = pricingMap.get(`${provider}:${model}`)
  if (exact) return exact

  // Fuzzy match — useful for versioned models like "gpt-4o-2024-11-20"
  for (const [, price] of pricingMap) {
    if (price.provider === provider && model.startsWith(price.model)) {
      return price
    }
  }

  return null
}

export function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number } {
  const price = getModelPrice(provider, model)

  if (!price) {
    return { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0 }
  }

  const inputCostUsd = (inputTokens / 1_000_000) * price.inputPer1M
  const outputCostUsd = (outputTokens / 1_000_000) * price.outputPer1M
  const totalCostUsd = inputCostUsd + outputCostUsd

  return { inputCostUsd, outputCostUsd, totalCostUsd }
}
