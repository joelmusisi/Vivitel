Vivi Telematics VPS server — deployment notes

**Data safety:** Routine deploys must not delete or change user settings. See [`../DEPLOYMENT_DATA_SAFETY.md`](../DEPLOYMENT_DATA_SAFETY.md). Use `npm run deploy:vps` from the repo root (safe script preserves remote `data/`).

Build and run (local):

1. Install deps and build

```bash
cd vivi_telematic/backend
npm ci
npm run build:vps
```

2. Run:

```bash
# optional envs
export API_KEY=your_api_key
export PORT=8787
export DB_PATH=./vivi.db
export REQUIRE_PERSISTENT_DB=true
export VALKEY_URL='redis://:Vivi%40Secure123@127.0.0.1:6379'
# If you have TLS cert/key files:
export TLS_CERT_PATH=/etc/ssl/certs/your.crt
export TLS_KEY_PATH=/etc/ssl/private/your.key

node build/vps_server.js
```

Important production note

- Set `REQUIRE_PERSISTENT_DB=true` on VPS. This prevents accidental startup in in-memory mode (which loses storage/live continuity on restart).
- If SQLite native module is missing, startup will now fail loudly so you can fix the VPS dependency installation instead of silently losing persistence.
- For `VALKEY_URL`, URL-encode special password characters. Example: `@` becomes `%40`.
- When `VALKEY_URL` is configured, the backend also uses Valkey/Redis for admin session caching, `/auth/me` response caching, and the RBAC user read model used by impersonation flows.
- Protected-route auth checks now use a bounded in-process session hot cache first, then SQLite as the fallback source of truth; Valkey stays active for distributed auth/session read caching so the two layers do not contend on every request.
- Session revocation is explicit: `POST /auth/logout` clears the current token from the in-process hot cache, SQLite `admin_sessions`, and Valkey auth keys; `POST /auth/revoke` does the same for a supplied token.
- `/health` now reports both auth hot-cache stats and logout/revoke invalidation counters so you can verify that revocations are happening and not just relying on TTL expiry.

Docker

```bash
cd vivi_telematic/backend
docker build -t vivi-telematics-backend .
docker run -p 8787:8787 -e API_KEY=your_api_key -e DB_PATH=/data/vivi.db vivi-telematics-backend
```

Systemd (example)

Copy `vps.service` to `/etc/systemd/system/vivi-telematic.service`, update `WorkingDirectory` and `ExecStart` paths, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vivi-telematic.service
sudo journalctl -u vivi-telematic.service -f
```

Verify storage + live ingest health

```bash
# Basic health
curl -s http://127.0.0.1:8787/health | jq

# Tenant-scoped latest telemetry in DB
curl -s "http://127.0.0.1:8787/health?tenant=<tenant-id>" | jq '.telemetry'

# TCP listener diagnostics (Teltonika direct ingest)
curl -s http://127.0.0.1:8787/health/tcp | jq
```

Additional direct ingest options (non-Teltonika)

- Freematics (HTTP JSON)
	- Endpoint: `POST /ingest/freematics`
	- Supports common fields such as `lat/lon`, `speed`, `heading`, `satellites`, `timestamp`, `imei`.
- Queclink (TCP ASCII)
	- Set `QUECLINK_PORT=<port>` to enable a TCP listener for `+RESP:+BUFF` style messages.
	- Optional default tenant: `QUECLINK_DEFAULT_TENANT=<tenant-id>`.
- JT/T808 (TCP)
	- Set `JT808_PORT=<port>` to enable the JT/T808 listener.
	- The backend auto-detects JT/T808 on the shared telemetry TCP ingest path.
	- Optional default tenant: `JT808_DEFAULT_TENANT=<tenant-id>`.
- Concox GT06 (TCP)
	- Set `CONCOX_PORT=<port>` to enable a GT06 TCP listener.
	- Optional default tenant: `CONCOX_DEFAULT_TENANT=<tenant-id>`.

Optional Freematics default tenant:

- `FREEMATICS_DEFAULT_TENANT=<tenant-id>`

Example environment block:

```bash
export JT808_PORT=5015
export JT808_DEFAULT_TENANT=default
export CONCOX_PORT=5013
export CONCOX_DEFAULT_TENANT=default
export QUECLINK_PORT=5021
export QUECLINK_DEFAULT_TENANT=default
export FREEMATICS_DEFAULT_TENANT=default
```

You can inspect protocol listener health at `/health/tcp` where `teltonika`, `concox`, and `queclink` sections are reported, and use `/health/jt808` for JT/T808-specific frame/login/location diagnostics.

Protocol replay smoke test

You can replay sample payloads for Freematics, Queclink, and Concox into your running VPS backend:

```bash
cd vivi_telematic/backend
npm run replay:protocols
```

Optional flags:

```bash
node scripts/replay_protocols.mjs \
	--base-url http://127.0.0.1:8787 \
	--tenant default \
	--concox-port 5013 \
	--queclink-port 5021
```

If your VPS requires API key auth for non-loopback requests, pass:

```bash
node scripts/replay_protocols.mjs --api-key <your-api-key>
```

The script prints `PASS/FAIL` for each protocol path, summarizes `/health/tcp` counters,
checks telemetry event count delta from `/health`, and verifies replay IMEIs exist in `/d1/assets`.

Expected in `/health` for VPS:

- `storage.mode = "sqlite"`
- `telemetry.latestEventAt` keeps moving forward
- `workerForward.failed` remains low (if forwarding to Worker is enabled)

Teltonika IO decoding (recommended)

This backend can decode Traccar-forwarded Teltonika I/O values like `io8000`, `io8069`, `io8223`, etc. into human-readable names (Ignition, ICCID, BLE Temp #1, …) using the Teltonika Configurator export that is already in this repo:

- Source file (in this repo): `vivi_telematic/120 - 190 FMB Configuration File New.cfg`

On your VPS:

1. Create a folder for the mapping file:

```bash
sudo mkdir -p /opt/vivitel/vivi_telematic/backend/teltonika
```

2. Copy the cfg to the VPS (example from your local machine):

```bash
scp "vivi_telematic/120 - 190 FMB Configuration File New.cfg" \
	<user>@<vps>:/opt/vivitel/vivi_telematic/backend/teltonika/
```

3. In systemd, set:

```ini
Environment="TELTONIKA_CFG_PATH=/opt/vivitel/vivi_telematic/backend/teltonika/120 - 190 FMB Configuration File New.cfg"
```

4. Restart the service:

```bash
sudo systemctl daemon-reload
sudo systemctl restart vivi-telematic.service
```

If `TELTONIKA_CFG_PATH` is not set or the file is missing, the backend will still ingest telemetry, but it won’t be able to translate IO ids into friendly names.

TLS

- You can let a reverse proxy (nginx, Caddy) terminate TLS and forward plain HTTP to the Node server. This is the recommended setup for production.
- Alternatively, set `TLS_CERT_PATH` and `TLS_KEY_PATH` (or `TLS_CERT`/`TLS_KEY` base64 envs) and the server will start an HTTPS listener directly.

Worker-to-VPS API

The Worker uses the separate `vps-api.vivitelematics.ca` hostname for VPS operational storage and realtime endpoints. Do not point this hostname at the Traccar service.

1. Create a DNS-only A record `vps-api.vivitelematics.ca` pointing to the VPS public IP (or add this host to the existing VPS ingress DNS target).
2. Allow inbound TCP ports 80 and 443 so Caddy can obtain and renew a publicly trusted certificate.
3. Install Caddy and configure `/etc/caddy/Caddyfile`:

```caddy
vps-api.vivitelematics.ca {
    reverse_proxy 127.0.0.1:8787
}
```

4. Reload Caddy and verify `https://vps-api.vivitelematics.ca/health` before enabling Worker requests. For Kubernetes installs, also add `vps-api.vivitelematics.ca` to the ingress and ensure its TLS certificate covers that host; both the Helm and raw manifests now include this hostname.

`backend/wrangler.toml` uses `VPS_ORIGIN = "https://vps-api.vivitelematics.ca"`. Configure the same strong random key as `API_KEY` in the VPS-only `backend/.env.vps` and as the Cloudflare Worker secret `API_KEY_PERMANENT` (or `API_KEY`). Never put the key in `[vars]`, source files, or chat. Internal operational-storage and report-archive routes fail closed if the VPS key is unset.

For the worker secret, from `backend/` run `wrangler secret put API_KEY_PERMANENT` and enter the value interactively. Configure the VPS value out-of-band on the server, then restart the backend. Do not paste or commit the secret.

Cloudflare Worker: movement telemetry archive to Backblaze B2

The Worker (`src/worker.ts`) archives telemetry movement events and route libraries to Backblaze B2 when B2 credentials are configured.

**Default / legacy bucket** (Mitac, device artifacts, dual-read fallback):

```bash
cd vivi_telematic/backend
wrangler secret put B2_KEY_ID
wrangler secret put B2_APP_KEY
wrangler secret put B2_BUCKET_ID
# Optional if you prefer resolving by name instead of id:
wrangler secret put B2_BUCKET_NAME
```

**Track bucket** (`VIVI-TRACK` — telemetry + route libraries). Falls back to default when unset:

```bash
wrangler secret put B2_TRACK_KEY_ID
wrangler secret put B2_TRACK_APP_KEY
wrangler secret put B2_BUCKET_ID_TRACK
# or:
wrangler secret put B2_BUCKET_NAME_TRACK
```

**Reports bucket** (`Vivi-Reports` — cold report archives). Falls back to default when unset:

```bash
wrangler secret put B2_REPORTS_KEY_ID
wrangler secret put B2_REPORTS_APP_KEY
wrangler secret put B2_BUCKET_ID_REPORTS
# or:
wrangler secret put B2_BUCKET_NAME_REPORTS
```

Optional Worker vars:

```toml
# backend/wrangler.toml
[vars]
B2_API_BASE = "https://api.backblazeb2.com"
B2_ARCHIVE_PREFIX = "telemetry-archive"
```

When enabled, each telemetry event is uploaded to the Track bucket (or default fallback) and indexed in D1 table `telemetry_archives` with storage metadata (`storage`, `storage_key`, `size_bytes`). Object paths are unchanged; reads dual-fall back to the legacy bucket.

**VIVI Mobile push notifications** (FCM HTTP v1; iOS goes through APNs configured in the same Firebase project):

```bash
# Firebase console → Project settings → Service accounts → Generate new private key.
# Paste the whole JSON file as the value. Never commit it.
wrangler secret put FCM_SERVICE_ACCOUNT_JSON
```

The secret is read by the Worker only (alert dispatch runs in the Worker cron and Traccar ingest). The VPS needs nothing. When it is unset, push is skipped and in-app/email alerts work as before.

- `POST /api/mobile/push-tokens` / `DELETE /api/mobile/push-tokens` with `{ "token", "platform": "ios" | "android" }`, authenticated with the user's `x-api-key` session and `x-tenant-id`. Tokens are kept per tenant + user in the VPS-backed `ViviTEL` store (`vivi:push-tokens:<tenant>:<user>`), not in Cloudflare KV/D1.
- Every new in-app alert for a person on an alert's in-app recipient list is also pushed to their devices with `data.screen = "map"`. Tokens FCM reports as `UNREGISTERED` are removed.
