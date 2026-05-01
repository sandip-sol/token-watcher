-- CreateTable
CREATE TABLE "LLMEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "inputCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outputCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "tags" JSONB NOT NULL DEFAULT '{}',
    "prompt" TEXT,
    "completion" TEXT,

    CONSTRAINT "LLMEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPricing" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputPer1MTokens" DOUBLE PRECISION NOT NULL,
    "outputPer1MTokens" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metricType" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "windowHours" INTEGER NOT NULL DEFAULT 24,
    "provider" TEXT,
    "model" TEXT,
    "tagKey" TEXT,
    "tagValue" TEXT,
    "slackWebhook" TEXT,
    "webhookUrl" TEXT,
    "emailTo" TEXT,
    "lastTriggeredAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LLMEvent_createdAt_idx" ON "LLMEvent"("createdAt");

-- CreateIndex
CREATE INDEX "LLMEvent_provider_idx" ON "LLMEvent"("provider");

-- CreateIndex
CREATE INDEX "LLMEvent_model_idx" ON "LLMEvent"("model");

-- CreateIndex
CREATE UNIQUE INDEX "ModelPricing_provider_model_key" ON "ModelPricing"("provider", "model");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
