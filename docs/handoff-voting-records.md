# Handoff — Legislative voting records

**Written:** 2026-07-23 · **Branch:** `main` (feature merged, pushed, deployed) · **Convex prod:** `precious-axolotl-906`
**Live:** https://badgerbrief.org/candidates/francesca-hong (Voting record section) · chat `getVotingRecord`

---

## 0. One-paragraph state

The legislative voting-record feature is **built, reviewed, merged, deployed, and live**. It ingests Wisconsin
Legislature floor roll calls (bills + resolutions), matches tracked legislators by exact curated surname, and
shows their votes in the Voter Help chat and a "Voting record" section on candidate pages. **Kelda Roys (551
votes) and Francesca Hong (500 votes) are mapped and live.** The open work is one thing: **the pre-2019
roll-call HTML format doesn't parse**, which blocks four historical legislators — most importantly Mandela
Barnes, whose entire Assembly service (2013, 2015) is in that unparseable range. Tarik chose to **build the
old-format parser properly**. That is the next task.

---

## 1. What shipped (all live on prod)

- **Spec:** `docs/superpowers/specs/2026-07-23-legislative-voting-record-design.md`
- **Plan:** `docs/superpowers/plans/2026-07-23-legislative-voting-record.md` (9 tasks, all complete)
- **Merge:** `cdfbcfa` on main, pushed to origin.

**Architecture** (mirrors the scout.ts split — a plain mutation can't import a `"use node"` module):
- `convex/lib/rollCall.ts` — **pure parser + the reconciliation gate** (no Convex, no network). THE correctness core.
- `convex/lib/rollCall.test.ts` + `convex/lib/fixtures/wi-*.html` — 4 real fixtures, 45 tests.
- `convex/votesQueries.ts` — `storeRollCall`, `ingestedKeys`, `setLegislatorName` (admin-gated), `votingRecord` (public query).
- `convex/votes.ts` — `"use node"` ingest action (`ingest`), crawls index → fetch → parse → store.
- `convex/crons.ts` — weekly ingest, Sundays 12:00 UTC.
- `convex/voterHelp.ts` — `getVotingRecord` tool + rule 9 (ONE line — see landmine 6).
- `convex/public.ts` — `getCandidateBySlug` returns `votingRecord`.
- `src/components/guide/voting-record.tsx` + candidate page wiring.
- `scripts/seed-legislator-names.mjs` — maps candidate slug → exact surname. **Names MUST be seeded BEFORE ingest** (landmine 4).

**Prod data:** backfill stored **1,051 roll calls** (2023+2025, both chambers), 0 fetch failures, 111 rejected
(gate failing closed — see below). Hong nay AB 388 passage 62-35, Roys nay concurrence 22-10 — both verified live.

---

## 2. THE NEXT TASK — old-format parser for pre-2019 roll calls

### Why it's needed
The four pre-2023 legislators need earlier Assembly sessions ingested:

| Legislator | Slug | Chamber | Sessions to cover | Currently coverable? |
|---|---|---|---|---|
| Mandela Barnes | `mandela-barnes` | Assembly (Dist 11) | 2013, 2015 | **No — both pre-2019** |
| Brett Hulsey | `brett-hulsey` | Assembly (77→78) | 2011, 2013 | **No — both pre-2019** |
| David Crowley | `david-crowley` | Assembly (Dist 17) | 2017, 2019 | 2019 only |
| JoCasta Zamarripa | `jocasta-zamarripa` | Assembly (Dist 8) | 2011,2013,2015,2017,2019 | 2019 only |

(Service years verified via Perplexity + ballotpedia this session. All four are **Assembly**, none Senate.)

### The exact defect (root-caused this session — start here)
- Old-session index pages exist and use the same URL shape: `docs.legis.wisconsin.gov/{session}/related/votes/assembly`. Counts: 2011→786, 2013→441, 2015→442, 2017→362, 2019→177 ids.
- **2019 parses fine (22/23 sampled).** The newer format works.
- **2011–2017 are 100% rejected**, every document short by **exactly 2** in the tally reconciliation (`parsed 55/37/5 does not match printed 57/37/5`).
- Root cause: the old documents lay members out in a **3-column HTML table** (three `A / N / NV / NAME` header groups side by side, ~33 members per column). The current `parseAssemblyVotes` reads a flat line stream from `htmlToLines`, and at the column boundaries **exactly 2 members are mis-associated / dropped** — the flattened block yields **97 names for a 99-vote tally**, with `NO VACANT DISTRICTS` declared. The 2 missing are NOT after the member block (only `NO VACANT DISTRICTS / SEQUENCE NO. / date / path` follow) and NOT paired (`PAIRED - 0`).
- **The gate is behaving correctly** — it refuses to store a document where 97 parsed rows can't reconcile to a 99-vote tally. Do NOT loosen the gate to make old docs pass. The fix is to parse the 3-column layout correctly so all 99 rows are read, then the existing gate reconciles them.
- NOTE: 2013 tally line uses the literal text `&nbsp` (no semicolon) between numbers, where 2023/2025 use a real U+00A0. `parseTallies` already reads it fine (belt-and-braces), but the member cells may have similar entity quirks — check when adding the fixture.

### How to build it (Task-3-level rigor — this is the correctness core)
1. **Understand the 3-column layout fully.** Fetch a 2013 doc's RAW HTML (not flattened) and map how the three column-tables interleave. Determine the reading order htmlToLines produces and exactly which 2 rows get lost. A representative doc: `2013/assembly/av0100` (AB 181, 57/37/5, 99 seats, NO VACANT). It's saved this session at `/tmp/old2013.html` but re-fetch to be safe.
2. **Add old fixtures** — at least one 2013 (or 2011) Assembly roll call, committed like the existing `convex/lib/fixtures/wi-*.html`. Pick a substantive bill vote with a known aye/nay split.
3. **Extend the parser** to handle the multi-column layout WITHOUT breaking the current single-stream path (2023/2025 must still parse identically — 45 existing tests must stay green). Likely: detect the column structure and read each column's rows in order, or fix htmlToLines' cell association.
4. **Re-verify the gate on the old format**: after the fix, a corrupted old doc (blank a mark) must still be REJECTED. Run the same corruption sweep discipline Task 3 used.
5. **Ingest** the needed sessions: `npx convex run --prod votes:ingest '{"sessions":["2011","2013","2015","2017","2019"],"chambers":["assembly"]}'`. **SEED NAMES FIRST** (landmine 4).
6. **Collision-check every surname before mapping** (landmine 2 — this is how Taylor/Rodriguez were caught). For each of the four: confirm exactly one person of that surname+party in the sessions they served, and that it's genuinely our candidate (bio matches the district/timing). In 2019, `CROWLEY` and `ZAMARRIPA` are already confirmed single, unambiguous entries. Barnes/Hulsey need checking in 2013 once it parses.
7. Add each verified mapping to `scripts/seed-legislator-names.mjs` and run it (prod), then verify the record renders.

### DO NOT map (verified this session — wrong-person traps)
- `TAYLOR` and `RODRIGUEZ` appear in current 2023/2025 roll calls but are **different sitting legislators** — Chris Taylor (our candidate) left the Assembly in 2020; Sara Rodriguez became Lt. Gov. Jan 2023. Mapping them = misattribution. They stay unmapped.

---

## 3. Landmines (all hit or verified this session)

1. **The gate replaces human review.** No human hand-checks a parsed roll call before it hits a public profile. `parseRollCall` reconciles parsed positions against the document's own tallies, seat+vacancy count, duplicate names, and canonical-path/voteId identity. A failure returns `{error}` and the caller MUST skip it. A double-consumed-mark bug once stored two members with the *opposite* of their real votes while every check passed — caught by a 4,851-pair corruption sweep. Treat any parser change as correctness-critical.
2. **Matching is exact and curated, never fuzzy.** `ANDERSON, C` and `ANDERSON, J` are two people on the same vote. A candidate is matched only by a hand-verified `legislatorName` (surname string, chamber, sessions). Verify every surname against a real document AND check for same-surname collisions before mapping. Not-mapping is the fail-safe direction.
3. **`VACANT DISTRICTS: 4` means district number 4 — ONE seat, not four.** Count listed numbers, never sum.
4. **Seed names BEFORE ingest.** `legislator_votes` rows are created only inside `storeRollCall` at ingest time, and both storeRollCall (dedup on voteKey) and ingest (skip already-stored ids) short-circuit on re-run. A name added AFTER ingest attaches nothing and the candidate silently shows empty. There is NO db-only reconcile (non-tracked member positions aren't persisted). To backfill a late-added name you must force a re-ingest of the relevant ids. Documented in `scripts/seed-legislator-names.mjs`.
5. **Bill numbers reset each biennium.** `otherVotesOnBill` and any per-bill grouping key by `session-billNumber`, never billNumber alone. (Hong has two "AB 388" — a 2023 child-care bill and a different 2025 bill.)
6. **Any `voterHelp.ts` INSTRUCTIONS change re-runs the golden gate** (`node scripts/eval-gate.mjs --baseline sonnet-5-tuned`, 90% floor). A verbose rule addition regressed golden-expectations 93%→73%; the terse one-line rewrite scored 100%. **Keep every new rule ONE line.** The judge is noisy (63–100% on identical input) — don't trust a single run blindly, but the feature's correctness is separable from judge variance.
7. **Resolutions ARE now included.** `parseHeader` matches `/^(?:AB|SB|AJR|SJR|AR|SR)\s+\d+$/`. This shipped this session (commit `33cc4e5`) with a real SJR fixture; don't re-do it.
8. **The 111 prod rejects are correct.** They're the gate failing closed on undeclared mid-session vacancies (`97 rows != 99 seats`) and motion votes without a measure number. Not data loss.
9. **`.superpowers/` is gitignored** but ~25 scratch files are already tracked on origin/main from a prior session (a `git add -A` override). Subagents twice force-added scratch reports into commits; watch for it. Also two subagents committed to `main` instead of the feature branch — always assert the branch first.
10. **Test command is `npx vitest run <file>`** — no `pnpm test` (no-op). `npx tsc --noEmit` must be run separately (vitest doesn't type-check). `convex/_generated/api.d.ts` is tracked but references modules by `typeof`, so adding a function to an existing module needs no regen.

---

## 4. Command cheatsheet (prod)

```bash
# Ingest sessions (SEED NAMES FIRST). limit optional; skips already-stored ids.
npx convex run --prod votes:ingest '{"sessions":["2013"],"chambers":["assembly"]}'

# Seed a legislator mapping (edit scripts/seed-legislator-names.mjs, verify surname first)
node scripts/seed-legislator-names.mjs --prod

# Read a candidate's record
npx convex run --prod votesQueries:votingRecord '{"candidateSlug":"mandela-barnes"}' --identity '{"metadata":{"role":"admin"}}'

# Chat check
npx convex run --prod voterHelp:evalAnswer '{"prompt":"How did X vote on Y?"}'

# Gate (any voterHelp.ts change)
npx convex dev --once && node scripts/eval-gate.mjs --name <n> --baseline sonnet-5-tuned
```

Deploy: `npx convex deploy -y` then `npx vercel --prod --yes`. Both needed.

---

## 5. Other open items (unrelated to voting records)

- **MOO-393** — Clerk still a *development* instance. The actual launch blocker (Aug 4 target, Aug 11 primary).
- **[MOO-396](https://linear.app/moodyco/issue/MOO-396)** — federal voting records (8 sitting members of Congress incl. Tiffany, Moore) via Congress.gov. Different source, Bioguide IDs, no surname-collision problem. Backlog.
- **9 pending quote drafts** in `/admin` (WisconsinEye interviews) + outlet types + 9 draft outlets awaiting approval.
- **Rotate the `GOOGLE_SERVICE_ACCOUNT_JSON` key** — it printed into a session transcript earlier.

---

## 6. Progress ledger

Full task-by-task detail (every commit, every review, every fix wave) is in
`.superpowers/sdd/progress.md` under `--- legislative-voting-record (2026-07-23) ---`. That file is the
recovery map if context is lost — trust it and `git log` over recollection.
