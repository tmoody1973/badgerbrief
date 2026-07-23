#!/usr/bin/env node
/**
 * Transcribe manually-downloaded WisconsinEye interview audio, LOCALLY.
 *
 * Why local and not a Convex action: WisconsinEye's terms prohibit sharing the
 * media location link their download flow generates, and their archive is
 * account-gated. So the media never enters the app — Tarik downloads audio
 * through their own terms gate, whisper.cpp transcribes it on this machine, and
 * only TEXT plus the public program permalink is ever ingested. Nothing to
 * re-host, no clip to upload, no media URL to leak into an RSC payload.
 *
 * Convex actions also have no ffmpeg/whisper binaries, so this could not run
 * there even if the terms allowed it.
 *
 * Usage:
 *   node scripts/transcribe-wiseye.mjs \
 *     --audio ~/Downloads/wisconsineye-audio-interviews \
 *     [--only david-crowley] [--model ~/.cache/whisper/ggml-large-v3-turbo.bin]
 *
 * Writes one JSON per program to  transcripts/<candidateSlug>.json
 *   { candidateSlug, raceId, outlet, date, programUrl, title,
 *     segments: [{ start, end, text }], text }
 * `start` is seconds into the program — it becomes the ?t= deep link back to
 * wiseye.org that a published quote cites.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";

const MANIFEST = new URL("./wiseye-programs.json", import.meta.url);
const OUT_DIR = resolve(process.cwd(), "transcripts");
const TMP_DIR = resolve(process.cwd(), ".transcribe-tmp");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const expand = (p) => (p.startsWith("~") ? join(homedir(), p.slice(1)) : p);

const audioDir = resolve(expand(arg("audio", "")));
const model = resolve(expand(arg("model", "~/.cache/whisper/ggml-large-v3-turbo.bin")));
const only = arg("only", null);

if (!audioDir || !existsSync(audioDir)) {
  console.error(`Audio directory not found: ${audioDir}\nPass --audio <dir>`);
  process.exit(1);
}
if (!existsSync(model)) {
  console.error(
    `Whisper model not found: ${model}\n` +
      `Download it with:\n  curl -L -o ${model} \\\n` +
      `    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin`,
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
// Case/spacing in the download filenames is whatever the browser saved, so
// match on a normalised form rather than an exact string.
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
const onDisk = new Map(readdirSync(audioDir).map((f) => [norm(f), f]));

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

const programs = manifest.programs.filter((p) => !only || p.candidateSlug === only);
if (programs.length === 0) {
  console.error(`No program matches --only ${only}`);
  process.exit(1);
}

let done = 0;
for (const p of programs) {
  const file = onDisk.get(norm(p.audioFile));
  if (!file) {
    console.warn(`SKIP ${p.candidateSlug} — no file named "${p.audioFile}" in ${audioDir}`);
    continue;
  }

  const src = join(audioDir, file);
  const wav = join(TMP_DIR, `${p.candidateSlug}.wav`);
  const outBase = join(TMP_DIR, p.candidateSlug);

  process.stdout.write(`\n[${++done}/${programs.length}] ${p.candidateSlug} — ${basename(src)}\n`);

  // whisper.cpp only accepts 16 kHz mono PCM WAV; it will not decode mp3.
  process.stdout.write("  decoding to 16kHz mono wav...\n");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);

  process.stdout.write("  transcribing (this is the slow part)...\n");
  execFileSync(
    "whisper-cli",
    [
      "-m", model,
      "-f", wav,
      "--output-json",
      "--output-file", outBase,
      "-l", "en",
      // REQUIRED, not a tuning knob. whisper.cpp carries previous segments as
      // decoder context by default, and over a 30-minute interview that loop
      // self-reinforces: the first run emitted a "David Crowley:" speaker
      // prefix on 242 of 243 segments — including the interviewer's own
      // questions. On a quote product that is a fabricated attribution, the
      // worst bug available. Disabling context carry-over removed it entirely.
      "--max-context", "0",
      // These are political interviews full of Wisconsin proper nouns. The
      // prompt biases the decoder toward spelling the candidates' names right;
      // it does not invent content. Quotes are still gated on a verbatim
      // substring match and human review before anything publishes.
      "--prompt",
      "Wisconsin politics interview. Names: Mandela Barnes, Joel Brennan, David Crowley, " +
        "Francesca Hong, Andrew Manske, Kelda Roys, Sara Rodriguez, Josh Schoemann, Tom Tiffany, " +
        "Tony Evers. Places: Milwaukee, Madison, Wauwatosa, Waukesha, Racine, Kenosha, Green Bay.",
      "-pp",
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );

  const raw = JSON.parse(readFileSync(`${outBase}.json`, "utf8"));
  // whisper.cpp emits offsets in milliseconds under transcription[].offsets.
  const segments = (raw.transcription ?? []).map((s) => ({
    start: (s.offsets?.from ?? 0) / 1000,
    end: (s.offsets?.to ?? 0) / 1000,
    text: (s.text ?? "").trim(),
  })).filter((s) => s.text.length > 0);

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
        durationSec: segments.at(-1)?.end ?? 0,
        segments,
        text: segments.map((s) => s.text).join(" "),
      },
      null,
      2,
    ) + "\n",
  );

  rmSync(wav, { force: true });
  rmSync(`${outBase}.json`, { force: true });
  process.stdout.write(`  -> transcripts/${p.candidateSlug}.json (${segments.length} segments)\n`);
}

rmSync(TMP_DIR, { recursive: true, force: true });
console.log(`\nDone. ${done} transcript(s) in ${OUT_DIR}`);
