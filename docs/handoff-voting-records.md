# Handoff — Legislative voting records

**Written:** 2026-07-23 · **Updated:** 2026-07-24 (pre-2019 parser closed) · **Branch:** `main` (merged, pushed, deployed)
**Convex prod:** `precious-axolotl-906`
**Live:** https://badgerbrief.org/candidates/francesca-hong (Voting record section) · chat `getVotingRecord`

---

## 0. One-paragraph state

The legislative voting-record feature is **built, reviewed, merged, deployed, and live — including all
pre-2019 sessions**. It ingests Wisconsin Legislature floor roll calls (bills + resolutions), matches tracked
legislators by exact curated surname, and shows their votes in the Voter Help chat and a "Voting record"
section on candidate pages. **All six mapped legislators are live** (counts in §2). The pre-2019 parser
defect that blocked Barnes/Hulsey/Crowley/Zamarripa is **fixed and their records are on prod**. There is no
open work on this feature. Remaining project-level items are in §5 — the real launch blocker is MOO-393.

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

## 2. DONE — pre-2019 roll calls (closed 2026-07-24)

Commits `5427aac` (parser + fixture + tests) and `84ff439` (mappings), both on `origin/main`.

### The real root cause — NOT what this doc originally said
The original diagnosis in this handoff blamed a **3-column HTML table layout**. That was wrong, and the
wrong lead is worth recording: the flat line stream from `htmlToLines` handles the old layout fine.

The actual cause was one character. Pre-2019 documents print a disambiguating initial **dotted** —
`OTT, A.` / `OTT, J.` — where 2023/2025 print it bare (`ANDERSON, C`). `NAME_RE` had no optional `\.`, so
exactly those two rows failed to match and were dropped. That is the whole "short by exactly 2" signature in
every 2011–2017 document. Both Otts sat together through 2015; by 2019 only one remained and was printed as a
plain `OTT`, which is why 2019 already parsed. Fix: 9 lines in `convex/lib/rollCall.ts` (`NAME_RE`, ~line 135).

**The gate was never loosened.** `git show 5427aac -- convex/lib/rollCall.ts` touches no `error` / `SEATS` /
`count()` line. The reconciliation logic is byte-identical to what shipped on 2026-07-23.

### Verification on record
- `npx vitest run convex/lib/rollCall.test.ts` → **50/50 pass**; `npx tsc --noEmit` → clean.
- Old-format fixture committed: `convex/lib/fixtures/wi-assembly-av0100-2013.html` (2013 av0100, AB 181, 57/37/5).
- Corruption sweep re-run on the OLD format: blanking the mark cell on each of all 99 rows is rejected every
  time (`REJECTS a blank mark cell on ANY row of the pre-2019 format too`).
- Surname collision check done and documented inline in `scripts/seed-legislator-names.mjs`: each of the four
  is the single party-D entry of that surname in every session served.

### Prod coverage (verified 2026-07-24 via `votesQueries:votingRecord`)
| Legislator | Slug | Votes | By session |
|---|---|---|---|
| Mandela Barnes | `mandela-barnes` | 823 | 2013: 420 · 2015: 403 |
| Brett Hulsey | `brett-hulsey` | 1,125 | 2011: 705 · 2013: 420 |
| David Crowley | `david-crowley` | 515 | 2017: 342 · 2019: 173 |
| JoCasta Zamarripa | `jocasta-zamarripa` | 2,043 | 2011: 705 · 2013: 420 · 2015: 403 · 2017: 342 · 2019: 173 |
| Francesca Hong | `francesca-hong` | 500 | 2023: 222 · 2025: 278 |
| Kelda Roys | `kelda-roys` | 551 | 2023: 292 · 2025: 259 |

Accepted-vs-available roll calls per session: 2011 705/786, 2013 420/441, 2015 403/442, 2017 342/362,
2019 173/177. The shortfall is the gate failing closed (landmine 8) — undeclared mid-session vacancies and
motion votes with no measure number. Not data loss.

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
