#!/usr/bin/env node
/**
 * Attach legislatorName to tracked candidates who served in the Legislature.
 *
 * Hand-verified against real roll calls — matching is never fuzzy, because two
 * members can share a surname on the same vote (ANDERSON, C and ANDERSON, J).
 * A candidate omitted here simply shows no voting record.
 *
 * Sessions are those covered by our ingest (2023, 2025). A legislator who
 * served earlier has votes we do not have; the UI says which sessions it covers.
 *
 * Usage: node scripts/seed-legislator-names.mjs [--prod]
 */
import { execFileSync } from "node:child_process";

const prod = process.argv.includes("--prod");
const IDENTITY = JSON.stringify({ metadata: { role: "admin" } });

// VERIFY each surname against a roll call from that chamber before adding a row.
const MAPPINGS = [
  { slug: "francesca-hong", name: "HONG", chamber: "assembly", sessions: ["2023", "2025"] },
  { slug: "kelda-roys", name: "ROYS", chamber: "senate", sessions: ["2023", "2025"] },
];

for (const m of MAPPINGS) {
  const args = ["convex", "run"];
  if (prod) args.push("--prod");
  args.push("votesQueries:setLegislatorName", JSON.stringify(m), "--identity", IDENTITY);
  console.log(m.slug, execFileSync("npx", args, { encoding: "utf8" }).trim());
}
