# Migration Notes

## Phase 3: Workspaces and Projects

Phase 3 adds workspace and project scope to API keys, LLM events, alert rules, and alert history.

Existing installs are backfilled into:

- Workspace: `Default Workspace` (`default`)
- Project: `Default Project` (`default`, `production`)

Run:

```bash
npm run db:deploy
npm run db:backfill:workspaces
```

The backfill script is idempotent. It ensures the default workspace and project exist, then assigns old API keys, events, alerts, and alert history rows to that default scope.

If a migration fails, restore from backup, inspect the failed migration output, and rerun the backfill after the schema migration succeeds.
