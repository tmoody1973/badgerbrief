#!/usr/bin/env node
/**
 * Apply a certified November ballot file.
 *
 *   node scripts/apply-general-ballot.mjs --file <certification.json> [--prod]
 *
 * Refuses a file that is unsigned, has unresolved items, or was compared
 * against a different database. The whole file goes in ONE backend call, which
 * is one transaction: it lands completely or not at all. Safe to run twice.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { assertCertified, assertTarget } from "./lib/ballot-diff.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const prod = args.includes("--prod");
const target = prod ? "prod" : "dev";
const path = flag("file");
if (!path) {
  console.error("--file <certification.json> is required");
  process.exit(2);
}

const file = JSON.parse(readFileSync(path, "utf8"));
assertCertified(file);
assertTarget(file, target);

const run = (fn, payload) => {
  const argv = ["convex", "run", ...(prod ? ["--prod"] : []), fn, JSON.stringify(payload)];
  return JSON.parse(execFileSync("npx", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
};

console.log(`target: ${prod ? "PRODUCTION" : "dev"} | certified by ${file.certifiedBy} on ${file.certifiedAt}`);
const result = run("generalBallot:applyGeneralBallot", {
  source: file.source,
  dataAsOf: file.dataAsOf,
  races: file.races,
  candidates: file.candidates,
  newCandidates: file.newCandidates,
});
console.log(result);

// Read back what the database now holds and compare it with the file, field by field.
const key = (c) => `${c.raceId}/${c.slug}`;
const shown = (ballotName, party, ballotOrder) => JSON.stringify({ ballotName: ballotName ?? null, party: party ?? null, ballotOrder: ballotOrder ?? null });
const expected = new Map([
  ...file.candidates.filter((c) => c.onBallot).map((c) => [key(c), shown(c.ballotName, c.party, c.ballotOrder)]),
  ...file.newCandidates.map((c) => [key(c), shown(c.name, c.party, c.ballotOrder)]),
]);
const actual = new Map(
  run("generalBallot:onBallotSlugs", {}).map((c) => [key(c), shown(c.ballotName, c.party, c.ballotOrder)]),
);
const missing = [...expected.keys()].filter((k) => !actual.has(k));
const extra = [...actual.keys()].filter((k) => !expected.has(k));
const different = [...expected.keys()].filter((k) => actual.has(k) && actual.get(k) !== expected.get(k));
console.log(`on the ballot — file: ${expected.size} | database: ${actual.size}`);
if (missing.length > 0 || extra.length > 0 || different.length > 0) {
  console.error("MISMATCH", { missing, extra, different });
  process.exit(1);
}
console.log("database matches the certified file");
