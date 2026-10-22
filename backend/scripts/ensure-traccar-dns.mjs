import fs from "fs";
import path from "path";
import os from "os";

function readWranglerOauthToken() {
  const candidates = [
    path.join(os.homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml"),
    path.join(os.homedir(), ".wrangler", "config", "default.toml"),
    path.join(os.homedir(), ".config", "wrangler", "config", "default.toml")
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, "utf8");
      const m = raw.match(/oauth_token\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    } catch {
      // ignore
    }
  }
  return process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || "";
}

const token = readWranglerOauthToken();
if (!token) {
  console.error("No Cloudflare token available");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json"
};

const z = await fetch("https://api.cloudflare.com/client/v4/zones?name=vivitelematics.ca", { headers });
const zj = await z.json();
if (!zj.success) {
  console.error(JSON.stringify(zj, null, 2));
  process.exit(1);
}
const zoneId = zj.result?.[0]?.id;
if (!zoneId) {
  console.error("Zone vivitelematics.ca not found");
  process.exit(1);
}
console.log("zone", zoneId);

const list = await fetch(
  `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=traccar.vivitelematics.ca`,
  { headers }
);
const lj = await list.json();
const existing = Array.isArray(lj.result) ? lj.result : [];
console.log("existing", existing.length);

const payload = {
  type: "A",
  name: "traccar",
  content: "204.168.172.4",
  ttl: 120,
  proxied: false
};

let resp;
if (existing.length) {
  resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existing[0].id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload)
  });
} else {
  resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
}
const body = await resp.json();
console.log(
  JSON.stringify(
    {
      success: body.success,
      errors: body.errors,
      result: body.result
        ? { name: body.result.name, content: body.result.content, proxied: body.result.proxied }
        : null
    },
    null,
    2
  )
);
if (!body.success) process.exit(1);
