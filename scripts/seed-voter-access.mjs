/**
 * Seed voter_access rows from a curated JSON file through
 * internal.seed.upsertVoterAccess.
 *
 * upsertVoterAccess REJECTS any row without a source on an official domain
 * (elections.wi.gov, myvote.wi.gov, bringit.wi.gov) — see the publish gate in
 * convex/seed.ts. A row that fails this check makes the mutation throw via
 * execFileSync, which ABORTS the run (fail-loud, no try/catch): rows already
 * seeded before the failing row persist, rows after it are never attempted.
 * Fix the offending row and re-run — upsert is idempotent by `key`.
 *
 * Idempotent: key is the natural key (by_key index), so re-running after the
 * file gains or edits an entry updates in place.
 *
 * Usage:
 *   node scripts/seed-voter-access.mjs [--prod] [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const prod = args.includes("--prod");
const dryRun = args.includes("--dry-run");

const file = new URL("./voter-access-seed.json", import.meta.url);

const convex = (fn, payload) => {
  const argv = ["convex", "run"];
  if (prod) argv.push("--prod");
  argv.push(fn, JSON.stringify(payload));
  return execFileSync("npx", argv, { encoding: "utf8" }).trim();
};

if (!existsSync(file)) {
  console.error(`scripts/voter-access-seed.json not found — nothing to seed`);
  process.exit(1);
}

const rows = JSON.parse(readFileSync(file, "utf8"));

// Mirrors convex/seed.ts OFFICIAL_DOMAINS + the upsertVoterAccess hostname check.
const OFFICIAL_DOMAINS = ["elections.wi.gov", "myvote.wi.gov", "bringit.wi.gov"];
const hasOfficialSource = (row) =>
  (row.sources ?? []).some((s) => {
    try {
      const host = new URL(s.url).hostname.replace(/^www\./, "");
      return OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith("." + d));
    } catch {
      return false;
    }
  });

let seeded = 0;
let rejected = 0;
for (const row of rows) {
  if (dryRun) {
    if (hasOfficialSource(row)) {
      console.log(`would seed: ${row.key}`);
      seeded++;
    } else {
      console.log(`WOULD REJECT: ${row.key} (no official-domain source)`);
      rejected++;
    }
    continue;
  }
  convex("seed:upsertVoterAccess", row);
  console.log(`seeded: ${row.key}`);
  seeded++;
}

if (dryRun) {
  console.log(`[dry run] would seed ${seeded} rows, would reject ${rejected} rows`);
} else {
  console.log(`done: ${seeded} rows`);
}
