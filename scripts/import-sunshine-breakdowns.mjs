#!/usr/bin/env node
/**
 * Import funding breakdowns from a Sunshine transactions CSV into Convex
 * (finance_breakdowns). Run AFTER import-sunshine.mjs, same CSV:
 *   node scripts/import-sunshine-breakdowns.mjs <export.csv> [--prod] [--coverage <label>] [--window-end <YYYY-MM-DD>]
 * Prints each candidate's takeaway sentences (editorial eyeball gate) and the
 * largest untagged committee donors (candidates for pac-tags.json).
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { computeBreakdowns } from "./lib/breakdowns.mjs";

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
if (!csvPath) {
  console.error(
    "Usage: node scripts/import-sunshine-breakdowns.mjs <export.csv> [--prod] [--coverage <label>] [--window-end <YYYY-MM-DD>]",
  );
  process.exit(2);
}
const PROD = args.includes("--prod");
const coverageIdx = args.indexOf("--coverage");
const coverage = coverageIdx >= 0 ? args[coverageIdx + 1] : "per latest Sunshine export";
const windowEndIdx = args.indexOf("--window-end");
const windowEnd = windowEndIdx >= 0 ? args[windowEndIdx + 1] : null;

const mapping = JSON.parse(
  readFileSync(new URL("./sunshine-committees.json", import.meta.url), "utf8"),
);
const pacTags = JSON.parse(readFileSync(new URL("./pac-tags.json", import.meta.url), "utf8"));

function run(fn, payload) {
  const argv = ["convex", "run", fn, JSON.stringify(payload), "--typecheck", "disable"];
  if (PROD) argv.push("--prod");
  return execFileSync("npx", argv, { stdio: ["ignore", "pipe", "inherit"] }).toString();
}

const breakdowns = computeBreakdowns(readFileSync(csvPath, "utf8"), pacTags, { windowEnd });
let imported = 0;
for (const [committee, b] of breakdowns) {
  const match = mapping[committee];
  if (!match) continue; // import-sunshine.mjs already reports unmatched committees
  run("finance:upsertBreakdown", {
    candidateSlug: match.candidateSlug,
    raceId: match.raceId,
    source: "sunshine",
    coverageEndDate: coverage,
    ...b,
  });
  imported++;
  const total = b.categories.reduce((s, c) => s + c.amount, 0);
  console.log(`✓ ${committee} → ${match.candidateSlug}: $${total.toLocaleString("en-US")}`);
  for (const t of b.takeaways) console.log(`    "${t}"`);
  const untaggedBig = (b.categories.find((c) => c.key === "pac")?.topDonors ?? [])
    .filter((d) => !(d.name in pacTags) && d.amount >= 25000)
    .slice(0, 3);
  for (const d of untaggedBig)
    console.log(`    ? untagged committee donor: ${d.name} ($${d.amount.toLocaleString("en-US")})`);
}
console.log(`\nImported breakdowns for ${imported} committees.`);
