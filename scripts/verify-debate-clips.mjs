#!/usr/bin/env node
/**
 * Independent check on every published clip: send the cut file back to Deepgram
 * on its own and confirm two things.
 *
 *   1. WORDS — the clip's transcript matches the quote we print beside it. If a
 *      timestamp is off, the clip says something other than the quote and this
 *      catches it.
 *   2. VOICE — diarizing the isolated clip finds exactly ONE speaker. The whole
 *      attribution risk on this recording is a moderator's question or a rival's
 *      interjection bleeding into a candidate's block. A clip that contains two
 *      voices is a clip we must not publish under one name.
 *
 * This is deliberately a second, independent pass. The first pass diarized 58
 * minutes at once and had to separate eight voices; this one has to find only
 * how many voices are inside twenty seconds, which is a far easier question and
 * therefore a real check rather than an echo of the first answer.
 *
 * Usage: node scripts/verify-debate-clips.mjs --slug wi-gov-dem-primary-debate
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(process.cwd(), "transcripts-dg");
const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const slug = arg("slug", "wi-gov-dem-primary-debate");
const only = arg("only", null);

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const KEY = process.env.DEEPGRAM_API_KEY || env.DEEPGRAM_API_KEY;
if (!KEY) {
  console.error("DEEPGRAM_API_KEY not found");
  process.exit(1);
}

/** Share of the quote's words that must reappear in the clip transcript. */
const WORD_MATCH_FLOOR = 0.8;

const params = new URLSearchParams({
  model: "nova-3",
  language: "en",
  diarize: "true",
  punctuate: "true",
  smart_format: "true",
});

const { quotes } = JSON.parse(readFileSync(join(DIR, `${slug}.quotes.json`), "utf8"));
const targets = only ? quotes.filter((q) => q.personSlug === only) : quotes;

const bag = (s) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

async function verify(q) {
  const path = resolve(process.cwd(), "public", q.clip.replace(/^\//, ""));
  if (!existsSync(path)) return { ...q, ok: false, why: "clip file missing" };

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${KEY}`, "Content-Type": "audio/mpeg" },
    body: readFileSync(path),
  });
  if (!res.ok) return { ...q, ok: false, why: `http ${res.status}` };
  const json = await res.json();
  const alt = json.results?.channels?.[0]?.alternatives?.[0];
  const words = alt?.words ?? [];
  if (!words.length) return { ...q, ok: false, why: "no speech in clip" };

  const voices = new Set(words.map((w) => w.speaker));
  const heard = new Set(bag(alt.transcript));
  const wanted = bag(q.quote);
  const overlap = wanted.filter((w) => heard.has(w)).length / (wanted.length || 1);

  const problems = [];
  if (voices.size !== 1) problems.push(`${voices.size} voices in clip`);
  if (overlap < WORD_MATCH_FLOOR) problems.push(`only ${(overlap * 100).toFixed(0)}% of quote words heard`);

  return {
    ...q,
    ok: problems.length === 0,
    why: problems.join("; ") || "one voice, words match",
    voicesInClip: voices.size,
    wordMatch: Number(overlap.toFixed(3)),
  };
}

const results = [];
for (const [i, q] of targets.entries()) {
  process.stdout.write(`\r  verifying ${i + 1}/${targets.length}…   `);
  results.push(await verify(q));
}
process.stdout.write("\r" + " ".repeat(40) + "\r");

const bad = results.filter((r) => !r.ok);
const pad = (s, n) => String(s).padEnd(n);

console.log(`${pad("topic", 21)}${pad("candidate", 17)}${pad("voices", 8)}${pad("words", 8)}verdict`);
for (const r of results) {
  console.log(
    `${pad(r.topicId, 21)}${pad(r.name, 17)}${pad(r.voicesInClip ?? "—", 8)}` +
      `${pad(r.wordMatch != null ? (r.wordMatch * 100).toFixed(0) + "%" : "—", 8)}${r.ok ? "✓" : "✗ " + r.why}`,
  );
}

writeFileSync(
  join(DIR, `${slug}.verification.json`),
  JSON.stringify(
    {
      slug,
      method: "each clip re-transcribed and re-diarized in isolation",
      wordMatchFloor: WORD_MATCH_FLOOR,
      checked: results.length,
      passed: results.length - bad.length,
      results: results.map(({ fullAnswer, ...r }) => r),
    },
    null,
    2,
  ) + "\n",
);

console.log(`\n${results.length - bad.length}/${results.length} clips verified — one voice, words match.`);
if (bad.length) {
  console.log(`\n${bad.length} clip(s) must not be published as-is:`);
  for (const r of bad) console.log(`   ${r.topicId} / ${r.name} — ${r.why}`);
  process.exit(1);
}
