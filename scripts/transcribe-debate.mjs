#!/usr/bin/env node
/**
 * One-shot Deepgram pass over a full candidate DEBATE (many speakers), as
 * opposed to scripts/transcribe-deepgram.mjs which handles two-person
 * WisconsinEye interviews.
 *
 * A debate needs strictly more than the interview pass:
 *   - diarize + utterances  → who spoke, when (the only honest basis for
 *                             attributing a quote to a candidate)
 *   - paragraphs            → readable blocks for a published transcript
 *   - topics / intents      → what issues were actually raised, per utterance
 *   - sentiment             → tone per utterance, so "combative on X" is a
 *                             measurement rather than an impression
 *   - summarize=v2          → a whole-debate abstract
 *   - detect_entities       → people/orgs/money/places named on stage
 *
 * Speaker→candidate naming is NOT done here. Deepgram returns anonymous
 * speaker ids (0,1,2…); mapping them to real people is a separate, reviewable
 * step (scripts/label-debate-speakers.mjs) so that a wrong guess can never be
 * silently baked into the raw artifact.
 *
 * Usage:
 *   node scripts/transcribe-debate.mjs --audio "~/Downloads/debate.mp3" --slug wi-gov-dem-primary-debate-2026-07-28
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const OUT_DIR = resolve(process.cwd(), "transcripts-dg");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
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

const audio = resolve(expand(arg("audio", "")));
const slug = arg("slug", null);
if (!audio || !existsSync(audio)) {
  console.error(`Audio file not found: ${audio}\nPass --audio <file>`);
  process.exit(1);
}
if (!slug) {
  console.error("Pass --slug <output-slug>");
  process.exit(1);
}

// Proper nouns generic ASR mangles. The whole 2026 gubernatorial field plus the
// Wisconsin policy vocabulary a governor's debate runs on. Well under nova-3's
// 500-token keyterm budget.
const KEYTERMS = [
  // Democratic gubernatorial field
  "Mandela Barnes", "Joel Brennan", "David Crowley", "Francesca Hong",
  "Missy Hughes", "Brett Hulsey", "Tim Jacobson", "Sara Rodriguez",
  "Zachary Roper", "Kelda Roys", "Ryan Strnad",
  // Republican field + incumbents named on stage
  "Josh Schoemann", "Tom Tiffany", "Andy Manske", "Tony Evers",
  "Sarah Godlewski", "Rebecca Kleefisch", "Scott Walker", "Robin Vos",
  "Devin LeMahieu",
  // Moderators. Without these nova-3 hears "Gerron" as "Jaren".
  "Gerron Jordan", "Matt Smith", "WISN", "UpFront", "Marquette University",
  // Wisconsin places
  "Milwaukee", "Madison", "Wauwatosa", "Waukesha", "Racine", "Kenosha",
  "Green Bay", "Eau Claire", "Oshkosh", "Appleton", "Sheboygan", "La Crosse",
  "Dane County", "Milwaukee County", "Waukesha County",
  // Wisconsin policy vocabulary
  "BadgerCare", "Wisconsin Shares", "FoodShare", "Act 10", "Foxconn",
  "WEDC", "DNR", "PFAS", "Wisconsin Idea", "UW System", "Universities of Wisconsin",
  "Joint Finance Committee", "Wisconsin Elections Commission",
  "shared revenue", "school choice", "voucher", "referendum", "referenda",
  "gerrymander", "redistricting", "Medicaid expansion", "right to work",
  "prevailing wage", "collective bargaining", "gubernatorial",
];

const params = new URLSearchParams({
  model: "nova-3",
  language: "en",
  diarize: "true",
  utterances: "true",
  paragraphs: "true",
  punctuate: "true",
  smart_format: "true",
  sentiment: "true",
  topics: "true",
  intents: "true",
  detect_entities: "true",
  summarize: "v2",
});
for (const k of KEYTERMS) params.append("keyterm", k);

mkdirSync(OUT_DIR, { recursive: true });

const bytes = statSync(audio).size;
const started = Date.now();
console.log(`Uploading ${(bytes / 1e6).toFixed(1)} MB → nova-3 (diarize+utterances+sentiment+topics+intents+entities+summary)`);

const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
  method: "POST",
  headers: { Authorization: `Token ${KEY}`, "Content-Type": "audio/mpeg" },
  body: readFileSync(audio),
});
if (!res.ok) {
  console.error(`FAILED http ${res.status}: ${(await res.text()).slice(0, 800)}`);
  process.exit(1);
}
const json = await res.json();
const out = join(OUT_DIR, `${slug}.raw.json`);
writeFileSync(out, JSON.stringify(json, null, 2) + "\n");

const r = json.results ?? {};
const utts = r.utterances ?? [];
const speakers = new Set(utts.map((u) => u.speaker));
console.log(
  `\nDone in ${((Date.now() - started) / 1000).toFixed(0)}s → ${out}\n` +
    `  duration      ${(json.metadata?.duration ?? 0).toFixed(0)}s\n` +
    `  utterances    ${utts.length}\n` +
    `  speakers      ${speakers.size} (${[...speakers].sort((a, b) => a - b).join(", ")})\n` +
    `  topics        ${r.topics?.segments?.length ?? "—"}\n` +
    `  intents       ${r.intents?.segments?.length ?? "—"}\n` +
    `  sentiment     ${r.sentiments?.segments?.length ?? "—"}\n` +
    `  summary       ${r.summary?.short ? "yes" : "—"}\n` +
    `  entities      ${r.channels?.[0]?.alternatives?.[0]?.entities?.length ?? "—"}`,
);
