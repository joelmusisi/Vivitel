import fs from "node:fs";

const nav = fs.readFileSync("src/navData.ts", "utf8");
const paths = [...nav.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
const mods = ["track", "control", "analyze", "deliver"].flatMap((m) => {
  const t = fs.readFileSync(`src/modules/${m}/routes.tsx`, "utf8");
  return [...t.matchAll(/"(\/[^"]+)":\s/g)].map((x) => x[1]);
});
const set = new Set(mods);
const missing = paths.filter((p) => !set.has(p));
console.log(JSON.stringify({ nav: paths.length, modules: mods.length, missing }, null, 2));
