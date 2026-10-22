# Vivitel Production Architecture

This document explains how Vivitel is built to survive the gap between **“works on my machine”** and **production with thousands of users, different tenants, and different device settings**.

It follows four pillars:

1. **DevOps build spot** — reproducible infrastructure you can stand up anywhere  
2. **Prometheus watchful eye** — metrics and alerts before users notice  
3. **Inside the architecture** — how data and requests flow under load  
4. **Power and its price** — what each tier costs and when to enable it  

---

## 1. DevOps build spot

The **build spot** is where production parity starts: same Postgres mirror, Valkey cache, Prometheus scraper, and Grafana dashboards — locally or on a monitoring host.

### Quick start (full production stack)

```bash
cd vivi_telematic/backend/observability
cp .env.production.example .env.production   # edit passwords
docker compose -f docker-compose.production.yml --env-file .env.production up -d
```

This starts:

| Service | Role | Port |
|---------|------|------|
| **PostgreSQL 16** | Analytics mirror (not source of truth) | 5432 |
| **Valkey 8** | Hot read cache for VPS API | 6379 |
| **Prometheus** | Scrapes VPS `/metrics` | 9090 |
| **Grafana** | Dashboards + alert UI | 3001 |

### Wire the VPS API (systemd)

Edit `backend/vps.service` on the VPS host:

```ini
Environment="PG_MIRROR_DATABASE_URL=postgresql://vivitel:PASSWORD@127.0.0.1:5432/vivitel"
Environment="VALKEY_URL=redis://:PASSWORD@127.0.0.1:6379"
Environment="VPS_RATE_LIMIT_ENABLED=true"
Environment="VPS_RATE_LIMIT_MAX=600"
Environment="VPS_RATE_LIMIT_WINDOW_MS=60000"
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart vivi-telematic
cd /opt/vivitel/vivi_telematic/backend && npm run db:pg:indexes
```

### Verify the stack

```bash
cd vivi_telematic/backend
npm run verify:stack -- http://YOUR_VPS:8787
curl -s http://YOUR_VPS:8787/metrics | head
```

### CI/CD today

- **GitHub Actions** (`.github/workflows/ci.yml`): typecheck, prettier, build on every PR  
- **Deploy**: manual safe rollout via `deploy-vps-backend-safe.ps1` and Cloudflare `wrangler deploy`  

---

## 2. Prometheus watchful eye

Prometheus is the **watchful eye** on the VPS Express server. Cloudflare Workers cannot run a pull-based metrics server, so the VPS is the single scrape target.

### Metrics endpoint

`GET /metrics` on port **8787** exposes:

| Metric | Meaning |
|--------|---------|
| `vivi_http_requests_total` | Request volume by method/route/status |
| `vivi_http_request_duration_seconds` | Latency histogram |
| `vivi_storage_sqlite` | 1 = persistent SQLite active |
| `vivi_valkey_connected` | 1 = Valkey cache ready |
| `vivi_postgres_mirror_enabled` | 1 = PG mirror configured |
| `vivi_postgres_mirror_lag_events` | SQLite − PG event count (mirror drift) |
| `vivi_worker_forward_queue_depth` | Events waiting VPS → Worker |
| `vivi_traccar_outbox_pending` | Command jobs backlog |
| `vivi_rate_limit_exceeded_total` | HTTP 429 responses issued |
| `process_*` | CPU, memory, event loop (Node default) |

### Alert rules

`backend/observability/prometheus/alerts.yml` includes:

- VPS scrape down  
- SQLite memory fallback (data-loss risk)  
- Postgres mirror lag > 500 events  
- Worker forward failure rate elevated  
- HTTP 429 spike  
- Traccar outbox backlog  

### Grafana

Pre-provisioned dashboard: **Vivitel VPS Overview** (`observability/grafana/provisioning/dashboards/vivi-vps-overview.json`).

Point `prometheus/prometheus.yml` at production:

```yaml
- targets: ["162.35.186.103:8787"]
  labels:
    environment: production
```

---

## 3. Inside the architecture

### Storage tiers (mandatory policy)

| Tier | Engine | Data |
|------|--------|------|
| **Credentials** | Cloudflare D1 | RBAC users, password hashes, roles |
| **Source of truth** | VPS SQLite | Assets, telemetry, bindings, alerts, config |
| **Analytics mirror** | PostgreSQL | Read-heavy telemetry/reporting copies |
| **Hot cache** | Valkey | Sessions, telemetry query cache |
| **Scoped settings** | Cloudflare KV | User alert rules, libraries, per-tenant JSON |
| **Heavy blobs** | Backblaze B2 | Archives, media, exports |

**PostgreSQL is not the primary database.** SQLite on the VPS remains authoritative. Postgres receives best-effort mirrors for analytics and reporting queries (`createPostgresTelemetryMirror.ts`).

### PostgreSQL uses in the application

| Use | File / route |
|-----|----------------|
| Mirror asset upserts | `createAssetServices.ts` → `mirrorAssetUpsert` |
| Mirror telemetry writes | `createTelemetryServices.ts` → `mirrorTelemetryWrite` |
| Mirror archive metadata | `createTelemetryServices.ts` → `mirrorTelemetryArchive` |
| Read telemetry history | `registerTelemetryQueryRoutes.ts` → `readTelemetryHistory` |
| Find assets by IMEI | `registerTelemetryQueryRoutes.ts` → `findAssetsByImei` |
| Archive listing | `registerTelemetryQueryRoutes.ts` → `readTelemetryArchives` |
| JT808 latest position | `registerJt808HealthRoutes.ts` |
| Health + Prometheus lag | `/health`, `/metrics` |

Enable with `PG_MIRROR_DATABASE_URL` and run `npm run db:pg:indexes`.

### Production resilience (new)

| Problem | Solution |
|---------|----------|
| API overwhelmed by many users | **HTTP rate limiting** on VPS (`VPS_RATE_LIMIT_*`, returns 429 + `Retry-After`) |
| Frontend hits 429 / 5xx | **Exponential backoff** in `fetchWithAuthRetry` (`frontend/src/utils/api.ts`) |
| Worker forward drops on blip | **Retry queue** with backoff (`createWorkerForwardQueue.ts`) |
| Traccar commands fail | **SQLite outbox** with exponential backoff (existing) |
| Per-tenant settings clash | **Scoped KV keys** + site isolation rules (existing) |

### Request flow under load

```
User browser (Cloudflare Pages)
    → Worker API (auth, KV settings, D1 credentials)
    → VPS API (SQLite writes, PG mirror async, Valkey cache)
    → Prometheus scrapes /metrics every 15s

Device TCP ingest
    → VPS decode → SQLite → PG mirror (async)
    → Worker forward queue → Cloudflare Worker (retry on failure)
```

---

## 4. Power and its price

| Component | Power | Typical cost | When to enable |
|-----------|-------|--------------|----------------|
| **SQLite on VPS** | Single-writer ACID, low ops | Included with VPS | Always (required) |
| **Cloudflare D1** | Global credentials, low latency auth | Free tier / Workers plan | Always (credentials only) |
| **Cloudflare KV** | Per-tenant settings at edge | Workers plan | Always (operational JSON) |
| **Valkey** | 10–100× faster repeated reads | ~$0 (self-hosted on VPS) | **Recommended** at 50+ concurrent users |
| **PostgreSQL mirror** | Heavy reporting, IMEI history, analytics | ~$15–50/mo (managed) or docker on VPS | **Recommended** at 100k+ telemetry rows or slow reports |
| **B2** | Cheap durable blobs | ~$6/TB/mo | When storing archives/media |
| **Prometheus + Grafana** | Full observability | ~$0 self-hosted | **Recommended** before production launch |
| **Rate limiting** | Protects API from abuse/spikes | $0 (in-process) | Always in production |

### Cost-conscious path

1. **Minimum viable production**: VPS + SQLite + Worker + D1/KV + B2 — **$ VPS only**  
2. **Recommended production**: add Valkey + rate limiting + Prometheus — **+$0** on same VPS  
3. **Scale reporting**: add Postgres mirror + partial indexes — **+$0–50/mo**  
4. **Hosted observability**: Grafana Cloud — **~$0–49/mo** if you skip self-hosted Grafana  

---

## Why local dev diverges from production

| Local | Production |
|-------|------------|
| One user, one tenant | Thousands of users, many tenants/sites |
| Small SQLite file | Large telemetry tables, mirror lag possible |
| No rate limits hit | 429 responses under burst traffic |
| No Worker forward failures | Transient network → retry queue fills |
| No Prometheus | Blind to lag, queue depth, 429 spikes |

The stack above closes each gap **without** violating the storage policy (credentials on D1, operational data on server, blobs on B2).

---

## Related docs

- `MIX_PATTERNS.md` — Mix-style hierarchy, fleet filters, and live-row mapping (no MiX cloud API)  
- `STORAGE_AND_OBSERVABILITY.md` — tier map and env reference  
- `DEPLOYMENT.md` — deploy procedures  
- `.cursor/rules/data-storage-policy.mdc` — mandatory storage rules  
- `.cursor/rules/tenant-site-isolation.mdc` — multi-tenant isolation  
