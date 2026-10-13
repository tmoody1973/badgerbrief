#!/usr/bin/env node
/**
 * Build the list that links each certified candidate to their page in
 * Wisconsin Watch's 2026 voter guide.
 *
 *   node scripts/wisconsin-watch-links.mjs
 *
 * Asks Voter Guide Commons for every race (129 paced requests, about two
 * minutes), matches against the certified ballot, and writes the data file and
 * a report. Touches no database.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GUIDE_URL, matchRace, parseCandidateList, raceJobs } from "./lib/wisconsin-watch.mjs";

const SERVER = "https://voterguidecommons.org/mcp";
const CERTIFICATION = "docs/evidence/general-ballot/general-ballot-certification.json";
const OUT = "convex/lib/data/wisconsin-watch-2026.json";
const REPORT_DIR = "docs/evidence/wisconsin-watch";
const PAUSE_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function candidateListFor(job) {
  const res = await fetch(SERVER, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": "badgerbrief-link-build/1.0 (+https://badgerbrief.org)",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "get_candidates",
        arguments: { office: job.office, source: "WI", ...(job.district ? { district: job.district } : {}) },
      },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`${job.raceId}: the server answered ${res.status}`);
  const body = await res.json();
  if (body.error || body.result?.isError) {
    throw new Error(`${job.raceId}: ${JSON.stringify(body.error ?? body.result).slice(0, 200)}`);
  }
  return body.result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

const certification = JSON.parse(readFileSync(CERTIFICATION, "utf8"));
if (!certification.certifiedBy?.trim()) throw new Error("the ballot file is not certified");
const certified = [
  ...certification.candidates.filter((c) => c.onBallot).map((c) => ({ raceId: c.raceId, slug: c.slug, ballotName: c.ballotName, party: c.party })),
  ...certification.newCandidates.map((c) => ({ raceId: c.raceId, slug: c.slug, ballotName: c.name, party: c.party })),
];

const jobs = raceJobs();
const results = [];
const updated = new Set();
for (const job of jobs) {
  const ours = certified.filter((c) => c.raceId === job.raceId);
  if (ours.length === 0) throw new Error(`${job.raceId} is not on the certified ballot`);
  const text = await candidateListFor(job);
  const stamp = /Last updated (\d{4}-\d{2}-\d{2})/.exec(text)?.[1];
  if (stamp) updated.add(stamp);
  results.push(matchRace({ raceId: job.raceId, ours, theirs: parseCandidateList(text) }));
  await sleep(PAUSE_MS);
}
if (updated.size !== 1) throw new Error(`expected one "Last updated" date across the guide, found: ${[...updated].join(", ") || "none"}`);

const links = results.flatMap((r) => r.links);
const notInGuide = results.flatMap((r) => r.notInGuide);
const extra = results.flatMap((r) => r.extra);
const notes = results.flatMap((r) => r.notes);
const file = {
  source: {
    name: "Wisconsin Watch 2026 Voter Guide",
    publisher: "Wisconsin Watch",
    url: GUIDE_URL,
    supportUrl: "https://wisconsinwatch.org/donate/",
    via: "Voter Guide Commons",
    viaUrl: "https://voterguidecommons.org/",
    guideUpdated: [...updated][0],
    retrievedAt: `${new Date().toISOString().slice(0, 19)}Z`,
  },
  races: jobs.map((job) => job.raceId),
  candidates: links,
  notInGuide,
};

const answered = links.filter((l) => l.answered > 0).length;
const report = [
  "# Wisconsin Watch questionnaire: link report",
  "",
  `Built ${file.source.retrievedAt} from ${SERVER}. Their guide says it was last updated ${file.source.guideUpdated}.`,
  "",
  `${jobs.length} races. ${certified.filter((c) => file.races.includes(c.raceId)).length} candidates on the certified ballot: ${links.length} linked to a page (${answered} answered, ${links.length - answered} did not), ${notInGuide.length} with no page.`,
  "",
  "## On the certified ballot, with no page in their guide",
  "",
  ...(notInGuide.length > 0 ? notInGuide.map((c) => `- ${c.ballotName} (${c.raceId})`) : ["- None."]),
  "",
  "## In their guide as still running, not on the certified ballot (never shown)",
  "",
  ...(extra.length > 0 ? extra.map((c) => `- ${c.name}, ${c.party} (${c.raceId})`) : ["- None."]),
  "",
  "## Differences in how a name or party is printed (the ballot's version is shown)",
  "",
  ...(notes.length > 0 ? notes.map((note) => `- ${note}`) : ["- None."]),
  "",
].join("\n");

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync("convex/lib/data", { recursive: true });
writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);
writeFileSync(join(REPORT_DIR, "links-report.md"), report);
console.log(`races: ${jobs.length} | linked: ${links.length} | answered: ${answered} | did not answer: ${links.length - answered} | no page: ${notInGuide.length} | not on our ballot: ${extra.length}`);
console.log(`wrote ${OUT} and ${join(REPORT_DIR, "links-report.md")}`);
