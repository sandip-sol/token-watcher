-- Phase 3: workspace/project structure with an idempotent default scope.
-- Fixed IDs keep the SQL migration portable and safe for existing installs.

CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "environment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");
CREATE UNIQUE INDEX "Project_workspaceId_slug_key" ON "Project"("workspaceId", "slug");
CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");

INSERT INTO "Workspace" ("id", "name", "slug")
VALUES ('default_workspace', 'Default Workspace', 'default')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Project" ("id", "workspaceId", "name", "slug", "environment")
VALUES ('default_project', 'default_workspace', 'Default Project', 'default', 'production')
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "ApiKey" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN "projectId" TEXT;

ALTER TABLE "LLMEvent" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "LLMEvent" ADD COLUMN "projectId" TEXT;
ALTER TABLE "LLMEvent" ADD COLUMN "requestId" TEXT;
ALTER TABLE "LLMEvent" ADD COLUMN "userId" TEXT;

ALTER TABLE "AlertRule" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "AlertRule" ADD COLUMN "projectId" TEXT;

ALTER TABLE "AlertHistory" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "AlertHistory" ADD COLUMN "projectId" TEXT;

UPDATE "ApiKey" SET "workspaceId" = 'default_workspace' WHERE "workspaceId" IS NULL;
UPDATE "LLMEvent"
SET "workspaceId" = 'default_workspace', "projectId" = 'default_project'
WHERE "workspaceId" IS NULL;
UPDATE "AlertRule" SET "workspaceId" = 'default_workspace' WHERE "workspaceId" IS NULL;
UPDATE "AlertHistory" SET "workspaceId" = 'default_workspace' WHERE "workspaceId" IS NULL;

ALTER TABLE "ApiKey" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "LLMEvent" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "AlertRule" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "AlertHistory" ALTER COLUMN "workspaceId" SET NOT NULL;

CREATE INDEX "ApiKey_workspaceId_idx" ON "ApiKey"("workspaceId");
CREATE INDEX "ApiKey_projectId_idx" ON "ApiKey"("projectId");

CREATE INDEX "LLMEvent_workspaceId_idx" ON "LLMEvent"("workspaceId");
CREATE INDEX "LLMEvent_projectId_idx" ON "LLMEvent"("projectId");
CREATE INDEX "LLMEvent_workspaceId_createdAt_idx" ON "LLMEvent"("workspaceId", "createdAt");
CREATE INDEX "LLMEvent_workspaceId_projectId_createdAt_idx" ON "LLMEvent"("workspaceId", "projectId", "createdAt");
CREATE INDEX "LLMEvent_workspaceId_provider_createdAt_idx" ON "LLMEvent"("workspaceId", "provider", "createdAt");
CREATE INDEX "LLMEvent_workspaceId_model_createdAt_idx" ON "LLMEvent"("workspaceId", "model", "createdAt");

CREATE INDEX "AlertRule_workspaceId_idx" ON "AlertRule"("workspaceId");
CREATE INDEX "AlertRule_projectId_idx" ON "AlertRule"("projectId");

CREATE INDEX "AlertHistory_workspaceId_idx" ON "AlertHistory"("workspaceId");
CREATE INDEX "AlertHistory_projectId_idx" ON "AlertHistory"("projectId");

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LLMEvent"
  ADD CONSTRAINT "LLMEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LLMEvent"
  ADD CONSTRAINT "LLMEvent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AlertRule"
  ADD CONSTRAINT "AlertRule_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AlertRule"
  ADD CONSTRAINT "AlertRule_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
