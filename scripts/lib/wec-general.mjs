/**
 * Turn the state's "All Contests and Candidates" rows for the Nov 3, 2026
 * general election into candidates per race.
 *
 * Only state and federal contests are kept. They are the rows whose
 * Jurisdiction is "STATE OF WISCONSIN"; county and municipal offices carry a
 * county name and are handled elsewhere. Names are kept exactly as printed.
 */
import { decode } from "./wec-legislative.mjs";

export const GENERAL_ELECTION = "2026 General Election";
export const STATE_JURISDICTION = "STATE OF WISCONSIN";

const REQUIRED_COLUMNS = [
  "Election",
  "IsReferendum",
  "Name On Ballot",
  "CommitteeID",
  "Political Party",
  "Jurisdiction",
  "Contest",
  "Candidate Ballot Position",
];

const FIXED_CONTESTS = new Map([
  ["GOVERNOR / LIEUTENANT GOVERNOR", "WI-GOV-2026"],
  ["ATTORNEY GENERAL", "WI-AG-2026"],
  ["SECRETARY OF STATE", "WI-SOS-2026"],
  ["STATE TREASURER", "WI-TREAS-2026"],
]);

const DISTRICT_CONTESTS = [
  [/^REPRESENTATIVE IN CONGRESS DISTRICT (\d+)$/, (n) => `WI-US-HOUSE-D${n}-2026`],
  [/^STATE SENATOR DISTRICT (\d+)$/, (n) => `WI-STATE-SENATE-D${n}-2026`],
  [/^REPRESENTATIVE TO THE ASSEMBLY DISTRICT (\d+)$/, (n) => `WI-STATE-ASSEMBLY-D${n}-2026`],
];

/** Our race ID for a state contest name, or null if we do not recognize it. */
export function raceIdForContest(contest) {
  const name = contest.trim().toUpperCase();
  const fixed = FIXED_CONTESTS.get(name);
  if (fixed) return fixed;
  for (const [pattern, toRaceId] of DISTRICT_CONTESTS) {
    const match = pattern.exec(name);
    if (match) return toRaceId(Number(match[1]));
  }
  return null;
}

/** "Tom Tiffany / David Varnam" is a governor and a running mate. */
export function splitTicket(nameOnBallot) {
  const [first, second] = nameOnBallot.split(" / ").map((part) => part.trim());
  return { matchName: first, runningMate: second || null };
}

function assertUsable(wecRows) {
  if (wecRows.length === 0) throw new Error("state spreadsheet has no rows");
  const missing = REQUIRED_COLUMNS.filter((column) => !(column in wecRows[0]));
  if (missing.length > 0) {
    throw new Error(`state spreadsheet is missing column(s): ${missing.join(", ")}`);
  }
  const wrong = wecRows.find((r) => r.Election !== GENERAL_ELECTION);
  if (wrong) {
    throw new Error(
      `every row must be "${GENERAL_ELECTION}" but found "${wrong.Election}". Is this the primary file?`,
    );
  }
}

function toCandidate(row, raceId) {
  const ballotName = decode(row["Name On Ballot"]);
  const ballotOrder = Number(row["Candidate Ballot Position"]);
  if (!Number.isInteger(ballotOrder) || ballotOrder < 1) {
    throw new Error(`"${ballotName}" in ${raceId} has no usable ballot position`);
  }
  return {
    ballotName,
    ...splitTicket(ballotName),
    party: row["Political Party"] || null,
    ballotOrder,
    committeeId: row.CommitteeID || null,
  };
}

/**
 * @returns {{ contests: Map<string, object[]>, unrecognized: string[] }}
 *   `unrecognized` lists state contest names we could not map. Callers must
 *   treat a non-empty list as a failure.
 */
export function buildGeneralBallot(wecRows) {
  assertUsable(wecRows);
  const contests = new Map();
  const unrecognized = new Set();

  for (const row of wecRows) {
    if (row.IsReferendum !== "") continue;
    if (row.Jurisdiction !== STATE_JURISDICTION) continue;
    if (!row["Name On Ballot"]) continue;

    const raceId = raceIdForContest(row.Contest);
    if (raceId === null) {
      unrecognized.add(row.Contest);
      continue;
    }
    const candidate = toCandidate(row, raceId);
    const soFar = contests.get(raceId) ?? [];
    if (soFar.some((c) => c.ballotName === candidate.ballotName)) {
      throw new Error(`duplicate "${candidate.ballotName}" in ${raceId}`);
    }
    contests.set(raceId, [...soFar, candidate]);
  }

  if (contests.size === 0 && unrecognized.size === 0) {
    throw new Error("no state or federal candidates found in the state spreadsheet");
  }
  const inBallotOrder = new Map(
    [...contests].map(([raceId, list]) => [
      raceId,
      [...list].sort((a, b) => a.ballotOrder - b.ballotOrder),
    ]),
  );
  return { contests: inBallotOrder, unrecognized: [...unrecognized].sort() };
}
