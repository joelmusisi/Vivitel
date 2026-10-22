# Deployment data safety

User settings (libraries, bindings, configuration groups, RBAC, assets, hierarchy, report favorites, and related data) are **intentional production state**. Routine deploys must **never** delete, reset, or overwrite them.

Every npm deployment entry point runs `scripts/Test-DeploymentDataSafety.ps1` first. The deployment is blocked if the D1 credential binding drifts, a Cloudflare KV binding is reintroduced, destructive data commands are added to deploy hooks, or VPS data-preservation safeguards are removed.

## What deploy scripts do (safe by design)

| Command | Changes | Does **not** touch |
|--------|---------|-------------------|
| `npm run deploy` / `deploy:cloudflare` | Worker code, static frontend (`dist`) | Cloudflare **D1** contents and **R2** |
| `npm run deploy:worker` | Worker bundle only | D1 contents |
| `npm run deploy:frontend` | Pages static files only | Server data |
| `npm run deploy:vps` | VPS app code (`build/`, `node_modules`) | Remote **`data/`** SQLite, `.env.vps`, `teltonika/` |

VPS rollout uses `deploy-vps-backend-safe.ps1`: copies live `data/` and `.env.vps` into the new stage, smoke-tests, swaps binaries, rolls back on failure. The deploy tarball **excludes** local `backend/data` and `backend/.env.vps`.

Frontend deploy only removes and rebuilds **`dist/`** (compiled JS/CSS). That is not user configuration.

## Where settings live

- **Cloudflare Worker**: D1 (`VIVI_D1`) is reserved for authentication and access-control tables (users, roles, permissions, and assignments). Worker operational SQL and KV-compatible calls are routed to the VPS API; there is no Cloudflare KV binding. Legacy operational rows and KV keys are intentionally left untouched and are not read as fallback data.
- **VPS**: SQLite under `DB_PATH` (production: `/opt/Vivitel/backend/data`) is authoritative for operational SQL, Worker key-value data, telemetry, and report archive metadata. Worker storage endpoints require the configured API key and an internal-forwarding header. Optional Valkey is a cache, not the source of truth. Generated report snapshots stay on VPS for 90 days, are copied and read-back verified in the `Vivi-Reports` B2 bucket, and remain on VPS after archival.
- **Realtime migration status**: a VPS WebSocket hub is implemented locally for `/ws`, `/stream/ws`, and `/realtime/ws`; local tests cover the VPS WebSocket/live-data path. Production Worker forwarding is not enabled until a dedicated TLS VPS API hostname is reachable and verified. Scheduled Worker jobs and their D1-backed job queues have not yet been migrated. Keep existing Worker Durable Object/cron bindings until scheduled replacements and production cutover checks are complete.
- **Browser**: `localStorage` caches (bindings, assets, org ribbon). Deploy may ship new UI code; the app **must not** treat empty API responses as “delete my settings” (see `api.ts` binding guard).

## Rules for anyone deploying

1. **Never** run destructive Wrangler/D1/R2 commands against production unless doing a documented disaster recovery with backups:
   - `wrangler d1 delete`, `d1 execute` with `DROP`/`DELETE` without a `WHERE` tenant scope
   - Replacing `database_id` in `wrangler.toml` with a new empty database
2. **Never** bundle or overwrite production `backend/data` from a developer machine.
3. On VPS, keep **`REQUIRE_PERSISTENT_DB=true`** so the server refuses to start in in-memory mode (which would lose data on restart).
4. Keep **`ALLOW_ADMIN_BOOTSTRAP=false`** in production (`wrangler.toml` / env) unless actively recovering admin access.
5. Do **not** run one-off seed scripts (`backend/scripts/seed_assets_for_imeis.ps1`, etc.) against production without explicit approval.
6. Schema changes must be **additive only**: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE` with try/catch for existing columns — no table drops on startup.

## Application behaviour after deploy

- Startup migrations add tables/columns; they do not truncate user tables.
- Loading Libraries/Reports must not auto-save “cleanup” to VPS SQLite/localStorage except for **known legacy demo** rows only; keep empty-server → cached-bindings guard.
- **Never** write bundled/default library seeds into VPS storage because a VPS GET failed or returned empty after deploy — that overwrites real user settings.
- Binding reads keep the last good cache when the server returns an empty list (cold start / transient errors).
- Binding **purge** APIs (`purge=1`) are explicit user/admin actions — not part of deploy.

## Deploy pipeline guarantees

| Layer | Guarantee |
|-------|-----------|
| `Test-DeploymentDataSafety.ps1` | Blocks deploy scripts that delete D1/Pages/R2 or drop tables; verifies matching D1 IDs and no KV bindings; requires VPS `data/` copy |
| Pages (`deploy-pages.ps1`) | Deletes only local `dist/` before rebuild — not Cloudflare project settings |
| Worker (`wrangler deploy`) | Uploads Worker code only — does not migrate/wipe D1 |
| VPS (`deploy-vps-backend-safe.ps1`) | Copies live `data/` + `.env.vps` into the new stage; never ships local `backend/data` |

## If settings seem missing after deploy

1. Confirm the same **tenant** and **site** are selected in the org ribbon.
2. Check API health and tenant header (`x-tenant-id`).
3. For VPS, verify `/health` reports `storage.mode = "sqlite"` and the correct `DB_PATH`.
4. Do not run purge or bootstrap endpoints to “fix” the UI — that can make things worse.
5. Soft-refresh the app; do **not** clear site data / localStorage as a first step.

## Related docs

- `backend/README.deploy.md` — VPS env and persistence
- `AGENTS.md` — scope isolation (per-site settings)
