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
- Cookie-authenticated dashboard write routes use double-submit CSRF protection. `GET /api/auth/csrf` issues the token, dashboard fetches send it as `X-CSRF-Token`, and ingest endpoints are excluded because they use Bearer API keys.
- Keep `ALLOW_INGEST_COST_OVERRIDE="false"` for public deployments. Cost is calculated server-side by default; letting ingest clients provide cost values is unsafe for audit integrity.
- Keep production, staging, development, and test traffic in separate projects so alerting and spend reports do not blur environments.
- Keep `STORE_PROMPTS="false"` unless prompt and completion retention is absolutely required.
- Avoid sending PII in tags, metadata, prompts, or completions.
- The SDK does not send prompts or completions by default. Passing prompt text with `storePrompt: true` is still subject to the server-side `STORE_PROMPTS` setting.
- Avoid putting PII or secrets in tags. Treat `userId` as sensitive and prefer an internal stable identifier over email addresses or names.
- SDK and server debug logs mask API keys and must never log raw keys, prompt bodies, completion bodies, or webhook secrets.
- SDK batch mode stores events in process memory until flush; call `shutdown()` during graceful app shutdown.
- Server batch ingest is all-or-nothing: validation, project scoping, and inserts must all succeed before any batch event is committed.
- Use proper PostgreSQL backups and test restores.
- Restrict database network access to the TokenWatcher app and trusted operators.
- Use HTTPS webhook URLs in production and validate incoming webhook payloads on the receiving service.
- Be careful with webhook destinations. TokenWatcher blocks obvious local/private webhook URLs in production, but DNS-based SSRF protection is still a future hardening item.
- TokenWatcher sets a CSP in middleware and `next.config.js`. Production uses `script-src 'self'`, `object-src 'none'`, and `frame-ancestors 'none'`; development adds the allowances Next.js needs for local dev. Set `CSP_REPORT_ONLY="true"` to test deployments before enforcing, and use `CSP_CONNECT_SRC` only for explicit extra trusted origins.

## Rate Limiting

The MVP ingest rate limiter is in-memory and suitable only for a single app instance. Multi-instance deployments should replace it with Redis or another shared store.

## Reporting Issues

If you discover a vulnerability, please avoid opening a public issue with exploit details. Contact the maintainers privately first, then coordinate disclosure.
