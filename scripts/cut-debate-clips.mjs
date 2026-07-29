#!/usr/bin/env node
/**
 * Pick one representative quote per candidate per topic and cut the matching
 * audio clip, so every claim on the debate page can be heard, not just read.
 *
 * Why clips matter here beyond nice UX: diarization on this recording is
 * uneven — David Crowley's words average 0.50 speaker confidence. A printed
 * quote asks the reader to trust our attribution. A ten-second clip lets them
 * check it with their own ears. The weakest part of the pipeline is covered by
 * the strongest possible evidence.
 *
 * SELECTION IS A RULE, NOT A JUDGEMENT. For each topic the candidate's longest
 * answer is taken (their most substantive turn on that subject), and the clip
 * runs from the start of that answer through whole sentences up to
 * MAX_CLIP_SEC. Opening sentences are where a candidate states a position in
 * response to a direct question. The full answer still appears in the
 * transcript below, so the clip is an entry point and never the whole record.
 *
 * Only excerpts are cut. The complete programme is not redistributed — the page
 * links to WISN's own posting for that.
 *
 * Usage:
 *   node scripts/cut-debate-clips.mjs \
 *     --audio "~/Downloads/Wisconsin Democratic Primary Debate for Governor.mp3" \
 *     --slug wi-gov-dem-primary-debate
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const DIR = resolve(process.cwd(), "transcripts-dg");
const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const expand = (p) => (p.startsWith("~") ? join(homedir(), p.slice(1)) : p);

const slug = arg("slug", "wi-gov-dem-primary-debate");
const audio = resolve(expand(arg("audio", "")));
if (!existsSync(audio)) {
  console.error(`Audio not found: ${audio}\nPass --audio <file>`);
  process.exit(1);
}

/** Clips stay short — an excerpt for verification and context, not a rebroadcast. */
const MAX_CLIP_SEC = 30;
const MIN_CLIP_SEC = 6;
/** Lead-in so a clip doesn't open mid-syllable. */
const PAD_SEC = 0.35;

const OUT_AUDIO = resolve(process.cwd(), "public", "audio", "debate", slug);
mkdirSync(OUT_AUDIO, { recursive: true });

const doc = JSON.parse(readFileSync(join(DIR, `${slug}.structured.json`), "utf8"));

/** Every answer a candidate gave inside a topic block, flattened. */
function answersFor(topicId, personSlug) {
  return doc.exchanges
    .filter((e) => e.topicId === topicId)
    .flatMap((e) => e.answers.filter((a) => a.personSlug === personSlug).map((a) => ({ ...e, ...a })));
}

/** Whole sentences from the start of an answer, up to MAX_CLIP_SEC. */
function leadingWindow(answer) {
  const sentences = answer.sentences ?? [];
  if (!sentences.length) return null;
  const from = sentences[0].start;
  let taken = [];
  for (const s of sentences) {
    if (s.end - from > MAX_CLIP_SEC && taken.length) break;
    taken.push(s);
    if (s.end - from >= MAX_CLIP_SEC) break;
  }
  const to = taken.at(-1).end;
  if (to - from < MIN_CLIP_SEC) return null;
  return { from, to, text: taken.map((s) => s.text).join(" ") };
}

const quotes = [];
let cut = 0;
for (const topic of doc.topics) {
  for (const personSlug of doc.candidates) {
    const answers = answersFor(topic.id, personSlug);
    if (!answers.length) continue;
    // Longest answer = the candidate's most substantive turn on this topic.
    const best = answers.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    const win = leadingWindow(best);
    if (!win) continue;

    const file = `${topic.id}--${personSlug}.mp3`;
    const start = Math.max(0, win.from - PAD_SEC);
    const dur = win.to - start;
    execFileSync("ffmpeg", [
      "-nostdin", "-loglevel", "error", "-y",
      "-ss", start.toFixed(3),
      "-t", dur.toFixed(3),
      "-i", audio,
      "-ac", "1", "-b:a", "64k", "-ar", "44100",
      join(OUT_AUDIO, file),
    ]);
    cut += 1;

    quotes.push({
      topicId: topic.id,
      personSlug,
      name: best.name,
      quote: win.text,
      startSec: Number(win.from.toFixed(2)),
      endSec: Number(win.to.toFixed(2)),
      clip: `/audio/debate/${slug}/${file}`,
      question: best.question,
      askedBy: best.askedBy,
      sentiment: best.sentiment,
      sentimentScore: best.sentimentScore,
      speakerConfidence: best.speakerConfidence,
      // Carried through to the page: a reader-visible caution, and the reason
      // the clip sits next to the text.
      needsReview: best.needsReview,
      fullAnswer: best.text,
    });
  }
}

writeFileSync(join(DIR, `${slug}.quotes.json`), JSON.stringify({ slug, quotes }, null, 2) + "\n");

const flagged = quotes.filter((q) => q.needsReview);
console.log(`✓ ${cut} clips cut → public/audio/debate/${slug}/`);
console.log(`✓ ${quotes.length} quotes → transcripts-dg/${slug}.quotes.json`);
const secs = quotes.reduce((s, q) => s + (q.endSec - q.startSec), 0);
console.log(`  total excerpt audio: ${(secs / 60).toFixed(1)} min of a ${(doc.durationSec / 60).toFixed(0)} min programme`);
if (flagged.length) {
  console.log(`\n⚠ ${flagged.length} selected quote(s) sit on low-confidence diarization — listen before publishing:`);
  for (const q of flagged) {
    console.log(`   ${q.topicId.padEnd(20)} ${q.name.padEnd(16)} conf ${q.speakerConfidence.toFixed(2)}  ${q.clip}`);
  }
}
