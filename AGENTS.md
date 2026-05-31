# AGENTS.md

## Cursor Cloud specific instructions

### Products in this repo

- **Vivi Telematics web app**: `frontend/` (Vite + React) + `backend/` (Cloudflare Worker via Wrangler).
- **Mitac camera intercom** (Android scaffold): `camera_ai_intercom/` — separate Gradle project; not required for web dev.
- **`backend/src/vps_server.ts`**: optional Express alternative for device ingest, live video, intercom, etc. Not wired in `backend/package.json`; ignore for the documented Worker stack.

### Local full-stack (recommended)

1. **API**: `cd backend && npm run dev` → `http://localhost:8787` (Wrangler emulates KV + D1 locally).
2. **UI**: `cd frontend && VITE_API_BASE_URL=http://localhost:8787 npm run dev` → `http://localhost:5173`.

Committed `frontend/.env` points at production (`https://api.vivitelematics.ca`). Override `VITE_API_BASE_URL` for local API calls (the code uses `VITE_API_BASE_URL`, not `VITE_API_BASE` from the root README).

### Lint / typecheck / build

- No ESLint config in repo.
- `npm run typecheck` in **frontend** and **backend** currently fail due to pre-existing issues (missing modules/exports in `frontend`, and `vps_server.ts` included in backend `tsconfig` without its Node dependencies).
- `npm run build` in **frontend** fails on unresolved imports in `Assets.tsx` (`../components/Icons`, etc.). Dev server (`npm run dev`) still serves many routes (e.g. Config Admin) that do not depend on those broken imports at runtime.

### Quick API smoke test

```bash
curl -s http://localhost:8787/health
curl -s http://localhost:8787/d1/configuration-groups -H 'x-tenant-id: demo-tenant'
```

### Optional: Android intercom

`cd camera_ai_intercom/android && ./gradlew assembleDebug` (requires Android SDK / JDK).
