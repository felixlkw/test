#!/usr/bin/env node
// verify-catalog-hash.mjs — v0.2.4 PR-feedback-2 CI safety net.
//
// Compares sha256 of backend/data/checklist_catalog/{domain}.json against
// frontend/src/generated/catalog/{domain}.json. Exits non-zero on any drift
// so CI surfaces "the bundled frontend catalog is stale, run sync-catalog".
//
// Usage:
//   node test/scripts/verify-catalog-hash.mjs
// Recommended CI step (after `npm install`, before `npm run build`):
//   node scripts/sync-catalog.mjs        # produces a fresh frontend/src/generated/catalog
//   node scripts/verify-catalog-hash.mjs # asserts no drift (defensive)
// In Railway / monorepo CI, the predev/prebuild npm hook already runs sync;
// this script is a defensive double-check.

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SRC_DIR = resolve(ROOT, "backend", "data", "checklist_catalog");
const DST_DIR = resolve(ROOT, "frontend", "src", "generated", "catalog");

const DOMAINS = [
  "manufacturing",
  "construction",
  "heavy_industry",
  "semiconductor",
];

async function sha256(file) {
  const buf = await readFile(file);
  return createHash("sha256").update(buf).digest("hex");
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const drift = [];
  for (const domain of DOMAINS) {
    const src = join(SRC_DIR, `${domain}.json`);
    const dst = join(DST_DIR, `${domain}.json`);
    if (!(await exists(src))) {
      console.error(`[verify-catalog-hash] backend missing: ${src}`);
      process.exit(1);
    }
    if (!(await exists(dst))) {
      console.error(
        `[verify-catalog-hash] frontend missing: ${dst}\n` +
          `  Run: node scripts/sync-catalog.mjs`,
      );
      process.exit(1);
    }
    const a = await sha256(src);
    const b = await sha256(dst);
    if (a !== b) {
      drift.push({ domain, src: a, dst: b });
    } else {
      console.log(
        `[verify-catalog-hash] ${domain.padEnd(15)} OK  sha256=${a.slice(0, 12)}…`,
      );
    }
  }
  if (drift.length > 0) {
    console.error("\n[verify-catalog-hash] DRIFT detected:");
    for (const d of drift) {
      console.error(
        `  - ${d.domain}\n      backend  = ${d.src}\n      frontend = ${d.dst}`,
      );
    }
    console.error(
      "\nRemediation: run `node scripts/sync-catalog.mjs` then commit/redeploy.",
    );
    process.exit(1);
  }
  console.log("[verify-catalog-hash] OK — no drift");
}

main().catch((err) => {
  console.error(
    `[verify-catalog-hash] FATAL: ${err && err.stack ? err.stack : err}`,
  );
  process.exit(1);
});
