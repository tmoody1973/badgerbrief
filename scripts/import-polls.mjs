/**
 * Import published horse-race polls from the curated Wisconsin 2026 poll file.
 *
 * Polls are stored VERBATIM and never averaged — see convex/lib/polls.ts.
 *
 * A poll is REFUSED rather than stored when it has no source url, no parseable
 * field date, or no results. Every other claim on the site links to its source;
 * a poll that cannot meet that bar is not shown at all.
 *
 * Idempotent: pollKey is raceId + pollster + field + end date, so re-running
 * after the file gains a new Marquette release updates in place. A duplicated
 * poll would read to a visitor as two independent polls agreeing.
 *
 * Usage:
 *   node scripts/import-polls.mjs --file "<path to json>" [--race WI-GOV-2026] [--prod] [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { normalizePoll } from "../convex/lib/polls.ts";

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const file = flag("file");
if (!file) {
  console.error('--file "<path to poll json>" is required');
  process.exit(2);
}
const raceId = flag("race", "WI-GOV-2026");
const prod = args.includes("--prod");
const dryRun = args.includes("--dry-run");

const IDENTITY = JSON.stringify({ metadata: { role: "admin" } });
const convex = (fn, payload, withIdentity = false) => {
  const argv = ["convex", "run"];
  if (prod) argv.push("--prod");
  argv.push(fn, JSON.stringify(payload));
  if (withIdentity) argv.push("--identity", IDENTITY);
  return execFileSync("npx", argv, { encoding: "utf8" }).trim();
};

// Candidate names come from the race itself, so a poll can only ever link to a
// candidate we actually publish — never to a name invented by the poll file.
const race = JSON.parse(convex("public:getRace", { raceId }));
const candidates = race.candidates.map((c) => ({ name: c.name, slug: c.slug }));
console.log(`${raceId}: ${candidates.length} candidates available for matching`);

const doc = JSON.parse(readFileSync(file, "utf8"));
const source = doc.races?.find((r) => /governor/i.test(r.race_name ?? "")) ?? doc.races?.[0];
if (!source) {
  console.error("no races[] entry found in the poll file");
  process.exit(2);
}

const raw = [...(source.polls ?? []), ...(source.general_election_matchup_polls ?? [])];
console.log(`${raw.length} polls in file\n`);

let stored = 0;
let refused = 0;
const unmatched = new Set();

for (const p of raw) {
  const poll = normalizePoll(p, { raceId, candidates });
  if ("error" in poll) {
    console.warn(`  REFUSED ${poll.error}`);
    refused++;
    continue;
  }
  for (const g of poll.groups) {
    for (const r of g.rows) {
      if (!r.candidateSlug && !/^(undecided|other|margin|note)/i.test(r.label)) {
        unmatched.add(r.label);
      }
    }
  }
  // The normalizer uses null for "the pollster did not publish this", which is
  // the honest domain shape. Convex v.optional() accepts a MISSING key, not an
  // explicit null, so the nulls are dropped here at the storage boundary rather
  // than weakening the lib's types.
  const storable = Object.fromEntries(
    Object.entries(poll).filter(([, v]) => v !== null),
  );
  const label = `${poll.pollster} · ${poll.conductedEnd}${poll.scientific ? "" : " · STRAW"}`;
  if (dryRun) {
    console.log(`  ${label}`);
    for (const g of poll.groups) {
      if (g.label) console.log(`    [${g.label}]`);
      for (const r of g.rows) {
        console.log(`      ${r.label.padEnd(30)} ${r.value.slice(0, 40).padEnd(42)} ${r.candidateSlug ?? "—"}`);
      }
    }
  } else {
    const res = JSON.parse(convex("pollsQueries:upsertPoll", { poll: storable }, true));
    console.log(`  ${res.updated ? "updated" : "stored "} ${label}`);
  }
  stored++;
}

console.log(`\n${dryRun ? "[dry run] " : ""}${stored} polls, ${refused} refused`);
if (unmatched.size > 0) {
  // Not an error: undeclared or withdrawn names legitimately have no candidate
  // page. Printed so a genuinely missing mapping is visible rather than silent.
  console.log(`unlinked names (no candidate page): ${[...unmatched].join(", ")}`);
}
