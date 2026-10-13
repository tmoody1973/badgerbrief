/**
 * Wisconsin Watch's 2026 voter guide, as served by Voter Guide Commons
 * (https://voterguidecommons.org/mcp), matched to OUR certified ballot.
 *
 * Their list is never a source for who is running. It was last updated in
 * August and differs from the state's list in small ways. Every match starts
 * from a candidate on our certified ballot and looks for that one person in
 * the same race on their side. Anything left over is reported, never guessed.
 */

export const GUIDE_URL = "https://voterguide26.wisconsinwatch.org/";

/** Every race their guide covers: our race id, and how to ask their server for it. */
export function raceJobs() {
  const district = (prefix, office, numbers) =>
    numbers.map((n) => ({ raceId: `${prefix}-D${n}-2026`, office, district: String(n) }));
  const range = (from, to, step = 1) =>
    Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
  return [
    { raceId: "WI-GOV-2026", office: "Governor" },
    { raceId: "WI-LTGOV-2026", office: "Lieutenant Governor" },
    { raceId: "WI-AG-2026", office: "Attorney General" },
    { raceId: "WI-SOS-2026", office: "Secretary of State" },
    { raceId: "WI-TREAS-2026", office: "State Treasurer" },
    ...district("WI-US-HOUSE", "U.S. House of Representatives", range(1, 8)),
    ...district("WI-STATE-SENATE", "Wisconsin State Senate", range(1, 33, 2)),
    ...district("WI-STATE-ASSEMBLY", "Wisconsin State Assembly", range(1, 99)),
  ];
}

/**
 * The candidates in one get_candidates answer who are still running.
 * A candidate can appear under several headings (the race and its primary);
 * the entry that says they are still running wins. Only the heading line and
 * three labelled lines of each block are read: the newsroom's race summary is
 * never touched.
 */
export function parseCandidateList(text) {
  const byId = new Map();
  for (const block of text.split(/\n### /).slice(1)) {
    const head = /^(.+?) \(([^,)]+)(?:,[^)]*)?\)(.*)$/.exec(block.split("\n")[0]);
    const candidateId = /candidate_id: `([^`]+)`/.exec(block)?.[1];
    const source = /^- Source: (\S+)/m.exec(block)?.[1];
    if (!head || !candidateId || !source) continue;
    const answered = /answered (\d+) of/.exec(block);
    if (answered === null && !/Did not answer/.test(block)) {
      throw new Error(`${candidateId}: the guide does not say whether they answered`);
    }
    const entry = {
      candidateId,
      name: head[1].trim(),
      party: head[2].trim(),
      running: !/no longer running/.test(head[3]),
      url: source.split("?")[0],
      answered: answered ? Number(answered[1]) : 0,
    };
    const seen = byId.get(candidateId);
    if (!seen || (!seen.running && entry.running)) byId.set(candidateId, entry);
  }
  return [...byId.values()].filter((c) => c.running);
}

const SUFFIX = /,?\s+(jr\.?|sr\.?|ii|iii|iv)$/i;

/** The person a ballot line names for this race: the governor ticket prints "Governor / Lieutenant Governor". */
export function personOnBallot(raceId, ballotName) {
  const parts = ballotName.split(" / ");
  return (raceId === "WI-LTGOV-2026" ? parts[parts.length - 1] : parts[0]).trim();
}

export const surname = (name) =>
  name
    .replace(SUFFIX, "")
    .trim()
    .split(/\s+/)
    .pop()
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const sameParty = (ours, theirs) => {
  const a = (ours ?? "").toLowerCase();
  const b = (theirs ?? "").toLowerCase();
  return a === b || (a.startsWith("democrat") && b.startsWith("democrat"));
};

/**
 * Match one race. `ours` is the certified ballot for the race; `theirs` is
 * parseCandidateList() for the same race. A match needs exactly one person on
 * their side with the same surname.
 */
export function matchRace({ raceId, ours, theirs }) {
  const links = [];
  const notInGuide = [];
  const notes = [];
  const used = new Set();
  for (const candidate of ours) {
    const person = personOnBallot(raceId, candidate.ballotName);
    const found = theirs.filter((t) => surname(t.name) === surname(person));
    if (found.length !== 1) {
      notInGuide.push({ raceId, slug: candidate.slug, ballotName: candidate.ballotName });
      if (found.length > 1) {
        notes.push(`${raceId}: ${found.length} people in their guide share the surname of ${person}; left unlinked.`);
      }
      continue;
    }
    const [match] = found;
    used.add(match.candidateId);
    if (match.name !== person) {
      notes.push(`${raceId}: the ballot prints "${person}"; their guide prints "${match.name}".`);
    }
    if (!sameParty(candidate.party, match.party)) {
      notes.push(`${raceId}: ${person} is "${candidate.party}" on the ballot and "${match.party}" in their guide.`);
    }
    links.push({ raceId, slug: candidate.slug, candidateId: match.candidateId, url: match.url, answered: match.answered });
  }
  const extra = theirs
    .filter((t) => !used.has(t.candidateId))
    .map((t) => ({ raceId, name: t.name, party: t.party, candidateId: t.candidateId }));
  return { links, notInGuide, extra, notes };
}
