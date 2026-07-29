#!/usr/bin/env node
/**
 * Turn the labelled transcript into the structure the debate page renders:
 * topic blocks, question→answer exchanges, and the on-stage hand-raise votes.
 *
 * Two rules govern everything here.
 *
 * 1. TOPICS COME FROM THE MODERATORS, NOT FROM A MODEL. Deepgram's own topic
 *    classifier was run and rejected — on this file it returned "Racist race",
 *    "racial disparities in malaysia" and "impact of russian federal government
 *    on local governments". Instead each block is anchored to the verbatim
 *    sentence a moderator used to open it ("Let's talk about data centers"), so
 *    the segmentation is something a reader can check against the tape rather
 *    than something an LLM asserted.
 *
 * 2. A HAND-RAISE COUNTS ONLY IF A MODERATOR SAID THE RESULT ALOUD. We have
 *    audio, not video — we cannot see hands. Every vote below therefore carries
 *    the moderator's spoken readout as its evidence. No vote is inferred.
 *
 * Usage: node scripts/structure-debate.mjs --slug wi-gov-dem-primary-debate
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(process.cwd(), "transcripts-dg");
const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const slug = arg("slug", "wi-gov-dem-primary-debate");

const doc = JSON.parse(readFileSync(join(DIR, `${slug}.labeled.json`), "utf8"));
const turns = doc.turns;
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Each anchor is the verbatim phrase a moderator used to open the block. Order
 * matters: blocks run from one anchor to the next.
 */
const TOPICS = [
  {
    id: "the-race",
    label: "The state of the race",
    blurb: "Crowley's re-entry, Hong's DSA membership, Barnes' 2022 loss, and whether single-digit polling ends a candidacy.",
    anchor: "It is fair to say that this race has been chaotic",
  },
  {
    id: "public-safety",
    label: "Policing and public safety",
    blurb: "The Madison police shooting of Corey Ruys, body cameras, and whether any of them would cut police budgets.",
    anchor: "Last week, a Madison police officer shot and killed a man",
  },
  {
    id: "affordability",
    label: "Affordability and the failed tax deal",
    blurb: "The Evers–Republican rebate deal that died in the state Senate, and who would have signed it.",
    anchor: "Let's move on to the economy tonight",
  },
  {
    id: "surplus",
    label: "The budget surplus",
    blurb: "Return the projected $2.5 billion to taxpayers, or spend it — and on what.",
    anchor: "Congressman Tom Tiffany is campaigning on the fact that he would return the entire surplus",
  },
  {
    id: "income-taxes",
    label: "Taxing the wealthy",
    blurb: "Each candidate's specific income threshold and rate, pressed for numbers.",
    anchor: "We did bring up taxes, so let's move on to taxes",
  },
  {
    id: "property-taxes",
    label: "Property taxes",
    blurb: "School referenda, the two-thirds funding commitment, and shared revenue.",
    anchor: "Let's talk about property taxes",
  },
  {
    id: "vouchers",
    label: "School vouchers",
    blurb: "Whether to end, cap or keep the nation's oldest school choice program — the sharpest split of the night.",
    anchor: "We brought up vouchers, so let's talk about vouchers right now",
  },
  {
    id: "data-centers",
    label: "AI data centers",
    blurb: "Moratorium, pause, or guardrails, with 76% of Wisconsinites telling Marquette the costs outweigh the benefits.",
    anchor: "Let's talk about data centers",
  },
  {
    id: "divided-government",
    label: "Governing a divided legislature",
    blurb: "What survives if Republicans keep the legislature.",
    anchor: "Everything you've talked about tonight relies on a democratically controlled legislature",
  },
  {
    id: "closing",
    label: "Closing statements",
    blurb: "Thirty seconds each, in an order drawn at random.",
    anchor: "it is now time for closing statements",
  },
];

/**
 * Votes taken by show of hands.
 *
 * `anchor` is a phrase asserted to occur in exactly one moderator turn — that
 * is what makes the vote checkable. `spoken` is what the reader is shown, which
 * can span two turns: on the body-camera vote the moderators talk over each
 * other, Jordan starting "All of you" while Smith finishes "all candidates."
 * The yes/no lists are transcribed from that spoken readout and from nothing
 * else — this is audio, we cannot see hands.
 */
const HAND_VOTES = [
  {
    id: "body-cameras",
    topicId: "public-safety",
    question: "Would you sign legislation requiring all police and sheriff's departments in Wisconsin to have body cameras?",
    askedAt: "Raise your hand if, as governor, you would sign legislation requiring all police",
    anchor: "all candidates.",
    spoken: "All of you — all candidates.",
    yes: ["mandela-barnes", "joel-brennan", "david-crowley", "francesca-hong", "kelda-roys"],
    no: [],
  },
  {
    id: "tax-deal",
    topicId: "affordability",
    question: "Would you have signed the Evers–Republican tax relief deal into law if it had passed?",
    askedAt: "I'd like you to raise your hand if as governor you would have signed that deal into law",
    anchor: "One, Mr. Crowley.",
    spoken: "One, Mr. Crowley.",
    yes: ["david-crowley"],
    no: ["mandela-barnes", "joel-brennan", "francesca-hong", "kelda-roys"],
  },
  {
    id: "property-tax-cut",
    topicId: "property-taxes",
    question: "Would you commit to an across-the-board property tax decrease?",
    askedAt: "Raise your hand if you as governor would commit to an across the board property tax decrease",
    anchor: "All candidates agreeing to across the board property tax decrease",
    spoken: "All candidates agreeing to across the board property tax decrease.",
    yes: ["mandela-barnes", "joel-brennan", "david-crowley", "francesca-hong", "kelda-roys"],
    no: [],
  },
];

// ── ANCHOR RESOLUTION (assert, don't guess) ─────────────────────────────────
const failures = [];
const anchored = [];
for (const t of TOPICS) {
  const hits = turns.filter((x) => norm(x.text).includes(norm(t.anchor)));
  if (hits.length !== 1) {
    failures.push(`topic "${t.id}": anchor matched ${hits.length} turns, expected 1 — "${t.anchor}"`);
    continue;
  }
  const [turn] = hits;
  if (turn.role !== "moderator") {
    failures.push(`topic "${t.id}": anchor was spoken by ${turn.name} (${turn.role}), expected a moderator`);
    continue;
  }
  anchored.push({ ...t, start: turn.start, openedBy: turn.name });
}
for (const v of HAND_VOTES) {
  for (const [field, phrase] of [["askedAt", v.askedAt], ["anchor", v.anchor]]) {
    const hits = turns.filter((x) => norm(x.text).includes(norm(phrase)));
    if (hits.length !== 1) {
      failures.push(`vote "${v.id}" ${field}: matched ${hits.length} turns, expected 1 — "${phrase}"`);
    } else if (hits[0].role !== "moderator") {
      failures.push(`vote "${v.id}" ${field}: spoken by ${hits[0].name}, expected a moderator`);
    }
  }
}
if (failures.length) {
  console.error("STRUCTURE FAILED — refusing to write:\n");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}

anchored.sort((a, b) => a.start - b.start);
for (const [i, t] of anchored.entries()) {
  t.end = i + 1 < anchored.length ? anchored[i + 1].start : (turns.at(-1)?.end ?? t.start);
}

// ── EXCHANGES: a moderator turn plus the answers it drew ────────────────────
const CANDIDATES = ["mandela-barnes", "joel-brennan", "david-crowley", "francesca-hong", "kelda-roys"];
const topicAt = (t) => anchored.find((b) => t >= b.start && t < b.end)?.id ?? null;

const exchanges = [];
let current = null;
for (const turn of turns) {
  if (turn.role === "announcer") continue;
  if (turn.role === "moderator") {
    // A follow-up inside the same answer ("Do you have a percentage in mind?")
    // extends the open exchange rather than starting a new one.
    //
    // It must also still be the SAME topic. Length alone is not enough: the
    // moderator's move into closing statements — "Believe it or not, it is now
    // time for closing statements. We did choose randomly with the campaigns
    // present to determine the order." — is 25 words, so a word-count test
    // swallowed it and filed all five closing statements as answers to the
    // previous question about governing a divided legislature. Four candidates'
    // closing pitches were published as their position on that question.
    if (
      current &&
      current.answers.length &&
      turn.wordCount <= 25 &&
      topicAt(turn.start) === current.topicId
    ) {
      current.followUps.push({ start: turn.start, text: turn.text, by: turn.name });
      continue;
    }
    if (current) exchanges.push(current);
    current = {
      topicId: topicAt(turn.start),
      question: turn.text,
      askedBy: turn.name,
      start: turn.start,
      followUps: [],
      answers: [],
    };
    continue;
  }
  if (!current) continue;
  current.answers.push({
    personSlug: turn.personSlug,
    name: turn.name,
    start: turn.start,
    end: turn.end,
    text: turn.text,
    sentiment: turn.sentiment,
    sentimentScore: turn.sentimentScore,
    speakerConfidence: turn.speakerConfidence,
    needsReview: turn.needsReview,
    sentences: turn.sentences,
  });
}
if (current) exchanges.push(current);

/**
 * Every answer must sit inside the topic block its exchange claims.
 *
 * This is the check that was missing. An exchange carries one topicId, taken
 * from where the question was asked, and each answer inherits it implicitly —
 * so a boundary the builder fails to notice silently RELABELS answers rather
 * than dropping them. That is the dangerous shape: the page still looks
 * complete, while a candidate's closing statement appears as their answer to
 * whatever was asked before it.
 */
const strays = [];
for (const e of exchanges) {
  for (const a of e.answers) {
    const actual = topicAt(a.start);
    if (actual !== e.topicId) {
      const m = Math.floor(a.start / 60);
      const s = String(Math.floor(a.start % 60)).padStart(2, "0");
      strays.push(`${a.name} at ${m}:${s} is in "${actual}" but filed under "${e.topicId}"`);
    }
  }
}
if (strays.length) {
  console.error(`STRUCTURE FAILED — ${strays.length} answer(s) filed under the wrong topic:\n`);
  for (const x of strays.slice(0, 12)) console.error("  ✗ " + x);
  process.exit(1);
}

/**
 * Why a candidate is absent from a topic — because absence is not neutral.
 *
 * Every gap on this page turned out to be a candidate the moderators never
 * called on: on the failed tax deal only Roys and Crowley were asked to
 * explain their hand, on the surplus only Hong, Brennan and Barnes, and on
 * governing a divided legislature time ran out ("I apologize if I cut you off
 * here. We are kind of running up against time"). Labelling that "did not
 * answer" implies the candidate dodged, which would be our error, not theirs.
 *
 * So the distinction is derived rather than assumed:
 *   notAsked      — never spoke AND no moderator said their name in the block
 *   namedButSilent — a moderator addressed them and they still said nothing
 */
const SURNAME = {
  "mandela-barnes": /\bBarnes\b/i,
  "joel-brennan": /\bBrennan\b/i,
  "david-crowley": /\bCrowley\b/i,
  "francesca-hong": /\bHong\b/i,
  "kelda-roys": /\b(Roys|Royce|Royse)\b/i,
};

const participation = {};
for (const b of anchored) {
  const inBlock = turns.filter((t) => t.start >= b.start && t.start < b.end);
  const mods = inBlock.filter((t) => t.role === "moderator");
  const notAsked = [];
  const namedButSilent = [];
  for (const slugId of CANDIDATES) {
    if (inBlock.some((t) => t.personSlug === slugId)) continue; // they spoke
    const named = mods.some((t) => SURNAME[slugId]?.test(t.text));
    (named ? namedButSilent : notAsked).push(slugId);
  }
  participation[b.id] = { notAsked, namedButSilent };
}

// ── PER-CANDIDATE, PER-TOPIC TONE ───────────────────────────────────────────
// Presented as tone on an issue, never aggregated into a per-candidate score:
// "who sounded most negative overall" is a verdict, and this project does not
// render verdicts.
const tone = {};
for (const b of anchored) {
  tone[b.id] = {};
  for (const slugId of CANDIDATES) {
    const said = turns.filter(
      (t) => t.personSlug === slugId && t.start >= b.start && t.start < b.end && t.sentimentScore != null,
    );
    if (!said.length) continue;
    const words = said.reduce((s, t) => s + t.wordCount, 0);
    tone[b.id][slugId] = {
      // Weighted by length so a one-line interjection cannot swing the block.
      score: Number(
        (said.reduce((s, t) => s + t.sentimentScore * t.wordCount, 0) / words).toFixed(3),
      ),
      words,
      turns: said.length,
    };
  }
}

const out = {
  slug,
  raceId: "WI-GOV-2026",
  title: "Wisconsin Democratic Primary Debate for Governor",
  venue: "Marquette University, Milwaukee",
  broadcaster: "WISN 12",
  moderators: ["Matt Smith", "Gerron Jordan"],
  candidates: CANDIDATES,
  durationSec: doc.durationSec,
  primaryDate: "2026-08-11",
  generalDate: "2026-11-03",
  method: doc.identification,
  segmentation: doc.segmentation,
  topics: anchored,
  handVotes: HAND_VOTES,
  exchanges,
  participation,
  tone,
};
writeFileSync(join(DIR, `${slug}.structured.json`), JSON.stringify(out, null, 2) + "\n");

console.log(`✓ ${anchored.length} topic blocks, each opened by a verified moderator phrase`);
for (const b of anchored) {
  const m = Math.floor(b.start / 60), s = Math.floor(b.start % 60);
  const ex = exchanges.filter((e) => e.topicId === b.id).length;
  console.log(`   ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}  ${b.label.padEnd(36)} ${ex} exchanges`);
}
const unassigned = exchanges.filter((e) => !e.topicId).length;
console.log(`\n✓ ${exchanges.length} exchanges, ${exchanges.reduce((n, e) => n + e.answers.length, 0)} answers`);
if (unassigned) console.log(`  ${unassigned} exchange(s) fall before the first topic anchor (cold open)`);
console.log(`✓ ${HAND_VOTES.length} hand votes, each with a moderator's spoken readout as evidence`);
console.log(`\n→ transcripts-dg/${slug}.structured.json`);
