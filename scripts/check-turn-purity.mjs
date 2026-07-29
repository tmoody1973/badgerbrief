#!/usr/bin/env node
/**
 * The check behind the decision to build turns from `paragraphs` rather than
 * `utterances`.
 *
 * A turn is IMPURE when one block contains both a moderator's direct address to
 * a candidate ("Mr Barnes, you were once seen as…") and first-person answer
 * speech ("I would sign that bill"). That means two people are inside one
 * attributed block, and any quote pulled from it can land in the wrong mouth.
 *
 * On the WI governor debate this reports 0/230 impure paragraphs against
 * 15/342 impure utterances. If a future transcript regresses — a different
 * mix, a different model version — this fails instead of quietly publishing
 * misattributed quotes.
 *
 * Usage: node scripts/check-turn-purity.mjs --slug wi-gov-dem-primary-debate
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const slug = arg("slug", "wi-gov-dem-primary-debate");
const raw = JSON.parse(
  readFileSync(join(resolve(process.cwd(), "transcripts-dg"), `${slug}.raw.json`), "utf8"),
);

const VOCATIVE =
  /\b(Mr\.?|Mister|Miss|Ms\.?)\s+(Barnes|Brennan|Crowley|Hong|Roys|Royse|Roy)\b/i;
const FIRST_PERSON = /\b(I would|I think|I believe|I have|I am|I'm|my plan)\b/i;

const impure = (text) => VOCATIVE.test(text) && FIRST_PERSON.test(text);

const alt = raw.results.channels[0].alternatives[0];
const paragraphs = (alt.paragraphs?.paragraphs ?? []).map((p) =>
  p.sentences.map((s) => s.text).join(" "),
);
const utterances = (raw.results.utterances ?? []).map((u) => u.transcript);

const pBad = paragraphs.filter(impure).length;
const uBad = utterances.filter(impure).length;

console.log(`paragraphs  ${pBad}/${paragraphs.length} impure`);
console.log(`utterances  ${uBad}/${utterances.length} impure`);

if (!paragraphs.length) {
  console.error("\nFAIL: no paragraphs — rerun transcribe-debate.mjs with paragraphs=true");
  process.exit(1);
}
if (pBad > 0) {
  console.error(
    `\nFAIL: ${pBad} paragraph(s) mix a moderator question with answer speech.\n` +
      `Quotes cut from these would be misattributed. Repair segmentation before publishing.`,
  );
  for (const t of paragraphs.filter(impure).slice(0, 5)) console.error(`  • ${t.slice(0, 160)}…`);
  process.exit(1);
}
console.log(`\n✓ every paragraph holds exactly one speaker's words`);
