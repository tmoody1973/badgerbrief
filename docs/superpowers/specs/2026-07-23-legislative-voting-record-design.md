# Legislative voting records

**Date:** 2026-07-23 · **Status:** approved, not yet planned
**Goal:** answer "how did this candidate vote on X" from the official record, in chat and on candidate pages.

## Why

Eight tracked candidates have served in the Wisconsin Legislature: Hong, Roys, Barnes,
Crowley, Taylor, Zamarripa, Hulsey, Rodriguez. For an incumbent or former member, the
voting record is the most substantive thing about them, and it is entirely public. Today
BadgerBrief has positions (what they say) and quotes (what they said) but nothing about
what they did in office.

## Source: the Legislature, not Open States

**Open States cannot do this for Wisconsin.** Their own Legislative Data Report Card
grades Wisconsin a "D" and notes the state "does not provide stand-alone roll call
votes." LegiScan resells the same public data through an API key.

The Wisconsin Legislature publishes complete per-legislator roll calls itself, as
structured HTML at predictable URLs. It is authoritative, free, and it is the URL we
would cite regardless of where the structured data came from — which satisfies the
existing rule that every claim links to its source.

```
Session index   docs.legis.wisconsin.gov/{session}/related/votes/{assembly|senate}
Roll call       docs.legis.wisconsin.gov/{session}/related/votes/assembly/av0083
                docs.legis.wisconsin.gov/{session}/related/votes/senate/sv0260
```

Verified volume: **233 Assembly roll calls in 2023, 302 in 2025.** With the Senate,
roughly 1,000 documents across both sessions. Small enough for a weekly cron.

## The chambers use different formats

This is the main implementation trap. Same data, unrelated markup, so **two parsers**.

**Assembly** — one row per member, with a vote column and party. Collisions are
disambiguated by first initial:

```
AB 388  BY HURD  CHILD CARE CENTER RENOVATIONS LOAN PROGRAM  PASSAGE
AYES - 62   NAYS - 35   NOT VOTING - 2   PAIRED - 0
  Y   ALLEN        R
  N   ANDERSON, C  D
  N   ANDERSON, J  D
  N   HONG         D
```

**Senate** — grouped name lists under tally headers. No party column, no first initials:

```
AB 388  BY HURD  CHILD CARE CENTER LOAN PROGRAM  CONCURRENCE
AYES - 22   BALLWEG  JAGLER  STAFSHOLT  BRADLEY ...
NAYS - 10   AGARD  LARSON  SPREITZER  CARPENTER  PFAFF  WIRCH  HESSELBEIN  ROYS ...
NOT VOTING - 0
```

Note also that the same bill carries **different titles in each chamber** ("CHILD CARE
CENTER RENOVATIONS LOAN PROGRAM" vs "CHILD CARE CENTER LOAN PROGRAM"). Store the title as
it appears on each roll call; do not assume one canonical title per bill.

## Data model

`legislative_votes` — one row per roll call.

| field | notes |
|---|---|
| `voteKey` | `2023-assembly-av0083`, natural key |
| `session`, `chamber` | `"2023"`, `"assembly"` |
| `billNumber` | `AB 388` |
| `billTitle` | verbatim from this roll call |
| `voteType` | `PASSAGE`, `CONCURRENCE`, `ADOPTION`, etc., verbatim |
| `votedOn` | ISO date |
| `ayes`, `nays`, `notVoting` | from the document header |
| `sourceUrl` | the official roll-call URL |

`legislator_votes` — only for legislators we track.

| field | notes |
|---|---|
| `voteKey` | → `legislative_votes` |
| `candidateSlug` | our slug |
| `position` | `aye` \| `nay` \| `not_voting` |

Storing only tracked legislators keeps ~1,000 roll calls to a few thousand rows instead of
~100,000. Full tallies still live on the parent row, so an answer can say "passed 62-35,
Hong voted no" without storing all 99 members.

`candidates.legislatorName` — new optional field. The exact surname string as it appears
in roll calls, plus the chamber and sessions served.

## Matching is curated, never fuzzy

A candidate is tied to roll-call rows by an explicit, hand-entered `legislatorName`.
No fuzzy matching, no normalization heuristics, no inference.

`ANDERSON, C` and `ANDERSON, J` are two different people in the same chamber on the same
vote. Wrong-person attribution on a voting record is a defamation-shaped error, and this
repo has already been bitten by name-matching (see the photo-verification rule in
CLAUDE.md). **A candidate with no mapping shows no votes**, which is a visible gap rather
than a silent error.

## The gate: arithmetic, not review

Quotes require human approval because a model chose them. A roll call involves no model
judgment at any point — it is a deterministic parse of an official document. Requiring a
human to approve 1,000 roll calls would be theatre, and it would not catch the failure
mode that actually exists here, which is a parser silently mis-reading a page.

So the gate is reconciliation, in the same spirit as the verbatim gate on quotes:

1. Parsed positions must sum exactly to the document's own `AYES`/`NAYS`/`NOT VOTING`
   header counts. This is the primary check.
2. Seat reconciliation: parsed rows plus vacant seats must equal 99 (Assembly) or 33
   (Senate).

   **`VACANT DISTRICTS: 4` means district number 4 is vacant — one seat, not four.**
   Verified: `sv0260` reads `VACANT DISTRICTS: 4` and totals 22+10+0 = 32 = 33 − 1, while
   `sv0100` and `sv0050` read `NO VACANT DISTRICTS` and total exactly 33. The line lists
   district *numbers*, so subtract how many numbers are listed, never the numbers
   themselves. Reading it as a count rejects every Senate roll call taken during a
   vacancy.
3. `billNumber`, `voteType` and date must all be present.

A roll call failing any check is **rejected and logged, not stored**. Partial parses never
enter the database.

## Chat

New tool `getVotingRecord({ candidateSlug, query })`:

- Keyword-searches `billNumber` and `billTitle` of roll calls the candidate participated in.
- Returns the **passage or concurrence** vote first — what people mean by "voted for the
  bill" — plus the candidate's position, the tally, and the official URL.
- Also returns a count of other recorded votes on the same bill, so the answer can disclose
  they exist without burying the reader in four numbers.
- Returns nothing on no match. The agent then says BadgerBrief doesn't have it, per the
  existing disclose-uncertainty rule. It must never infer which bill was meant.

Answers always lead with the official bill number and title, so a question asked using a
colloquial or partisan nickname is answered in the record's own vocabulary rather than the
questioner's.

**Rule additions must be one line each.** A previous change to these instructions regressed
`golden-expectations` from 93% to 73% — the failures were on unrelated voting-logistics
questions, because two verbose appended rules diluted attention on the existing ones.
Rewritten tersely, the same change passed at 100%. Add at least one voting-record question
to the golden set, and re-run `node scripts/eval-gate.mjs` before deploying.

## Candidate page

A "Voting record" section on the pages of candidates that have a `legislatorName`, styled
after the existing interview section: one card, dashed dividers, mono stamps, no nested
cards.

**Selection rule is recency, and it is stated on the page.** Most recent passage votes
first, a handful shown, the rest behind a `<details>` fold — the same pattern as the quotes
section. Recency is a neutral criterion we can disclose; "most important votes" is an
editorial judgment we would have to defend, and choosing which of a legislator's votes
matter is exactly the cherry-picking that ingesting the complete record avoids.

Each entry: bill number, official title, the candidate's position, the tally, the date, and
a link to the official roll call.

## Out of scope

- **Federal votes.** Tiffany, Pocan and Grothman serve in Congress; that needs the
  Congress.gov API and is a separate project.
- **Committee votes.** Floor roll calls only. Committee votes are not in the session vote
  index and are reported in the bill history without per-member records.
- **Scorecards, ratings, or vote-based scoring of any kind.** That is characterization, not
  record, and it breaks the no-endorsements rule.
- **Mapping bills to issue slugs.** Would be a model judgment, reintroducing the
  fabrication surface this design avoids.

## Risks

- **Markup drift.** The Legislature could change either page format. The reconciliation
  gate turns that into rejected rows and a visible gap rather than silent bad data.
- **Session coverage.** A legislator who served before 2023 has votes we will not have.
  The page must say which sessions are covered rather than implying completeness.
- **Procedural votes read as substantive.** Mitigated by leading with passage and labelling
  `voteType` verbatim, never paraphrasing it.

## Done when

- Both parsers reconcile against header tallies on a sample of real roll calls from each
  chamber and both sessions, with unit tests over saved fixtures.
- `Hong voted N on AB 388 passage` and `Roys voted NAY on AB 388 concurrence` reproduce
  from ingested data, matching the official documents linked above.
- The chat answers "how did Francesca Hong vote on child care center loans" with the bill
  number, official title, position and official link.
- The golden eval gate passes with a voting-record question added.
- A candidate with no `legislatorName` renders no section and the chat reports no data.
