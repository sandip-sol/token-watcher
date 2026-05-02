# Operations

## Rollups

TokenWatcher keeps raw `LLMEvent` rows for detailed analysis and stores daily/hourly rollups for fast dashboard aggregate queries. Rollups update after successful ingest commits when `ROLLUPS_ENABLED` is not `"false"`.

Usage aggregation, rollups, stats, and alerts use UTC day/hour/month boundaries. Keep dashboards, rebuild jobs, and alert thresholds aligned to UTC when comparing raw and rollup totals.

Rebuild rollups after migrations, imports, or manual data fixes:

```bash
npm run db:rebuild-rollups -- --from=2026-05-01 --to=2026-05-31
```

Optional filters:

```bash
npm run db:rebuild-rollups -- --workspaceId=workspace_id
```

Recommended cron:

```cron
15 2 * * * cd /app && npm run db:rebuild-rollups
*/10 * * * * curl -fsS -X POST "https://tokenwatcher.example.com/api/alerts/evaluate" -H "Authorization: Bearer $CRON_SECRET"
```

Keep raw events even when using rollups. Raw rows are the audit trail for debugging, tag analysis, and future rebuilds. Back up PostgreSQL regularly and test restores before relying on backups.

## Security Operations

Dashboard write APIs are cookie-authenticated and require CSRF tokens. The browser dashboard uses `GET /api/auth/csrf` and sends `X-CSRF-Token` automatically. Bearer-token ingest routes (`/api/ingest` and `/api/ingest/batch`) do not use CSRF.

CSP is enforced by default. Use `CSP_REPORT_ONLY="true"` during deployment testing, then switch it back to `"false"` once dashboards, charts, and any explicitly configured `CSP_CONNECT_SRC` origins are verified.

Validation commands before release:

```bash
npm run typecheck:all
npm run test:all
npm run build:all
```
