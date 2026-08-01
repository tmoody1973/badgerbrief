# HANDOFF — 2026-08-01 (voting record by issue + session state)

Pick up in a clean context. Everything below is **LIVE on prod** unless marked. The
active next task is **expanding the voting-record-by-issue feature to more incumbents**
(last section). Read "Deploy + gotchas" before shipping anything.

---

## Shipped this session (all LIVE on badgerbrief.org)

1. **/forecast → a "class on forecasting" + methodology.** 3-act lesson (polls + win-prob
   sim → "meet the witnesses" 4-signal share bars → "you be the forecaster" weight sliders,
   no quotable score) + a research-backed **methodology section with real citation links**
   (Jackman, Shirani-Mehr, Gelman, Pew, Gayo-Avello, Kalla & Broockman, Wlezien, Sides).
   News-tone classifier seeded (25). See memory [[badgerbrief-forecast-teaching-signals]].
2. **Kelda Roys finance corrected + completeness fixed.** The $1.2M press claim is
   UNCONFIRMED (official WI CFIS: **$527,431.75** raised). Fixed her receipts/disbursements/
   period. Backfilled cash-on-hand for 5 down-ballot committees → **all 14 Sunshine candidates
   complete**. Added `finance:financeGaps` audit + **weekly cron alert** (`financeGapAlert`,
   Mondays 14:00 UTC, emails via `feedback.notify`). See [[badgerbrief-sunshine-finance-mismap]].
3. **Debate moderators un-swapped.** Matt Smith ↔ Gerron Jordan were reversed in the
   Deepgram labeling; global swap across transcript + 43 quote `askedBy`. Verified live.
4. **/about — open-source + learning-project section** (EN + ES). Links the public repo.

---

## Voting record by issue — SHIPPED for Hong + Roys, ready to expand

**What it is:** on a candidate page (`/candidates/<slug>`, under the "Voting record" tab),
an incumbent's votes are grouped by the **11-issue taxonomy** (same as `candidate_positions_published`
/ /match), each translated to **"Voted for/against a bill to [plain outcome]"** (outcome from
the nonpartisan LRB one-sentence summary), with **factual for/against counts**, the candidate's
**stated position shown alongside** ("They said:"), and the bill one click away. No scores/labels.

**Design + plan:** `docs/superpowers/specs/2026-08-01-voting-record-by-issue-design.md`,
`docs/superpowers/plans/2026-08-01-voting-record-by-issue.md`. Full detail in memory
[[badgerbrief-voting-record-by-issue]].

**The pieces (all on main, deployed):**
- `bills` table (LRB cache) carries the classification: `issueSlugs`, `outcome`,
  `classifyConfidence`, `classifyStatus` (pending|approved|rejected|needs_review), `classifiedAt`.
- `convex/billClassify.ts`: `setBillClassification`, `pendingBillsForCandidates`, `listForReview`,
  `approvePending({only?})`, pure `buildBillClassifyPrompt` + `ISSUE_SLUGS`.
- `convex/billClassifyRun.ts` (`"use node"`): `classifyPendingBills({candidateSlugs, limit})` —
  LLM (`claude-sonnet-5`); `confidence<0.6` or no-issue → `needs_review` (never auto-public).
- `votesQueries.votingRecordByIssue({candidateSlug, raceId})` — **approved-only**, grouped,
  for/against, position-paired.
- UI: `src/components/guide/voting-record-by-issue.tsx`, wired in `src/app/candidates/[slug]/page.tsx`.

**HONESTY GATE (verified end-to-end):** classifier can only write pending/needs_review; approval
is internal-only; the public query hard-filters to `approved`. Nothing public without human review.

**v1 run:** classified all 473 pending bills for Hong+Roys → 436 issue-mapped, 37 withheld.
Tarik reviewed via a private Artifact and approved all 436. LIVE + browser-verified.

### The UI is already candidate-agnostic — expanding is mostly classifying NEW bills
`VotingRecordByIssue` renders on **every** candidate page (gated on `votingRecordSummary`). So the
moment a candidate's substantive-vote bills are **approved-classified**, their section appears.
Because bills are SHARED within a chamber/session, most Assembly bills are already classified
(from Hong) and most 2023/2025 Senate bills from Roys — so many other incumbents may **already**
show data. Expanding = classify the remaining bills (ones other members voted on that Hong/Roys
didn't) and approve them.

### EXPANSION STATUS: WI legislators DONE (2026-08-01)
Shared chamber bills + candidate-agnostic UI mean **every WI Assembly/Senate incumbent is already
live** with their own record — no work needed (verified: 14 others had 0 unclassified bills; Emerson
D-91 renders her own distinct counts). **Only frontier left = US House (631 votes each):** federal
bills have no WI-LRB summary so the classifier skips them — needs a **Congress.gov bill-summary
source wired into the `bills` cache first** (v2 data build). The steps below apply if new WI roll
calls get ingested (weekly cron) or once federal summaries exist.

### HOW TO EXPAND (for future WI bills or, post-federal-summaries, US House)
1. Get the tracked-legislator slugs (candidates with `legislator_votes`). ~89+ WI Assembly/Senate
   incumbents; US House members have ~631 votes each.
2. `npx convex run billClassifyRun:classifyPendingBills '{"candidateSlugs":[<all slugs>],"limit":40}' --prod`
   **in a loop** (batches of ~40 — a single run of hundreds hits the Convex action timeout; see
   the drain loop used in this session's git history / the b3gjzpywj background task).
3. Review the NEW pending bills: `npx convex run billClassify:listForReview '{"statuses":["pending"]}' --prod`
   → build a review Artifact (the generator + the last one live at
   https://claude.ai/code/artifact/5ce34770-094f-4726-ad58-b359fdd48b4a — regenerate from
   `scratchpad/vote-review.html`'s python, which pulls `listForReview` + per-candidate votes).
4. Tarik approves → `npx convex run billClassify:approvePending '{}' --prod` (or `{"only":[...]}`).
5. `vercel --prod` (clean worktree). It's live for all reviewed candidates.

**Cost/review reality:** each NEW bill is one LLM call + needs Tarik's eyeball. Expect a few
hundred more bills across all incumbents. Consider a real **admin review UI** before doing dozens
of candidates (v1 used the Artifact + CLI, fine for two). The **37 needs_review** bills (no clear
issue — mostly resolutions) can be revisited or left withheld.

---

## Deploy + gotchas (READ FIRST)
1. **No git auto-deploy.** Frontend ships via clean-worktree `vercel --prod`:
   ```
   git worktree add --detach /tmp/bb-deploy HEAD
   mkdir -p /tmp/bb-deploy/.vercel && cp .vercel/project.json /tmp/bb-deploy/.vercel/
   cd /tmp/bb-deploy && vercel --prod --yes && git worktree remove /tmp/bb-deploy --force
   ```
2. **Convex ships separately**, protecting the WIP: `git stash push -q -m wip -- convex/voterHelp.ts && npx convex deploy --yes && git stash pop -q`. Prod = `precious-axolotl-906`.
3. **`convex data <table>` truncates at 100 rows** — use a defined query for real counts (this bit me: "sparse votes" was a truncation artifact; Hong actually has 500).
4. **Convex functions can't import from `src/`** — issue labels are re-declared in `convex/votesQueries.ts`.
5. **`"use node"` Convex files export ONLY actions** — hence the billClassify.ts / billClassifyRun.ts split.
6. Interactive-authenticated MCP (claude-in-chrome) can drop; reconnect via `tabs_context_mcp`.
7. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Other open threads
- `convex/voterHelp.ts` has long-standing **uncommitted WIP** — leave it stashed during deploys, don't commit it.
- Forecast v2 signals (money, hashtag volume, FB reaction sentiment, engagement rate) — see [[badgerbrief-forecast-teaching-signals]].
- SocialFetch **Task D** (engagement rate) — probe script ready at `scratchpad/socialfetch-posts-probe.sh`; needs a credit purchase. See [[badgerbrief-forecast-social]].
