#!/usr/bin/env node
/**
 * Import a Wisconsin Sunshine transactions CSV export into Convex.
 * Usage: node scripts/import-sunshine.mjs <export.csv> [--prod] [--coverage "Jan 1 – Jun 30, 2026"]
 *
 * Committee → candidate mapping is EXPLICIT (scripts/sunshine-committees.json).
 * Unmatched committees are printed for review, never guessed.
 * Data source: campaignfinance.wi.gov — non-commercial use per Wis. Stat. § 11.1304(12).
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { aggregateSunshine } from "./lib/sunshine.mjs";

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
if (!csvPath) {
  console.error("Usage: node scripts/import-sunshine.mjs <export.csv> [--prod] [--coverage <label>]");
  process.exit(2);
}
const PROD = args.includes("--prod");
const coverageIdx = args.indexOf("--coverage");
const coverage =
  coverageIdx >= 0 ? args[coverageIdx + 1] : "per latest Sunshine export";

const mapping = JSON.parse(
  readFileSync(new URL("./sunshine-committees.json", import.meta.url), "utf8"),
);

function run(fn, payload) {
  const argv = ["convex", "run", fn, JSON.stringify(payload), "--typecheck", "disable"];
  if (PROD) argv.push("--prod");
  return execFileSync("npx", argv, { stdio: ["ignore", "pipe", "inherit"] }).toString();
}

const csv = readFileSync(csvPath, "utf8");
const { committees, skipped } = aggregateSunshine(csv);

let imported = 0;
const unmatched = [];
for (const [committee, entry] of committees) {
  const match = mapping[committee];
  if (!match) {
    unmatched.push({ committee, total: entry.total, count: entry.count });
    continue;
  }
  run("finance:upsertTotals", {
    candidateSlug: match.candidateSlug,
    raceId: match.raceId,
    source: "sunshine",
    receipts: Math.round(entry.total * 100) / 100,
    disbursements: Math.round(entry.disbursements * 100) / 100,
    coverageEndDate: coverage,
  });
  // Overall top donors plus any org donors (PACs/businesses) that didn't make
  // the overall cut — the UI splits them by contributorType.
  const inTop = new Set(entry.topDonors.map((d) => d.name));
  const donors = [
    ...entry.topDonors,
    ...entry.topOrgDonors.filter((d) => !inTop.has(d.name)),
  ];
  run("finance:replaceContributions", {
    candidateSlug: match.candidateSlug,
    raceId: match.raceId,
    source: "sunshine",
    contributions: donors.map((d) => ({
      contributorName: d.name,
      contributorLocation: d.city || undefined,
      contributorType: d.entityType || undefined,
      amount: Math.round(d.amount * 100) / 100,
      date: d.date || undefined,
      committee,
    })),
  });
  console.log(
    `✓ ${committee} → ${match.candidateSlug}: raised $${entry.total.toLocaleString()} (${entry.count} txns), spent $${entry.disbursements.toLocaleString()} (${entry.disbursementCount} txns)`,
  );
  imported++;
}

console.log(`\nImported ${imported} committees; skipped ${skipped} non-contribution/invalid rows.`);
if (unmatched.length > 0) {
  console.log("\n⚠ UNMATCHED committees (add to scripts/sunshine-committees.json to import):");
  for (const u of unmatched.sort((a, b) => b.total - a.total)) {
    console.log(`  - "${u.committee}" ($${u.total.toLocaleString()}, ${u.count} txns)`);
  }
}
