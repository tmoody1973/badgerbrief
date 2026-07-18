#!/usr/bin/env node
/**
 * Seed Convex from docs/wisconsin_2026_primary_elections.json.
 * Usage: node scripts/seed.mjs [--prod]
 * Idempotent: upserts by natural keys (election slug, raceId, candidate slug, source url).
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PROD = process.argv.includes("--prod");
const ELECTION_SLUG = "wi-2026";

const data = JSON.parse(
  readFileSync(new URL("../docs/wisconsin_2026_primary_elections.json", import.meta.url), "utf8"),
);

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const links = (arr) =>
  (arr ?? [])
    .filter((s) => s && s.url)
    .map((s) => ({ name: s.name ?? s.url, url: s.url }));

function run(fn, args) {
  const argv = ["convex", "run", fn, JSON.stringify(args), "--typecheck", "disable"];
  if (PROD) argv.push("--prod");
  return execFileSync("npx", argv, { stdio: ["ignore", "pipe", "inherit"] }).toString();
}

function transformCandidate(c, primaryParty) {
  return {
    slug: slugify(c.name),
    name: c.name,
    party: c.party,
    ...(primaryParty ? { primaryParty } : {}),
    status: c.status,
    incumbent: c.incumbent,
    background: c.background,
    currentOccupation: c.current_occupation,
    keyPriorities: c.key_priorities,
    notableEndorsements: c.notable_endorsements,
    notes: c.notes,
    fecCandidateId: c.fec_candidate_id,
    photoUrl: c.photo_url,
    photoSource: c.photo_source,
    socialMedia: c.social_media,
    campaignFinanceInfo: c.campaign_finance,
    sources: links(c.sources),
  };
}

// 1. election + voting info
run("seed:upsertElection", {
  slug: ELECTION_SLUG,
  state: data.state,
  cycle: data.election_cycle,
  primaryDate: data.primary_election_date,
  generalDate: data.general_election_date,
  springPrimaryDate: data.spring_primary_date,
  springGeneralDate: data.spring_general_date,
  filingDeadline: data.filing_deadline,
  primaryType: data.primary_type,
  dataAsOf: data.data_as_of,
});
console.log("✓ election");

const vi = data.voting_information;
run("seed:upsertVotingInfo", {
  electionSlug: ELECTION_SLUG,
  primaryDate: vi.primary_date,
  pollsOpen: vi.polls_open,
  pollsClose: vi.polls_close,
  timezone: vi.timezone,
  voterRegistration: vi.voter_registration,
  absenteeRequestDeadline: vi.absentee_ballot_request_deadline,
  absenteeReturnDeadline: vi.absentee_ballot_return_deadline,
  earlyVoting: vi.early_voting,
  voterIdRequired: vi.voter_id_required,
  photoIdRequired: vi.photo_id_required,
  officialVoterInfoUrl: vi.official_voter_info,
  officialGuideUrl: vi.official_wuwm_voter_guide,
  sources: links(vi.sources),
});
console.log("✓ voting_info");

// 2. races + candidates
for (const r of data.races) {
  const candidates = [];
  for (const [party, pdata] of Object.entries(r.primaries ?? {})) {
    for (const c of pdata.candidates ?? []) {
      candidates.push(transformCandidate(c, party));
    }
  }
  for (const c of r.candidates ?? []) {
    candidates.push(transformCandidate(c, undefined));
  }
  run("seed:upsertRace", {
    race: {
      raceId: r.race_id,
      electionSlug: ELECTION_SLUG,
      office: r.office,
      level: r.level,
      primaryDate: r.primary_date,
      generalDate: r.general_date,
      electionType: r.election_type,
      incumbent: r.incumbent,
      seatHeldBy: r.seat_held_by,
      officeDescription: r.office_description,
      districtDescription: r.district_description,
      notes: r.notes,
      seatsUp: r.seats_up,
      raceRating: r.race_rating,
      currentComposition: r.current_composition,
      competitiveSeatsToWatch: r.competitive_seats_to_watch,
      districts: r.districts,
      campaignFinanceInfo: r.campaign_finance,
      sources: links(r.sources),
      dataAsOf: data.data_as_of,
    },
    candidates,
  });
  console.log(`✓ ${r.race_id} (${candidates.length} candidates)`);
}

console.log("\ncounts:", run("seed:counts", {}));
