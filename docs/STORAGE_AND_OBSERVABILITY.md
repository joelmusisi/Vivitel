# Vivitel Storage & Observability Architecture

This document maps every data category in the Vivitel telematics platform to the
**approved storage tiers** (D1 for credentials, server storage for operational
data, B2 for heavy blobs) and documents the observability/CI stack.

> **Policy:** Authentication and access-control data (users, roles, permissions,
> and assignments) live on Cloudflare D1. All operational data, including
> Worker key-value data and live telemetry, is stored on VPS SQLite. Generated
> report archives are copied to Backblaze B2 after 90 days; the VPS copy is kept.

---

## Storage tier map

| Data category | What it means | Vivitel implementation | Engine / binding |
|---|---|---|---|
| **Relational** | Structured rows, joins, ACID | VPS operational data (assets, alerts, bindings, config groups, telemetry events) | **SQLite** (`better-sqlite3`, `DB_PATH`) — source of truth on VPS |
| **Relational (analytics)** | Read-heavy telemetry queries, reporting | Optional telemetry mirror | **PostgreSQL** (`pg`, `DATABASE_URL` / `PG_MIRROR_DATABASE_URL`) — best-effort mirror, not authoritative |
| **In-memory** | Hot caches to reduce DB load | Auth session hot cache, Worker in-process caches | **Node.js memory** + **Valkey** (`iovalkey`, `VALKEY_URL`) |
| **Key-value** | Fast session/settings lookups | Worker key-value data, scoped settings, dashboard cache, user alert rules | Worker-compatible API backed by **VPS SQLite**; optional **Valkey** is cache-only |
| **Document** | Evolving JSON configs (bindings, libraries, alert rules) | Scoped JSON documents and Worker KV-compatible values | **VPS SQLite JSON** — no Cloudflare KV binding |
| **Blob** | Large archives, media, exports | Telemetry archives, camera recordings, heavy exports | **Backblaze B2** (`@aws-sdk/client-s3` on VPS; native B2 API in Worker) |
| **Time-series** | High-volume timestamped telemetry | Telemetry events table + optional PG mirror; Traccar for live positions | **SQLite** + **Postgres** (optionally **TimescaleDB** extension) + **Traccar** |
| **Text search** | Full-text search on assets/alerts/logs | *Planned:* SQLite FTS5 virtual tables | **SQLite FTS5** — zero new infrastructure |
| **Graph** | Relationship traversal (org hierarchy) | Hierarchy tree in VPS JSON + in-memory filtering | **VPS SQLite JSON** + application code — no graph DB needed at current scale |
| **Wide-column** | Massive horizontal scale column store | Not required at current fleet size | **Not used** — SQLite/Postgres sufficient |
| **Special** | Auth credentials, RBAC | Password hashes, roles, permissions, tenant/site assignments | **Cloudflare D1** (`VIVI_D1` binding) — authentication and access control only |

### What we deliberately do NOT add

MongoDB, Neo4j, Cassandra, InfluxDB, Elasticsearch, ClickHouse, etc. are
**not deployed**. Each adds operational cost and violates the narrow-scope
storage policy unless a concrete, proven need emerges.

---

## Deployment topology

```
Devices (TCP: Teltonika / Concox / Queclink / JT808)
        │
        ▼
┌───────────────────────────────────────────────────────┐
│  VPS Express Server  (vps_server.ts)                  │
│  • SQLite (primary store)                             │
│  • Valkey (optional cache)                            │
│  • Postgres mirror (optional)                         │
│  • B2 uploads (S3 SDK)                                │
│  • GET /health  GET /metrics                          │
│  • Forwards telemetry → Worker                        │
└───────────────┬───────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────┐
│  Cloudflare Worker  (worker.ts)                         │
│  • D1 (authentication / access control)                │
│  • VPS API (operational SQL and KV-compatible data)    │
│  • B2 (report archives after 90 days)                  │
│  • Traccar proxy, cron alert dispatch                 │
└───────────────┬───────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────┐
│  Cloudflare Pages  (React frontend)                   │
└───────────────────────────────────────────────────────┘
```

---

## Related docs

- **[PRODUCTION_ARCHITECTURE.md](./PRODUCTION_ARCHITECTURE.md)** — DevOps build spot, Prometheus, architecture, and cost model  
- `DEPLOYMENT.md` (repo root) — deploy procedures  

---

## Observability

| Component | Status | How to use |
|---|---|---|
| **JSON health** | Active | `GET /health` on VPS — storage mode, cache, telemetry, Postgres, B2 |
| **Prometheus metrics** | Active | `GET /metrics` on VPS — HTTP latency, process stats, business gauges |
| **Grafana dashboards** | Ready (docker-compose) | `backend/observability/docker-compose.observability.yml` |
| **Stack verification** | Active | `npm run verify:stack -- <vps-url>` in `backend/` |

### Start observability stack locally

```bash
cd backend
npm run observability:up
# Grafana:    http://localhost:3001  (admin / admin)
# Prometheus: http://localhost:9090
```

### Start full production infrastructure (Postgres + Valkey + observability)

```bash
cd backend/observability
cp .env.production.example .env.production
docker compose -f docker-compose.production.yml --env-file .env.production up -d
```

Edit `prometheus/prometheus.yml` to point at your production VPS IP.

### Verify production stack

```bash
cd backend
npm run verify:stack -- https://your-vps-host:8787
```

---

## CI/CD

| Component | Status | Location |
|---|---|---|
| **GitHub Actions** | Active (checks only) | `.github/workflows/ci.yml` |
| **Manual deploy scripts** | Active | `deploy-both.ps1`, `deploy-vps-backend-safe.ps1` (repo root) |

CI runs on every push/PR to `main`:
- Backend: `typecheck` → `prettier --check` → `build:vps`
- Frontend: `typecheck` → `vitest` → `prettier --check` → `build`

Deploy remains manual via PowerShell scripts (safe staged rollout).

---

## Environment variables reference

### VPS server

| Variable | Tier | Required |
|---|---|---|
| `DB_PATH` | SQLite | Yes (prod) |
| `REQUIRE_PERSISTENT_DB` | SQLite | Yes (prod) |
| `VALKEY_URL` | Valkey cache | Optional |
| `DATABASE_URL` / `PG_MIRROR_DATABASE_URL` | Postgres mirror | Optional (recommended at scale) |
| `VPS_RATE_LIMIT_ENABLED` | HTTP rate limiting | Recommended (default `true`) |
| `VPS_RATE_LIMIT_MAX` | Max requests per IP per window | Default `600` |
| `VPS_RATE_LIMIT_WINDOW_MS` | Rate limit window | Default `60000` |
| `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET` | B2 legacy/default blob bucket | Recommended |
| `B2_REGION`, `B2_ENDPOINT` | S3-compatible region/endpoint (e.g. `ca-east-006`) | Recommended with B2 |
| `B2_TRACK_KEY_ID`, `B2_TRACK_APP_KEY`, `B2_BUCKET_TRACK` | Track module bucket (`VIVI-TRACK`) — telemetry + route libraries | Optional (falls back to default) |
| `B2_REPORTS_KEY_ID`, `B2_REPORTS_APP_KEY`, `B2_BUCKET_REPORTS` | Reports cold archive (`Vivi-Reports`) | Optional (falls back to default) |
| `REPORT_ARCHIVE_HOT_DAYS` | Days report runs stay hot on VPS before copy-promote to Reports B2 | Default `90` (3 months) |
| `REPORTS_ARCHIVE_LOCAL_DIR` | Local hot store for report archives | Default `./reports-archive` |
| `API_KEY` / `API_KEY_PERMANENT` | Protects internal Worker storage and report APIs | Yes |
| `WORKER_TELEMETRY_FORWARD_URL` | Worker pipeline | Yes |
| `WORKER_API_KEY` | Worker auth | Yes |

### Cloudflare Worker

| Binding / secret | Tier |
|---|---|
| `VIVI_D1` | D1 (credentials) |
| `VPS_ORIGIN` | VPS operational-storage API origin (for Worker SQL and KV-compatible calls) |
| `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET_ID` / `B2_BUCKET_NAME` | B2 default/legacy (secrets) |
| `B2_TRACK_KEY_ID`, `B2_TRACK_APP_KEY`, `B2_BUCKET_ID_TRACK` / `B2_BUCKET_NAME_TRACK` | Track bucket (secrets) |
| `B2_REPORTS_KEY_ID`, `B2_REPORTS_APP_KEY`, `B2_BUCKET_ID_REPORTS` / `B2_BUCKET_NAME_REPORTS` | Reports bucket (secrets) |

### B2 multi-bucket routing

| Purpose | Bucket | Object keys (unchanged paths) |
|---|---|---|
| **track** | `VIVI-TRACK` | `dealer/.../assets/.../telemetry/...`, `libraries/routes/...`, legacy `telemetry-archive/...` |
| **reports** | `Vivi-Reports` | `dealer/.../site/.../reports/{yyyy}/{mm}/...` (promoted after hot retention) |
| **default** | existing `B2_BUCKET` | Mitac zip, device artifacts, other blobs |

Reads for track/reports try the purpose bucket first, then fall back to the legacy default bucket. Nothing is deleted from the old bucket during transition.

---

## Future enhancements (when justified)

1. **TimescaleDB** — enable as a Postgres extension for native time-series
   compression/retention on `telemetry_event_facts`.
2. **SQLite FTS5** — add virtual tables for asset/alert text search without new
   infrastructure.
3. **Grafana Cloud** — hosted Prometheus/Grafana if self-hosted docker-compose
   is not desired.
4. **Hot report cleanup** — after dual-read is verified long-term, optionally
   prune local `reports-archive` files that already exist in `Vivi-Reports`.
