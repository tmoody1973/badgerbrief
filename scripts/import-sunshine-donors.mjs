#!/usr/bin/env node
/**
 * Import full donor rosters from a Sunshine transactions CSV into Convex
 * (donor_totals). Run AFTER import-sunshine.mjs, same CSV:
 *   node scripts/import-sunshine-donors.mjs <export.csv> [--prod] [--coverage <label>]
 * Clear-then-insert per committee (batches of 500; paged deletes).
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { computeDonorRosters } from "./lib/donors.mjs";

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
if (!csvPath) {
  console.error("Usage: node scripts/import-sunshine-donors.mjs <export.csv> [--prod] [--coverage <label>]");
  process.exit(2);
}
const PROD = args.includes("--prod");
const coverageIdx = args.indexOf("--coverage");
const coverage = coverageIdx >= 0 ? args[coverageIdx + 1] : "per latest Sunshine export";

const mapping = JSON.parse(
  readFileSync(new URL("./sunshine-committees.json", import.meta.url), "utf8"),
);
const pacTags = JSON.parse(readFileSync(new URL("./pac-tags.json", import.meta.url), "utf8"));

function run(fn, payload) {
  const argv = ["convex", "run", fn, JSON.stringify(payload), "--typecheck", "disable"];
  if (PROD) argv.push("--prod");
  return execFileSync("npx", argv, { stdio: ["ignore", "pipe", "inherit"] }).toString();
}

const rosters = computeDonorRosters(readFileSync(csvPath, "utf8"), pacTags);
let committees = 0;
for (const [committee, donors] of rosters) {
  const match = mapping[committee];
  if (!match) continue; // import-sunshine.mjs already reports unmatched committees
  const base = { candidateSlug: match.candidateSlug, raceId: match.raceId, source: "sunshine" };

  let cursor = null;
  for (;;) {
    const out = JSON.parse(run("finance:clearDonors", { ...base, cursor }));
    if (out.isDone) break;
    cursor = out.continueCursor;
  }
  for (let i = 0; i < donors.length; i += 500) {
    const docs = donors.slice(i, i + 500).map((d) => ({ ...d, ...base, coverageEndDate: coverage }));
    run("finance:insertDonors", { docs });
  }
  committees++;
  console.log(
    `✓ ${committee} → ${match.candidateSlug}: ${donors.length.toLocaleString("en-US")} donors, ` +
      `top: ${donors[0]?.donorName} ($${(donors[0]?.total ?? 0).toLocaleString("en-US")})`,
  );
}
console.log(`\nImported rosters for ${committees} committees.`);
