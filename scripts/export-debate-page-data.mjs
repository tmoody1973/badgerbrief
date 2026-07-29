#!/usr/bin/env node
/**
 * Collapse the pipeline's working files into the single payload the page
 * imports. Everything under transcripts-dg/ is gitignored working state; this
 * writes the one committed artifact the site actually renders.
 *
 * Usage: node scripts/export-debate-page-data.mjs --slug wi-gov-dem-primary-debate
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(process.cwd(), "transcripts-dg");
const OUT = resolve(process.cwd(), "src", "data", "debates");
const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const slug = arg("slug", "wi-gov-dem-primary-debate");

const read = (suffix) => JSON.parse(readFileSync(join(DIR, `${slug}.${suffix}.json`), "utf8"));
const labeled = read("labeled");
const structured = read("structured");
const { quotes } = read("quotes");
const verification = existsSync(join(DIR, `${slug}.verification.json`))
  ? read("verification")
  : null;

/**
 * Candidate display names and the office each held when they spoke. Titles are
 * taken from the moderators' own introductions in the transcript, not from an
 * external bio, so the page and the tape agree.
 */
const CANDIDATES = [
  { slug: "mandela-barnes", name: "Mandela Barnes", title: "Former Lieutenant Governor", short: "Barnes" },
  { slug: "joel-brennan", name: "Joel Brennan", title: "Former Evers cabinet secretary", short: "Brennan" },
  { slug: "david-crowley", name: "David Crowley", title: "Milwaukee County Executive", short: "Crowley" },
  { slug: "francesca-hong", name: "Francesca Hong", title: "State Representative", short: "Hong" },
  { slug: "kelda-roys", name: "Kelda Roys", title: "State Senator", short: "Roys" },
];

// Only what the page renders. The 636 detected entities, per-word timings and
// raw model topics stay in the working files — shipping them would bloat the
// payload with data no reader sees.
const transcript = labeled.turns
  .filter((t) => t.role !== "announcer" || t.start < 90)
  .map((t) => ({
    start: Number(t.start.toFixed(2)),
    name: t.name,
    personSlug: t.personSlug,
    role: t.role,
    text: t.text,
  }));

const byClip = new Map((verification?.results ?? []).map((r) => [r.clip, r]));

const payload = {
  slug,
  title: structured.title,
  // "last night" relative to the 2026-07-29 working session.
  date: "2026-07-28",
  venue: structured.venue,
  broadcaster: structured.broadcaster,
  moderators: structured.moderators,
  raceId: structured.raceId,
  primaryDate: structured.primaryDate,
  generalDate: structured.generalDate,
  durationSec: structured.durationSec,
  // Filled in once the broadcaster's own posting is confirmed; the page hides
  // the embed until then rather than shipping a dead frame.
  youtubeId: null,
  sourceUrl: null,
  candidates: CANDIDATES,
  topics: structured.topics.map((t) => ({
    id: t.id,
    label: t.label,
    blurb: t.blurb,
    start: Number(t.start.toFixed(2)),
    end: Number(t.end.toFixed(2)),
    openedBy: t.openedBy,
    anchor: t.anchor,
  })),
  handVotes: structured.handVotes.map((v) => ({
    id: v.id,
    topicId: v.topicId,
    question: v.question,
    spoken: v.spoken,
    yes: v.yes,
    no: v.no,
  })),
  quotes: quotes.map((q) => ({
    topicId: q.topicId,
    personSlug: q.personSlug,
    quote: q.quote,
    fullAnswer: q.fullAnswer,
    question: q.question,
    askedBy: q.askedBy,
    startSec: q.startSec,
    endSec: q.endSec,
    clip: q.clip,
    sentiment: q.sentiment,
    sentimentScore: q.sentimentScore,
    // Both halves of the attribution story travel to the page: the first pass's
    // doubt, and whether the isolated-clip re-check cleared it.
    diarizationConfidence: q.speakerConfidence,
    flaggedInFirstPass: q.needsReview,
    clipVerified: byClip.get(q.clip)?.ok ?? null,
    voicesInClip: byClip.get(q.clip)?.voicesInClip ?? null,
  })),
  tone: structured.tone,
  method: {
    engine: labeled.engine,
    segmentation: labeled.segmentation,
    identification: labeled.identification.method,
    speakers: labeled.identification.speakers.map((s) => ({
      name: s.name,
      role: s.role,
      evidence: s.evidence,
    })),
    clipsVerified: verification
      ? { checked: verification.checked, passed: verification.passed, how: verification.method }
      : null,
  },
};

mkdirSync(OUT, { recursive: true });
const file = join(OUT, `${slug}.json`);
writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");

const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0);
console.log(`✓ src/data/debates/${slug}.json  (${kb} KB)`);
console.log(`  ${payload.topics.length} topics · ${payload.quotes.length} quotes · ${payload.handVotes.length} hand votes · ${transcript.length} transcript turns`);
console.log(`  clips verified: ${payload.method.clipsVerified?.passed}/${payload.method.clipsVerified?.checked}`);

// The transcript is large and only ever rendered as HTML on the server, so it
// lives in its own file rather than inflating the payload every importer pays for.
writeFileSync(join(OUT, `${slug}.transcript.json`), JSON.stringify({ slug, transcript }, null, 2) + "\n");
console.log(`✓ src/data/debates/${slug}.transcript.json  (${transcript.length} turns)`);
