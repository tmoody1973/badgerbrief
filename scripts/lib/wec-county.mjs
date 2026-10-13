/**
 * County offices from the state's November candidate list.
 *
 * The state file mixes state and federal contests, county offices, a few
 * municipal ones and referendum rows. This keeps ONLY the offices every voter
 * in a county votes on (sheriff, clerk of circuit court, coroner). A contest
 * that covers part of a county is listed in `excluded` with the reason, and
 * anything the rules do not recognize is reported, never dropped.
 */
import { GENERAL_ELECTION, STATE_JURISDICTION } from "./wec-general.mjs";
import { decode } from "./wec-legislative.mjs";

const REQUIRED_COLUMNS = [
  "Election",
  "IsReferendum",
  "Name On Ballot",
  "Political Party",
  "Jurisdiction",
  "Contest",
  "District",
  "Contest Ballot Position",
  "Candidate Ballot Position",
];

// The state words these titles three ways ("Fond du Lac Sheriff", "Columbia
// County Clerk of Circuit Courts"), so the office is read from the end of the
// title, not from a fixed "<County> County <Office>" pattern.
const COUNTYWIDE_OFFICES = [
  [/\bSheriff$/i, "Sheriff"],
  [/\bClerk of Circuit Courts?$/i, "Clerk of Circuit Court"],
  [/\bCoroner$/i, "Coroner"],
];

const PART_OF_COUNTY = /\b(Municipal Judge|Supervisor)\b/i;
const PART_OF_COUNTY_REASON =
  "Covers part of a county. My Ballot knows a voter's county, not their city, town or supervisory district.";

/** "ST. CROIX COUNTY", "St. Croix County" and "St. Croix" all become "st-croix". */
export const countyKey = (name) =>
  name
    .trim()
    .toLowerCase()
    .replace(/\s+county$/, "")
    .replace(/\./g, "")
    .replace(/\s+/g, "-");

const officeFor = (contest) =>
  COUNTYWIDE_OFFICES.find(([pattern]) => pattern.test(contest))?.[1] ?? null;

function assertUsable(wecRows) {
  if (wecRows.length === 0) throw new Error("state spreadsheet has no rows");
  const missing = REQUIRED_COLUMNS.filter((column) => !(column in wecRows[0]));
  if (missing.length > 0) {
    throw new Error(`state spreadsheet is missing column(s): ${missing.join(", ")}`);
  }
  const other = wecRows.find((row) => row.Election !== GENERAL_ELECTION);
  if (other) {
    throw new Error(`expected only "${GENERAL_ELECTION}" rows, found "${other.Election}"`);
  }
}

const wholeNumber = (text, what) => {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${what} has no usable ballot position`);
  return n;
};

const notesFor = (contest) => {
  const orders = contest.candidates.map((c) => c.ballotOrder);
  return [
    ...(contest.candidates.length === 0
      ? [`${contest.contestAsPrinted}: the state lists no candidate.`]
      : []),
    ...(new Set(orders).size !== orders.length
      ? [
          `${contest.contestAsPrinted}: the state gives more than one candidate the same ballot position. They are kept in the order the state lists them.`,
        ]
      : []),
  ];
};

export function buildCountyContests(wecRows) {
  assertUsable(wecRows);
  const contests = new Map();
  const excluded = new Map();
  const unrecognized = new Set();

  for (const row of wecRows) {
    if (row.IsReferendum !== "") continue;
    if (row.Jurisdiction === STATE_JURISDICTION) continue;

    const contestAsPrinted = decode(row.Contest).trim();
    const countyName = decode(row.District).trim();
    const office = officeFor(contestAsPrinted);
    const countywide =
      office !== null &&
      /\sCOUNTY$/.test(row.Jurisdiction) &&
      countyName.toUpperCase() === row.Jurisdiction;

    if (!countywide) {
      if (office === null && PART_OF_COUNTY.test(contestAsPrinted)) {
        excluded.set(contestAsPrinted, {
          contestAsPrinted,
          jurisdiction: row.Jurisdiction,
          district: countyName,
          reason: PART_OF_COUNTY_REASON,
        });
      } else {
        unrecognized.add(`${row.Jurisdiction}: ${contestAsPrinted}`);
      }
      continue;
    }

    const county = countyKey(countyName);
    const id = `${county}/${office}`;
    const contest = contests.get(id) ?? {
      county,
      countyName,
      office,
      contestAsPrinted,
      ballotPosition: wholeNumber(row["Contest Ballot Position"], contestAsPrinted),
      candidates: [],
    };
    if (contest.contestAsPrinted !== contestAsPrinted) {
      throw new Error(
        `two contests for ${office} in ${countyName}: "${contest.contestAsPrinted}" and "${contestAsPrinted}"`,
      );
    }

    // The state prints one blank row for an office nobody filed for.
    const ballotName = decode(row["Name On Ballot"]).trim();
    if (!ballotName) {
      contests.set(id, contest);
      continue;
    }
    if (contest.candidates.some((c) => c.ballotName === ballotName)) {
      throw new Error(`duplicate "${ballotName}" in ${contestAsPrinted}`);
    }
    const party = decode(row["Political Party"]).trim();
    contests.set(id, {
      ...contest,
      candidates: [
        ...contest.candidates,
        {
          ballotName,
          ...(party ? { party } : {}),
          ballotOrder: wholeNumber(
            row["Candidate Ballot Position"],
            `"${ballotName}" in ${contestAsPrinted}`,
          ),
        },
      ],
    });
  }

  if (contests.size === 0 && unrecognized.size === 0) {
    throw new Error("no county offices found in the state spreadsheet");
  }

  // Array.prototype.sort is stable: candidates the state gives the same
  // position stay in the order the state listed them.
  const sorted = [...contests.values()]
    .map((contest) => ({
      ...contest,
      candidates: [...contest.candidates].sort((a, b) => a.ballotOrder - b.ballotOrder),
    }))
    .sort((a, b) => a.county.localeCompare(b.county) || a.ballotPosition - b.ballotPosition);

  return {
    contests: sorted,
    excluded: [...excluded.values()].sort((a, b) =>
      a.contestAsPrinted.localeCompare(b.contestAsPrinted),
    ),
    unrecognized: [...unrecognized].sort(),
    notes: sorted.flatMap(notesFor),
  };
}
