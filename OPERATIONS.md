# Operations

## Rollups

TokenWatcher keeps raw `LLMEvent` rows for detailed analysis and stores daily/hourly rollups for fast dashboard aggregate queries. Rollups update on ingest when `ROLLUPS_ENABLED` is not `"false"`.

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
