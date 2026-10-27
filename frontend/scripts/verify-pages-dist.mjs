/**
 * Fail the build/deploy if index.html references missing JS/CSS under /assets/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const indexPath = path.join(distDir, "index.html");

if (!fs.existsSync(indexPath)) {
  console.error("verify-pages-dist: dist/index.html not found — run npm run build first.");
  process.exit(1);
}

const html = fs.readFileSync(indexPath, "utf8");
const assetRefs = [
  ...html.matchAll(/(?:src|href)="(\/(?:assets|static)\/[^"]+)"/g),
].map((match) => match[1]);

const missing = assetRefs.filter((ref) => {
  const filePath = path.join(distDir, ref.replace(/^\//, "").split("/").join(path.sep));
  return !fs.existsSync(filePath);
});

if (missing.length > 0) {
  console.error("verify-pages-dist: index.html references missing files:");
  for (const ref of missing) {
    console.error(`  - ${ref}`);
  }
  process.exit(1);
}

console.log(`verify-pages-dist: OK (${assetRefs.length} asset references checked)`);
