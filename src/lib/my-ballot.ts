/**
 * One voter's November ballot, put together from the certified lists.
 *
 * Kept free of React, data fetching and the signed data files themselves
 * (types only), so it runs in the browser and can be tested directly. The
 * server builds one `BallotData` for everyone; the browser picks one voter's
 * contests out of it. A voter's districts are therefore never asked of any
 * server (decision 018).
 *
 * The one rule a caller must never bend: a contest this module cannot place
 * is left out. It is never guessed at and never borrowed from a neighbouring
 * district.
 */
import type { CountyContest } from "../../convex/lib/ballotExtras";
import type { BallotIndexRace } from "../../convex/public";
import type { Districts } from "./districts";
import { raceIdToSlug } from "./site";

export type Stamp = { label: "positions" | "money" | "ads" | "questionnaire"; href: string };

export type BallotContest = {
  /** A race id, or "county:<county>:<position>". */
  key: string;
  /** The state's Contest Ballot Position. */
  position: number;
  office: string;
  /** As the state prints them, in the state's order. */
  candidates: { name: string; party?: string; href?: string }[];
  /** The race page. County offices have none. */
  href?: string;
  /** The compare page, when there are two or more names and a published position to compare. */
  compareHref?: string;
  /** What the guide holds. Empty means it has no further information. */
  stamps: Stamp[];
};

export type BallotData = {
  statewide: BallotContest[];
  congressional: Record<number, BallotContest>;
  senate: Record<number, BallotContest>;
  assembly: Record<number, BallotContest>;
  /** By county key. Null when the county file is not certified. */
  counties: Record<string, { name: string; contests: BallotContest[] }> | null;
  ballotSource: { url: string; documentDate: string };
};

export type VoterBallot = {
  /** In the state's order. */
  contests: BallotContest[];
  senate: "on-ballot" | "not-up";
  county: { status: "ok"; name: string } | { status: "missing" } | { status: "unknown" } | { status: "not-certified" };
};

const STATEWIDE = new Map([
  ["WI-GOV-2026", 250],
  ["WI-AG-2026", 252],
  ["WI-SOS-2026", 253],
  ["WI-TREAS-2026", 254],
]);

const DISTRICT_BANDS = [
  { pattern: /^WI-US-HOUSE-D(\d+)-2026$/, base: 1200, slot: "congressional" },
  { pattern: /^WI-STATE-SENATE-D(\d+)-2026$/, base: 1300, slot: "senate" },
  { pattern: /^WI-STATE-ASSEMBLY-D(\d+)-2026$/, base: 1400, slot: "assembly" },
] as const;

type Placed = { position: number } & ({ slot: "statewide" } | { slot: "congressional" | "senate" | "assembly"; district: number });

function place(raceId: string): Placed | null {
  const fixed = STATEWIDE.get(raceId);
  if (fixed !== undefined) return { position: fixed, slot: "statewide" };
  for (const band of DISTRICT_BANDS) {
    const match = band.pattern.exec(raceId);
    if (match) return { position: band.base + Number(match[1]), slot: band.slot, district: Number(match[1]) };
  }
  return null;
}

/**
 * The state's Contest Ballot Position for a race, from its id. The state's
 * numbering is regular; my-ballot-order.test.ts holds this to the state's file.
 */
export function contestPosition(raceId: string): number | null {
  return place(raceId)?.position ?? null;
}

function raceContest(race: BallotIndexRace, position: number, answered: boolean): BallotContest {
  const page = `/races/${raceIdToSlug(race.raceId)}`;
  const compareHref = race.candidates.length >= 2 && race.holds.positions ? `/compare/${raceIdToSlug(race.raceId)}` : undefined;
  const stamps: Stamp[] = [
    ...(race.holds.positions ? [{ label: "positions" as const, href: compareHref ?? `${page}#candidates` }] : []),
    ...(race.holds.money ? [{ label: "money" as const, href: `${page}#money` }] : []),
    ...(race.holds.ads ? [{ label: "ads" as const, href: `${page}#ad-money` }] : []),
    ...(answered ? [{ label: "questionnaire" as const, href: `${page}#questionnaire` }] : []),
  ];
  return {
    key: race.raceId,
    position,
    office: race.office,
    candidates: race.candidates.map((c) => ({ name: c.ballotName, ...(c.party ? { party: c.party } : {}), href: `/candidates/${c.slug}` })),
    href: page,
    ...(compareHref ? { compareHref } : {}),
    stamps,
  };
}

/** A county office: the names the state prints, in the file's row order, and nothing else. */
function countyContest(contest: CountyContest): BallotContest {
  return {
    key: `county:${contest.county}:${contest.ballotPosition}`,
    position: contest.ballotPosition,
    office: contest.contestAsPrinted,
    candidates: contest.candidates.map((c) => ({ name: c.ballotName, ...(c.party ? { party: c.party } : {}) })),
    stamps: [],
  };
}

const byPosition = (a: BallotContest, b: BallotContest) => a.position - b.position;

/**
 * Everything My Ballot can show, for every voter. `answered` says whether
 * anyone on the ballot in a race answered Wisconsin Watch's questionnaire.
 * `countyContests` is null while the county file is not certified.
 */
export function buildBallotData(input: {
  index: readonly BallotIndexRace[];
  countyContests: readonly CountyContest[] | null;
  answered: (raceId: string) => boolean;
}): BallotData {
  const statewide: BallotContest[] = [];
  const districts = { congressional: {}, senate: {}, assembly: {} } as Pick<BallotData, "congressional" | "senate" | "assembly">;
  for (const race of input.index) {
    const placed = place(race.raceId);
    if (!placed) continue;
    const contest = raceContest(race, placed.position, input.answered(race.raceId));
    if (placed.slot === "statewide") statewide.push(contest);
    else districts[placed.slot][placed.district] = contest;
  }

  let counties: BallotData["counties"] = null;
  if (input.countyContests) {
    counties = {};
    for (const contest of input.countyContests) {
      const entry = Object.hasOwn(counties, contest.county) ? counties[contest.county] : (counties[contest.county] = { name: contest.countyName, contests: [] });
      entry.contests.push(countyContest(contest));
    }
  }

  const first = input.index[0]?.source;
  return {
    statewide: statewide.sort(byPosition),
    ...districts,
    counties,
    ballotSource: { url: first?.url ?? "", documentDate: first?.documentDate ?? "" },
  };
}

const own = <T>(record: Record<string | number, T>, key: string | number): T | undefined => (Object.hasOwn(record, key) ? record[key] : undefined);

/** One voter's contests, in the state's order. */
export function voterBallot(data: BallotData, districts: Districts): VoterBallot {
  const senate = own(data.senate, districts.senate);
  const mine = [...data.statewide, own(data.congressional, districts.congressional), senate, own(data.assembly, districts.assembly)].filter(
    (contest): contest is BallotContest => contest !== undefined,
  );

  let county: VoterBallot["county"];
  if (data.counties === null) county = { status: "not-certified" };
  else if (!districts.county) county = { status: "missing" };
  else {
    const found = own(data.counties, districts.county);
    if (found) {
      county = { status: "ok", name: found.name };
      mine.push(...found.contests);
    } else county = { status: "unknown" };
  }

  return { contests: mine.sort(byPosition), senate: senate ? "on-ballot" : "not-up", county };
}

/**
 * The places that make up this ballot, each a phrase that must not break
 * across lines: "House 4", "Senate 7", "Assembly 19", "Milwaukee County".
 * The state's file already writes a county's name with the word "County".
 */
export function ballotPlaces(districts: Districts, county: VoterBallot["county"]): string[] {
  return [
    `House ${districts.congressional}`,
    `Senate ${districts.senate}`,
    `Assembly ${districts.assembly}`,
    ...(county.status === "ok" ? [county.name] : []),
  ];
}

/** The ballot in two passes: contests with a real choice, then offices with one name. Each keeps the state's order. */
export function byAttention(contests: readonly BallotContest[]): { decisions: BallotContest[]; oneName: BallotContest[] } {
  return {
    decisions: contests.filter((c) => c.candidates.length > 1),
    oneName: contests.filter((c) => c.candidates.length <= 1),
  };
}

/** Each contest's place in the state's order among the contests shown: "3 of 9". The same in either view. */
export function numbered(contests: readonly BallotContest[]): Map<string, { n: number; of: number }> {
  const inOrder = [...contests].sort(byPosition);
  return new Map(inOrder.map((contest, i) => [contest.key, { n: i + 1, of: inOrder.length }]));
}
