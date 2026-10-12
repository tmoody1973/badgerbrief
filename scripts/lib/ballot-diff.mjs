/**
 * Compare the state's November candidates with the candidates we store.
 *
 * The matching rule is deliberately strict. Within one race, a state candidate
 * and a stored candidate are the same person only when exactly one of each
 * shares a surname AND their first names agree. Anything else is "unresolved"
 * and goes to a person. In July, inserting on a near-miss name created
 * duplicate people on a live page.
 *
 * Nothing is dropped in silence: a race, contest or candidate this code cannot
 * place ends up in `unresolved`, which blocks the apply step.
 */
import { slugify, surnameOf } from "./wec-legislative.mjs";

const GOVERNOR = "WI-GOV-2026";
const LT_GOVERNOR = "WI-LTGOV-2026";

/** Stored races we expect to be absent from the state's November list, and why. */
export const NO_CONTEST_NOTES = {
  [LT_GOVERNOR]:
    "Not a separate November contest. Each party's nominee is the running mate on a governor ticket.",
  "WI-SCOTUS-2026": "Decided in the April 7, 2026 spring election.",
  "WI-STATE-SENATE-2026": "Replaced by one race per district.",
  "WI-STATE-ASSEMBLY-2026": "Replaced by one race per district.",
};

/** Surname with accents removed, so "Peña" and "Pena" compare equal. */
const surnameKey = (name) =>
  surnameOf(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");

/** First given name, lowercased and unaccented: "José A. Peña" -> "jose". */
const firstNameKey = (name) => slugify(name).split("-")[0] ?? "";

/** "Dan" and "Daniel" agree; "John" and "Jane" do not. A short form needs 3+ letters. */
const firstNamesAgree = (a, b) => {
  const [x, y] = [firstNameKey(a), firstNameKey(b)];
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && long.startsWith(short);
};

const groupBy = (list, keyOf) => {
  const groups = new Map();
  for (const item of list) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return groups;
};

const brief = (c) => ({ slug: c.slug, name: c.name });

/** One state candidate and one stored candidate share a surname in this race. */
function matchStored({ raceId, stateCandidate, stored }) {
  if (!firstNamesAgree(stored.name, stateCandidate.matchName)) {
    return {
      unresolved: {
        raceId,
        surname: surnameKey(stateCandidate.matchName),
        reason: "the surname matches but the first names differ",
        state: [stateCandidate.ballotName],
        db: [brief(stored)],
      },
    };
  }
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

/** A state candidate with no surname match among this race's stored candidates. */
function placeNewcomer({ raceId, newcomer, leaving, allStored }) {
  const sameFirstName = leaving.filter((c) => firstNamesAgree(c.name, newcomer.matchName));
  if (sameFirstName.length > 0) {
    return {
      held: sameFirstName,
      unresolved: {
        raceId,
        surname: surnameKey(newcomer.matchName),
        reason:
          "a newcomer shares a first name with a stored candidate leaving the ballot; this may be the same person under a new surname",
        state: [newcomer.ballotName],
        db: sameFirstName.map(brief),
      },
    };
  }
  const slug = slugify(newcomer.matchName);
  const taken = allStored.find((c) => c.slug === slug);
  if (taken) {
    return {
      held: [],
      unresolved: {
        raceId,
        surname: surnameKey(newcomer.matchName),
        reason: "a new candidate would take an address that already belongs to someone else",
        state: [newcomer.ballotName],
        db: [brief(taken)],
      },
    };
  }
  return {
    held: [],
    newCandidate: {
      slug,
      name: newcomer.matchName,
      ballotName: newcomer.ballotName,
      party: newcomer.party,
      ballotOrder: newcomer.ballotOrder,
    },
  };
}

export function diffRace({ raceId, dbCandidates, stateCandidates }) {
  const storedBySurname = groupBy(dbCandidates, (c) => surnameKey(c.name));
  const stateBySurname = groupBy(stateCandidates, (c) => surnameKey(c.matchName));
  const advancing = [];
  const newcomers = [];
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
    if (stored.length === 0) {
      newcomers.push(fromState[0]);
      continue;
    }
    const result = matchStored({ raceId, stateCandidate: fromState[0], stored: stored[0] });
    if (result.advancing) advancing.push(result.advancing);
    else unresolved.push(result.unresolved);
  }

  const leaving = dbCandidates.filter((c) => !accountedFor.has(c.slug));
  const newCandidates = [];
  const held = new Set();
  for (const newcomer of newcomers) {
    const placed = placeNewcomer({ raceId, newcomer, leaving, allStored: dbCandidates });
    placed.held.forEach((c) => held.add(c.slug));
    if (placed.newCandidate) newCandidates.push(placed.newCandidate);
    else unresolved.push(placed.unresolved);
  }

  const byOrder = (a, b) => a.ballotOrder - b.ballotOrder;
  return {
    raceId,
    advancing: [...advancing].sort(byOrder),
    newCandidates: [...newCandidates].sort(byOrder),
    notOnBallot: leaving
      .filter((c) => !held.has(c.slug))
      .map((c) => ({ slug: c.slug, name: c.name, status: c.status ?? null })),
    unresolved,
    uncontested: stateCandidates.length === 1,
  };
}

/**
 * Candidate pages are looked up by address alone, so an address must be unique
 * across ALL races. Hold back any newcomer whose address is stored in another
 * race or claimed by a second newcomer.
 */
function holdCrossRaceCollisions(races, dbCandidates) {
  const storedBySlug = groupBy(dbCandidates, (c) => c.slug);
  const claims = groupBy(
    races.flatMap((r) => r.newCandidates.map((n) => ({ slug: n.slug, raceId: r.raceId }))),
    (claim) => claim.slug,
  );
  return races.map((race) => {
    const elsewhere = (n) => (storedBySlug.get(n.slug) ?? []).filter((c) => c.raceId !== race.raceId);
    const clashes = race.newCandidates.filter((n) => elsewhere(n).length > 0 || claims.get(n.slug).length > 1);
    if (clashes.length === 0) return race;
    return {
      ...race,
      newCandidates: race.newCandidates.filter((n) => !clashes.includes(n)),
      unresolved: [
        ...race.unresolved,
        ...clashes.map((n) => ({
          raceId: race.raceId,
          surname: surnameKey(n.name),
          reason: "a new candidate would take an address already used in another race",
          state: [n.ballotName],
          db: elsewhere(n).map(brief),
        })),
      ],
    };
  });
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

/**
 * @param unrecognized state contest names the reader could not map to a race
 */
export function diffAll({ dbRaces, dbCandidates, contests, unrecognized = [] }) {
  const storedByRace = groupBy(dbCandidates, (c) => c.raceId);
  const storedRaceIds = new Set(dbRaces.map((r) => r.raceId));
  const inRace = (raceId) => storedByRace.get(raceId) ?? [];

  const perRace = dbRaces
    .filter((r) => contests.has(r.raceId))
    .map((r) => diffRace({ raceId: r.raceId, dbCandidates: inRace(r.raceId), stateCandidates: contests.get(r.raceId) }));
  const races = holdCrossRaceCollisions(perRace, dbCandidates);

  const racesWithoutContest = dbRaces
    .filter((r) => !contests.has(r.raceId))
    .map((r) => ({
      raceId: r.raceId,
      expected: r.raceId in NO_CONTEST_NOTES,
      note: NO_CONTEST_NOTES[r.raceId] ?? "",
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
    unrecognizedContests: [...unrecognized],
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
  // A stored race missing from the state's list for no reason we know. Marking
  // it off the ballot here would hide a reworded or relabelled contest.
  ...diff.racesWithoutContest
    .filter((r) => !r.expected)
    .map((r) => ({
      raceId: r.raceId,
      surname: "",
      reason: "a stored race has no contest on the state's list, and we know no reason why",
      state: [],
      db: r.candidates,
    })),
  ...diff.unrecognizedContests.map((contest) => ({
    raceId: "",
    surname: "",
    reason: `the state lists a contest whose name we do not recognize: ${contest}`,
    state: [],
    db: [],
  })),
];

/** Stored candidates in races with no November contest who are not running mates. */
const offInOtherRaces = (diff) => {
  const mates = new Set(diff.runningMates.linked.map((m) => `${m.raceId}/${m.slug}`));
  return diff.racesWithoutContest.flatMap((r) =>
    r.candidates.filter((c) => !mates.has(`${r.raceId}/${c.slug}`)).map((c) => ({ ...c, raceId: r.raceId })),
  );
};

/**
 * The file a person signs. Every stored candidate appears exactly once with
 * `onBallot` true or false, so nothing is left to inference when it is applied.
 * `database` records which database the comparison was made against.
 */
export function toCertification({ diff, source, dataAsOf, database }) {
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

  return present({
    source,
    dataAsOf,
    database,
    certifiedBy: "",
    certifiedAt: "",
    unresolved: allUnresolved(diff),
    races: [
      ...diff.races.map((r) => ({ raceId: r.raceId, onBallot: true })),
      ...diff.racesWithoutContest.map((r) => present({ raceId: r.raceId, onBallot: false, note: r.note || null })),
    ],
    candidates: [...fromContests, ...fromOtherRaces],
    newCandidates: diff.races.flatMap((r) =>
      r.newCandidates.map((c) => present({ raceId: r.raceId, slug: c.slug, name: c.name, party: c.party, ballotOrder: c.ballotOrder })),
    ),
  });
}

/** Refuse to apply anything a person has not signed, or that still has open questions. */
export function assertCertified(file) {
  if (!file.certifiedBy?.trim()) throw new Error('not certified: "certifiedBy" is empty');
  if (!file.certifiedAt?.trim()) throw new Error('not certified: "certifiedAt" is empty');
  if ((file.unresolved ?? []).length > 0) {
    throw new Error(`not applicable: ${file.unresolved.length} unresolved item(s) remain`);
  }
}

/** Refuse to apply a file to a database other than the one it was compared against. */
export function assertTarget(file, target) {
  if (!file.database) throw new Error("the file does not say which database it was compared against");
  if (file.database !== target) {
    throw new Error(`the file was compared against "${file.database}" and cannot be applied to "${target}"`);
  }
}

const bullets = (lines) => (lines.length > 0 ? lines.map((l) => `- ${l}`).join("\n") : "- None");

/** A plain-language report for the person who certifies. */
export function toMarkdown({ diff, source }) {
  const advancing = diff.races.flatMap((r) => r.advancing.map((a) => ({ ...a, raceId: r.raceId })));
  const gone = diff.races.flatMap((r) => r.notOnBallot.map((c) => ({ ...c, raceId: r.raceId })));
  const goneElsewhere = offInOtherRaces(diff);
  const fresh = diff.races.flatMap((r) => r.newCandidates.map((c) => ({ ...c, raceId: r.raceId })));
  const unresolved = allUnresolved(diff);
  const renamed = advancing.filter((a) => a.nameDiffers);
  const reparty = advancing.filter((a) => a.partyDiffers);
  const single = diff.races.filter((r) => r.uncontested);
  const offIn = (raceId) => goneElsewhere.filter((c) => c.raceId === raceId).map((c) => c.name);

  return [
    "# November 3, 2026 ballot: difference report",
    "",
    `Source: ${source.url} (file dated ${source.documentDate}, retrieved ${source.retrievedAt}).`,
    "",
    "## Totals",
    "",
    `- On the November ballot: ${advancing.length} (plus ${diff.runningMates.linked.length} running mates, listed below)`,
    `- Stored, not on the November ballot: ${gone.length + goneElsewhere.length}`,
    `- New to us: ${fresh.length}`,
    `- Unresolved: ${unresolved.length}`,
    `- Races with one candidate: ${single.length}`,
    "",
    "## Unresolved — nothing is written until these are settled",
    "",
    bullets(unresolved.map((u) => `${u.raceId || "(no race)"}: ${u.reason}. State: ${u.state.join("; ") || "—"}. Stored: ${u.db.map((c) => c.name).join("; ") || "—"}.`)),
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
    bullets(
      diff.racesWithoutContest.map((r) => {
        const off = offIn(r.raceId);
        const why = r.expected ? r.note : "NO KNOWN REASON — see Unresolved.";
        return `${r.raceId}: ${why}${off.length > 0 ? ` Marked off the ballot: ${off.join(", ")}.` : ""}`;
      }),
    ),
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
