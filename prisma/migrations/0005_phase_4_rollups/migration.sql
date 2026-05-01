-- Phase 4: error events and scalable hourly/daily rollups.

ALTER TABLE "LLMEvent" ADD COLUMN IF NOT EXISTS "eventType" TEXT NOT NULL DEFAULT 'usage';
ALTER TABLE "LLMEvent" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "LLMEvent" ADD COLUMN IF NOT EXISTS "errorType" TEXT;
ALTER TABLE "LLMEvent" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;

UPDATE "LLMEvent" SET "status" = 'success' WHERE "eventType" = 'usage' AND "status" IS NULL;

CREATE INDEX IF NOT EXISTS "LLMEvent_workspaceId_eventType_createdAt_idx"
  ON "LLMEvent"("workspaceId", "eventType", "createdAt");

CREATE TABLE IF NOT EXISTS "DailyUsageRollup" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL DEFAULT '__all__',
  "date" TIMESTAMP(3) NOT NULL,
  "provider" TEXT NOT NULL DEFAULT '__all__',
  "model" TEXT NOT NULL DEFAULT '__all__',
  "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "totalLatencyMs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DailyUsageRollup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HourlyUsageRollup" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL DEFAULT '__all__',
  "hour" TIMESTAMP(3) NOT NULL,
  "provider" TEXT NOT NULL DEFAULT '__all__',
  "model" TEXT NOT NULL DEFAULT '__all__',
  "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "totalLatencyMs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HourlyUsageRollup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DailyUsageRollup_workspaceId_projectId_date_provider_model_key"
  ON "DailyUsageRollup"("workspaceId", "projectId", "date", "provider", "model");
CREATE INDEX IF NOT EXISTS "DailyUsageRollup_workspaceId_date_idx"
  ON "DailyUsageRollup"("workspaceId", "date");
CREATE INDEX IF NOT EXISTS "DailyUsageRollup_workspaceId_projectId_date_idx"
  ON "DailyUsageRollup"("workspaceId", "projectId", "date");
CREATE INDEX IF NOT EXISTS "DailyUsageRollup_provider_idx"
  ON "DailyUsageRollup"("provider");
CREATE INDEX IF NOT EXISTS "DailyUsageRollup_model_idx"
  ON "DailyUsageRollup"("model");

CREATE UNIQUE INDEX IF NOT EXISTS "HourlyUsageRollup_workspaceId_projectId_hour_provider_model_key"
  ON "HourlyUsageRollup"("workspaceId", "projectId", "hour", "provider", "model");
CREATE INDEX IF NOT EXISTS "HourlyUsageRollup_workspaceId_hour_idx"
  ON "HourlyUsageRollup"("workspaceId", "hour");
CREATE INDEX IF NOT EXISTS "HourlyUsageRollup_workspaceId_projectId_hour_idx"
  ON "HourlyUsageRollup"("workspaceId", "projectId", "hour");
