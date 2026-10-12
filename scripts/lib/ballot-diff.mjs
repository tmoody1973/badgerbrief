/**
 * Compare the state's November candidates with the candidates we store.
 *
 * The matching rule is deliberately strict: within one race, a state candidate
 * and a stored candidate are the same person only when exactly one of each
 * shares a surname. Anything else is "unresolved" and goes to a person. In
 * July, inserting on a near-miss name created duplicate people on a live page.
 */
import { slugify, surnameOf } from "./wec-legislative.mjs";

const GOVERNOR = "WI-GOV-2026";
const LT_GOVERNOR = "WI-LTGOV-2026";

export const NO_CONTEST_NOTES = {
  [LT_GOVERNOR]:
    "Not a separate November contest. Each party's nominee is the running mate on a governor ticket.",
  "WI-SCOTUS-2026": "Decided in the April 7, 2026 spring election.",
  "WI-STATE-SENATE-2026": "Replaced by one race per district.",
  "WI-STATE-ASSEMBLY-2026": "Replaced by one race per district.",
};
export const DEFAULT_NO_CONTEST_NOTE = "Not on the state's November 3, 2026 list.";

/** Surname with accents removed, so "Peña" and "Pena" compare equal. */
const surnameKey = (name) =>
  surnameOf(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");

const groupBy = (list, keyOf) => {
  const groups = new Map();
  for (const item of list) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return groups;
};

const brief = (c) => ({ slug: c.slug, name: c.name });

function matchOne({ raceId, stateCandidate, stored, allStored }) {
  if (stored) {
    return {
      advancing: {
        slug: stored.slug,
        storedName: stored.name,
        matchName: stateCandidate.matchName,
        ballotName: stateCandidate.ballotName,
        party: stateCandidate.party,
        ballotOrder: stateCandidate.ballotOrder,
        runningMate: stateCandidate.runningMate,
        nameDiffers: slugify(stored.name) !== slugify(stateCandidate.matchName),
        partyDiffers: (stored.party ?? null) !== stateCandidate.party,
      },
    };
  }
  const slug = slugify(stateCandidate.matchName);
  const taken = allStored.find((c) => c.slug === slug);
  if (taken) {
    return {
      unresolved: {
        raceId,
        surname: surnameKey(stateCandidate.matchName),
        reason: "a new candidate would take an address that already belongs to someone else",
        state: [stateCandidate.ballotName],
        db: [brief(taken)],
      },
    };
  }
  return {
    newCandidate: {
      slug,
      name: stateCandidate.matchName,
      ballotName: stateCandidate.ballotName,
      party: stateCandidate.party,
      ballotOrder: stateCandidate.ballotOrder,
    },
  };
}

export function diffRace({ raceId, dbCandidates, stateCandidates }) {
  const storedBySurname = groupBy(dbCandidates, (c) => surnameKey(c.name));
  const stateBySurname = groupBy(stateCandidates, (c) => surnameKey(c.matchName));
  const advancing = [];
  const newCandidates = [];
  const unresolved = [];
  const accountedFor = new Set();

  for (const [surname, fromState] of stateBySurname) {
    const stored = storedBySurname.get(surname) ?? [];
    stored.forEach((c) => accountedFor.add(c.slug));
    if (fromState.length > 1 || stored.length > 1) {
      unresolved.push({
        raceId,
        surname,
        reason: "more than one candidate in this race shares this surname",
        state: fromState.map((c) => c.ballotName),
        db: stored.map(brief),
      });
      continue;
    }
    const result = matchOne({ raceId, stateCandidate: fromState[0], stored: stored[0], allStored: dbCandidates });
    if (result.advancing) advancing.push(result.advancing);
    if (result.newCandidate) newCandidates.push(result.newCandidate);
    if (result.unresolved) unresolved.push(result.unresolved);
  }

  const byOrder = (a, b) => a.ballotOrder - b.ballotOrder;
  return {
    raceId,
    advancing: [...advancing].sort(byOrder),
    newCandidates: [...newCandidates].sort(byOrder),
    notOnBallot: dbCandidates
      .filter((c) => !accountedFor.has(c.slug))
      .map((c) => ({ slug: c.slug, name: c.name, status: c.status ?? null })),
    unresolved,
    uncontested: stateCandidates.length === 1,
  };
}

/** Find each governor ticket's running mate among the Lt. Governor candidates. */
function linkRunningMates({ governor, ltGovCandidates }) {
  const linked = [];
  const unresolved = [];
  for (const ticket of (governor?.advancing ?? []).filter((a) => a.runningMate)) {
    const matches = ltGovCandidates.filter((c) => surnameKey(c.name) === surnameKey(ticket.runningMate));
    if (matches.length === 1) {
      linked.push({
        raceId: LT_GOVERNOR,
        slug: matches[0].slug,
        storedName: matches[0].name,
        ballotName: ticket.ballotName,
        party: ticket.party,
        ballotOrder: ticket.ballotOrder,
        runningMate: ticket.matchName,
      });
    } else {
      unresolved.push({
        raceId: LT_GOVERNOR,
        surname: surnameKey(ticket.runningMate),
        reason: "the running mate was not found exactly once among Lieutenant Governor candidates",
        state: [ticket.ballotName],
        db: matches.map(brief),
      });
    }
  }
  return { linked, unresolved };
}

export function diffAll({ dbRaces, dbCandidates, contests }) {
  const storedByRace = groupBy(dbCandidates, (c) => c.raceId);
  const storedRaceIds = new Set(dbRaces.map((r) => r.raceId));
  const inRace = (raceId) => storedByRace.get(raceId) ?? [];

  const races = dbRaces
    .filter((r) => contests.has(r.raceId))
    .map((r) => diffRace({ raceId: r.raceId, dbCandidates: inRace(r.raceId), stateCandidates: contests.get(r.raceId) }));

  const racesWithoutContest = dbRaces
    .filter((r) => !contests.has(r.raceId))
    .map((r) => ({
      raceId: r.raceId,
      note: NO_CONTEST_NOTES[r.raceId] ?? DEFAULT_NO_CONTEST_NOTE,
      candidates: inRace(r.raceId).map(brief),
    }));

  const contestsWithoutRace = [...contests.keys()].filter((id) => !storedRaceIds.has(id)).sort();

  return {
    races,
    racesWithoutContest,
    contestsWithoutRace,
    contestsWithoutRaceNames: Object.fromEntries(
      contestsWithoutRace.map((id) => [id, contests.get(id).map((c) => c.ballotName)]),
    ),
    runningMates: linkRunningMates({
      governor: races.find((r) => r.raceId === GOVERNOR),
      ltGovCandidates: inRace(LT_GOVERNOR),
    }),
  };
}

/** Drop null and undefined so optional backend fields are omitted, never null. */
const present = (object) =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined));

const allUnresolved = (diff) => [
  ...diff.races.flatMap((r) => r.unresolved),
  ...diff.runningMates.unresolved,
  ...diff.contestsWithoutRace.map((raceId) => ({
    raceId,
    surname: "",
    reason: "the state lists this contest but the database has no such race",
    state: diff.contestsWithoutRaceNames[raceId],
    db: [],
  })),
];

/**
 * The file a person signs. Every stored candidate appears exactly once with
 * `onBallot` true or false, so nothing is left to inference when it is applied.
 */
export function toCertification({ diff, source, dataAsOf }) {
  const mates = new Map(diff.runningMates.linked.map((m) => [`${m.raceId}/${m.slug}`, m]));
  const onBallot = (raceId, a) =>
    present({ raceId, slug: a.slug, onBallot: true, ballotName: a.ballotName, party: a.party, ballotOrder: a.ballotOrder, runningMate: a.runningMate });

  const fromContests = diff.races.flatMap((r) => [
    ...r.advancing.map((a) => onBallot(r.raceId, a)),
    ...r.notOnBallot.map((c) => ({ raceId: r.raceId, slug: c.slug, onBallot: false })),
  ]);
  const fromOtherRaces = diff.racesWithoutContest.flatMap((r) =>
    r.candidates.map((c) => {
      const mate = mates.get(`${r.raceId}/${c.slug}`);
      return mate ? onBallot(r.raceId, mate) : { raceId: r.raceId, slug: c.slug, onBallot: false };
    }),
  );

  return {
    source,
    dataAsOf,
    certifiedBy: "",
    certifiedAt: "",
    unresolved: allUnresolved(diff),
    races: [
      ...diff.races.map((r) => ({ raceId: r.raceId, onBallot: true })),
      ...diff.racesWithoutContest.map((r) => ({ raceId: r.raceId, onBallot: false, note: r.note })),
    ],
    candidates: [...fromContests, ...fromOtherRaces],
    newCandidates: diff.races.flatMap((r) =>
      r.newCandidates.map((c) => present({ raceId: r.raceId, slug: c.slug, name: c.name, party: c.party, ballotOrder: c.ballotOrder })),
    ),
  };
}

/** Refuse to apply anything a person has not signed, or that still has open questions. */
export function assertCertified(file) {
  if (!file.certifiedBy?.trim()) throw new Error('not certified: "certifiedBy" is empty');
  if (!file.certifiedAt?.trim()) throw new Error('not certified: "certifiedAt" is empty');
  if ((file.unresolved ?? []).length > 0) {
    throw new Error(`not applicable: ${file.unresolved.length} unresolved item(s) remain`);
  }
}

export const chunk = (list, size) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

const bullets = (lines) => (lines.length > 0 ? lines.map((l) => `- ${l}`).join("\n") : "- None");

/** A plain-language report for the person who certifies. */
export function toMarkdown({ diff, source }) {
  const advancing = diff.races.flatMap((r) => r.advancing.map((a) => ({ ...a, raceId: r.raceId })));
  const gone = diff.races.flatMap((r) => r.notOnBallot.map((c) => ({ ...c, raceId: r.raceId })));
  const fresh = diff.races.flatMap((r) => r.newCandidates.map((c) => ({ ...c, raceId: r.raceId })));
  const unresolved = allUnresolved(diff);
  const renamed = advancing.filter((a) => a.nameDiffers);
  const reparty = advancing.filter((a) => a.partyDiffers);
  const single = diff.races.filter((r) => r.uncontested);

  return [
    "# November 3, 2026 ballot: difference report",
    "",
    `Source: ${source.url} (file dated ${source.documentDate}, retrieved ${source.retrievedAt}).`,
    "",
    "## Totals",
    "",
    `- On the November ballot: ${advancing.length} (plus ${diff.runningMates.linked.length} running mates, listed below)`,
    `- Stored, not on the November ballot: ${gone.length}`,
    `- New to us: ${fresh.length}`,
    `- Unresolved: ${unresolved.length}`,
    `- Races with one candidate: ${single.length}`,
    "",
    "## Unresolved — nothing is written until these are settled",
    "",
    bullets(unresolved.map((u) => `${u.raceId}: ${u.reason}. State: ${u.state.join("; ") || "—"}. Stored: ${u.db.map((c) => c.name).join("; ") || "—"}.`)),
    "",
    "## New to us",
    "",
    bullets(fresh.map((c) => `${c.raceId}: ${c.ballotName} (${c.party ?? "no party listed"}), address \`${c.slug}\``)),
    "",
    "## Printed name differs from the stored name (the address does not change)",
    "",
    bullets(renamed.map((a) => `${a.raceId}: ballot "${a.ballotName}", stored "${a.storedName}"`)),
    "",
    "## Party listed differently",
    "",
    bullets(reparty.map((a) => `${a.raceId}: ${a.storedName}: state "${a.party}"`)),
    "",
    "## Running mates",
    "",
    bullets(diff.runningMates.linked.map((m) => `${m.storedName} appears on the ballot as "${m.ballotName}"`)),
    "",
    "## Stored races with no November contest",
    "",
    bullets(diff.racesWithoutContest.map((r) => `${r.raceId}: ${r.note}`)),
    "",
    "## Stored, not on the November ballot",
    "",
    bullets(gone.map((c) => `${c.raceId}: ${c.name}${c.status ? ` (status: ${c.status})` : ""}`)),
    "",
    "## Races with one candidate",
    "",
    bullets(single.map((r) => `${r.raceId}: ${r.advancing[0]?.ballotName ?? r.newCandidates[0]?.ballotName ?? "—"}`)),
    "",
  ].join("\n");
}
