# Plan — Federal voting records (MOO-396)

**Written:** 2026-07-24 · **Ticket:** [MOO-396](https://linear.app/moodyco/issue/MOO-396) · **Extends:** `docs/superpowers/specs/2026-07-23-legislative-voting-record-design.md`

Source decision: **Congress.gov API** (Tarik's call, 2026-07-24, over the House Clerk XML alternative).
Schema decision: **extend the existing tables** rather than add federal-only ones.

---

## 1. Source surface — verified live, not assumed

All of the following was confirmed against real responses using `DEMO_KEY` before any code was written.

| Endpoint | Gives |
|---|---|
| `/v3/house-vote/{congress}/{session}` | Paginated list of votes — enumeration |
| `/v3/house-vote/{congress}/{session}/{voteNumber}` | `votePartyTotal[]` (per-party yea/nay/present/notVoting) |
| `/v3/house-vote/{congress}/{session}/{voteNumber}/members` | `results[]` with `bioguideID` + `voteCast`, plus all vote metadata |

Verified on 119/1/100 (H CON RES 14): 433 rows, 433 unique Bioguide IDs, summed party totals
(216/214/0/3) equal counted positions exactly. All eight tracked members resolved.

### Landmines found while probing (each cost a real debugging cycle to find)

1. **`bioguideID`, not `bioguideId`.** The official documentation says `bioguideId`; the actual JSON uses
   `bioguideID` with a capital D. Matching on the documented spelling silently finds zero members — every
   member lookup returns undefined and a candidate shows an empty record with no error anywhere.
2. **`voteCast` values vary by vote type.** Docs list `"Aye"`, `"Nay"`, `"Present"`, `"Not Voting"`. Roll 100
   is a YEA-AND-NAY vote and actually returns `"Yea"`. Recorded Votes return `"Aye"`. The position mapper
   must accept `Yea`/`Aye`/`Nay`/`No`/`Present`/`Not Voting` and **reject anything unrecognized** rather than
   defaulting — an unmapped string silently becoming `not_voting` is the misattribution class the state gate
   exists to prevent.
3. **`Present` is a real fourth position.** The state schema is `aye | nay | not_voting`. Voting Present is
   materially different from not voting — the member showed up and declined to take a side. Collapsing them
   misrepresents the record, so the position union gains `present`.
4. **No bill title anywhere in the vote endpoints.** Only `legislationType` + `legislationNumber` +
   `legislationUrl`. MOO-396's own verification requires "the bill number, official title, position and
   official link", so a second enrichment pass against `/v3/bill/{congress}/{type}/{number}` is **required,
   not optional**. (The Clerk XML carries `vote-desc` inline; the API dropped it.)
5. **Coverage is BETA and incomplete by design.** Congress.gov covers the 118th and 119th Congresses and
   **only votes associated with a piece of legislation** — non-legislation votes such as Election of the
   Speaker are excluded, "to be added at a later date." The federal record therefore has gaps the state
   record does not, and the UI must say so rather than implying completeness.
6. **No seat-count check is possible.** The state gate asserts `rows + vacantSeats == SEATS[chamber]`. The
   House has 435 seats but the API declares no vacancies, and mid-term vacancies are routine. That check has
   no federal equivalent and must not be faked with a hardcoded 435.
7. ~~**Rate limit.**~~ **Resolved.** The issued key allows 20,000 requests/hour, far above a full backfill.
   No backoff or windowing needed.
8. **Amendment votes carry no `legislationType`/`legislationNumber` at list level** — only `amendmentType`,
   `amendmentNumber`, `amendmentAuthor`. The detail/members levels DO name the underlying bill, so the
   parser records both: `measure` is what was voted on ("HAMDT 97"), `billNumber` is what a reader
   recognises ("HR 3838"). Collapsing them either loses the amendment or mislabels the vote.
9. **Two non-legislative vote shapes exist and must be refused** (found by running the live ingest, not by
   reading docs — the documentation claims such votes are simply absent):
   - *"Call by States"* (119/1/1) — an opening quorum call naming no legislation.
   - *"Election of the Speaker"* (119/1/2) — `votePartyTotal` carries `{candidate, total}` rows instead of
     party yea/nay rows, because members vote for a **person**. There is no yes/no position to record.
     Coercing it into aye/nay would be fabrication; the gate refuses it.
10. **~9 seconds per vote** (detail + members + Clerk XML, sequential; the XML alone is 83KB). A 357-vote
    session exceeds the Convex action time limit, so the backfill must be driven in batches from the client
    with `limit`. The weekly cron is fine — it only ever sees a handful of new votes.

### The free upgrade over the state feature

Every vote response carries `sourceDataURL` pointing at the House Clerk's own XML
(`clerk.house.gov/evs/2025/roll100.xml`). I confirmed all eight members' positions match across both
renderings. `parseRollCall`'s comment states its blind spot plainly — an internally-consistent document with
swapped positions passes every arithmetic check, and "catching it needs a second, independent source for the
same vote." Federal has that second source for free. **Task 5 spends it.**

---

## 2. Reconciliation gate — federal variant

Same fail-closed posture as state, adapted to what the source actually offers:

| Check | State | Federal |
|---|---|---|
| Positions match printed tally | ✅ | ✅ summed `votePartyTotal` vs counted `voteCast` |
| Row count vs seats+vacancies | ✅ | ❌ impossible — no vacancy data |
| Duplicate member | ✅ by name | ✅ by Bioguide ID (stronger — IDs are unique by construction) |
| Document self-identifies | ✅ canonical path | ✅ `congress`/`sessionNumber`/`rollCallNumber` echo the request |
| Unknown position string | n/a | ✅ **reject the document** |
| Cross-source agreement | impossible | ✅ Clerk XML spot-check (Task 5) |

Net: one check weaker (no seat count), two checks stronger (unique IDs, cross-source). **Do not loosen any
check to make a document pass** — same law as the state parser.

---

## 3. Tasks

| # | Task | Verification |
|---|---|---|
| 1 | Capture real fixtures: detail + members for a YEA-AND-NAY vote and a RECORDED VOTE (different `voteCast` vocab), plus one amendment vote | Fixtures committed under `convex/lib/fixtures/` |
| 2 | `convex/lib/houseVote.ts` — pure parser + federal gate. No network, no Convex (mirrors `rollCall.ts`) | Unit tests green |
| 3 | `houseVote.test.ts` — parse both vocabularies, reject unknown `voteCast`, reject tally mismatch, corruption sweep flipping each member's position | Every corruption rejected |
| 4 | Schema: add `present` to position union; add `us_house` chamber; add `bioguideId` to candidates | `npx convex dev --once` clean |
| 5 | **Cross-source verifier** — fetch the Clerk XML at `sourceDataURL` and assert every position agrees | Disagreement = reject + loud log |
| 6 | `convex/houseVotes.ts` — `"use node"` ingest action, pagination + 429 backoff | Dry-run against DEMO_KEY |
| 7 | Bill-title enrichment pass (`/v3/bill/...`), federal analogue of the `bills` LRB cache | Titles resolve for ingested votes |
| 8 | Seed the 8 Bioguide IDs (below) | All 8 attach |
| 9 | Chat `getVotingRecord` returns federal without caller branching; **new rule ONE line** | `eval-gate.mjs --baseline sonnet-5-tuned` ≥ 90% |
| 10 | Candidate page section; disclose the BETA coverage gap honestly | Renders for Tiffany + Moore |

### Bioguide IDs — read off roll 100, cross-confirmed in Clerk XML

| Member | District | Bioguide |
|---|---|---|
| Bryan Steil | WI-01 | `S001213` |
| Mark Pocan | WI-02 | `P000607` |
| Derrick Van Orden | WI-03 | `V000135` |
| Gwen Moore | WI-04 | `M001160` |
| Scott Fitzgerald | WI-05 | `F000471` |
| Glenn Grothman | WI-06 | `G000576` |
| Tom Tiffany | WI-07 | `T000165` |
| Tony Wied | WI-08 | `W000829` |

No surname collision problem — IDs are unique by construction, so the state design's curated-surname
mapping is deliberately **not** carried over (per the ticket).

---

## 4. Operations

The key is `CONGRESS_API_KEY` (Tarik's naming), in `.env.local` and set on prod Convex.

```bash
# Backfill must be batched — a full session exceeds the action time limit.
npx convex run --prod houseVotes:ingest '{"congress":119,"sessions":[1],"limit":40}'   # repeat until deferred=0
npx convex run --prod houseVotes:enrichBillTitles '{"congress":119}'

# Seed IDs BEFORE ingesting — a late id attaches nothing (see script header).
node scripts/seed-bioguide-ids.mjs --prod
```

`skipCrossCheck: true` exists for diagnosis only. Never use it for a real backfill: it disables the one
check arithmetic cannot make.
