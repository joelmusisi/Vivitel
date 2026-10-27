const fs = require("fs");
const path = require("path");

const apiBase = process.env.API_BASE_URL;
const apiKey = process.env.API_KEY;

if (!apiBase || !apiKey) {
  console.error("API_BASE_URL and API_KEY are required.");
  process.exit(1);
}

const defaultZip = path.resolve(
  __dirname,
  "..",
  "..",
  "camera_ai_intercom",
  "Mitac_Version_VVT",
  "Vivitel_Deploy",
  "dist"
);

function resolveZipPath(input) {
  if (input) return path.resolve(input);
  if (!fs.existsSync(defaultZip)) {
    throw new Error(`Dist folder not found: ${defaultZip}. Run build_pack.ps1 first.`);
  }
  const zips = fs
    .readdirSync(defaultZip)
    .filter((name) => name.toLowerCase().endsWith(".zip"))
    .map((name) => ({
      name,
      full: path.join(defaultZip, name),
      mtime: fs.statSync(path.join(defaultZip, name)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!zips.length) {
    throw new Error(`No .zip files in ${defaultZip}. Run build_pack.ps1 first.`);
  }
  return zips[0].full;
}

async function uploadMitacSoftware(zipPath) {
  const bytes = fs.readFileSync(zipPath);
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/admin/mitac-software`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify({
      contentBase64: bytes.toString("base64")
    })
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }
  return text;
}

(async () => {
  const zipPath = resolveZipPath(process.env.MITAC_SOFTWARE_ZIP_PATH);
  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(2);
  console.log(`Uploading ${zipPath} (${sizeMb} MB)...`);
  const result = await uploadMitacSoftware(zipPath);
  console.log(result);
  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
