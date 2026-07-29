#!/usr/bin/env node
/**
 * Turn Deepgram's anonymous speaker ids into named people — as an ASSERTION,
 * not a guess.
 *
 * The rule this repo already follows (see scripts/transcribe-deepgram.mjs): a
 * name is only attached to a voice when a checkable signal says so, and the
 * signal that fired is recorded next to the label so a reviewer can audit it.
 *
 * Here each person carries a `proof` — a phrase only that person could say
 * about themselves, taken verbatim from the transcript. The script requires
 * every proof to match EXACTLY ONE speaker. If a proof matches zero speakers
 * (transcript changed) or two (voices merged), the run FAILS rather than
 * publishing a wrong attribution.
 *
 * It also carries forward Deepgram's own doubt. `speaker_confidence` is per
 * word; any turn containing a run of low-confidence words is marked
 * `needsReview` so a human listens before that line is quoted anywhere.
 *
 * Usage:
 *   node scripts/label-debate-speakers.mjs --slug wi-gov-dem-primary-debate
 *   node scripts/label-debate-speakers.mjs --slug ... --check   # assertions only
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(process.cwd(), "transcripts-dg");
const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const slug = arg("slug", "wi-gov-dem-primary-debate");
const checkOnly = process.argv.includes("--check");

/**
 * A word is "doubted" below this. Deepgram's speaker_confidence is the model's
 * own probability that the word came from the speaker it assigned. 0.5 is the
 * coin-flip line — below it the label carries no information.
 */
const CONF_FLOOR = 0.5;
/** A turn needs human review if this share of its words are doubted. */
const REVIEW_SHARE = 0.25;

/**
 * Each `proof` is a self-identifying phrase lifted verbatim from the debate.
 * Chosen so that only the named person could be its subject in the first
 * person — a rival could mention David Crowley, but only Crowley says "I'm the
 * county executive of the largest community".
 */
const PEOPLE = [
  {
    name: "Mandela Barnes",
    slug: "mandela-barnes",
    role: "candidate",
    title: "Former Lieutenant Governor",
    proof: "they spent over $50,000,000 to defeat me",
  },
  {
    name: "Joel Brennan",
    slug: "joel-brennan",
    role: "candidate",
    title: "Former Secretary of Administration",
    proof: "I put together as a secretary of administration two budgets for governor Evers",
  },
  {
    name: "David Crowley",
    slug: "david-crowley",
    role: "candidate",
    title: "Milwaukee County Executive",
    proof: "I'm the county executive of the largest community",
  },
  {
    name: "Francesca Hong",
    slug: "francesca-hong",
    role: "candidate",
    title: "State Representative",
    proof: "I introduced the Healthy School Meals for All legislation",
  },
  {
    name: "Kelda Roys",
    slug: "kelda-roys",
    role: "candidate",
    title: "State Senator",
    proof: "I'm a mom and stepmom of five",
  },
];

/**
 * The moderators cannot be proved the same way — they never say their own
 * names. Two independent facts pin them:
 *   1. The intro names exactly two moderators, in order: "WISN twelve political
 *      director Matt Smith and up front cohost twelve news anchor [Gerron]
 *      Jordan" — the ASR renders the first name "Jaren"; see ASR_CORRECTIONS.
 *   2. Francesca Hong closes her voucher answer by addressing the moderator who
 *      pressed her — "bringing a responsible end to the voucher program is,
 *      Matt" — and that question came from this speaker.
 * So the speaker Hong calls "Matt" is Matt Smith; the other non-announcer
 * moderator is Gerron Jordan. Both are asserted below.
 */
const MODERATOR_ADDRESSED_AS_MATT =
  "bringing a responsible end to the voucher program is, Matt";

/**
 * Proper nouns the ASR heard wrong, corrected against an authority.
 *
 * Speech recognition mangles surnames it has no prior for, and a debate is
 * almost entirely surnames. Every entry here is corrected against a source
 * outside the tape — the moderator's name confirmed by Tarik, the candidate
 * names from the WEC-derived candidate list in Convex — never against a guess
 * about what "sounds right".
 *
 * The fix belongs in the keyterm list in transcribe-debate.mjs, which is where
 * it now lives for any future run. This map repairs the transcript already in
 * hand without paying to re-transcribe, and is applied to display text only —
 * the raw file keeps what Deepgram actually returned.
 */
const ASR_CORRECTIONS = [
  [/\bJaren Jordan\b/g, "Gerron Jordan"],
  [/\bJaren\b/g, "Gerron"],
  [/\bMiss Huang\b/g, "Miss Hong"],
  [/\bMiss Royse\b/g, "Miss Roys"],
  [/\bMiss Roy,/g, "Miss Roys,"],
  [/\bMister Brett\b/g, "Mister Brennan"],
  [/\bMiss calling, you are calling\b/g, "Miss Hong, you are calling"],
];
const correct = (s) => ASR_CORRECTIONS.reduce((t, [re, to]) => t.replace(re, to), s);

const raw = JSON.parse(readFileSync(join(DIR, `${slug}.raw.json`), "utf8"));
const results = raw.results;
const utterances = results.utterances ?? [];
const words = results.channels[0].alternatives[0].words ?? [];

if (!utterances.length) {
  console.error("No utterances in the raw file — rerun scripts/transcribe-debate.mjs");
  process.exit(1);
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Everything each speaker says, joined. Utterances are ~10s long, so a proof
 * phrase routinely straddles two of them — searching per utterance silently
 * misses real matches, which the assertion below would then report as "0
 * speakers" and halt. Search the speaker's whole text instead.
 */
const textBySpeaker = new Map();
for (const u of utterances) {
  textBySpeaker.set(u.speaker, (textBySpeaker.get(u.speaker) ?? "") + " " + u.transcript);
}

/** Speakers that own a given phrase, by whole-transcript match. */
function speakersSaying(phrase) {
  const needle = norm(phrase);
  return [...textBySpeaker].filter(([, t]) => norm(t).includes(needle)).map(([s]) => s);
}

// ── ASSERTIONS ──────────────────────────────────────────────────────────────
const failures = [];
const speakerOf = new Map(); // speakerId -> person

for (const p of PEOPLE) {
  const owners = speakersSaying(p.proof);
  if (owners.length !== 1) {
    failures.push(
      `${p.name}: proof matched ${owners.length} speakers (${owners.join(", ") || "none"}) — expected exactly 1\n    proof: "${p.proof}"`,
    );
    continue;
  }
  const [id] = owners;
  if (speakerOf.has(id)) {
    failures.push(`speaker ${id} claimed by both ${speakerOf.get(id).name} and ${p.name}`);
    continue;
  }
  speakerOf.set(id, { ...p, speaker: id, evidence: p.proof });
}

// Moderators.
const matt = speakersSaying(MODERATOR_ADDRESSED_AS_MATT);
if (matt.length !== 1) {
  failures.push(`Matt Smith: address-proof matched ${matt.length} speakers — expected exactly 1`);
} else {
  speakerOf.set(matt[0], {
    name: "Matt Smith",
    slug: "matt-smith",
    role: "moderator",
    title: "WISN 12 political director",
    speaker: matt[0],
    evidence: `addressed as "Matt" by a candidate answering this speaker's question`,
  });
}

// The announcer is the voice in the taped cold open and never returns after the
// live show starts. Identify positionally rather than by name.
const LIVE_START = "And now, live from the campus of Marquette University";
const announcer = speakersSaying(LIVE_START);
if (announcer.length === 1 && !speakerOf.has(announcer[0])) {
  speakerOf.set(announcer[0], {
    name: "Announcer",
    slug: "announcer",
    role: "announcer",
    title: "Broadcast narration",
    speaker: announcer[0],
    evidence: "reads the taped open and the moderator introductions",
  });
}

// Whoever is left, having spoken materially, is the second named moderator.
const spoke = new Set(utterances.map((u) => u.speaker));
const unclaimed = [...spoke].filter((s) => !speakerOf.has(s));
if (unclaimed.length === 1) {
  speakerOf.set(unclaimed[0], {
    name: "Gerron Jordan",
    slug: "gerron-jordan",
    role: "moderator",
    title: "12 News anchor, UpFront co-host",
    speaker: unclaimed[0],
    evidence:
      "sole remaining speaker; the open names exactly two moderators and the other is proved to be Matt Smith",
  });
} else if (unclaimed.length > 1) {
  failures.push(
    `${unclaimed.length} speakers unidentified (${unclaimed.join(", ")}) — cannot infer the second moderator by elimination`,
  );
}

if (failures.length) {
  console.error("SPEAKER IDENTIFICATION FAILED — refusing to write labels:\n");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`✓ ${speakerOf.size} speakers identified, each by an independent signal`);
for (const [id, p] of [...speakerOf].sort((a, b) => a[0] - b[0])) {
  console.log(`   spk${id} → ${p.name.padEnd(16)} (${p.role}) — ${p.evidence.slice(0, 70)}`);
}
if (checkOnly) process.exit(0);

// ── LABELLED TURNS + CARRIED-FORWARD DOUBT ──────────────────────────────────
/**
 * Turns are built from `paragraphs`, NOT `utterances`.
 *
 * Deepgram returns both. The utterances array bleeds across speaker changes —
 * a moderator's question routinely lands inside the previous candidate's block
 * together with the opening of the next candidate's answer, which is exactly
 * how a quote ends up attributed to the wrong person. Measured on this file:
 * 15 of 342 utterances contain both a moderator vocative ("Mr Barnes, …") and
 * first-person answer speech, versus 0 of 230 paragraphs.
 *
 * So paragraphs are the honest unit here, and no bespoke re-segmentation
 * heuristic is needed. scripts/check-turn-purity.mjs re-measures this on every
 * new transcript rather than trusting that it stays true.
 */
const paragraphs = results.channels[0].alternatives[0].paragraphs?.paragraphs ?? [];
if (!paragraphs.length) {
  console.error("No paragraphs in the raw file — rerun transcribe-debate.mjs with paragraphs=true");
  process.exit(1);
}

/** Words that fall inside [start,end], used to score a turn's diarization. */
function wordsIn(start, end) {
  return words.filter((w) => w.start >= start - 1e-6 && w.end <= end + 1e-6);
}

const turns = paragraphs.map((p) => {
  const ws = wordsIn(p.start, p.end);
  const conf = ws.map((w) => w.speaker_confidence ?? 1);
  const doubted = conf.filter((c) => c < CONF_FLOOR).length;
  const share = conf.length ? doubted / conf.length : 0;
  const person = speakerOf.get(p.speaker);
  return {
    start: p.start,
    end: p.end,
    speaker: p.speaker,
    name: person.name,
    personSlug: person.slug,
    role: person.role,
    text: correct(p.sentences.map((s) => s.text).join(" ").trim()),
    // Sentence timings are what the per-quote audio clips are cut from, so they
    // travel with the turn rather than being recomputed later.
    sentences: p.sentences.map((s) => ({
      text: correct(s.text),
      start: s.start,
      end: s.end,
      sentiment: s.sentiment ?? null,
      sentimentScore: s.sentiment_score ?? null,
    })),
    wordCount: p.num_words,
    speakerConfidence: conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : null,
    doubtedWordShare: Number(share.toFixed(3)),
    // A turn a human must hear before any of it is quoted.
    needsReview: share >= REVIEW_SHARE,
    sentiment: p.sentiment ?? null,
    sentimentScore: p.sentiment_score ?? null,
  };
});

const out = {
  slug,
  raceId: "WI-GOV-2026",
  engine: "deepgram/nova-3+diarize+paragraphs+sentiment",
  segmentation: "paragraphs (utterances rejected — 15/342 mixed two speakers)",
  durationSec: raw.metadata?.duration ?? 0,
  identification: {
    method: "verbatim self-identifying phrase, asserted unique per speaker",
    confidenceFloor: CONF_FLOOR,
    reviewShare: REVIEW_SHARE,
    speakers: [...speakerOf.values()].sort((a, b) => a.speaker - b.speaker),
  },
  turns,
};
writeFileSync(join(DIR, `${slug}.labeled.json`), JSON.stringify(out, null, 2) + "\n");

const flagged = turns.filter((t) => t.needsReview);
const byPerson = new Map();
for (const t of turns) {
  const e = byPerson.get(t.name) ?? { sec: 0, turns: 0, flagged: 0, conf: [] };
  e.sec += t.end - t.start;
  e.turns += 1;
  e.flagged += t.needsReview ? 1 : 0;
  e.conf.push(t.speakerConfidence ?? 1);
  byPerson.set(t.name, e);
}
console.log(`\n→ transcripts-dg/${slug}.labeled.json`);
console.log(`\n${"person".padEnd(18)} ${"talk".padStart(7)} ${"turns".padStart(6)} ${"diar.conf".padStart(10)} ${"review".padStart(7)}`);
for (const [name, e] of [...byPerson].sort((a, b) => b[1].sec - a[1].sec)) {
  const mean = e.conf.reduce((a, b) => a + b, 0) / e.conf.length;
  console.log(
    `${name.padEnd(18)} ${(e.sec / 60).toFixed(1).padStart(5)}m ${String(e.turns).padStart(7)} ${mean.toFixed(3).padStart(10)} ${String(e.flagged).padStart(7)}`,
  );
}
console.log(`\n${flagged.length}/${turns.length} turns flagged for human review before quoting.`);
