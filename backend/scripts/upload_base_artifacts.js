const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const apiBase = process.env.API_BASE_URL;
const apiKey = process.env.API_KEY;
const tenantId = process.env.TENANT_ID || "";

if (!apiBase || !apiKey) {
  console.error("API_BASE_URL and API_KEY are required.");
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, "..", "..");
const cfgPath = process.env.BASE_CONFIG_PATH || path.join(repoRoot, "120 - 190 FMB Configuration File New.cfg");
const fwPath = process.env.BASE_FIRMWARE_PATH || path.join(repoRoot, "FMB.Ver.03.29.00.Rev.14.e.xim");

function parseConfigVersion(cfgBytes) {
  try {
    const text = zlib.gunzipSync(cfgBytes).toString("utf8");
    const match = text.match(/ConfigurationVersion:([^;]+)/i);
    return match ? match[1].trim() : "unknown";
  } catch {
    return "unknown";
  }
}

async function uploadArtifact({ type, name, version, contentType, contentBase64 }) {
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/admin/device-artifacts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      ...(tenantId ? { "x-tenant-id": tenantId } : {})
    },
    body: JSON.stringify({
      type,
      name,
      version,
      contentType,
      contentBase64,
      isBase: true
    })
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }
  return text;
}

(async () => {
  const cfgBytes = fs.readFileSync(cfgPath);
  const fwBytes = fs.readFileSync(fwPath);

  const configVersion = process.env.BASE_CONFIG_VERSION || parseConfigVersion(cfgBytes);
  const firmwareVersion = process.env.BASE_FIRMWARE_VERSION || path.basename(fwPath, path.extname(fwPath));

  console.log("Uploading base config...");
  await uploadArtifact({
    type: "config",
    name: path.basename(cfgPath),
    version: configVersion,
    contentType: "application/gzip",
    contentBase64: cfgBytes.toString("base64")
  });

  console.log("Uploading base firmware...");
  await uploadArtifact({
    type: "firmware",
    name: path.basename(fwPath),
    version: firmwareVersion,
    contentType: "application/octet-stream",
    contentBase64: fwBytes.toString("base64")
  });

  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
