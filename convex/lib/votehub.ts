/**
 * Published Wisconsin polls from VoteHub's free polling API
 * (https://api.votehub.com, CC BY 4.0), shaped for the `polls` table.
 *
 * Pure: no network, no Convex ctx (same split as polls.ts).
 *
 * The same rules as every other poll on the site (lib/polls.ts): each figure is
 * carried exactly as the pollster published it, nothing is averaged, and a poll
 * reaches a November page only when everyone it names is on the ballot
 * (splitPolls, decision 007). Two rules are specific to this source:
 *
 *  - Only polls taken after the August 11 primary. Earlier polls tested
 *    pairings that never happened and are already in the primary archive,
 *    entered by hand; importing them again would show each one twice.
 *  - A poll paid for by a party-aligned group, or a campaign's own poll, is
 *    kept only while the same race has at least one independent poll, and its
 *    sponsor is named on the card (Tarik, 2026-10-14). Otherwise a race whose
 *    only polls come from one side would show only that side's numbers.
 */
import { hostOf, matchCandidate } from "./polls";

export type VoteHubPoll = {
  id: string;
  poll_type: string;
  sample_size: number | null;
  population: string;
  url: string;
  created_at: string;
  start_date: string;
  end_date: string;
  pollster: string;
  answers: { choice: string; pct: number }[];
  seat_name: string | null;
  sponsors: string[];
  internal: boolean;
  partisan: string | null;
  subject: string;
};

type Candidate = { name: string; slug: string };

/** The day after the August 11, 2026 primary. */
export const SINCE = "2026-08-12";

const CREDIT = { name: "VoteHub (CC BY 4.0)", url: "https://votehub.com/polls/" };

const POPULATION: Record<string, string> = {
  lv: "likely voters",
  rv: "registered voters",
  a: "adults",
  v: "voters",
};

const STATEWIDE: Record<string, string> = {
  governor: "WI-GOV-2026",
  "attorney-general": "WI-AG-2026",
};

/** Our race id for a VoteHub subject, or null when it is not a Wisconsin race we cover. */
export function raceIdFor(p: Pick<VoteHubPoll, "subject" | "poll_type">): string | null {
  if (p.subject === "2026 Wisconsin") return STATEWIDE[p.poll_type] ?? null;
  const district = p.subject.match(/^2026 WI-0?(\d{1,2})$/);
  return district && p.poll_type === "us-representative" ? `WI-US-HOUSE-D${Number(district[1])}-2026` : null;
}

const isPartyPaid = (p: VoteHubPoll) => p.internal || p.partisan !== null;

function sponsorNote(p: VoteHubPoll): string | undefined {
  const who = p.sponsors.join(" and ");
  const side = p.partisan === "DEM" ? "Democratic" : p.partisan === "REP" ? "Republican" : null;
  if (p.internal) return `A campaign's own poll${who ? `, sponsored by ${who}` : ""}, as VoteHub lists it.`;
  if (side && who) return `Sponsored by ${who}, which VoteHub lists as ${side}-aligned.`;
  if (side) return `VoteHub lists this poll as ${side}-sponsored.`;
  return who ? `Sponsored by ${who}.` : undefined;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const rowsOf = (p: VoteHubPoll, candidates: Candidate[]) =>
  [...p.answers]
    .sort((a, b) => b.pct - a.pct)
    .map((a) => ({ label: a.choice, value: `${a.pct}%`, candidateSlug: matchCandidate(a.choice, candidates) }));

/**
 * One storable poll per pollster release. VoteHub lists a release's
 * likely-voter and registered-voter results as separate polls; they become one
 * poll with a group for each, so they never read as two polls agreeing.
 */
function toRow(raceId: string, release: VoteHubPoll[], candidates: Candidate[]) {
  const [first] = release;
  const single = release.length === 1;
  const population = (p: VoteHubPoll) => POPULATION[p.population] ?? p.population;
  return {
    pollKey: `votehub-${slugify(raceId)}-${slugify(first.pollster)}-${first.end_date}`,
    raceId,
    pollster: first.pollster,
    pollType: "General election matchup",
    conductedStart: release.map((p) => p.start_date).sort()[0],
    conductedEnd: first.end_date,
    releasedOn: release.map((p) => p.created_at).sort()[0],
    ...(single && first.sample_size ? { sampleSize: String(first.sample_size) } : {}),
    ...(single ? { sampleType: capitalize(population(first)) } : {}),
    scientific: true,
    groups: release.map((p) => ({
      label: single ? null : `${p.sample_size ?? "?"} ${population(p)}`,
      rows: rowsOf(p, candidates),
    })),
    ...(sponsorNote(first) ? { notes: sponsorNote(first) } : {}),
    sources: [{ name: hostOf(first.url), url: first.url }, CREDIT],
  };
}

export type VoteHubRow = ReturnType<typeof toRow>;

/** Every VoteHub poll that belongs on a Wisconsin race page, ready for storePoll. */
export function selectPolls(polls: readonly VoteHubPoll[], candidatesByRace: Record<string, Candidate[]>): VoteHubRow[] {
  const releases = new Map<string, { raceId: string; polls: VoteHubPoll[] }>();
  for (const p of polls) {
    const raceId = raceIdFor(p);
    if (!raceId || p.end_date < SINCE || p.answers.length === 0 || !p.url) continue;
    const key = `${raceId}|${p.pollster}|${p.end_date}`;
    const release = releases.get(key) ?? { raceId, polls: [] };
    releases.set(key, { raceId, polls: [...release.polls, p] });
  }
  const all = [...releases.values()].map((r) => ({
    ...r,
    // Likely voters first: it is the headline figure pollsters lead with.
    polls: [...r.polls].sort((a, b) => (a.population === "lv" ? -1 : b.population === "lv" ? 1 : 0)),
  }));
  const hasIndependent = new Set(all.filter((r) => !isPartyPaid(r.polls[0])).map((r) => r.raceId));
  return all
    .filter((r) => !isPartyPaid(r.polls[0]) || hasIndependent.has(r.raceId))
    .map((r) => toRow(r.raceId, r.polls, candidatesByRace[r.raceId] ?? []));
}
