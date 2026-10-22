# VIVI Telematic — agent notes

## Deployment data safety (non-negotiable)

Routine **`npm run deploy`** / Cloudflare / VPS scripts must **never** delete or reset user settings (D1, KV, SQLite `data/`, scoped libraries, bindings, config groups, RBAC).

- Read **`DEPLOYMENT_DATA_SAFETY.md`** before changing deploy scripts, startup migrations, or load-time “cleanup” that writes to KV/API.
- Deploy = **code only**; production data stores persist unless an operator runs explicit destructive CLI/API actions.
- Do not add postinstall/predeploy hooks that seed, truncate, or purge tenant data.
- Prefer additive schema (`CREATE IF NOT EXISTS`, guarded `ALTER`). Never `DROP` user tables on app start.
- Frontend: do not auto-persist library/binding “repairs” on page load unless removing **known legacy demo** rows only; keep empty-server → cached-bindings guard.

## Scope isolation (non-negotiable)

Each **dealer**, **organisation**, **database**, and **site** has its own settings. They do not share notification libraries, bindings, configuration groups UI, or compile targets across sites.

### Frontend

| Concern | Use |
|--------|-----|
| Notification / location library KV | `loadScopedFromApi` / `saveScopedToApi` in `frontend/src/utils/scopeStorage.ts` |
| Config group local cache | `configGroupsCacheKey()` |
| Filter lists by site | `filterForSiteScope()` |
| Site change | `activateSiteContext()` in `frontend/src/utils/tenantContext.ts` |
| Binding site match | `bindingMatchesSite()` in `frontend/src/utils/scopeIsolation.ts` |

Direct `loadFromApi("libraries:notification")` or `saveToApi("libraries:notification", …)` is **blocked** when a site is selected.

### Backend

- `POST /kv/libraries:notification` (flat key) → **400**; use scoped keys only.
- `POST /d1/bindings` without `site` on database tenants → **400**.

See `backend/src/shared/scopeIsolation.ts`.

### Tests

- `frontend/src/utils/scopeIsolation.test.ts`
- `frontend/src/utils/bindingRecordUtils.test.ts`

Run: `cd frontend && npm test` (if vitest is configured).
