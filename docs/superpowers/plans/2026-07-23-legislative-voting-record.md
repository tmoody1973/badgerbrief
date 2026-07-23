# Legislative Voting Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer "how did this candidate vote on X" from the Wisconsin Legislature's official roll calls, in the Voter Help chat and on candidate pages.

**Architecture:** Pure parsers in `convex/lib/` (no network, no Convex ctx, unit-tested against saved HTML fixtures), a `"use node"` action that fetches and calls plain mutations to store, and read paths through an existing public query. This mirrors the established `scoutParse.ts` / `scout.ts` / `scoutQueries.ts` split — a Convex mutation cannot import from a `"use node"` module, so all shared logic lives in `lib/`.

**Tech Stack:** Convex (schema, actions, mutations, crons), TypeScript, Vitest + `convex-test`, Next.js App Router, `@convex-dev/agent`.

**Spec:** `docs/superpowers/specs/2026-07-23-legislative-voting-record-design.md`

## Global Constraints

- **Source is `docs.legis.wisconsin.gov` only.** Never Open States (Wisconsin roll-call coverage is a documented gap) and never LegiScan.
- **`VACANT DISTRICTS: 4` means district number 4 — one seat, not four.** Count the district numbers listed; never sum them. Verified: `sv0260` reads `VACANT DISTRICTS: 4` and totals 22+10+0 = 32 = 33−1.
- **Matching is curated, never fuzzy.** Candidates are tied to roll calls by an exact hand-entered `legislatorName`. A candidate without one shows no votes.
- **A roll call that fails reconciliation is rejected, not stored.** Never store a partial parse.
- **Bill titles differ between chambers for the same bill.** Store the title verbatim from each roll call.
- **Any change to `convex/voterHelp.ts` re-runs `node scripts/eval-gate.mjs`.** Keep new instruction rules to ONE line each — a verbose addition regressed `golden-expectations` 93% → 73% on 2026-07-23; the terse rewrite passed at 100%.
- **Test command is `npx vitest run <file>`.** This repo has no `pnpm test` script; it silently no-ops.
- **`convex/_generated/api.d.ts` is tracked.** Run `npx convex codegen` and commit it whenever a Convex module is added.
- **UI follows `DESIGN.md`:** 2px borders, `shadow-[var(--shadow-brutal)]`, zero radius, semantic tokens only, no `dark:` classes, never nest a card in a card.

---

## File Structure

| File | Responsibility |
|---|---|
| `convex/lib/rollCall.ts` | Pure parsing: HTML → lines, header fields, Assembly rows, Senate groups, date, vacancies, reconciliation |
| `convex/lib/rollCall.test.ts` | Unit tests over saved fixtures |
| `convex/lib/fixtures/wi-assembly-av0083.html` | Real Assembly roll call (AB 388 passage) |
| `convex/lib/fixtures/wi-senate-sv0260.html` | Real Senate roll call (AB 388 concurrence, has a vacancy) |
| `convex/lib/fixtures/wi-senate-sv0050.html` | Real Senate roll call, no vacancy |
| `convex/schema.ts` | `legislative_votes`, `legislator_votes`, `candidates.legislatorName` |
| `convex/votesQueries.ts` | Plain mutations/queries: store a roll call, list ingested keys, read a candidate's record |
| `convex/votes.ts` | `"use node"` action: crawl the session index, fetch, parse, store |
| `convex/votesQueries.test.ts` | convex-test coverage of storage + read paths |
| `convex/crons.ts` | Weekly ingest |
| `convex/voterHelp.ts` | `getVotingRecord` tool + one-line rule |
| `convex/public.ts` | Return the voting record on `getCandidateBySlug` |
| `src/components/guide/voting-record.tsx` | Candidate-page section |
| `src/app/candidates/[slug]/page.tsx` | Render the section, add the nav entry |

---

### Task 1: Save fixtures and parse the roll-call header

**Files:**
- Create: `convex/lib/fixtures/wi-assembly-av0083.html`, `convex/lib/fixtures/wi-senate-sv0260.html`, `convex/lib/fixtures/wi-senate-sv0050.html`
- Create: `convex/lib/rollCall.ts`
- Test: `convex/lib/rollCall.test.ts`

**Interfaces:**
- Produces: `htmlToLines(html: string): string[]`, `parseVoteDate(lines: string[]): string | null`, `parseVacantSeats(lines: string[]): number`, `parseTallies(lines): {ayes,nays,notVoting} | null`, `parseHeader(lines): {billNumber,billTitle,voteType} | null`

- [ ] **Step 1: Download the three fixtures**

```bash
mkdir -p convex/lib/fixtures
curl -sL -A "Mozilla/5.0" -o convex/lib/fixtures/wi-assembly-av0083.html \
  "https://docs.legis.wisconsin.gov/2023/related/votes/assembly/av0083"
curl -sL -A "Mozilla/5.0" -o convex/lib/fixtures/wi-senate-sv0260.html \
  "https://docs.legis.wisconsin.gov/2023/related/votes/senate/sv0260"
curl -sL -A "Mozilla/5.0" -o convex/lib/fixtures/wi-senate-sv0050.html \
  "https://docs.legis.wisconsin.gov/2023/related/votes/senate/sv0050"
```

Expected: three files, each roughly 35-40KB.

- [ ] **Step 2: Write the failing test**

Create `convex/lib/rollCall.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { htmlToLines, parseHeader, parseTallies, parseVacantSeats, parseVoteDate } from "./rollCall";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

const asmLines = htmlToLines(fixture("wi-assembly-av0083.html"));
const senLines = htmlToLines(fixture("wi-senate-sv0260.html"));
const senNoVacancy = htmlToLines(fixture("wi-senate-sv0050.html"));

describe("parseHeader", () => {
  test("reads bill, title and vote type from an Assembly roll call", () => {
    expect(parseHeader(asmLines)).toEqual({
      billNumber: "AB 388",
      billTitle: "CHILD CARE CENTER RENOVATIONS LOAN PROGRAM",
      voteType: "PASSAGE",
    });
  });

  test("reads them from a Senate roll call, where the title differs", () => {
    // Same bill, different title text per chamber — store what each doc says.
    expect(parseHeader(senLines)).toEqual({
      billNumber: "AB 388",
      billTitle: "CHILD CARE CENTER LOAN PROGRAM",
      voteType: "CONCURRENCE",
    });
  });
});

describe("parseTallies", () => {
  test("reads Assembly tallies", () => {
    expect(parseTallies(asmLines)).toEqual({ ayes: 62, nays: 35, notVoting: 2 });
  });

  test("reads Senate tallies", () => {
    expect(parseTallies(senLines)).toEqual({ ayes: 22, nays: 10, notVoting: 0 });
  });
});

describe("parseVacantSeats", () => {
  test("counts listed district NUMBERS, not their values", () => {
    // "VACANT DISTRICTS: 4" = district 4 is vacant = ONE seat.
    // Reading it as four would reject every Senate roll call taken during a vacancy.
    expect(parseVacantSeats(senLines)).toBe(1);
  });

  test("returns 0 for NO VACANT DISTRICTS", () => {
    expect(parseVacantSeats(senNoVacancy)).toBe(0);
    expect(parseVacantSeats(asmLines)).toBe(0);
  });
});

describe("parseVoteDate", () => {
  test("reads the date from the document footer", () => {
    expect(parseVoteDate(asmLines)).toBe("2023-09-14");
    expect(parseVoteDate(senLines)).toBe("2024-02-13");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run convex/lib/rollCall.test.ts`
Expected: FAIL — `Failed to resolve import "./rollCall"`

- [ ] **Step 4: Write the implementation**

Create `convex/lib/rollCall.ts`:

```typescript
/**
 * Pure parsing of Wisconsin Legislature roll-call documents.
 *
 * No network, no Convex ctx — a plain mutation cannot import from a "use node"
 * module, so everything shared between the fetching action and the storing
 * mutation lives here (same split as scoutParse.ts).
 *
 * Source: docs.legis.wisconsin.gov/{session}/related/votes/{chamber}/{av|sv}NNNN
 * Open States is NOT usable for Wisconsin — their own report card notes the
 * state "does not provide stand-alone roll call votes".
 */

export type Chamber = "assembly" | "senate";
export type Position = "aye" | "nay" | "not_voting";

/** Seats per chamber, used by the reconciliation gate. */
export const SEATS: Record<Chamber, number> = { assembly: 99, senate: 33 };

/** Strip tags to a list of non-empty trimmed text lines. */
export function htmlToLines(html: string): string[] {
  return html
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((s) => s.replace(/ /g, " ").trim())
    .filter((s) => s.length > 0);
}

const TALLY_RE = /^AYES\s*-\s*(\d+)/i;

/** Index of the line carrying the AYES tally — the boundary between header and rows. */
function talliesIndex(lines: string[]): number {
  return lines.findIndex((l) => TALLY_RE.test(l));
}

export function parseTallies(
  lines: string[],
): { ayes: number; nays: number; notVoting: number } | null {
  const i = talliesIndex(lines);
  if (i === -1) return null;
  // Assembly puts all three on one line; the Senate splits them across lines.
  const joined = lines.slice(i, i + 6).join(" ");
  const num = (label: string) => {
    const m = joined.match(new RegExp(`${label}\\s*-\\s*(\\d+)`, "i"));
    return m ? Number(m[1]) : null;
  };
  const ayes = num("AYES");
  const nays = num("NAYS");
  const notVoting = num("NOT VOTING");
  if (ayes === null || nays === null || notVoting === null) return null;
  return { ayes, nays, notVoting };
}

/**
 * Bill number, title and vote type, taken from the lines above the tally.
 * The last all-caps line before the tally is the vote type (PASSAGE,
 * CONCURRENCE, ADOPTION); the line before it is the title.
 */
export function parseHeader(
  lines: string[],
): { billNumber: string; billTitle: string; voteType: string } | null {
  const end = talliesIndex(lines);
  if (end === -1) return null;
  const head = lines.slice(0, end);
  const billIdx = head.findIndex((l) => /^[AS]B\s+\d+$/.test(l));
  if (billIdx === -1) return null;
  const after = head.slice(billIdx + 1).filter((l) => !/^BY\s/i.test(l));
  if (after.length < 2) return null;
  return {
    billNumber: head[billIdx],
    billTitle: after[after.length - 2],
    voteType: after[after.length - 1],
  };
}

/**
 * How many seats are vacant.
 *
 * "VACANT DISTRICTS: 4" names district number 4 — ONE seat, not four.
 * Verified: sv0260 says "VACANT DISTRICTS: 4" and totals 22+10+0 = 32 = 33-1,
 * while sv0050 says "NO VACANT DISTRICTS" and totals exactly 33. Reading the
 * number as a count rejects every Senate roll call taken during a vacancy.
 */
export function parseVacantSeats(lines: string[]): number {
  const line = lines.find((l) => /VACANT\s+DISTRICTS?/i.test(l));
  if (!line || /NO\s+VACANT/i.test(line)) return 0;
  const after = line.split(":")[1] ?? "";
  return (after.match(/\d+/g) ?? []).length;
}

const MONTHS: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

/** "Thursday, September 14, 2023" -> "2023-09-14". */
export function parseVoteDate(lines: string[]): string | null {
  for (const l of lines) {
    const m = l.match(/^[A-Za-z]+day,\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
    if (!m) continue;
    const month = MONTHS[m[1]];
    if (!month) continue;
    return `${m[3]}-${String(month).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
  }
  return null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run convex/lib/rollCall.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 6: Commit**

```bash
git add convex/lib/rollCall.ts convex/lib/rollCall.test.ts convex/lib/fixtures/wi-*.html
git commit -m "feat(votes): parse Wisconsin roll-call headers, tallies and dates

VACANT DISTRICTS: 4 names district number 4 — one seat, not four. Verified
against sv0260 (totals 32 = 33-1) and sv0050 (NO VACANT DISTRICTS, totals 33).
Counting the value instead of the listed numbers would reject every Senate roll
call taken during a vacancy."
```

---

### Task 2: Parse Assembly member rows

**Files:**
- Modify: `convex/lib/rollCall.ts`
- Test: `convex/lib/rollCall.test.ts`

**Interfaces:**
- Consumes: `htmlToLines`, `talliesIndex` behaviour from Task 1
- Produces: `type MemberVote = { name: string; party?: string; position: Position }`, `parseAssemblyVotes(lines: string[]): MemberVote[]`

- [ ] **Step 1: Write the failing test**

Append to `convex/lib/rollCall.test.ts`:

```typescript
import { parseAssemblyVotes } from "./rollCall";

describe("parseAssemblyVotes", () => {
  const votes = parseAssemblyVotes(asmLines);

  test("returns one row per seat", () => {
    expect(votes).toHaveLength(99);
  });

  test("reads a named member's position and party", () => {
    expect(votes.find((v) => v.name === "HONG")).toEqual({
      name: "HONG",
      party: "D",
      position: "nay",
    });
    expect(votes.find((v) => v.name === "ALLEN")).toEqual({
      name: "ALLEN",
      party: "R",
      position: "aye",
    });
  });

  test("keeps the first initial that disambiguates a shared surname", () => {
    // ANDERSON, C and ANDERSON, J are different people in the same chamber.
    const andersons = votes.filter((v) => v.name.startsWith("ANDERSON"));
    expect(andersons.map((v) => v.name).sort()).toEqual(["ANDERSON, C", "ANDERSON, J"]);
  });

  test("positions sum to the document's own tallies", () => {
    const count = (p: string) => votes.filter((v) => v.position === p).length;
    expect(count("aye")).toBe(62);
    expect(count("nay")).toBe(35);
    expect(count("not_voting")).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/rollCall.test.ts`
Expected: FAIL — `parseAssemblyVotes is not a function`

- [ ] **Step 3: Write the implementation**

Add to `convex/lib/rollCall.ts`:

```typescript
export type MemberVote = { name: string; party?: string; position: Position };

const POSITION_BY_MARK: Record<string, Position> = {
  Y: "aye",
  N: "nay",
  NV: "not_voting",
};

/** A member name cell: surname, optionally with a disambiguating first initial. */
const NAME_RE = /^[A-Z][A-Z'’.\- ]*(?:,\s?[A-Z])?$/;

/**
 * Assembly roll calls are a table: a Y/N/NV mark in one of three columns,
 * then the member name, then the party.
 *
 * The Speaker is listed as the literal string "SPEAKER" rather than by surname,
 * so a Speaker's own vote cannot be attributed by name. No tracked candidate
 * has held the office; if that changes, map their slug to "SPEAKER" for the
 * sessions they presided.
 */
export function parseAssemblyVotes(lines: string[]): MemberVote[] {
  const start = lines.findIndex((l) => TALLY_RE.test(l));
  if (start === -1) return [];
  const out: MemberVote[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const name = lines[i];
    const party = lines[i + 1];
    if (!NAME_RE.test(name) || !["R", "D", "I"].includes(party)) continue;
    // The mark sits in one of the up-to-three cells before the name.
    const mark = lines
      .slice(Math.max(0, i - 3), i)
      .reverse()
      .find((c) => c in POSITION_BY_MARK);
    if (!mark) continue;
    out.push({ name, party, position: POSITION_BY_MARK[mark] });
    i++; // party line consumed
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/rollCall.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add convex/lib/rollCall.ts convex/lib/rollCall.test.ts
git commit -m "feat(votes): parse Assembly member rows

99 rows reconciling to the document's 62/35/2 tallies. Keeps the first initial
on shared surnames — ANDERSON, C and ANDERSON, J are different people voting on
the same bill, and wrong-person attribution on a voting record is a
defamation-shaped error."
```

---

### Task 3: Parse Senate groups and reconcile

**Files:**
- Modify: `convex/lib/rollCall.ts`
- Test: `convex/lib/rollCall.test.ts`

**Interfaces:**
- Consumes: `MemberVote`, `SEATS`, `parseTallies`, `parseVacantSeats` from Tasks 1-2
- Produces: `parseSenateVotes(lines: string[]): MemberVote[]`, `type RollCall`, `parseRollCall(html, {session, chamber, voteId}): RollCall | { error: string }`

- [ ] **Step 1: Write the failing test**

Append to `convex/lib/rollCall.test.ts`:

```typescript
import { parseRollCall, parseSenateVotes } from "./rollCall";

describe("parseSenateVotes", () => {
  const votes = parseSenateVotes(senLines);

  test("returns every member who voted, grouped under the tally headers", () => {
    // 33 seats minus one vacancy.
    expect(votes).toHaveLength(32);
  });

  test("reads a named senator's position", () => {
    expect(votes.find((v) => v.name === "ROYS")).toEqual({
      name: "ROYS",
      position: "nay",
    });
    expect(votes.find((v) => v.name === "BALLWEG")).toEqual({
      name: "BALLWEG",
      position: "aye",
    });
  });

  test("carries no party — the Senate document does not print one", () => {
    expect(votes.every((v) => v.party === undefined)).toBe(true);
  });
});

describe("parseRollCall", () => {
  test("parses a complete Assembly roll call", () => {
    const rc = parseRollCall(fixture("wi-assembly-av0083.html"), {
      session: "2023",
      chamber: "assembly",
      voteId: "av0083",
    });
    expect("error" in rc).toBe(false);
    if ("error" in rc) return;
    expect(rc.billNumber).toBe("AB 388");
    expect(rc.voteType).toBe("PASSAGE");
    expect(rc.votedOn).toBe("2023-09-14");
    expect(rc.votes).toHaveLength(99);
    expect(rc.sourceUrl).toBe(
      "https://docs.legis.wisconsin.gov/2023/related/votes/assembly/av0083",
    );
  });

  test("parses a Senate roll call taken during a vacancy", () => {
    const rc = parseRollCall(fixture("wi-senate-sv0260.html"), {
      session: "2023",
      chamber: "senate",
      voteId: "sv0260",
    });
    expect("error" in rc).toBe(false);
    if ("error" in rc) return;
    expect(rc.voteType).toBe("CONCURRENCE");
    expect(rc.vacantSeats).toBe(1);
    expect(rc.votes).toHaveLength(32);
  });

  test("REJECTS a roll call whose rows do not match its own tallies", () => {
    // Drop one member row; the parse must fail rather than store 98 of 99.
    const broken = fixture("wi-assembly-av0083.html").replace(">HONG<", "><");
    const rc = parseRollCall(broken, {
      session: "2023",
      chamber: "assembly",
      voteId: "av0083",
    });
    expect("error" in rc).toBe(true);
  });

  test("rejects a document with no tallies at all", () => {
    const rc = parseRollCall("<html><body>Not a roll call</body></html>", {
      session: "2023",
      chamber: "assembly",
      voteId: "av9999",
    });
    expect("error" in rc).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/rollCall.test.ts`
Expected: FAIL — `parseSenateVotes is not a function`

- [ ] **Step 3: Write the implementation**

Add to `convex/lib/rollCall.ts`:

```typescript
const GROUP_HEADERS: { re: RegExp; position: Position }[] = [
  { re: /^AYES\s*-\s*\d+/i, position: "aye" },
  { re: /^NAYS\s*-\s*\d+/i, position: "nay" },
  { re: /^NOT VOTING\s*-\s*\d+/i, position: "not_voting" },
];

/** Lines that follow the name groups and must not be read as members. */
const SENATE_STOP = /^(VACANT|NO VACANT|PRESIDING|SEQUENCE NO|PAIRED)/i;

/**
 * Senate roll calls list names in groups under each tally header — no vote
 * column and no party, unlike the Assembly. Entirely different markup for the
 * same data, which is why there are two parsers.
 */
export function parseSenateVotes(lines: string[]): MemberVote[] {
  const out: MemberVote[] = [];
  let position: Position | null = null;
  for (const line of lines) {
    const header = GROUP_HEADERS.find((h) => h.re.test(line));
    if (header) {
      position = header.position;
      continue;
    }
    if (position === null) continue;
    if (SENATE_STOP.test(line)) break;
    if (NAME_RE.test(line)) out.push({ name: line, position });
  }
  return out;
}

export type RollCall = {
  voteKey: string;
  session: string;
  chamber: Chamber;
  voteId: string;
  billNumber: string;
  billTitle: string;
  voteType: string;
  votedOn: string;
  ayes: number;
  nays: number;
  notVoting: number;
  vacantSeats: number;
  sourceUrl: string;
  votes: MemberVote[];
};

export const rollCallUrl = (session: string, chamber: Chamber, voteId: string) =>
  `https://docs.legis.wisconsin.gov/${session}/related/votes/${chamber}/${voteId}`;

/**
 * Parse and RECONCILE. A roll call is only returned when the parsed rows agree
 * with the document's own numbers — parsed positions must equal the printed
 * tallies, and rows plus vacant seats must equal the chamber's seat count.
 *
 * Anything else returns { error } and the caller must not store it. The failure
 * mode this guards is a parser silently mis-reading a page, which no amount of
 * human review of the output would catch.
 */
export function parseRollCall(
  html: string,
  ref: { session: string; chamber: Chamber; voteId: string },
): RollCall | { error: string } {
  const lines = htmlToLines(html);
  const tallies = parseTallies(lines);
  if (!tallies) return { error: "no AYES/NAYS/NOT VOTING tallies found" };
  const header = parseHeader(lines);
  if (!header) return { error: "no bill number / title / vote type found" };
  const votedOn = parseVoteDate(lines);
  if (!votedOn) return { error: "no vote date found" };

  const vacantSeats = parseVacantSeats(lines);
  const votes =
    ref.chamber === "assembly" ? parseAssemblyVotes(lines) : parseSenateVotes(lines);

  const count = (p: Position) => votes.filter((v) => v.position === p).length;
  if (
    count("aye") !== tallies.ayes ||
    count("nay") !== tallies.nays ||
    count("not_voting") !== tallies.notVoting
  ) {
    return {
      error:
        `parsed ${count("aye")}/${count("nay")}/${count("not_voting")} does not match ` +
        `printed ${tallies.ayes}/${tallies.nays}/${tallies.notVoting}`,
    };
  }
  if (votes.length + vacantSeats !== SEATS[ref.chamber]) {
    return {
      error: `${votes.length} rows + ${vacantSeats} vacant != ${SEATS[ref.chamber]} seats`,
    };
  }

  return {
    voteKey: `${ref.session}-${ref.chamber}-${ref.voteId}`,
    session: ref.session,
    chamber: ref.chamber,
    voteId: ref.voteId,
    ...header,
    votedOn,
    ...tallies,
    vacantSeats,
    sourceUrl: rollCallUrl(ref.session, ref.chamber, ref.voteId),
    votes,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/rollCall.test.ts`
Expected: PASS, 18 tests

- [ ] **Step 5: Commit**

```bash
git add convex/lib/rollCall.ts convex/lib/rollCall.test.ts
git commit -m "feat(votes): Senate parser and the reconciliation gate

The Senate lists names grouped under tally headers with no vote column and no
party — same data as the Assembly, unrelated markup, so two parsers.

parseRollCall only returns a result when the parsed rows agree with the
document's own numbers: positions must equal the printed tallies, and rows plus
vacant seats must equal the chamber's seat count. This is the gate that replaces
human review — a roll call is a deterministic parse with no model judgment, so
the real risk is a parser silently mis-reading a page, which reviewing the
output would never catch."
```

---

### Task 4: Session index parser

**Files:**
- Modify: `convex/lib/rollCall.ts`
- Test: `convex/lib/rollCall.test.ts`

**Interfaces:**
- Produces: `parseVoteIndex(html: string, chamber: Chamber): string[]` returning sorted unique vote ids

- [ ] **Step 1: Write the failing test**

Append to `convex/lib/rollCall.test.ts`:

```typescript
import { parseVoteIndex } from "./rollCall";

describe("parseVoteIndex", () => {
  test("extracts unique, sorted vote ids for the chamber", () => {
    const html = `
      <a href="/2023/related/votes/assembly/av0083">Assembly Vote 83</a>
      <a href="/2023/related/votes/assembly/av0001">Assembly Vote 1</a>
      <a href="/2023/related/votes/assembly/av0083">dup</a>
      <a href="/2023/related/votes/senate/sv0260">Senate Vote 260</a>`;
    expect(parseVoteIndex(html, "assembly")).toEqual(["av0001", "av0083"]);
  });

  test("ignores the other chamber", () => {
    const html = `<a href="/2023/related/votes/senate/sv0260">x</a>`;
    expect(parseVoteIndex(html, "assembly")).toEqual([]);
    expect(parseVoteIndex(html, "senate")).toEqual(["sv0260"]);
  });

  test("returns an empty list rather than throwing on junk", () => {
    expect(parseVoteIndex("", "assembly")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/rollCall.test.ts`
Expected: FAIL — `parseVoteIndex is not a function`

- [ ] **Step 3: Write the implementation**

Add to `convex/lib/rollCall.ts`:

```typescript
export const voteIndexUrl = (session: string, chamber: Chamber) =>
  `https://docs.legis.wisconsin.gov/${session}/related/votes/${chamber}`;

/**
 * Vote ids linked from a session index page. Verified volume: 233 Assembly
 * roll calls in 2023 and 302 in 2025, so a full crawl is ~1,000 documents
 * across both chambers and sessions.
 */
export function parseVoteIndex(html: string, chamber: Chamber): string[] {
  const prefix = chamber === "assembly" ? "av" : "sv";
  const re = new RegExp(`/votes/${chamber}/(${prefix}\\d{4})`, "g");
  const ids = new Set<string>();
  for (const m of html.matchAll(re)) ids.add(m[1]);
  return [...ids].sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/rollCall.test.ts`
Expected: PASS, 21 tests

- [ ] **Step 5: Commit**

```bash
git add convex/lib/rollCall.ts convex/lib/rollCall.test.ts
git commit -m "feat(votes): parse the session vote index"
```

---

### Task 5: Schema and storage

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/votesQueries.ts`
- Test: `convex/votesQueries.test.ts`

**Interfaces:**
- Consumes: `RollCall` from Task 3
- Produces: `internal.votesQueries.storeRollCall({ rollCall })`, `internal.votesQueries.ingestedKeys({ session, chamber })`

- [ ] **Step 1: Add the tables**

In `convex/schema.ts`, add inside `defineSchema({ ... })`:

```typescript
  // ---------- legislative voting records ----------
  legislative_votes: defineTable({
    voteKey: v.string(), // "2023-assembly-av0083" — natural key
    session: v.string(),
    chamber: v.union(v.literal("assembly"), v.literal("senate")),
    voteId: v.string(),
    billNumber: v.string(),
    // Verbatim from THIS roll call. The same bill carries different titles in
    // each chamber, so there is no canonical per-bill title.
    billTitle: v.string(),
    voteType: v.string(), // PASSAGE, CONCURRENCE, ADOPTION — verbatim, never paraphrased
    votedOn: v.string(), // YYYY-MM-DD
    ayes: v.number(),
    nays: v.number(),
    notVoting: v.number(),
    sourceUrl: v.string(),
    ingestedAt: v.number(),
  })
    .index("by_voteKey", ["voteKey"])
    .index("by_session_chamber", ["session", "chamber"])
    .index("by_bill", ["billNumber"]),

  // Only legislators we track. ~1,000 roll calls stay a few thousand rows
  // instead of ~100,000.
  legislator_votes: defineTable({
    voteKey: v.string(),
    candidateSlug: v.string(),
    position: v.union(v.literal("aye"), v.literal("nay"), v.literal("not_voting")),
  })
    .index("by_candidate", ["candidateSlug"])
    .index("by_vote", ["voteKey"]),
```

And add to the existing `candidates` table definition, after `fecCandidateId`:

```typescript
    // Exact surname as printed on roll calls ("HONG", "ANDERSON, C"), with the
    // chamber and sessions served. Hand-entered: matching is never fuzzy,
    // because two members can share a surname on the same vote.
    legislatorName: v.optional(
      v.object({
        name: v.string(),
        chamber: v.union(v.literal("assembly"), v.literal("senate")),
        sessions: v.array(v.string()),
      }),
    ),
```

- [ ] **Step 2: Write the failing test**

Create `convex/votesQueries.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

const ROLL_CALL = {
  voteKey: "2023-assembly-av0083",
  session: "2023",
  chamber: "assembly" as const,
  voteId: "av0083",
  billNumber: "AB 388",
  billTitle: "CHILD CARE CENTER RENOVATIONS LOAN PROGRAM",
  voteType: "PASSAGE",
  votedOn: "2023-09-14",
  ayes: 62,
  nays: 35,
  notVoting: 2,
  vacantSeats: 0,
  sourceUrl: "https://docs.legis.wisconsin.gov/2023/related/votes/assembly/av0083",
  votes: [
    { name: "HONG", party: "D", position: "nay" as const },
    { name: "ALLEN", party: "R", position: "aye" as const },
  ],
};

async function seedCandidate(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("candidates", {
      slug: "francesca-hong",
      raceId: "WI-GOV-2026",
      name: "Francesca Hong",
      sources: [],
      dataAsOf: "2026-07-23",
      legislatorName: { name: "HONG", chamber: "assembly", sessions: ["2023"] },
    });
  });
}

describe("storeRollCall", () => {
  test("stores the roll call and only tracked legislators' positions", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });

    await t.run(async (ctx) => {
      const votes = await ctx.db.query("legislative_votes").collect();
      expect(votes).toHaveLength(1);
      expect(votes[0].billNumber).toBe("AB 388");

      // ALLEN is not a tracked candidate, so no row for him.
      const positions = await ctx.db.query("legislator_votes").collect();
      expect(positions).toHaveLength(1);
      expect(positions[0]).toMatchObject({
        candidateSlug: "francesca-hong",
        position: "nay",
      });
    });
  });

  test("re-ingesting the same roll call does not duplicate", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("legislative_votes").collect()).toHaveLength(1);
      expect(await ctx.db.query("legislator_votes").collect()).toHaveLength(1);
    });
  });

  test("a candidate whose session does not match gets no row", async () => {
    // Hong's mapping covers 2023 only; a 2025 vote must not attach to her.
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, {
      rollCall: { ...ROLL_CALL, voteKey: "2025-assembly-av0001", session: "2025", voteId: "av0001" },
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("legislator_votes").collect()).toHaveLength(0);
    });
  });

  test("a candidate with no legislatorName is never matched", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("candidates", {
        slug: "someone-else",
        raceId: "WI-GOV-2026",
        name: "Someone Else",
        sources: [],
        dataAsOf: "2026-07-23",
      });
    });
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("legislator_votes").collect()).toHaveLength(0);
    });
  });
});

describe("ingestedKeys", () => {
  test("reports which vote ids are already stored", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    const keys = await t.query(internal.votesQueries.ingestedKeys, {
      session: "2023",
      chamber: "assembly",
    });
    expect(keys).toEqual(["av0083"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx convex codegen && npx vitest run convex/votesQueries.test.ts`
Expected: FAIL — `internal.votesQueries` is undefined

- [ ] **Step 4: Write the implementation**

Create `convex/votesQueries.ts`:

```typescript
/**
 * Storage for legislative roll calls. Plain mutations/queries only — the
 * fetching action lives in convex/votes.ts and is "use node", which a mutation
 * cannot import from (same split as scout.ts / scoutQueries.ts).
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const positionValidator = v.union(
  v.literal("aye"),
  v.literal("nay"),
  v.literal("not_voting"),
);

const chamberValidator = v.union(v.literal("assembly"), v.literal("senate"));

export const storeRollCall = internalMutation({
  args: {
    rollCall: v.object({
      voteKey: v.string(),
      session: v.string(),
      chamber: chamberValidator,
      voteId: v.string(),
      billNumber: v.string(),
      billTitle: v.string(),
      voteType: v.string(),
      votedOn: v.string(),
      ayes: v.number(),
      nays: v.number(),
      notVoting: v.number(),
      vacantSeats: v.number(),
      sourceUrl: v.string(),
      votes: v.array(
        v.object({
          name: v.string(),
          party: v.optional(v.string()),
          position: positionValidator,
        }),
      ),
    }),
  },
  handler: async (ctx, { rollCall }): Promise<{ stored: boolean; matched: number }> => {
    const existing = await ctx.db
      .query("legislative_votes")
      .withIndex("by_voteKey", (q) => q.eq("voteKey", rollCall.voteKey))
      .unique();
    if (existing) return { stored: false, matched: 0 };

    await ctx.db.insert("legislative_votes", {
      voteKey: rollCall.voteKey,
      session: rollCall.session,
      chamber: rollCall.chamber,
      voteId: rollCall.voteId,
      billNumber: rollCall.billNumber,
      billTitle: rollCall.billTitle,
      voteType: rollCall.voteType,
      votedOn: rollCall.votedOn,
      ayes: rollCall.ayes,
      nays: rollCall.nays,
      notVoting: rollCall.notVoting,
      sourceUrl: rollCall.sourceUrl,
      ingestedAt: Date.now(),
    });

    // Only legislators we track, matched on an exact hand-entered name for the
    // right chamber and session. No fuzzy matching: two members can share a
    // surname on the same vote.
    const candidates = await ctx.db.query("candidates").collect();
    let matched = 0;
    for (const c of candidates) {
      const mapping = c.legislatorName;
      if (!mapping) continue;
      if (mapping.chamber !== rollCall.chamber) continue;
      if (!mapping.sessions.includes(rollCall.session)) continue;
      const row = rollCall.votes.find((x) => x.name === mapping.name);
      if (!row) continue;
      await ctx.db.insert("legislator_votes", {
        voteKey: rollCall.voteKey,
        candidateSlug: c.slug,
        position: row.position,
      });
      matched++;
    }
    return { stored: true, matched };
  },
});

export const ingestedKeys = internalQuery({
  args: { session: v.string(), chamber: chamberValidator },
  handler: async (ctx, { session, chamber }): Promise<string[]> => {
    const rows = await ctx.db
      .query("legislative_votes")
      .withIndex("by_session_chamber", (q) =>
        q.eq("session", session).eq("chamber", chamber),
      )
      .collect();
    return rows.map((r) => r.voteId).sort();
  },
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run convex/votesQueries.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
npx convex codegen
git add convex/schema.ts convex/votesQueries.ts convex/votesQueries.test.ts convex/_generated/api.d.ts
git commit -m "feat(votes): schema and storage for roll calls

Stores every roll call but only the positions of legislators we track, which
keeps ~1,000 roll calls to a few thousand rows rather than ~100,000. Full
tallies live on the parent row so an answer can say 'passed 62-35, Hong voted
no' without storing all 99 members.

Matching requires an exact hand-entered legislatorName plus a chamber and
session match. A candidate without one is never matched — a visible gap beats a
silent wrong-person attribution."
```

---

### Task 6: Ingest action and cron

**Files:**
- Create: `convex/votes.ts`
- Modify: `convex/crons.ts`

**Interfaces:**
- Consumes: `parseVoteIndex`, `parseRollCall`, `voteIndexUrl`, `rollCallUrl` (Tasks 3-4); `internal.votesQueries.storeRollCall`, `internal.votesQueries.ingestedKeys` (Task 5)
- Produces: `internal.votes.ingest({ sessions?, chambers?, limit? })`

- [ ] **Step 1: Write the action**

Create `convex/votes.ts`:

```typescript
"use node";
/**
 * Crawl the Wisconsin Legislature's roll-call documents.
 *
 * Source is docs.legis.wisconsin.gov only. Open States cannot serve this —
 * their own report card grades Wisconsin a "D" and notes the state "does not
 * provide stand-alone roll call votes".
 *
 * Verified volume: 233 Assembly roll calls in 2023, 302 in 2025. Roughly 1,000
 * documents across both chambers and sessions, so a weekly full pass is fine.
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  parseRollCall,
  parseVoteIndex,
  rollCallUrl,
  voteIndexUrl,
  type Chamber,
} from "./lib/rollCall";

const SESSIONS = ["2023", "2025"];
const CHAMBERS: Chamber[] = ["assembly", "senate"];
const UA = "BadgerBrief/1.0 (nonpartisan voter guide; +https://badgerbrief.org)";

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  return await res.text();
}

export const ingest = internalAction({
  args: {
    sessions: v.optional(v.array(v.string())),
    chambers: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ stored: number; skipped: number; rejected: number }> => {
    const sessions = args.sessions ?? SESSIONS;
    const chambers = (args.chambers as Chamber[] | undefined) ?? CHAMBERS;
    let stored = 0;
    let skipped = 0;
    let rejected = 0;

    for (const session of sessions) {
      for (const chamber of chambers) {
        const indexHtml = await fetchText(voteIndexUrl(session, chamber));
        if (!indexHtml) {
          console.warn(`vote index unavailable: ${session} ${chamber}`);
          continue;
        }
        const ids = parseVoteIndex(indexHtml, chamber);
        const done = new Set(
          await ctx.runQuery(internal.votesQueries.ingestedKeys, { session, chamber }),
        );
        const todo = ids.filter((id) => !done.has(id)).slice(0, args.limit ?? 10_000);
        skipped += ids.length - todo.length;

        for (const voteId of todo) {
          const html = await fetchText(rollCallUrl(session, chamber, voteId));
          if (!html) {
            rejected++;
            continue;
          }
          const parsed = parseRollCall(html, { session, chamber, voteId });
          if ("error" in parsed) {
            // Rejected, never stored. A partial parse must not enter the
            // database — that is the failure mode reviewing output can't catch.
            console.warn(`reject ${session}/${chamber}/${voteId}: ${parsed.error}`);
            rejected++;
            continue;
          }
          const res = await ctx.runMutation(internal.votesQueries.storeRollCall, {
            rollCall: parsed,
          });
          if (res.stored) stored++;
        }
      }
    }
    return { stored, skipped, rejected };
  },
});
```

- [ ] **Step 2: Register the cron**

In `convex/crons.ts`, add before `export default crons;`:

```typescript
// Sundays 12:00 UTC — the Legislature posts roll calls within a day or two of a
// floor session, and already-ingested vote ids are skipped, so a weekly full
// pass costs one index fetch per chamber when nothing is new.
crons.weekly(
  "ingest legislative roll calls",
  { dayOfWeek: "sunday", hourUTC: 12, minuteUTC: 0 },
  internal.votes.ingest,
  {},
);
```

- [ ] **Step 3: Typecheck and deploy to dev**

```bash
npx convex codegen && npx tsc --noEmit && npx convex dev --once
```

Expected: no type errors, `Convex functions ready!`

- [ ] **Step 4: Ingest a small real sample and verify it reconciles**

```bash
npx convex run votes:ingest '{"sessions":["2023"],"chambers":["assembly"],"limit":5}'
```

Expected: `{ "stored": 5, "skipped": 0, "rejected": 0 }`. A non-zero `rejected` means the parser disagrees with a real document — investigate before continuing, do not proceed.

- [ ] **Step 5: Commit**

```bash
git add convex/votes.ts convex/crons.ts convex/_generated/api.d.ts
git commit -m "feat(votes): crawl and ingest Wisconsin roll calls weekly

Skips vote ids already stored, so the weekly pass costs one index fetch per
chamber when nothing is new. A document that fails reconciliation is logged and
rejected, never stored."
```

---

### Task 7: Map verified legislators and backfill

> Seeds only Hong and Roys — the two surnames verified against real roll calls during
> design. The other six (Barnes, Crowley, Taylor, Zamarripa, Hulsey, Rodriguez) each need
> their printed surname confirmed against a document from a session they served, and
> several served before 2023 and so fall outside the ingested range. Adding an unverified
> name is the one thing this design must not do.

**Files:**
- Create: `scripts/seed-legislator-names.mjs`

**Interfaces:**
- Consumes: `candidates.legislatorName` (Task 5), `internal.votes.ingest` (Task 6)

- [ ] **Step 1: Verify each name against a real roll call before entering it**

For each candidate below, open a roll call from a session they served and confirm the exact printed surname. Do not skip this — the whole matching design rests on these strings being right.

```bash
# Assembly 2023, prints surnames with party
curl -sL -A "Mozilla/5.0" "https://docs.legis.wisconsin.gov/2023/related/votes/assembly/av0083" \
  | sed 's/<[^>]*>/\n/g' | grep -E "^(HONG|ANDERSON|SNODGRASS)" 
# Senate 2023, prints surnames grouped under tallies
curl -sL -A "Mozilla/5.0" "https://docs.legis.wisconsin.gov/2023/related/votes/senate/sv0260" \
  | sed 's/<[^>]*>/\n/g' | grep -E "^(ROYS|AGARD|SPREITZER)"
```

Expected: `HONG` appears in the Assembly document, `ROYS` in the Senate document.

- [ ] **Step 2: Write the seeding script**

Create `scripts/seed-legislator-names.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Attach legislatorName to tracked candidates who served in the Legislature.
 *
 * Hand-verified against real roll calls — matching is never fuzzy, because two
 * members can share a surname on the same vote (ANDERSON, C and ANDERSON, J).
 * A candidate omitted here simply shows no voting record.
 *
 * Sessions are those covered by our ingest (2023, 2025). A legislator who
 * served earlier has votes we do not have; the UI says which sessions it covers.
 *
 * Usage: node scripts/seed-legislator-names.mjs [--prod]
 */
import { execFileSync } from "node:child_process";

const prod = process.argv.includes("--prod");
const IDENTITY = JSON.stringify({ metadata: { role: "admin" } });

// VERIFY each surname against a roll call from that chamber before adding a row.
const MAPPINGS = [
  { slug: "francesca-hong", name: "HONG", chamber: "assembly", sessions: ["2023", "2025"] },
  { slug: "kelda-roys", name: "ROYS", chamber: "senate", sessions: ["2023", "2025"] },
];

for (const m of MAPPINGS) {
  const args = ["convex", "run"];
  if (prod) args.push("--prod");
  args.push("votesQueries:setLegislatorName", JSON.stringify(m), "--identity", IDENTITY);
  console.log(m.slug, execFileSync("npx", args, { encoding: "utf8" }).trim());
}
```

- [ ] **Step 3: Add the admin mutation the script calls**

Append to `convex/votesQueries.ts`:

```typescript
import { mutation } from "./_generated/server";
import { requireAdmin } from "./sponsors";

/** Attach a hand-verified roll-call surname to a candidate. */
export const setLegislatorName = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    chamber: chamberValidator,
    sessions: v.array(v.string()),
  },
  handler: async (ctx, { slug, name, chamber, sessions }) => {
    await requireAdmin(ctx);
    const candidate = await ctx.db
      .query("candidates")
      .withIndex("by_slug_only", (q) => q.eq("slug", slug))
      .first();
    if (!candidate) throw new Error(`no candidate with slug "${slug}"`);
    await ctx.db.patch(candidate._id, { legislatorName: { name, chamber, sessions } });
    return { slug, name };
  },
});
```

- [ ] **Step 4: Seed and backfill in dev**

```bash
npx convex dev --once
node scripts/seed-legislator-names.mjs
npx convex run votes:ingest '{"sessions":["2023"],"chambers":["assembly","senate"]}'
```

Expected: `rejected` is 0. If not, stop and fix the parser.

- [ ] **Step 5: Verify the two known-good facts from the spec**

```bash
npx convex run votesQueries:ingestedKeys '{"session":"2023","chamber":"assembly"}'
```

Then confirm in the Convex dashboard that `legislator_votes` contains a `nay` for `francesca-hong` on `2023-assembly-av0083`, and a `nay` for `kelda-roys` on `2023-senate-sv0260`. These match the official documents linked in the spec.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-legislator-names.mjs convex/votesQueries.ts convex/_generated/api.d.ts
git commit -m "feat(votes): map tracked legislators to their roll-call surnames

Hand-verified against real documents. Hong voted nay on AB 388 passage; Roys
voted nay on the Senate concurrence — both reproduce from ingested data and
match the official roll calls."
```

---

### Task 8: Read path and chat tool

**Files:**
- Modify: `convex/votesQueries.ts`
- Modify: `convex/voterHelp.ts`
- Modify: `scripts/voter-help-golden.json`

**Interfaces:**
- Consumes: `legislative_votes`, `legislator_votes` (Task 5)
- Produces: `api.votesQueries.votingRecord({ candidateSlug, query? })` returning `{ billNumber, billTitle, voteType, votedOn, position, ayes, nays, sourceUrl, otherVotesOnBill }[]`

- [ ] **Step 1: Write the failing test**

Append to `convex/votesQueries.test.ts`:

```typescript
import { api } from "./_generated/api";

describe("votingRecord", () => {
  test("returns the candidate's position with the bill and tally", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    const rows = await t.query(api.votesQueries.votingRecord, {
      candidateSlug: "francesca-hong",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      billNumber: "AB 388",
      billTitle: "CHILD CARE CENTER RENOVATIONS LOAN PROGRAM",
      voteType: "PASSAGE",
      position: "nay",
      ayes: 62,
      nays: 35,
      sourceUrl: "https://docs.legis.wisconsin.gov/2023/related/votes/assembly/av0083",
    });
  });

  test("keyword search matches the official title, case-insensitively", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    expect(
      await t.query(api.votesQueries.votingRecord, {
        candidateSlug: "francesca-hong",
        query: "child care",
      }),
    ).toHaveLength(1);
    expect(
      await t.query(api.votesQueries.votingRecord, {
        candidateSlug: "francesca-hong",
        query: "AB 388",
      }),
    ).toHaveLength(1);
    // No match returns nothing rather than a guess.
    expect(
      await t.query(api.votesQueries.votingRecord, {
        candidateSlug: "francesca-hong",
        query: "transportation budget",
      }),
    ).toHaveLength(0);
  });

  test("passage votes sort ahead of procedural ones on the same bill", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    await t.mutation(internal.votesQueries.storeRollCall, {
      rollCall: {
        ...ROLL_CALL,
        voteKey: "2023-assembly-av0082",
        voteId: "av0082",
        voteType: "TABLE",
        votedOn: "2023-09-14",
      },
    });
    const rows = await t.query(api.votesQueries.votingRecord, {
      candidateSlug: "francesca-hong",
      query: "AB 388",
    });
    expect(rows[0].voteType).toBe("PASSAGE");
    // The reader is told the other recorded vote exists.
    expect(rows[0].otherVotesOnBill).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx convex codegen && npx vitest run convex/votesQueries.test.ts`
Expected: FAIL — `api.votesQueries.votingRecord` is undefined

- [ ] **Step 3: Write the implementation**

Append to `convex/votesQueries.ts`:

```typescript
import { query } from "./_generated/server";

/** Votes that decide a bill, surfaced ahead of procedural ones. */
const FINAL_VOTE_TYPES = ["PASSAGE", "CONCURRENCE", "ADOPTION"];
const isFinal = (voteType: string) =>
  FINAL_VOTE_TYPES.some((t) => voteType.toUpperCase().includes(t));

export const votingRecord = query({
  args: { candidateSlug: v.string(), query: v.optional(v.string()) },
  handler: async (ctx, { candidateSlug, query: search }) => {
    const positions = await ctx.db
      .query("legislator_votes")
      .withIndex("by_candidate", (q) => q.eq("candidateSlug", candidateSlug))
      .collect();
    if (positions.length === 0) return [];

    const rows = [];
    for (const p of positions) {
      const vote = await ctx.db
        .query("legislative_votes")
        .withIndex("by_voteKey", (q) => q.eq("voteKey", p.voteKey))
        .unique();
      if (!vote) continue;
      rows.push({ vote, position: p.position });
    }

    const needle = search?.trim().toLowerCase();
    const matched = needle
      ? rows.filter(
          (r) =>
            r.vote.billTitle.toLowerCase().includes(needle) ||
            r.vote.billNumber.toLowerCase().includes(needle),
        )
      : rows;

    // Count every recorded vote we hold on each bill, so an answer can disclose
    // that procedural votes exist rather than quietly showing one of several.
    const perBill = new Map<string, number>();
    for (const r of rows) {
      perBill.set(r.vote.billNumber, (perBill.get(r.vote.billNumber) ?? 0) + 1);
    }

    return matched
      .sort((a, b) => {
        // Final votes first, then most recent.
        const fa = isFinal(a.vote.voteType) ? 1 : 0;
        const fb = isFinal(b.vote.voteType) ? 1 : 0;
        return fb - fa || b.vote.votedOn.localeCompare(a.vote.votedOn);
      })
      .map((r) => ({
        billNumber: r.vote.billNumber,
        billTitle: r.vote.billTitle,
        voteType: r.vote.voteType,
        votedOn: r.vote.votedOn,
        chamber: r.vote.chamber,
        session: r.vote.session,
        position: r.position,
        ayes: r.vote.ayes,
        nays: r.vote.nays,
        sourceUrl: r.vote.sourceUrl,
        otherVotesOnBill: (perBill.get(r.vote.billNumber) ?? 1) - 1,
      }));
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/votesQueries.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Add the chat tool**

In `convex/voterHelp.ts`, add after the `getCoverage` tool definition:

```typescript
const getVotingRecord = createTool({
  description:
    'How a candidate who serves or served in the Wisconsin Legislature voted. Pass candidateSlug (e.g. "francesca-hong") and an optional query matching a bill number ("AB 388") or words from its official title ("child care"). Returns the deciding vote first, the candidate\'s position, the tally, and the official roll-call link. Wisconsin Legislature only — not Congress. Read-only.',
  inputSchema: z.object({
    candidateSlug: z.string().describe('Candidate slug such as "francesca-hong"'),
    query: z.string().optional().describe('Bill number or words from its official title'),
  }),
  execute: async (ctx, { candidateSlug, query }): Promise<string> =>
    withToolSpan("getVotingRecord", ctx.threadId, { candidateSlug, query }, async () => {
      const rows = await ctx.runQuery(api.votesQueries.votingRecord, {
        candidateSlug,
        ...(query ? { query } : {}),
      });
      if (rows.length === 0) {
        return `No voting record for "${candidateSlug}" matching that. BadgerBrief covers Wisconsin Legislature floor votes from the 2023 and 2025 sessions only — say so plainly rather than guessing, and note we don't cover Congress.`;
      }
      return JSON.stringify(rows.slice(0, 8));
    }),
});
```

Register it in `makeVoterHelpAgent`:

```typescript
    tools: { getVotingInfo, getMyBallot, getRaceInfo, getCandidateInfo, getCoverage, getVotingRecord, handoffOfficialLink },
```

Add ONE line to `INSTRUCTIONS`, after rule 8:

```
9. Voting records are Wisconsin Legislature floor votes only — lead with the deciding vote, name the official bill number and title, and mention when otherVotesOnBill is above zero.
```

- [ ] **Step 6: Add a golden question**

Append to the array in `scripts/voter-help-golden.json`:

```json
{
  "question": "How did Francesca Hong vote on the child care center loan bill?",
  "expectation": "States that Hong voted no on AB 388, names the official bill title, and links the official Wisconsin Legislature roll call. Does not characterize the vote or the bill beyond its official title."
}
```

- [ ] **Step 7: Run the eval gate**

```bash
npx convex dev --once
node scripts/eval-gate.mjs --name voting-record --baseline sonnet-5-tuned
```

Expected: `RESULT: PASS`, `golden-expectations` at or above 90% and no more than 5 points below baseline.

If it fails, shorten rule 9 further rather than expanding it. A verbose rule addition regressed this gate 93% → 73% on 2026-07-23 by diluting attention on the existing voting-logistics rules; the one-line rewrite scored 100%.

- [ ] **Step 8: Commit**

```bash
git add convex/votesQueries.ts convex/votesQueries.test.ts convex/voterHelp.ts scripts/voter-help-golden.json convex/_generated/api.d.ts
git commit -m "feat(chat): getVotingRecord tool over Wisconsin roll calls

Leads with the deciding vote — what people mean by 'voted for the bill' — and
reports how many other recorded votes exist on the same bill, so a procedural
vote is neither hidden nor mistaken for the substantive one. Answers always name
the official bill number and title, so a question asked with a colloquial or
partisan nickname is answered in the record's own vocabulary.

Golden gate re-run and passing."
```

---

### Task 9: Candidate page section

**Files:**
- Modify: `convex/public.ts`
- Create: `src/components/guide/voting-record.tsx`
- Modify: `src/app/candidates/[slug]/page.tsx`

**Interfaces:**
- Consumes: `api.votesQueries.votingRecord` (Task 8)
- Produces: `<VotingRecord votes={...} candidateName={...} />`

- [ ] **Step 1: Return the record from the candidate query**

In `convex/public.ts`, inside `getCandidateBySlug`, add before the `return`:

```typescript
    // Voting record for candidates with a hand-verified roll-call mapping.
    // Everyone else gets an empty array and renders no section.
    const votingRecord = await ctx.runQuery(api.votesQueries.votingRecord, {
      candidateSlug: slug,
    });
```

And add `votingRecord,` to the returned object.

- [ ] **Step 2: Write the component**

Create `src/components/guide/voting-record.tsx`:

```tsx
type VoteRow = {
  billNumber: string;
  billTitle: string;
  voteType: string;
  votedOn: string;
  session: string;
  chamber: string;
  position: "aye" | "nay" | "not_voting";
  ayes: number;
  nays: number;
  sourceUrl: string;
  otherVotesOnBill: number;
};

const POSITION_LABEL: Record<VoteRow["position"], string> = {
  aye: "Voted yes",
  nay: "Voted no",
  not_voting: "Did not vote",
};

const VISIBLE = 5;

/**
 * A legislator's floor votes, newest first.
 *
 * SELECTION IS RECENCY, AND THE PAGE SAYS SO. Ordering by "most important
 * votes" would be an editorial judgment we'd have to defend, and picking which
 * of a legislator's votes matter is exactly the cherry-picking that ingesting
 * the complete record avoids. Recency is a neutral rule we can state.
 *
 * DESIGN.md: one card, never nested — entries are separated by dashed rules.
 */
export function VotingRecord({
  votes,
  candidateName,
}: {
  votes: VoteRow[];
  candidateName: string;
}) {
  if (votes.length === 0) return null;

  const ordered = [...votes].sort((a, b) => b.votedOn.localeCompare(a.votedOn));
  const shown = ordered.slice(0, VISIBLE);
  const folded = ordered.slice(VISIBLE);
  const sessions = [...new Set(ordered.map((v) => v.session))].sort();

  const Entry = ({ v }: { v: VoteRow }) => (
    <li className="px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {v.billNumber} · {v.voteType} · {v.votedOn}
      </p>
      <p className="mt-1 max-w-[62ch] text-sm">{v.billTitle}</p>
      <p className="mt-1 text-sm">
        <span className="font-bold">{POSITION_LABEL[v.position]}</span>
        <span className="text-muted-foreground">
          {" "}
          · passed {v.ayes}&ndash;{v.nays}
          {v.otherVotesOnBill > 0
            ? ` · ${v.otherVotesOnBill} other recorded vote${v.otherVotesOnBill === 1 ? "" : "s"} on this bill`
            : ""}
        </span>
      </p>
      <a
        href={v.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block font-mono text-[11px] uppercase tracking-[0.1em] underline decoration-2 underline-offset-2"
      >
        Official roll call ↗
      </a>
    </li>
  );

  return (
    <section id="votes" className="mt-6 scroll-mt-16">
      <h2 className="font-display text-xl">Voting record</h2>
      <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
        Floor votes {candidateName} cast in the Wisconsin Legislature, most recent first,
        from the {sessions.join(" and ")} session{sessions.length > 1 ? "s" : ""}. Every
        entry links to the official roll call. We don&rsquo;t rate or score votes.
      </p>

      <div className="mt-3 border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
        <div className="border-b-2 border-border bg-secondary/40 px-4 py-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
            Wisconsin Legislature · {votes.length} recorded vote{votes.length === 1 ? "" : "s"}
          </span>
        </div>
        <ol className="divide-y-2 divide-dashed divide-border">
          {shown.map((v) => (
            <Entry key={v.sourceUrl} v={v} />
          ))}
        </ol>
        {folded.length > 0 && (
          <details className="border-t-2 border-dashed border-border">
            <summary className="cursor-pointer px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Show all {ordered.length} votes
            </summary>
            <ol className="divide-y-2 divide-dashed divide-border border-t-2 border-dashed border-border">
              {folded.map((v) => (
                <Entry key={v.sourceUrl} v={v} />
              ))}
            </ol>
          </details>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Render it on the candidate page**

In `src/app/candidates/[slug]/page.tsx`, add the import:

```tsx
import { VotingRecord } from "@/components/guide/voting-record";
```

Destructure `votingRecord` from `data`, add the nav entry after the interview entry:

```tsx
    ...(votingRecord.length > 0
      ? [{ id: "votes", label: "Voting record", count: votingRecord.length }]
      : []),
```

And render it after `<InterviewQuotes ... />`:

```tsx
        <VotingRecord votes={votingRecord} candidateName={candidate.name} />
```

- [ ] **Step 4: Verify in the browser**

```bash
npx convex dev --once && pnpm dev
```

Open `http://localhost:3000/candidates/francesca-hong#votes`. Confirm: the section renders, entries are newest first, the intro names the sessions covered, and "Official roll call" links resolve to `docs.legis.wisconsin.gov`. Then open a candidate with no `legislatorName` (e.g. `/candidates/david-crowley` before he is mapped) and confirm **no section and no nav chip appear**.

- [ ] **Step 5: Typecheck, test, build**

```bash
npx tsc --noEmit && npx vitest run && npx next build
```

Expected: no type errors, all tests pass, build compiles.

- [ ] **Step 6: Commit**

```bash
git add convex/public.ts src/components/guide/voting-record.tsx "src/app/candidates/[slug]/page.tsx" convex/_generated/api.d.ts
git commit -m "feat(candidates): voting record section

Newest first, and the page states that recency is the ordering rule. Selecting
by importance would be an editorial judgment we'd have to defend; ingesting the
complete record and ordering by date means we never chose which votes to show.

Each entry names the bill, the vote type verbatim, the position, the tally, how
many other recorded votes exist on that bill, and links the official roll call.
A candidate with no verified roll-call mapping renders nothing."
```

---

## Self-review

**Spec coverage:** Source and URL patterns → Tasks 1, 4, 6. Two chamber formats → Tasks 2, 3. Data model → Task 5. Curated matching → Tasks 5, 7. Reconciliation gate → Task 3, enforced in Task 6. Chat → Task 8. Candidate page with recency rule → Task 9. Eval gate → Task 8 Step 7. Out-of-scope items are not implemented anywhere, as intended.

**Known limitation carried from exploration:** the Assembly prints the Speaker as the literal string `SPEAKER` rather than a surname, so a Speaker's own vote cannot be attributed by name. No tracked candidate has held the office. Documented in `parseAssemblyVotes`.

**Deferred:** Task 7 seeds only Hong and Roys, the two mappings verified during design. Barnes, Crowley, Taylor, Zamarripa, Hulsey and Rodriguez need their surnames verified against roll calls from the sessions they served, and several served before 2023 — outside the ingested range. Add them to `MAPPINGS` as each is verified.
