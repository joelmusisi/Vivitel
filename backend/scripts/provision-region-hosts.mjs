import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ACCOUNT_ID = "64ed259316fd6346a981fba2cc7c1ce5";
const PAGES_PROJECT = "vivi-telematics-frontend";
const PAGES_TARGET = "vivi-telematics-frontend.pages.dev";
const HOSTS = [
  "za.vivitelematics.ca",
  "ent.vivitelematics.ca",
  "ae.vivitelematics.ca",
  "uk.vivitelematics.ca"
];

const tokenPaths = [
  path.join(os.homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml"),
  path.join(os.homedir(), ".wrangler", "config", "default.toml"),
  path.join(os.homedir(), "AppData", "Roaming", ".wrangler", "config", "default.toml")
];

const readOauthToken = () => {
  const envToken = String(process.env.CLOUDFLARE_OAUTH_TOKEN ?? "").trim();
  if (envToken) return envToken;
  for (const file of tokenPaths) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    const match = raw.match(/^oauth_token\s*=\s*"([^"]+)"/m);
    if (match?.[1]) return match[1];
  }
  throw new Error("No Wrangler OAuth token found. Run: wrangler login");
};

const cfFetch = async (url, token, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { ok: response.ok, status: response.status, body };
};

const token = readOauthToken();
const zoneResp = await cfFetch("https://api.cloudflare.com/client/v4/zones?name=vivitelematics.ca", token);
const zoneId = zoneResp.body?.result?.[0]?.id;
if (!zoneId) {
  throw new Error(`Could not resolve vivitelematics.ca zone (${zoneResp.status})`);
}

const results = [];
for (const host of HOSTS) {
  const dnsResp = await cfFetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${host}`, token);
  const existing = Array.isArray(dnsResp.body?.result) ? dnsResp.body.result[0] : null;
  const row = { host, dns: "", pages: "" };
  if (!existing) {
    const created = await cfFetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, token, {
      method: "POST",
      body: JSON.stringify({
        type: "CNAME",
        name: host,
        content: PAGES_TARGET,
        proxied: true,
        ttl: 1
      })
    });
    row.dns = created.ok ? "created" : `failed ${created.status} ${created.body?.errors?.[0]?.message || ""}`.trim();
  } else {
    row.dns = `exists ${existing.type}`;
  }

  const domainResp = await cfFetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}/domains`,
    token,
    { method: "POST", body: JSON.stringify({ name: host }) }
  );
  const already = domainResp.status === 409 || /already exists/i.test(JSON.stringify(domainResp.body ?? {}));
  row.pages = domainResp.ok || already
    ? already ? "already attached" : "attached"
    : `failed ${domainResp.status} ${domainResp.body?.errors?.[0]?.message || ""}`.trim();
  results.push(row);
}

process.stdout.write(`${JSON.stringify({ zoneId, results }, null, 2)}\n`);
