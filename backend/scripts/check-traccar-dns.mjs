import fs from "fs";
import path from "path";
import os from "os";
import dns from "dns/promises";

function readToken() {
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
    } catch {}
  }
  return process.env.CLOUDFLARE_API_TOKEN || "";
}

const token = readToken();
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const zoneId = "17c2e285a2b53aa3ad1592a070481620";

const names = [
  "traccar.vivitelematics.ca",
  "traccar",
  "gps.vivitelematics.ca"
];

console.log("--- local DNS ---");
for (const name of ["traccar.vivitelematics.ca"]) {
  try {
    console.log(name, await dns.resolve4(name));
  } catch (e) {
    console.log(name, e.code || e.message);
  }
}

console.log("--- CF DNS API ---");
for (const name of names) {
  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${encodeURIComponent(name.includes(".") ? name : name + ".vivitelematics.ca")}`;
  const r = await fetch(url, { headers });
  const j = await r.json();
  console.log(name, "success="+j.success, "count="+(j.result||[]).length, j.errors?.[0]?.message || "");
  for (const rec of j.result || []) {
    console.log(" ", rec.type, rec.name, rec.content, "proxied="+rec.proxied);
  }
}

// Also search any record containing 204.168.172.4
const all = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=100&content=204.168.172.4`, { headers });
const aj = await all.json();
console.log("--- records with 204.168.172.4 ---", "success="+aj.success, "count="+(aj.result||[]).length);
for (const rec of aj.result || []) {
  console.log(" ", rec.type, rec.name, rec.content, "proxied="+rec.proxied);
}

console.log("--- worker status ---");
const st = await fetch("https://us.vivitelematics.ca/api/traccar/status?t=" + Date.now());
console.log(await st.json());
