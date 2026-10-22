const https = require("https");

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
  const files = [
    "https://us.vivitelematics.ca/static/LiveTracking-oO2zuLyy.js",
    "https://us.vivitelematics.ca/static/traccarFuel-WTZZVrmO.js",
    "https://us.vivitelematics.ca/static/traccarLive-CkxUMy7B.js"
  ];
  const patterns = [
    "getTraccarFuelRoute",
    "getTraccarRoute",
    "reports/route",
    "reports/summary",
    "reports/fuel",
    "/positions?",
    "buildFuelTrendFromRoute",
    "buildFuelChartModel",
    "Loading fuel data",
    "Fuel history is taking too long",
    "No fuel points",
    "No drains",
    "DRAINS",
    "DRAINED",
    "Fuel graph (litres)",
    "Sensor / Fuel",
    "fuelLevel",
    "spentFuel",
    "bypassSlot",
    "thinFuel",
    "CHUNK_MS",
    "isRoutePointPowerCutoff",
    "ignition===!1",
    "ignition===false"
  ];

  for (const url of files) {
    const body = await get(url);
    console.log("\n====", url, "size", body.length, "====");
    for (const p of patterns) {
      const count = body.split(p).length - 1;
      if (count) console.log("HIT", p, count);
    }
    for (const p of ["reports/route", "getTraccarRoute", "Loading fuel", "fuelLevel", "positions?"]) {
      const idx = body.indexOf(p);
      if (idx >= 0) {
        console.log("CTX", p, JSON.stringify(body.slice(Math.max(0, idx - 60), idx + 100)));
      }
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
