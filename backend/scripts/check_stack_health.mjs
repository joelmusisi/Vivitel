#!/usr/bin/env node
/**
 * Verifies that the live VPS stack is wired correctly by reading the server's
 * /health endpoint and asserting each storage/observability tier is present.
 *
 * Usage:
 *   node scripts/check_stack_health.mjs [baseUrl]
 *   VIVI_HEALTH_URL=https://my-vps:8787 node scripts/check_stack_health.mjs
 *   npm run verify:stack -- https://my-vps:8787
 *
 * Exit code 0 = all required tiers OK, 1 = one or more failed/unreachable.
 * Optional tiers (Valkey, Postgres mirror) report WARN, not failure.
 */

const baseUrl = (process.argv[2] || process.env.VIVI_HEALTH_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function line(status, name, detail) {
  const color = status === "OK" ? GREEN : status === "WARN" ? YELLOW : RED;
  const tag = `${color}${status.padEnd(4)}${RESET}`;
  console.log(`  [${tag}] ${name.padEnd(22)} ${DIM}${detail}${RESET}`);
}

async function fetchJson(path) {
  const url = `${baseUrl}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`\nVivitel stack health check  ->  ${baseUrl}\n`);

  let health;
  try {
    health = await fetchJson("/health");
  } catch (err) {
    line("FAIL", "Reachability", `cannot reach /health: ${err?.message ?? err}`);
    console.log(`\n${RED}Server unreachable. Is the VPS server running and is the URL correct?${RESET}\n`);
    process.exit(1);
  }

  let failures = 0;

  // --- Server up ---
  line("OK", "Server", `status=${health.status} @ ${health.timestamp}`);

  // --- SQLite (required source of truth on VPS) ---
  const mode = health?.storage?.mode;
  if (mode === "sqlite") {
    line("OK", "SQLite (primary)", `dbPath=${health.storage.dbPath}`);
  } else {
    line("FAIL", "SQLite (primary)", `running in '${mode}' mode (persistent store not active)`);
    failures++;
  }

  // --- Valkey (optional cache) ---
  const cache = health?.cache ?? {};
  if (cache.driver === "valkey" && cache.connected) {
    line("OK", "Valkey cache", `connected, ttl=${cache.ttlSeconds}s`);
  } else if (cache.driver === "valkey") {
    line("WARN", "Valkey cache", "configured but not connected");
  } else {
    line("WARN", "Valkey cache", "not configured (set VALKEY_URL to enable)");
  }

  // --- Postgres mirror (optional) ---
  const pg = health?.postgres ?? {};
  if (pg.enabled && pg.reachable) {
    line("OK", "Postgres mirror", `reachable, events=${pg.totalEvents}`);
  } else if (pg.enabled) {
    line("WARN", "Postgres mirror", "enabled but not reachable (check DATABASE_URL / network)");
  } else {
    line("WARN", "Postgres mirror", "disabled (set DATABASE_URL to enable analytics mirror)");
  }

  // --- B2 blob storage ---
  const blob = health?.blob ?? {};
  if (blob.enabled) {
    line("OK", "B2 blob storage", `driver=${blob.driver}`);
  } else {
    line("WARN", "B2 blob storage", "disabled (set B2_KEY_ID / B2_APP_KEY / B2_BUCKET)");
  }

  // --- Telemetry pipeline ---
  const tel = health?.telemetry ?? {};
  line("OK", "Telemetry", `totalEvents=${tel.totalEvents ?? 0}, latest=${tel.latestEventAt ?? "n/a"}`);

  // --- Worker forward ---
  const wf = health?.workerForward ?? {};
  line(wf.hasApiKey ? "OK" : "WARN", "Worker forward", `apiKey=${wf.hasApiKey ? "set" : "missing"}`);

  // --- Prometheus /metrics ---
  try {
    const res = await fetch(`${baseUrl}/metrics`, { headers: { accept: "text/plain" } });
    const text = await res.text();
    if (res.ok && text.includes("vivi_http_requests_total")) {
      line("OK", "Prometheus /metrics", "exposed with vivi_* metrics");
    } else {
      line("FAIL", "Prometheus /metrics", `unexpected response (HTTP ${res.status})`);
      failures++;
    }
  } catch (err) {
    line("FAIL", "Prometheus /metrics", `not reachable: ${err?.message ?? err}`);
    failures++;
  }

  console.log("");
  if (failures > 0) {
    console.log(`${RED}${failures} required tier(s) failed.${RESET}\n`);
    process.exit(1);
  }
  console.log(`${GREEN}All required tiers OK.${RESET} ${DIM}(WARN = optional tier not configured)${RESET}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`${RED}Unexpected error:${RESET}`, err);
  process.exit(1);
});
