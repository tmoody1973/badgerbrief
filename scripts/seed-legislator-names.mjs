#!/usr/bin/env node
/**
 * Attach legislatorName to tracked candidates who served in the Legislature.
 *
 * Hand-verified against real roll calls — matching is never fuzzy, because two
 * members can share a surname on the same vote (ANDERSON, C and ANDERSON, J).
 * A candidate omitted here simply shows no voting record.
 *
 * Sessions listed per mapping are those the candidate served AND that our
 * ingest covers (2011–2025 Assembly, 2023–2025 Senate). A legislator who
 * served outside that range has votes we do not have; the UI says which
 * sessions it covers.
 *
 * *** ORDERING CONSTRAINT — READ BEFORE ADDING A MAPPING ***
 * Names here MUST be seeded BEFORE `votes:ingest` runs for the sessions/
 * chambers involved. `storeRollCall` matches each roll call's per-member
 * votes against candidates' legislatorName AT INGEST TIME ONLY — it inserts a
 * `legislator_votes` row for whichever candidates are mapped at that instant,
 * then discards the per-member vote list. `legislative_votes` persists only
 * the aggregate tally (ayes/nays/notVoting), never per-member names, so
 * nothing later can recover who voted which way on an already-ingested roll
 * call. There is no reconcile-from-DB path: it is not merely unbuilt, it is
 * impossible with what's stored.
 *
 * Consequence: adding a mapping AFTER the backfill ingest already ran means
 * that candidate's votes on already-stored roll calls are gone for good. The
 * only fix is a forced re-ingest that re-fetches and re-parses those roll
 * calls from docs.legis.wisconsin.gov (source data still exists there) —
 * `storeRollCall` dedupes on `voteKey`, so simply calling `votes:ingest` again
 * will skip everything already stored via `ingestedKeys`. To actually pick up
 * a newly-added name you must delete the affected `legislative_votes` rows
 * for that session+chamber first (or add a force flag to `votes:ingest` that
 * bypasses the `ingestedKeys` filter) and then re-run ingest so
 * `storeRollCall` re-matches against the now-present mapping.
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
  // Pre-2019 Assembly service. Each surname verified as the SINGLE, party-D
  // entry in every session served (no same-surname collision) against a real
  // roll call from that session: Barnes 2013/2015, Hulsey 2011/2013, Crowley
  // 2017/2019, Zamarripa 2011/2013/2015/2017/2019.
  { slug: "mandela-barnes", name: "BARNES", chamber: "assembly", sessions: ["2013", "2015"] },
  { slug: "brett-hulsey", name: "HULSEY", chamber: "assembly", sessions: ["2011", "2013"] },
  { slug: "david-crowley", name: "CROWLEY", chamber: "assembly", sessions: ["2017", "2019"] },
  { slug: "jocasta-zamarripa", name: "ZAMARRIPA", chamber: "assembly", sessions: ["2011", "2013", "2015", "2017", "2019"] },
];

for (const m of MAPPINGS) {
  const args = ["convex", "run"];
  if (prod) args.push("--prod");
  args.push("votesQueries:setLegislatorName", JSON.stringify(m), "--identity", IDENTITY);
  console.log(m.slug, execFileSync("npx", args, { encoding: "utf8" }).trim());
}
