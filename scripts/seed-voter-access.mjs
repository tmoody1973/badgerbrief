/**
 * Seed voter_access rows from a curated JSON file through
 * internal.seed.upsertVoterAccess.
 *
 * upsertVoterAccess REJECTS any row without a source on an official domain
 * (elections.wi.gov, myvote.wi.gov, bringit.wi.gov) — see the publish gate in
 * convex/seed.ts. A row that fails this check throws in convex and the row
 * is skipped here, not silently dropped.
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

let seeded = 0;
for (const row of rows) {
  if (dryRun) {
    console.log(`seeded: ${row.key}`);
    seeded++;
    continue;
  }
  convex("seed:upsertVoterAccess", row);
  console.log(`seeded: ${row.key}`);
  seeded++;
}

console.log(`${dryRun ? "[dry run] would seed " : "done: "}${seeded} rows`);
