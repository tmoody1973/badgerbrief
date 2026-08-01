# Voting record by issue — design spec (v1)

**Date:** 2026-08-01
**Status:** Approved (design); pending implementation plan
**Builds on:** the existing voting-record UX (Phase 1: aggregate summary + per-session accordion, `src/components/guide/voting-record.tsx`), the LRB bill-summary cache (`bills` table, `convex/bills.ts`), and the `candidate_positions_published` issue taxonomy.

---

## Goal

Turn an incumbent's pile of raw roll-call votes (Hong alone has **500**) into a legible, honest picture of **how they voted on the issues** — grouped by the same 11 issues voters already use on `/match`, each vote translated from "AB 245 — Yes" into **"Voted for/against [plain outcome]"**, with the full bill one click away.

### The core transformation
`legislator_votes.position` (aye/nay) + a neutral "what a **YES** vote does" line (from the nonpartisan LRB summary) → **"Voted for / against [outcome]."** Group these by `issueSlug`. That single move is 80% of the clarity.

---

## Locked decisions (from brainstorming)

- **Clarity dial:** *translated votes + factual count.* Per issue: an arithmetic header (`Healthcare · voted for 3, against 1`) over a list of "Voted for/against [outcome]" lines. **No characterization of the member's stance** — no scores, no ratings, no "pro-X." The reader draws the conclusion.
- **Coverage:** *all substantive votes* (final passage / concurrence; procedural motions excluded). Complete counts, so the arithmetic can't be selective. NOT a curated "key votes" set.
- **Taxonomy:** the **11 issues** already in `candidate_positions_published`: `healthcare, education, public-safety, taxes-budget, abortion, housing, immigration, environment-energy, economy-jobs, elections-democracy, agriculture`.
- **Pairing:** where the candidate has a **published position** on an issue, show it next to their votes on that issue — *what they said beside how they voted* — as two plain facts, **with no "matches/contradicts" label**.
- **v1 scope:** **`francesca-hong` and `kelda-roys`** (the Gov-primary candidates who are legislators), on their candidate pages, before the Aug 11 primary. The pipeline is candidate-agnostic and expands to all incumbents afterward. **Verified:** `francesca-hong` has 500 votes (2023+2025 Assembly). **Prerequisite (Task 1 of the plan):** confirm `kelda-roys`'s Senate votes are actually ingested — Senate ingestion status is uncertain and her count was not verified here. If her record is thin/absent, backfill her Senate roll calls first, or ship Hong in v1 and add Roys when her data lands.

---

## Architecture

### Component 1 — data: one new tag per bill

Extend the existing per-bill LRB cache (`bills`, keyed by `session` + `billNumber`) with classification fields (co-located with the summary they're derived from):

```
// added to the bills table
issueSlugs: v.optional(v.array(v.string())),   // 1-2 of the 11 taxonomy slugs
outcome: v.optional(v.string()),                // neutral "a YES vote would […]", ≤ ~12 words
classifyConfidence: v.optional(v.number()),
classifyStatus: v.optional(v.union(
  v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("needs_review"),
)),
classifiedAt: v.optional(v.number()),
```

Everything else is reused unchanged: `legislative_votes` (bill, `voteType`, `votedOn`, ayes/nays, `sourceUrl`), `legislator_votes` (per-member `position`), `bills.summary` (LRB), `candidate_positions_published` (stance + summary + sources).

**Substantive-vote filter:** a shared predicate keeps only final-passage votes. State `voteType` ∈ {PASSAGE, CONCURRENCE, ADOPTION}; federal `voteType`/question "On Passage". Everything else (procedural, quorum, most amendments) is excluded from the issue view.

### Component 2 — classifier pipeline (LLM, reviewed)

`convex/billClassify.ts` (or extend `convex/bills.ts`), same pattern as the news-tone classifier (`convex/newsToneClassify.ts`, `"use node"`):

- `classifyPendingBills` (internal action): for each bill that a tracked candidate voted on (substantive votes only) and that lacks a classification, send `billTitle` + LRB `summary` to `generateObject` (`anthropic("claude-sonnet-5")`) with the fixed 11-slug enum → `{ issueSlugs, outcome, confidence }`. The `outcome` prompt is anchored to the LRB sentence and constrained to be **neutral and factual** ("a YES vote would …"), never characterizing a member.
- Storage mutation upserts onto the `bills` row. **`confidence < 0.6` or `summary === null` → `classifyStatus: "needs_review"`** (never auto-published).
- **Human review gate:** an admin surface lists classified bills for keep/fix/reject; only `classifyStatus: "approved"` bills appear in the public view. (The schema already notes roll calls have "no human check"; adding interpretation makes review mandatory.)

Pure, testable helper `buildBillClassifyPrompt(title, lrbSummary)` split out (like `buildToneRubricPrompt`).

### Component 3 — read query

`votesQueries.votingRecordByIssue({ candidateSlug })` (public query):
1. Load the candidate's `legislator_votes` → `voteKey`s.
2. Join `legislative_votes`; keep substantive votes with a defined bill.
3. Join the `bills` cache by `(session, billNumber)`; keep only `classifyStatus === "approved"` bills.
4. Group by each `issueSlug` (a bill tagged with 2 issues appears under both). Within an issue, each entry:
   `{ direction: position==="aye" ? "for" : "against", outcome, votedOn, billNumber, session, sourceUrl, billUrl }`.
   `present`/`not_voting` are excluded from for/against and surfaced separately if present.
5. Per issue return `{ issueSlug, label, forCount, againstCount, votes: [...] }` plus the candidate's published `position` for that issue (stance + summary + sources) when it exists.

### Component 4 — UI (extends `voting-record.tsx`)

- New `VotingRecordByIssue` component under the existing summary tiles.
- Per issue with votes: header `label · voted for N, against M`; list of `✓/✗ Voted for/against [outcome] — [year] · bill ↗`. The `bill ↗` links to a bill-detail view (LRB summary, roll call ayes/nays + this member's vote, `sourceUrl`).
- If a published position exists for the issue: a muted "They said: [summary] →" line linking the position + its sources.
- Issues in the taxonomy with no approved votes: "No floor votes on this issue" (absence ≠ stance).
- Keep the existing aggregate summary + per-session accordion as a "see every vote" fallback.

---

## Honesty guardrails (brand-critical)

- The **bill** is described (LRB, nonpartisan); the **member** is never labeled. No scores, ratings, ideology percentages, or "pro-/anti-" language.
- Counts are **complete** (all substantive votes on the issue), so they can't be a selective sample.
- **No motive inference:** a "No" renders as "Voted against [what the bill does]," never "opposes [issue]."
- Every line is one click from the LRB summary + the roll call + the source.
- **Low-confidence / no-LRB classifications are withheld** until a human approves them.
- Procedural votes are excluded from the issue view (still visible in the "every vote" accordion).
- Incumbents only (challengers have no record — `/match` positions cover them).

## Error handling / edge cases

- Bill with no approved classification → excluded from the issue view (not shown as "uncategorized").
- Bill tagged to 2 issues → counted once under each issue.
- Candidate with a position but no votes on an issue (or vice-versa) → show whichever exists; never imply the missing one.
- `present` / `not_voting` → excluded from for/against counts; shown separately only if non-zero.
- Missing `session` on a `legislator_vote` (legacy) → derive from `voteKey` prefix (existing convention).

## Testing

- `src/lib/...` pure helpers: the substantive-vote predicate (keeps passage, drops procedural) and the direction mapping (aye→for, nay→against) — unit tested.
- `convex/billClassify.test.ts`: `buildBillClassifyPrompt` asserts the neutral/"YES vote would" framing + the fixed slug enum (mocked LLM).
- `convex/votesQueries.test.ts`: `votingRecordByIssue` with seeded votes + classified bills — asserts grouping, for/against counts, approved-only filtering, multi-issue double-count, and position pairing (convex-test).

## Out of scope / deferred (v2+)

- All other incumbents (state + federal House) — same pipeline, run later.
- Any "matches/contradicts their words" comparison logic (kept as two side-by-side facts in v1).
- Amendment-level votes as their own issue entries.
- Spanish translation of the new UI strings (mirror after the English ships).
