#!/usr/bin/env node
/**
 * Second transcription pass over the WisconsinEye interviews using Deepgram
 * nova-3 WITH SPEAKER DIARIZATION.
 *
 * Why this exists alongside scripts/transcribe-wiseye.mjs (whisper.cpp):
 *
 *   Whisper gives no speaker separation at all — a single segment runs straight
 *   from the interviewer's question into the candidate's answer. Attributing a
 *   pull-quote to the candidate from that text is an LLM *inference* over
 *   ambiguous input, and getting it wrong publishes words the candidate never
 *   said. Diarization makes attribution an acoustic *measurement* instead.
 *
 *   Both passes are kept. Two independent ASR systems over the same audio give
 *   a free confidence signal: where they disagree on the wording of a sentence
 *   we are about to publish as a verbatim quote, that is exactly the sentence a
 *   human should listen to before it ships.
 *
 * nova-3 is Deepgram's current flagship for pre-recorded English (checked
 * 2026-07-23). Flux is newer but is built for real-time voice agents with
 * turn-taking, not batch transcription. Keyterm prompting is nova-3-only.
 *
 * Compliance is unchanged from the whisper pass: audio is downloaded by hand
 * through WisconsinEye's own terms gate, and only TEXT plus the public program
 * permalink is ever ingested. No media URL is stored anywhere.
 *
 * Usage:
 *   node scripts/transcribe-deepgram.mjs \
 *     --audio ~/Downloads/wisconsineye-audio-interviews [--only david-crowley]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const MANIFEST = new URL("./wiseye-programs.json", import.meta.url);
const OUT_DIR = resolve(process.cwd(), "transcripts-dg");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const expand = (p) => (p.startsWith("~") ? join(homedir(), p.slice(1)) : p);

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const KEY = process.env.DEEPGRAM_API_KEY || env.DEEPGRAM_API_KEY;
if (!KEY) {
  console.error("DEEPGRAM_API_KEY not found in the environment or .env.local");
  process.exit(1);
}

const audioDir = resolve(expand(arg("audio", "")));
const only = arg("only", null);
if (!audioDir || !existsSync(audioDir)) {
  console.error(`Audio directory not found: ${audioDir}\nPass --audio <dir>`);
  process.exit(1);
}

// Boost the proper nouns generic ASR reliably mangles. The whisper pass wrote
// "WestPolitics" for WisPolitics and "wisi.org" for wiseye.org. Capped well
// under Deepgram's 500-token keyterm budget.
const KEYTERMS = [
  "Mandela Barnes", "Joel Brennan", "David Crowley", "Francesca Hong",
  "Andrew Manske", "Kelda Roys", "Sara Rodriguez", "Josh Schoemann",
  "Tom Tiffany", "Tony Evers", "J.R. Ross", "WisPolitics", "WisconsinEye",
  "BadgerCare", "Wauwatosa", "Waukesha", "Milwaukee", "Madison",
  "Assembly", "Evers", "gubernatorial",
];

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
const onDisk = new Map(readdirSync(audioDir).map((f) => [norm(f), f]));

mkdirSync(OUT_DIR, { recursive: true });

const programs = manifest.programs.filter((p) => !only || p.candidateSlug === only);
if (!programs.length) {
  console.error(`No program matches --only ${only}`);
  process.exit(1);
}

const params = new URLSearchParams({
  model: "nova-3",
  diarize: "true",     // speaker labels — the entire reason for this pass
  utterances: "true",  // group words into speaker turns
  smart_format: "true",
  punctuate: "true",
  language: "en",
});
for (const k of KEYTERMS) params.append("keyterm", k);

/**
 * Decide which diarized speaker id is the candidate.
 *
 * Deterministic, with a checkable signal rather than a guess: the host opens
 * every one of these programs with "Hi, I'm J.R. Ross, editor of
 * WisPolitics.com", so the speaker who utters that name is the host and the
 * other is the candidate. Falls back to total speaking time (in a 30-minute
 * interview the candidate always talks more) and reports which rule fired so a
 * reviewer can see how the label was derived.
 */
function identifyCandidateSpeaker(utterances) {
  const talkTime = new Map();
  for (const u of utterances) {
    talkTime.set(u.speaker, (talkTime.get(u.speaker) ?? 0) + (u.end - u.start));
  }
  const speakers = [...talkTime.keys()].sort((a, b) => talkTime.get(b) - talkTime.get(a));

  const hostUtterance = utterances.find((u) => /\bJ\.?\s?R\.?\s+Ross\b/i.test(u.transcript));
  if (hostUtterance !== undefined && speakers.length > 1) {
    const candidate = speakers.find((s) => s !== hostUtterance.speaker);
    if (candidate !== undefined) {
      return { candidateSpeaker: candidate, hostSpeaker: hostUtterance.speaker, rule: "host self-identified as J.R. Ross" };
    }
  }
  return {
    candidateSpeaker: speakers[0],
    hostSpeaker: speakers[1] ?? null,
    rule: "fallback: most total speaking time",
  };
}

for (const [i, p] of programs.entries()) {
  const file = onDisk.get(norm(p.audioFile));
  if (!file) {
    console.warn(`SKIP ${p.candidateSlug} — no file named "${p.audioFile}"`);
    continue;
  }
  const src = join(audioDir, file);
  process.stdout.write(`\n[${i + 1}/${programs.length}] ${p.candidateSlug} — uploading ${file}\n`);

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${KEY}`, "Content-Type": "audio/mpeg" },
    body: readFileSync(src),
  });
  if (!res.ok) {
    console.error(`  FAILED http ${res.status}: ${(await res.text()).slice(0, 300)}`);
    continue;
  }
  const json = await res.json();
  const utterances = json.results?.utterances ?? [];
  if (!utterances.length) {
    console.error("  FAILED: no utterances returned");
    continue;
  }

  const { candidateSpeaker, hostSpeaker, rule } = identifyCandidateSpeaker(utterances);

  const turns = utterances.map((u) => ({
    start: u.start,
    end: u.end,
    speaker: u.speaker,
    // Who this is ATTRIBUTED to, resolved once here rather than re-inferred at
    // every downstream read.
    role: u.speaker === candidateSpeaker ? "candidate" : u.speaker === hostSpeaker ? "host" : "unknown",
    confidence: u.confidence,
    text: u.transcript.trim(),
  }));

  const candidateTurns = turns.filter((t) => t.role === "candidate");
  writeFileSync(
    join(OUT_DIR, `${p.candidateSlug}.json`),
    JSON.stringify(
      {
        candidateSlug: p.candidateSlug,
        raceId: manifest.raceId,
        outlet: manifest.outlet,
        date: p.date,
        programUrl: p.programUrl,
        title: p.title,
        engine: "deepgram/nova-3+diarize",
        speakerMapping: { candidateSpeaker, hostSpeaker, rule },
        durationSec: json.metadata?.duration ?? turns.at(-1)?.end ?? 0,
        turns,
        // Only the candidate's own words. This is what quote extraction reads,
        // so the interviewer's questions are not merely labelled — they are
        // absent, and cannot be misattributed downstream.
        candidateText: candidateTurns.map((t) => t.text).join(" "),
      },
      null,
      2,
    ) + "\n",
  );

  const candSec = candidateTurns.reduce((s, t) => s + (t.end - t.start), 0);
  const totalSec = turns.reduce((s, t) => s + (t.end - t.start), 0);
  process.stdout.write(
    `  -> transcripts-dg/${p.candidateSlug}.json — ${turns.length} turns, ` +
      `candidate = speaker ${candidateSpeaker} (${Math.round((candSec / totalSec) * 100)}% of talk time)\n` +
      `     rule: ${rule}\n`,
  );
}

console.log(`\nDone. Output in ${OUT_DIR}`);
