# Feature modules

Each product area owns its route map so edits stay isolated while the app shell
keeps shared auth, tenant context, API clients, and navigation.

## Modules

| Module | Owns |
|--------|------|
| `track` | Live/historical tracking, fleet, video, jobs, journey, HOS, streams |
| `control` | Libraries, bindings, config, ops, users, notifications, settings |
| `analyze` | Dashboards, reports, insight tools, analysers |
| `deliver` | Drone delivery + platform apps |
| `auth` | Login, reset password, public live share |
| `mobile` | Phone-shell surfaces |
| `marketing` | Public website |
| `home` | Authenticated desktop home |

## Shared connections (do not duplicate)

- `src/utils/api.ts` — HTTP, auth, RBAC helpers
- `src/utils/tenantContext.ts` / `scopeStorage.ts` — tenant + site isolation
- `src/components/*` — shell UI (TopNav, OrgRibbon, ErrorBoundary)
- `src/navData.ts` — nav labels/paths

## How to add or change a page

1. Put or edit the page under `src/pages/...` (or later under the module folder).
2. Register the lazy import **only** in that module’s `routes.tsx`.
3. Do not add page imports to `App.tsx` — it composes `appRouteComponents` from `src/modules`.

## Runtime isolation

Protected routes wrap each page in an `ErrorBoundary` titled with the module
name, so a crash in Track does not blank Control/Analyze/etc.

## Performance

Pages remain `React.lazy` code-split chunks. Vite also names chunks by module
when the importer path includes `/modules/<id>/`, so editing one module’s route
registry does not invalidate unrelated page chunks.
