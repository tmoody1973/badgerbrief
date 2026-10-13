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
 * the entry that says they are still running wins.
 *
 * Only an entry's heading and the "- " lines directly under it are read. The
 * newsroom's race summaries, which can follow an entry, are never looked at.
 * An entry that cannot be read stops the build: skipping it would later show
 * a certified candidate as "not in the guide", which would be false.
 */
export function parseCandidateList(text) {
  const byId = new Map();
  for (const block of text.split(/\n### /).slice(1)) {
    const [heading, ...rest] = block.split("\n");
    const firstOther = rest.findIndex((line) => !line.startsWith("- "));
    const own = (firstOther < 0 ? rest : rest.slice(0, firstOther)).join("\n");
    const head = /^(.+?) \(([^,)]+)(?:,[^)]*)?\)(.*)$/.exec(heading);
    const candidateId = /candidate_id: `([^`]+)`/.exec(own)?.[1];
    const source = /^- Source: (\S+)/m.exec(own)?.[1];
    if (!head || !candidateId || !source) throw new Error(`could not read the entry "${heading.trim()}"`);
    const answered = /answered (\d+) of/.exec(own);
    if (answered === null && !/Did not answer/.test(own)) {
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

const firstName = (name) => name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");

/** "Josh" and "Joshua", "Sam" and "Samuel", "Shirley" and "Shirley M." are one person; "Michael" and "Mary" are not. */
const sameFirstName = (a, b) => {
  const x = firstName(a);
  const y = firstName(b);
  return x !== "" && y !== "" && (x.startsWith(y) || y.startsWith(x));
};

const sameParty = (ours, theirs) => {
  const a = (ours ?? "").toLowerCase();
  const b = (theirs ?? "").toLowerCase();
  return a === b || (a.startsWith("democrat") && b.startsWith("democrat"));
};

/**
 * Match one race. `ours` is the certified ballot for the race; `theirs` is
 * parseCandidateList() for the same race.
 *
 * A match needs exactly one person on their side, not already matched, with
 * the same surname and a first name that agrees. Anything short of that
 * leaves the candidate unlinked and says why: an unlinked candidate is shown
 * as "not in the guide", a wrong link would put one person's words under
 * another's name.
 */
export function matchRace({ raceId, ours, theirs }) {
  if (theirs.length === 0) {
    throw new Error(`${raceId}: their guide returned no candidates. Refusing to mark everyone "not in the guide" from an empty answer.`);
  }
  const links = [];
  const notInGuide = [];
  const notes = [];
  const used = new Set();
  for (const candidate of ours) {
    const person = personOnBallot(raceId, candidate.ballotName);
    const namesakes = theirs.filter((t) => surname(t.name) === surname(person) && !used.has(t.candidateId));
    const found = namesakes.filter((t) => sameFirstName(t.name, person));
    if (found.length !== 1) {
      notInGuide.push({ raceId, slug: candidate.slug, ballotName: candidate.ballotName });
      if (found.length > 1) {
        notes.push(`${raceId}: ${found.length} people in their guide could be ${person}; left unlinked. Check by hand.`);
      } else {
        for (const other of namesakes) {
          notes.push(`${raceId}: their guide lists "${other.name}", who shares a surname with ${person} but not a first name; left unlinked. Check by hand.`);
        }
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
