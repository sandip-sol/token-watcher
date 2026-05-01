-- Add a non-secret display prefix for DB-backed API keys.
ALTER TABLE "ApiKey" ADD COLUMN "keyPrefix" TEXT;

CREATE INDEX "ApiKey_keyPrefix_idx" ON "ApiKey"("keyPrefix");
