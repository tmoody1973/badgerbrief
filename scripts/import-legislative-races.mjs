/**
 * Create per-district races and candidates for the Wisconsin Legislature.
 *
 * The guide previously carried "Wisconsin State Senate" and "Wisconsin State
 * Assembly" as two lumped races whose districts lived in `races.districts` —
 * an opaque `v.any()` blob the schema itself calls "display-only ... rendered,
 * never computed on". Every candidate in it was therefore invisible to the rest
 * of the product: no candidate page, no finance, no positions, no voting record
 * and no ballot matching. This turns each district into a real race with real
 * candidate rows.
 *
 * Names come from WEC, metadata from the election JSON — see lib/wec-legislative.mjs.
 *
 * Usage:
 *   node scripts/import-legislative-races.mjs --chamber senate [--prod] [--dry-run]
 *   node scripts/import-legislative-races.mjs --chamber assembly [--prod] [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  buildDistricts,
  officeFor,
  raceIdFor,
  readWecWorkbook,
} from "./lib/wec-legislative.mjs";

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const chamber = flag("chamber");
if (chamber !== "senate" && chamber !== "assembly") {
  console.error("--chamber senate|assembly is required");
  process.exit(2);
}
const prod = args.includes("--prod");
const dryRun = args.includes("--dry-run");

const WEC_XLSX = flag("wec", ".playwright-mcp/All-Contests-and-Candidates.xlsx");
const ELECTION_JSON = flag("json", "docs/wisconsin_2026_primary_elections.json");
const WEC_SOURCE = {
  name: "Wisconsin Elections Commission — 2026 Partisan Primary candidate list",
  url: "https://elections.wi.gov/media/40146/download",
};

const electionJson = JSON.parse(readFileSync(ELECTION_JSON, "utf8"));
const wecRows = readWecWorkbook(WEC_XLSX);
const districts = buildDistricts({ wecRows, electionJson, chamber });

const parentOffice =
  chamber === "senate" ? "Wisconsin State Senate" : "Wisconsin State Assembly";
const parent = electionJson.races.find((r) => r.office === parentOffice);
const dataAsOf = electionJson.data_as_of;

const convex = (fn, payload) => {
  const argv = ["convex", "run"];
  if (prod) argv.push("--prod");
  argv.push(fn, JSON.stringify(payload));
  return execFileSync("npx", argv, { encoding: "utf8" }).trim();
};

let races = 0;
let candidates = 0;
for (const d of districts) {
  const race = {
    raceId: raceIdFor(chamber, d.district),
    electionSlug: "wi-2026",
    office: officeFor(chamber, d.district),
    level: "State Legislative",
    primaryDate: parent.primary_date,
    generalDate: parent.general_date,
    // The incumbent's name as WEC prints it when they are running again, so the
    // race header and the candidate row cannot disagree.
    ...(d.candidates.find((c) => c.incumbent)
      ? { incumbent: d.candidates.find((c) => c.incumbent).name }
      : {}),
    ...(d.districtDescription ? { districtDescription: d.districtDescription } : {}),
    ...(d.openSeat ? { notes: "Open seat — no incumbent is seeking re-election." } : {}),
    campaignFinanceInfo: parent.campaign_finance,
    sources: [WEC_SOURCE, ...(d.sources ?? [])],
    dataAsOf,
  };
  const cands = d.candidates.map((c) => ({
    slug: c.slug,
    name: c.name,
    party: c.party ?? undefined,
    primaryParty: c.party ?? undefined,
    status: "Active",
    incumbent: c.incumbent,
    sources: [WEC_SOURCE],
  }));

  if (dryRun) {
    console.log(
      `${race.raceId.padEnd(32)} ${String(cands.length).padStart(2)} cand` +
        `${race.incumbent ? ` · inc ${race.incumbent}` : " · OPEN"}`,
    );
  } else {
    convex("seed:upsertRace", { race, candidates: cands });
    console.log(`${race.raceId} ✓ ${cands.length}`);
  }
  races++;
  candidates += cands.length;
}

console.log(
  `\n${dryRun ? "[dry run] " : ""}${races} races, ${candidates} candidates (${chamber})`,
);
