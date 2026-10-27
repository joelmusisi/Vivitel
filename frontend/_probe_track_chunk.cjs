const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

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
  const url = "https://us.vivitelematics.ca/static/module-track-UejNQeZv.js";
  const body = await get(url);
  const out = path.join(os.tmpdir(), "vivi-module-track.js");
  fs.writeFileSync(out, body);
  console.log("size", body.length);

  const patterns = [
    "getTraccarFuelRoute",
    "getTraccarRoute",
    "buildFuelTrendFromRoute",
    "buildFuelChartModel",
    "Loading fuel data",
    "fuel-tachograph",
    "Fuel graph",
    "DRAINS",
    "DRAINED",
    "No drains",
    "No fuel",
    "fuelLevel",
    "reports/route",
    "reports/summary",
    "/positions?",
    "Sensor / Fuel",
    "Tacho",
    "tachograph",
    "spentFuel",
    "bypassSlot",
    "thinFuel",
    "ignition"
  ];
  for (const p of patterns) {
    const count = body.split(p).length - 1;
    if (count) console.log("HIT", p, count);
    else console.log("miss", p);
  }

  // Sample nearby context for fuelLevel / reports/route
  for (const p of ["fuelLevel", "reports/route", "Tacho", "Sensor"]) {
    const idx = body.indexOf(p);
    if (idx >= 0) console.log("\nCTX", p, JSON.stringify(body.slice(Math.max(0, idx - 80), idx + 120)));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
