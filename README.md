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
 - Personal access tokens: simple KV-backed endpoints for creating/listing/revoking tokens under `/pat` and `/pat/:id/revoke`. Frontend points to `VITE_API_BASE` (defaults to `http://localhost:8787`); set this in `frontend/.env` when calling a deployed Worker.

## VPS deployment and architecture

This project can run with the backend hosted either as a Cloudflare Worker (using `wrangler`) or as a classic VPS-hosted HTTP server (for development or production on a VPS). The recommended runtime for now is your existing VPS.

- Flow overview:
	- **Frontend**: `vivi_telematic/frontend` — connects to the internet and calls the backend API at `VITE_API_BASE_URL`.
	- **Backend (VPS)**: Accepts HTTP requests from the frontend, authenticates using `x-api-key` or tenant headers, and proxies/coordinates communication to devices.
	- **Device**: Devices hold the onboard modems and GNSS receivers and communicate over mobile networks and satellite links to the device endpoint; the backend triggers fetches and receives telemetry via device endpoints or push mechanisms.
	- **Storage (D1)**: The backend stores entities and telemetry in `VIVI_D1` (or an equivalent SQL store on your VPS). The code in `backend/src/worker.ts` adapts D1 usage; when running on VPS you should provide an equivalent SQLite/Postgres connection string and ensure the `ensureD1Tables` SQL runs on startup.

- Key env vars to set when using a VPS:
	- Backend: `API_KEY` (shared secret for server-to-server calls), `SUPPORT_EMAIL`, DB connection params (or a `D1` adapter), storage credentials if using R2/S3, and any task queue config.
	- Frontend: `VITE_API_BASE_URL` — set to `https://your-vps.example.com` (or `http://<IP>:<PORT>`), and optionally `VITE_API_KEY` when calling protected endpoints.

Steps to use your VPS as the server for now:
1. Deploy the backend code to your VPS (adapt `worker.ts` into an Express/fastify server or run it as a Worker-compatible runtime if available).
2. Configure DB/storage on the VPS and run the `ensureD1Tables` SQL at startup.
3. Set the frontend env `VITE_API_BASE_URL` to the VPS public URL and set `VITE_API_KEY` if you require API key authentication.
4. Start the frontend and verify calls reach the VPS and that the VPS stores telemetry to D1 (or your DB).

If you want, I can add a small Express wrapper that reuses the route handlers in `worker.ts` so the same API surface runs on a VPS. Say the word and I'll scaffold it.

## Standalone single-camera setup (tracking + video telematics)

Use this when one camera should run as a self-contained unit and still appear in both basic tracking and video areas.

1. Start backend (`vivi_telematic/backend`) with at least:
	- `API_KEY=<your-key>`
	- `PORT=8787`
	- `DB_PATH=./vivi.db`
	- `REQUIRE_PERSISTENT_DB=true`

2. Point frontend (`vivi_telematic/frontend/.env`) to that backend:

```env
VITE_API_BASE_URL=http://<your-server>:8787
VITE_API_KEY=<your-key>
```

3. Configure the camera app SD config (`vivi_telematic/camera_ai_intercom/sdcard_package/config.json`):
	- `deviceId`: set a stable ID (example: `CAMERA-001`)
	- `tenantId`: choose your tenant (example: `default`)
	- `server.host`: backend host/IP
	- `server.port`: backend port (example: `8787`)
	- `server.apiKey`: same value as backend `API_KEY`
	- keep default paths for:
	  - `/ingest/camera-health`
	  - `/ingest/intercom-audio`
	  - `/intercom/talkback/next`
	  - `/intercom/talkback`

4. Verify the camera is connected:

```bash
curl -s -H "x-tenant-id: default" -H "x-api-key: <your-key>" http://<your-server>:8787/d1/cameras
```

5. Optional but recommended for basic tracking views:
	- Create one asset entry with matching camera fields (`camera`, `cameraModel`, `cameraSerial`), plus normal tracking fields (`imei`, configuration group).
	- The app can now show streaming rows from either assets or direct camera-health records.

Notes:
- Standalone camera health is stored through `/ingest/camera-health` and surfaced at `/d1/cameras`.
- Intercom uplink chunks are stored through `/ingest/intercom-audio` in rolling `.pcm` files under `CAMERA_RECORDINGS_DIR`.
- The live streaming page now includes standalone cameras returned by `/d1/cameras`, so a single-camera deployment appears even before full fleet commissioning.
