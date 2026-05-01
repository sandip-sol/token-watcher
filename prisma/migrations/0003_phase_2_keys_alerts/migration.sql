-- Phase 2: DB-backed API key management and webhook alert management.

-- ApiKey: keep existing hashed keys, add management metadata, and rename enabled -> isActive.
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "environment" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ApiKey' AND column_name = 'enabled'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ApiKey' AND column_name = 'isActive'
  ) THEN
    ALTER TABLE "ApiKey" RENAME COLUMN "enabled" TO "isActive";
  END IF;
END $$;

ALTER TABLE "ApiKey" ALTER COLUMN "name" DROP NOT NULL;
UPDATE "ApiKey"
SET "keyPrefix" = COALESCE("keyPrefix", 'tw_legacy_' || substr("id", 1, 6))
WHERE "keyPrefix" IS NULL;
ALTER TABLE "ApiKey" ALTER COLUMN "keyPrefix" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "ApiKey_isActive_idx" ON "ApiKey"("isActive");

-- AlertRule: migrate the MVP rule shape into the Phase 2 rule shape.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AlertRule' AND column_name = 'enabled'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AlertRule' AND column_name = 'isActive'
  ) THEN
    ALTER TABLE "AlertRule" RENAME COLUMN "enabled" TO "isActive";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AlertRule' AND column_name = 'metricType'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AlertRule' AND column_name = 'type'
  ) THEN
    ALTER TABLE "AlertRule" RENAME COLUMN "metricType" TO "type";
  END IF;
END $$;

UPDATE "AlertRule"
SET "type" = CASE
  WHEN "type" = 'total_tokens' THEN 'daily_tokens'
  WHEN "type" = 'hourly_cost' THEN 'daily_cost'
  ELSE "type"
END;

ALTER TABLE "AlertRule" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "AlertRule" DROP COLUMN IF EXISTS "windowHours";
ALTER TABLE "AlertRule" DROP COLUMN IF EXISTS "tagKey";
ALTER TABLE "AlertRule" DROP COLUMN IF EXISTS "tagValue";
ALTER TABLE "AlertRule" DROP COLUMN IF EXISTS "slackWebhook";
ALTER TABLE "AlertRule" DROP COLUMN IF EXISTS "emailTo";
ALTER TABLE "AlertRule" DROP COLUMN IF EXISTS "lastCheckedAt";

CREATE INDEX IF NOT EXISTS "AlertRule_type_idx" ON "AlertRule"("type");
CREATE INDEX IF NOT EXISTS "AlertRule_isActive_idx" ON "AlertRule"("isActive");

CREATE TABLE IF NOT EXISTS "AlertHistory" (
  "id" TEXT NOT NULL,
  "alertRuleId" TEXT NOT NULL,
  "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "type" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "error" TEXT,

  CONSTRAINT "AlertHistory_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AlertHistory_alertRuleId_fkey'
  ) THEN
    ALTER TABLE "AlertHistory"
    ADD CONSTRAINT "AlertHistory_alertRuleId_fkey"
    FOREIGN KEY ("alertRuleId") REFERENCES "AlertRule"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AlertHistory_alertRuleId_idx" ON "AlertHistory"("alertRuleId");
CREATE INDEX IF NOT EXISTS "AlertHistory_triggeredAt_idx" ON "AlertHistory"("triggeredAt");
