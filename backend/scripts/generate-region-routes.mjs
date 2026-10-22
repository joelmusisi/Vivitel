const hosts = [
  "us.vivitelematics.ca",
  "za.vivitelematics.ca",
  "ent.vivitelematics.ca",
  "ae.vivitelematics.ca",
  "uk.vivitelematics.ca"
];
const paths = [
  "api/*",
  "auth/*",
  "rbac/*",
  "hos/*",
  "d1/*",
  "kv/*",
  "b2/*",
  "libraries/*",
  "config/*",
  "telemetry/*",
  "ingest/*",
  "support/*",
  "stream/*",
  "ws",
  "ws/*",
  "device/*",
  "downloads/*",
  "share/*",
  "camera/*",
  "health*",
  "pat/*",
  "admin/*",
  "echo",
  "cmsv6/*",
  "intercom/*",
  "reports/*"
];

const lines = ['  { pattern = "api.vivitelematics.ca/*", zone_name = "vivitelematics.ca" }'];
for (const host of hosts) {
  for (const path of paths) {
    lines.push(`  { pattern = "${host}/${path}", zone_name = "vivitelematics.ca" }`);
  }
}
process.stdout.write(`${lines.join(",\n")}\n`);
process.stderr.write(`route count ${lines.length}\n`);
