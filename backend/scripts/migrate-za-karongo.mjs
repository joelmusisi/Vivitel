/**
 * One-shot: POST /admin/region/migrate-za-karongo against the live API.
 * Requires ADMIN_API_KEY (or permanent API key) in the environment.
 *
 * Usage:
 *   cd backend
 *   node scripts/migrate-za-karongo.mjs
 */
const base = String(process.env.VIVI_API_BASE ?? "https://us.vivitelematics.ca").replace(/\/+$/, "");
const apiKey = String(process.env.ADMIN_API_KEY ?? process.env.API_KEY_PERMANENT ?? process.env.API_KEY ?? "").trim();

if (!apiKey) {
  console.error("Set ADMIN_API_KEY (or API_KEY_PERMANENT) before running.");
  process.exit(1);
}

const url = `${base}/admin/region/migrate-za-karongo`;
const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": apiKey
  }
});
const text = await response.text();
let body = null;
try {
  body = text ? JSON.parse(text) : null;
} catch {
  body = { raw: text };
}
console.log(JSON.stringify({ status: response.status, body }, null, 2));
process.exit(response.ok ? 0 : 1);
