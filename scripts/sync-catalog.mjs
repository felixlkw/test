#!/usr/bin/env node
// sync-catalog.mjs — v0.2.4 PR-feedback-2 build infra.
//
// Purpose: copy backend/data/checklist_catalog/{domain}.json → frontend/src/
// generated/catalog/{domain}.json. Runs in `predev` and `prebuild` (see
// frontend/package.json) so the build is reproducible from a clean clone.
//
// Why frontend needs the catalog:
//   v0.2.4 introduces a 2-tier hazard recommendation flow. Tier-1 is rendered
//   instantly from the static catalog (≤300ms, no network). Tier-2 augments
//   via /api/recommend-hazards LLM. Backend remains the single source of
//   truth — this script is one-way (backend → frontend) and idempotent.
//
// Why .mjs (not .ts):
//   Frontend stack already pins typescript ~5.8.3 and tsx is NOT a dependency.
//   The script does only JSON copy + sha256 — plain Node ESM keeps the
//   dependency surface minimal.
//
// Domains:
//   manufacturing | construction | heavy_industry | semiconductor

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
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

/** sha256 hex of a file's bytes. */
async function sha256(file) {
  const buf = await readFile(file);
  return createHash("sha256").update(buf).digest("hex");
}

/** Bytes → human readable. */
function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  await mkdir(DST_DIR, { recursive: true });

  const summary = [];
  for (const domain of DOMAINS) {
    const src = join(SRC_DIR, `${domain}.json`);
    const dst = join(DST_DIR, `${domain}.json`);

    let srcInfo;
    try {
      srcInfo = await stat(src);
    } catch (err) {
      console.error(
        `[sync-catalog] FATAL: source missing for domain '${domain}': ${src}\n` +
          `  ${err && err.message ? err.message : err}`,
      );
      process.exit(1);
    }
    if (!srcInfo.isFile()) {
      console.error(
        `[sync-catalog] FATAL: source is not a regular file: ${src}`,
      );
      process.exit(1);
    }

    // Validate JSON parseable (cheap guard — bad JSON would still copy bytes
    // verbatim, but we'd rather fail the build here than at runtime in the
    // browser).
    try {
      const raw = await readFile(src, "utf8");
      JSON.parse(raw);
    } catch (err) {
      console.error(
        `[sync-catalog] FATAL: source is not valid JSON: ${src}\n` +
          `  ${err && err.message ? err.message : err}`,
      );
      process.exit(1);
    }

    await copyFile(src, dst);
    const hash = await sha256(dst);
    const size = (await stat(dst)).size;
    summary.push({ domain, hash, size });
    console.log(
      `[sync-catalog] ${domain.padEnd(15)} ${fmtBytes(size).padStart(8)}  sha256=${hash.slice(0, 12)}…`,
    );
  }

  console.log(
    `[sync-catalog] OK — ${summary.length} catalog file(s) synced to ${DST_DIR}`,
  );
}

main().catch((err) => {
  console.error(`[sync-catalog] FATAL: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
