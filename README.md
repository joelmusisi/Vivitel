# Vivitel

Minimal starter for a React/Vite frontend and a Cloudflare Worker backend.

## Frontend (`frontend`)

- Install: `npm install`
- Develop: `npm run dev`
- Type-check: `npm run typecheck`
- Build: `npm run build`

## Backend (`backend`)

- Install: `npm install`
- Local dev: `npm run dev`
- Type-check: `npm run typecheck`
- Deploy (requires auth): `npm run deploy`

## Notes

- Frontend uses Vite + React + TypeScript with a simple landing UI in `src/App.tsx`.
- Backend exposes `/`, `/health`, `/telemetry/summary`, and `/echo` (POST) routes via Cloudflare Workers. Configure env vars in `backend/wrangler.toml`.
- Personal access tokens: simple KV-backed endpoints for creating/listing/revoking tokens under `/pat` and `/pat/:id/revoke`. Frontend points to `VITE_API_BASE` (defaults to `http://localhost:8787`); set this in `frontend/.env` when calling a deployed Worker.
