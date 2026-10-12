#!/usr/bin/env node
/**
 * Compare the state's November candidate list with the database and write a
 * report for a person to certify. READS ONLY: two public queries, two local
 * files. Nothing is written to any database.
 *
 *   node scripts/general-ballot-report.mjs [--prod] [--wec <xlsx>] [--out <dir>]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { diffAll, toCertification, toMarkdown } from "./lib/ballot-diff.mjs";
import { buildGeneralBallot } from "./lib/wec-general.mjs";
import { readWecWorkbook } from "./lib/wec-legislative.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const prod = args.includes("--prod");

const WEC_XLSX = flag("wec", "docs/evidence/2026-10-12-wec-general/All-Contests-and-Candidates_November-3-2026.xlsx");
const OUT_DIR = flag("out", "docs/evidence/general-ballot");
const source = {
  url: flag("source-url", "https://elections.wi.gov/media/41846/download"),
  documentDate: flag("source-date", "2026-10-06"),
  retrievedAt: flag("retrieved", "2026-10-12T21:32:56Z"),
};

const query = (fn) => {
  const argv = ["convex", "run", ...(prod ? ["--prod"] : []), fn, "{}"];
  const out = execFileSync("npx", argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out);
};

const { contests, unrecognized } = buildGeneralBallot(readWecWorkbook(WEC_XLSX));
const dbRaces = query("public:listRaces").map((r) => ({ raceId: r.raceId }));
const dbCandidates = query("public:listCandidateDirectory").map((c) => ({
  raceId: c.raceId,
  slug: c.slug,
  name: c.name,
  ...(c.party ? { party: c.party } : {}),
  ...(c.status ? { status: c.status } : {}),
}));

const diff = diffAll({ dbRaces, dbCandidates, contests });
const certification = toCertification({ diff, source, dataAsOf: new Date().toISOString().slice(0, 10) });

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "general-ballot-diff.md"), toMarkdown({ diff, source }));
writeFileSync(join(OUT_DIR, "general-ballot-certification.json"), `${JSON.stringify(certification, null, 2)}\n`);

const onBallot = certification.candidates.filter((c) => c.onBallot).length;
console.log(`database: ${prod ? "PRODUCTION (read only)" : "dev (read only)"}`);
console.log(`state contests: ${contests.size} | stored races: ${dbRaces.length} | stored candidates: ${dbCandidates.length}`);
console.log(`on the November ballot: ${onBallot} | new to us: ${certification.newCandidates.length} | unresolved: ${certification.unresolved.length}`);
console.log(`wrote ${join(OUT_DIR, "general-ballot-diff.md")} and general-ballot-certification.json`);

if (unrecognized.length > 0) {
  console.error(`UNRECOGNIZED state contests (the state may have changed its wording): ${unrecognized.join("; ")}`);
}
if (unrecognized.length > 0 || certification.unresolved.length > 0) process.exit(1);
