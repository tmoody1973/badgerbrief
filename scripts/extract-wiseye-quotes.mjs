#!/usr/bin/env node
/**
 * Extract quotable answers from a diarized WisconsinEye interview and push them
 * into the existing quote review pipeline as DRAFTS.
 *
 * Two independent guards, because the failure mode here is publishing words a
 * candidate never said:
 *
 *  1. Diarization already removed the interviewer. The model only ever sees
 *     `role === "candidate"` turns, so J.R. Ross's questions are not merely
 *     labelled — they are absent, and cannot be attributed to the candidate.
 *  2. VERBATIM GATE (below). Every quote the model returns must appear, word
 *     for word after normalisation, inside the specific turn it claims to come
 *     from. A paraphrase is dropped, not corrected. This is a deterministic
 *     string check, not a judgement — the model cannot talk its way past it.
 *
 * `context` is the interviewer's preceding question, which diarization gives us
 * for free and which is the honest framing for any answer: a reader sees what
 * the candidate was actually asked.
 *
 * Nothing here publishes. Drafts land in /admin for review, and
 * publish.publishQuote still gates on human approval.
 *
 * Usage:
 *   node scripts/extract-wiseye-quotes.mjs --only david-crowley        # dry run
 *   node scripts/extract-wiseye-quotes.mjs --only david-crowley --push
 *   node scripts/extract-wiseye-quotes.mjs --push --prod
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(process.cwd(), "transcripts-dg");
const MODEL = "claude-opus-4-8"; // matches research.ts, the other quote extractor
const MAX_QUOTES = 8;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const only = arg("only", null);
const push = has("push");
const prod = has("prod");

if (!existsSync(DIR)) {
  console.error(`No transcripts-dg/ — run scripts/transcribe-deepgram.mjs first.`);
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const KEY = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.error("ANTHROPIC_API_KEY not found in the environment or .env.local");
  process.exit(1);
}

/** Normalise for comparison only — never for storage. Collapses whitespace,
 *  unifies the quote marks and dashes ASR and LLMs render differently, and
 *  drops terminal punctuation so a trimmed sentence still matches. */
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9'" -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function buildPrompt(doc, candidateTurns) {
  const numbered = candidateTurns
    .map((t, i) => `[${i}] (${Math.floor(t.start / 60)}:${String(Math.floor(t.start % 60)).padStart(2, "0")}) ${t.text}`)
    .join("\n\n");

  return [
    `You select quotable passages from a candidate interview for a NON-PARTISAN Wisconsin voter guide.`,
    `Candidate: ${doc.candidateSlug}. Program: ${doc.title} (${doc.outlet}, ${doc.date}).`,
    ``,
    `Below are ONLY the candidate's own speaking turns, already separated from the interviewer by speaker diarization. Each is numbered.`,
    ``,
    `Rules:`,
    `- Return at most ${MAX_QUOTES} quotes. Fewer is fine. Quality over coverage.`,
    `- \`text\` MUST be copied character-for-character from a single numbered turn. Do not join two turns. Do not clean up grammar, remove filler, or fix disfluencies. Do not paraphrase. A quote that is not an exact substring of its turn will be discarded automatically.`,
    `- You MAY start and end mid-turn to select the substantive sentence(s), but what you return must be one contiguous run of text from that turn.`,
    `- \`turnIndex\` is the number of the turn the text came from.`,
    `- Prefer passages where the candidate states a position, commits to an action, or gives a concrete number or plan. Skip pleasantries, biography, and throat-clearing.`,
    `- \`topic\` is 2-5 plain words describing the subject (e.g. "child care costs").`,
    `- Choose quotes spread across different subjects rather than several on one.`,
    ``,
    `Return JSON: {"quotes":[{"turnIndex":0,"text":"...","topic":"..."}]}`,
    ``,
    `CANDIDATE TURNS:`,
    numbered,
  ].join("\n");
}

async function extract(doc, candidateTurns) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: buildPrompt(doc, candidateTurns) }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic http ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const raw = (body.content ?? []).map((c) => c.text ?? "").join("");
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON object in model response");
  return JSON.parse(match[0]).quotes ?? [];
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => !only || f === `${only}.json`);
if (!files.length) {
  console.error(`No transcript matches --only ${only}`);
  process.exit(1);
}

const accepted = [];
let totalReturned = 0;
let totalRejected = 0;

for (const file of files) {
  const doc = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  const turns = doc.turns;
  const candidateTurns = turns.filter((t) => t.role === "candidate" && t.text.split(/\s+/).length >= 12);

  process.stdout.write(`\n=== ${doc.candidateSlug} — ${candidateTurns.length} candidate turns ===\n`);
  let quotes;
  try {
    quotes = await extract(doc, candidateTurns);
  } catch (err) {
    console.error(`  extraction failed: ${err.message}`);
    continue;
  }
  totalReturned += quotes.length;

  for (const q of quotes) {
    const turn = candidateTurns[q.turnIndex];
    if (!turn) {
      console.warn(`  REJECT (bad turnIndex ${q.turnIndex}): ${String(q.text).slice(0, 60)}...`);
      totalRejected++;
      continue;
    }
    // THE GATE. Must be a contiguous substring of the turn it claims.
    if (!norm(turn.text).includes(norm(q.text))) {
      console.warn(`  REJECT (not verbatim): ${String(q.text).slice(0, 70)}...`);
      totalRejected++;
      continue;
    }

    // Context = the interviewer's question immediately before this turn.
    const idx = turns.indexOf(turn);
    const question = [...turns.slice(0, idx)].reverse().find((t) => t.role === "host" && t.text.split(/\s+/).length >= 5);

    accepted.push({
      candidateSlug: doc.candidateSlug,
      raceId: doc.raceId,
      // The interview IS the candidate speaking, so the speaker is the
      // candidate. Resolved from the slug; a reviewer confirms the display name.
      speaker: doc.candidateSlug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
      text: q.text.trim(),
      context: question
        ? `Asked on ${doc.outlet}'s "${doc.title}": ${question.text.trim()}`
        : `From ${doc.outlet}'s "${doc.title}" (${q.topic ?? "interview"}).`,
      outlet: doc.outlet,
      date: doc.date,
      sourceUrl: `${doc.programUrl}?t=${Math.floor(turn.start)}`,
    });
    const m = Math.floor(turn.start / 60);
    const s = String(Math.floor(turn.start % 60)).padStart(2, "0");
    process.stdout.write(`  ✓ ${m}:${s}  [${q.topic ?? "?"}] ${q.text.slice(0, 78)}\n`);
  }
}

console.log(
  `\n${accepted.length} accepted · ${totalRejected} rejected by the verbatim gate ` +
    `(of ${totalReturned} returned)`,
);

if (!push) {
  console.log("\nDry run. Re-run with --push to write drafts (add --prod for production).");
  process.exit(0);
}
if (!accepted.length) {
  console.log("Nothing to push.");
  process.exit(0);
}

const args = ["convex", "run"];
if (prod) args.push("--prod");
args.push(
  "quoteIngest:ingestTranscriptQuotes",
  JSON.stringify({ quotes: accepted }),
  "--identity",
  JSON.stringify({ metadata: { role: "admin" } }),
);
console.log(`\nPushing ${accepted.length} drafts to ${prod ? "PRODUCTION" : "dev"}...`);
console.log(execFileSync("npx", args, { encoding: "utf8" }));
