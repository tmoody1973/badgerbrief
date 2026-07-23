#!/usr/bin/env node
/**
 * Cut a short video clip for each published WisconsinEye interview quote and
 * upload it to Convex storage.
 *
 * Runs locally because the source video never enters the app. WisconsinEye's
 * terms prohibit sharing the media location link their download flow
 * generates, so that URL appears nowhere — not in this file, not in the
 * database, not in a log. Only our own re-hosted clip is served.
 *
 * Compliance, clause by clause:
 *   - "must retain WisconsinEye branding watermarks" — their bug and lower
 *     third are burned into every frame, so clips are NEVER cropped. The only
 *     transform is a proportional downscale, which keeps both legible.
 *   - "not in their entirety; two to five minute clips permitted" — clips are
 *     bounded by the speaking turn and hard-capped at MAX_CLIP_SECONDS.
 *   - "link your clips back to the original program" — the quote's sourceUrl
 *     is the program permalink and renders beside every clip.
 *
 * Timestamp alignment was verified before this was written: each mp4's duration
 * matches its mp3 to within 0.1s, so offsets taken from the audio transcript
 * land on the same moment in the video.
 *
 * Usage:
 *   node scripts/clip-wiseye.mjs --video ~/Downloads [--only david-crowley] [--prod]
 *   node scripts/clip-wiseye.mjs --video ~/Downloads --dry-run
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, statSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";

const TRANSCRIPTS = resolve(process.cwd(), "transcripts-dg");
/** Well under WisconsinEye's 2-5 minute clip ceiling; a pull-quote is seconds. */
const MAX_CLIP_SECONDS = 90;
/** Lead-in/out so a clip doesn't start or end mid-syllable. */
const PAD_BEFORE = 0.6;
const PAD_AFTER = 0.8;
/** Proportional downscale only. Cropping would remove the watermark. */
const CLIP_WIDTH = 854; // 854x480 from a 1280x720 source

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const has = (n) => process.argv.includes(`--${n}`);
const expand = (p) => (p.startsWith("~") ? join(homedir(), p.slice(1)) : p);

const videoDir = resolve(expand(arg("video", join(homedir(), "Downloads"))));
const only = arg("only", null);
const prod = has("prod");
const dryRun = has("dry-run");

if (!existsSync(TRANSCRIPTS)) {
  console.error("No transcripts-dg/ — run scripts/transcribe-deepgram.mjs first.");
  process.exit(1);
}

const IDENTITY = JSON.stringify({ metadata: { role: "admin" } });
const convex = (fn, args) => {
  const a = ["convex", "run"];
  if (prod) a.push("--prod");
  a.push(fn, JSON.stringify(args), "--identity", IDENTITY);
  const out = execFileSync("npx", a, { encoding: "utf8" });
  const m = out.match(/[[{][\s\S]*[\]}]/);
  return m ? JSON.parse(m[0]) : null;
};

/** turn whose start matches this ?t= anchor, so the clip ends where speech does */
function findTurn(slug, seconds) {
  const path = join(TRANSCRIPTS, `${slug}.json`);
  if (!existsSync(path)) return null;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  return doc.turns.find((t) => Math.floor(t.start) === seconds) ?? null;
}

const pending = convex("interviewClips:quotesNeedingClips", {}) ?? [];
const targets = pending.filter((q) => !only || q.candidateSlug === only);
console.log(`${pending.length} published quote(s) without a clip; ${targets.length} selected.\n`);
if (targets.length === 0) process.exit(0);

const tmp = mkdtempSync(join(tmpdir(), "wiseye-clip-"));
let done = 0;
let skipped = 0;

for (const q of targets) {
  const seconds = Number(new URL(q.sourceUrl).searchParams.get("t"));
  const video = join(videoDir, `${q.candidateSlug}.mp4`);
  if (!existsSync(video)) {
    console.warn(`  SKIP ${q.candidateSlug} — no ${q.candidateSlug}.mp4 in ${videoDir}`);
    skipped++;
    continue;
  }
  const turn = findTurn(q.candidateSlug, seconds);
  if (!turn) {
    console.warn(`  SKIP ${q.candidateSlug} @${seconds}s — no matching turn in the transcript`);
    skipped++;
    continue;
  }

  const start = Math.max(0, turn.start - PAD_BEFORE);
  const duration = Math.min(turn.end - turn.start + PAD_BEFORE + PAD_AFTER, MAX_CLIP_SECONDS);
  const out = join(tmp, `${q.candidateSlug}-${seconds}.mp4`);
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");

  // -ss before -i seeks fast; re-encoding (not stream copy) so the clip starts
  // on a keyframe at exactly the right moment rather than up to 2s early.
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-ss", String(start), "-t", String(duration),
    "-i", video,
    "-vf", `scale=${CLIP_WIDTH}:-2`, // -2 keeps the aspect ratio; never crop
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
    "-c:a", "aac", "-b:a", "96k",
    "-movflags", "+faststart", // plays before the whole file downloads
    out,
  ]);

  const bytes = statSync(out).size;
  console.log(`  ${q.candidateSlug} @${mm}:${ss}  ${duration.toFixed(1)}s  ${(bytes / 1e6).toFixed(1)}MB  "${q.text.slice(0, 50)}…"`);

  if (dryRun) { done++; continue; }

  const uploadUrl = execFileSync("npx", [
    "convex", "run", ...(prod ? ["--prod"] : []),
    "interviewClips:generateClipUploadUrl", "{}", "--identity", IDENTITY,
  ], { encoding: "utf8" }).trim().replace(/^"|"$/g, "").split("\n").pop().replace(/^"|"$/g, "");

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "video/mp4" },
    body: readFileSync(out),
  });
  if (!res.ok) {
    console.error(`    upload failed: http ${res.status}`);
    skipped++;
    continue;
  }
  const { storageId } = await res.json();
  const r = convex("interviewClips:attachClip", { sourceUrl: q.sourceUrl, storageId });
  console.log(`    attached to ${r?.attached ?? 0} quote row(s)`);
  done++;
  rmSync(out, { force: true });
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${done} clip(s) ${dryRun ? "cut (dry run, nothing uploaded)" : "uploaded"}, ${skipped} skipped.`);
