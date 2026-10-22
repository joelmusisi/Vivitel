const fs = require("fs");
const https = require("https");
const path = require("path");
const os = require("os");

const indexPath = path.join(os.tmpdir(), "vivi-deployed-index.js");
const text = fs.readFileSync(indexPath, "utf8");

const chunkRe = /["'](\/?static\/[^"']+\.js)["']/g;
const chunks = new Set();
let m;
while ((m = chunkRe.exec(text))) chunks.add(m[1]);
console.log("chunk refs", chunks.size);
[...chunks].slice(0, 60).forEach((c) => console.log(c));

const keys = [
  "LiveTracking",
  "fuel-tachograph",
  "getTraccarRoute",
  "getTraccarFuelRoute",
  "Loading fuel",
  "DRAINED",
  "DRAINS",
  "module-track",
  "Fuel graph"
];
for (const k of keys) console.log(k, text.split(k).length - 1);

// Vite often emits import map like {"./pages/LiveTracking.tsx":"static/LiveTracking-xxxxx.js"}
const liveHints = [];
const hintRe = /LiveTracking[^"']{0,40}/g;
while ((m = hintRe.exec(text)) && liveHints.length < 15) liveHints.push(m[0]);
console.log("LiveTracking hints:", liveHints);

const hashed = [...text.matchAll(/([A-Za-z0-9_-]*[Ll]ive[Tt]rack[A-Za-z0-9_-]*-[A-Za-z0-9_-]+\.js)/g)].map(
  (x) => x[1]
);
console.log("hashed live files", [...new Set(hashed)]);

const fuelFiles = [...text.matchAll(/([A-Za-z0-9_-]*[Ff]uel[A-Za-z0-9_-]*-[A-Za-z0-9_-]+\.js)/g)].map((x) => x[1]);
console.log("hashed fuel files", [...new Set(fuelFiles)].slice(0, 30));

// Also pull prefetch/modulepreload from HTML
function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

(async () => {
  const html = await get("https://us.vivitelematics.ca/Track/tracking/live");
  const htmlScripts = [...html.matchAll(/\/static\/[^"']+\.js/g)].map((x) => x[0]);
  console.log("html scripts", htmlScripts);

  // Probe common chunk name patterns from vite manualChunks module-track
  const candidates = [...chunks]
    .filter((c) => /track|Live|fuel|Fuel|api-/i.test(c))
    .slice(0, 40);
  console.log("candidate chunks", candidates);

  const patterns = [
    "getTraccarFuelRoute",
    "thinFuelRouteChunk",
    "No drains in this period",
    "No fuel drained in this period",
    "Fuel history is taking too long",
    "Loading fuel data",
    "Fuel graph (litres)",
    "DRAINS",
    "DRAINED",
    "bypassSlot",
    "isRoutePointPowerCutoff",
    "buildFuelTrendFromRoute",
    "buildFuelChartModel"
  ];

  async function scanUrl(url) {
    try {
      const body = await get(url.startsWith("http") ? url : `https://us.vivitelematics.ca${url}`);
      const hits = patterns.filter((p) => body.includes(p));
      return { url, size: body.length, hits };
    } catch (e) {
      return { url, error: String(e.message || e) };
    }
  }

  // Scan index + all referenced chunks that look relevant; if few, scan all chunks (cap 40)
  const toScan = ["https://us.vivitelematics.ca/static/index-CJi4hpi2.js", ...[...chunks].slice(0, 80)];
  const results = [];
  for (const u of toScan) {
    const r = await scanUrl(u);
    if (r.hits && r.hits.length) results.push(r);
  }
  console.log("=== chunks with fuel markers ===");
  console.log(JSON.stringify(results, null, 2));

  // If nothing, try module-track style names by listing from index import map
  const importMap = [...text.matchAll(/"([^"]+)":\s*"([^"]+\.js)"/g)].slice(0, 200);
  const trackImports = importMap.filter(
    ([, from, file]) => /live|fuel|track|traccar/i.test(from) || /live|fuel|track|traccar/i.test(file)
  );
  console.log(
    "import map track-like",
    trackImports.slice(0, 40).map((x) => `${x[1]} -> ${x[2]}`)
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
