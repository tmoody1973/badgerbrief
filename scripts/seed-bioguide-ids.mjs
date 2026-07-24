/**
 * Attach U.S. House Bioguide IDs to tracked candidates.
 *
 * Federal counterpart of seed-legislator-names.mjs, and deliberately much
 * simpler. A Bioguide ID is unique across everyone who has ever served in
 * Congress, so there is no same-surname collision to hand-verify and no chamber
 * or session list to curate — the id identifies the member for their whole
 * career. That is why MOO-396 says NOT to copy the state matching design.
 *
 * ORDERING HAZARD, same as the state path: legislator_votes rows are written
 * only inside storeHouseVote at ingest time, and ingest skips roll calls it has
 * already stored. An id added AFTER a backfill attaches nothing and the
 * candidate silently shows an empty record. SEED BEFORE INGESTING. To pick up a
 * late addition you must delete that Congress's federal legislative_votes rows
 * and re-run the ingest.
 *
 * Every id below was read directly off a real roll call (119th Congress, 1st
 * session, roll 100) and independently confirmed against the House Clerk's XML
 * for the same vote — not copied from a lookup table.
 *
 * Usage: node scripts/seed-bioguide-ids.mjs [--prod]
 */
import { execFileSync } from "node:child_process";

const prod = process.argv.includes("--prod");
const IDENTITY = JSON.stringify({ metadata: { role: "admin" } });

const MAPPINGS = [
  { slug: "bryan-steil", bioguideId: "S001213" }, // WI-01
  { slug: "mark-pocan", bioguideId: "P000607" }, // WI-02
  { slug: "derrick-van-orden", bioguideId: "V000135" }, // WI-03
  { slug: "gwen-moore", bioguideId: "M001160" }, // WI-04
  { slug: "scott-fitzgerald", bioguideId: "F000471" }, // WI-05
  { slug: "glenn-grothman", bioguideId: "G000576" }, // WI-06
  { slug: "tom-tiffany", bioguideId: "T000165" }, // WI-07 — also running for Governor
  { slug: "tony-wied", bioguideId: "W000829" }, // WI-08
];

let failed = 0;
for (const m of MAPPINGS) {
  const args = ["convex", "run"];
  if (prod) args.push("--prod");
  args.push("votesQueries:setBioguideId", JSON.stringify(m), "--identity", IDENTITY);
  try {
    console.log(m.slug, execFileSync("npx", args, { encoding: "utf8" }).trim());
  } catch (error) {
    // A slug that doesn't exist yet is a real problem worth surfacing, not a
    // silent skip — an unmapped member shows an empty voting record.
    failed++;
    console.error(`FAILED ${m.slug}: ${error.message.split("\n")[0]}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed}/${MAPPINGS.length} mappings failed — those members will show no record.`);
  process.exit(1);
}
