# Security

TokenWatcher is self-hosted software. Your deployment choices determine how exposed the dashboard, database, and ingest API are.

## Deployment Guidance

- Do not expose the dashboard publicly without authentication enabled.
- Use a strong `DASHBOARD_SESSION_SECRET`; generate one with `openssl rand -base64 32`.
- Change `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD` before production use.
- Use HTTPS in production so dashboard session cookies are protected in transit.
- Rotate `TOKENWATCHER_API_KEY` immediately if it is leaked.
- Prefer DB-backed hashed API keys for production ingest traffic.
- Prefer project-scoped API keys for production apps. Workspace-level keys can write to multiple projects and should be treated as more powerful.
- API keys created from the dashboard are stored as hashes. The raw key is shown only once.
- Revoke leaked dashboard-created API keys from `/dashboard/api-keys`.
- Keep production, staging, development, and test traffic in separate projects so alerting and spend reports do not blur environments.
- Keep `STORE_PROMPTS="false"` unless prompt and completion retention is absolutely required.
- Avoid sending PII in tags, metadata, prompts, or completions.
- The SDK does not send prompts or completions by default. Passing prompt text with `storePrompt: true` is still subject to the server-side `STORE_PROMPTS` setting.
- Avoid putting PII or secrets in tags. Treat `userId` as sensitive and prefer an internal stable identifier over email addresses or names.
- SDK and server debug logs mask API keys and must never log raw keys, prompt bodies, completion bodies, or webhook secrets.
- SDK batch mode stores events in process memory until flush; call `shutdown()` during graceful app shutdown.
- Use proper PostgreSQL backups and test restores.
- Restrict database network access to the TokenWatcher app and trusted operators.
- Use HTTPS webhook URLs in production and validate incoming webhook payloads on the receiving service.
- Be careful with webhook destinations. TokenWatcher blocks obvious local/private webhook URLs in production, but DNS-based SSRF protection is still a future hardening item.

## Rate Limiting

The MVP ingest rate limiter is in-memory and suitable only for a single app instance. Multi-instance deployments should replace it with Redis or another shared store.

## Reporting Issues

If you discover a vulnerability, please avoid opening a public issue with exploit details. Contact the maintainers privately first, then coordinate disclosure.
