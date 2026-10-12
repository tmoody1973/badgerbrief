#!/usr/bin/env node
/**
 * Apply a certified November ballot file.
 *
 *   node scripts/apply-general-ballot.mjs --file <certification.json> [--prod]
 *
 * Refuses a file that is unsigned or still has unresolved items. Safe to run
 * twice: the backend function gives the same result each time.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { assertCertified, chunk } from "./lib/ballot-diff.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const prod = args.includes("--prod");
const path = flag("file");
if (!path) {
  console.error("--file <certification.json> is required");
  process.exit(2);
}

const file = JSON.parse(readFileSync(path, "utf8"));
assertCertified(file);

const run = (fn, payload) => {
  const argv = ["convex", "run", ...(prod ? ["--prod"] : []), fn, JSON.stringify(payload)];
  return JSON.parse(execFileSync("npx", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
};

console.log(`target: ${prod ? "PRODUCTION" : "dev"} | certified by ${file.certifiedBy} on ${file.certifiedAt}`);
const base = { source: file.source, dataAsOf: file.dataAsOf };
const totals = { racesPatched: 0, candidatesPatched: 0, candidatesInserted: 0 };
const add = (r) => Object.keys(totals).forEach((k) => (totals[k] += r[k]));

// Races and new candidates first, then stored candidates 100 at a time. Each
// call is one transaction; a failure stops here and a re-run is safe.
add(run("generalBallot:applyGeneralBallot", { ...base, races: file.races, candidates: [], newCandidates: file.newCandidates }));
for (const group of chunk(file.candidates, 100)) {
  add(run("generalBallot:applyGeneralBallot", { ...base, races: [], candidates: group, newCandidates: [] }));
}
console.log(totals);

const key = (c) => `${c.raceId}/${c.slug}`;
const expected = new Set([...file.candidates.filter((c) => c.onBallot), ...file.newCandidates].map(key));
const actual = new Set(run("generalBallot:onBallotSlugs", {}).map(key));
const missing = [...expected].filter((k) => !actual.has(k));
const extra = [...actual].filter((k) => !expected.has(k));
console.log(`on the ballot — file: ${expected.size} | database: ${actual.size}`);
if (missing.length > 0 || extra.length > 0) {
  console.error("MISMATCH", { missing, extra });
  process.exit(1);
}
console.log("database matches the certified file");
