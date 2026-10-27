#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sqlPath = path.join(root, "scripts", "postgresql_partial_indexes.sql");
const databaseUrl = String(process.env.DATABASE_URL ?? "").trim();

const args = databaseUrl
  ? ["-d", databaseUrl, "-f", sqlPath]
  : ["-f", sqlPath];

const result = spawnSync("psql", args, { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
