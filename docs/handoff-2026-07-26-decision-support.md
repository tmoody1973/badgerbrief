# Handoff — BadgerBrief decision-support, session 2026-07-26

**Date:** 2026-07-26 · **Repo:** `/Users/tarikmoody/Documents/Projects/badgerbrief` · branch `main`, clean + synced with origin. Everything below is deployed to badgerbrief.org unless marked otherwise.

**Next session's focus (in order):** (1) **Feature A — "Make sense of the guide"** (guided `/start` path + inline explainers): design is APPROVED — write the spec, then plan → build. (2) Then either **MOO-410** (chat un-gate + budget guardrails — design done, parked) or **Feature B** (contribution pathway — not yet brainstormed). Tarik's call on order.

## 0. Read these first (don't re-derive)
- **Memory index:** `~/.claude/projects/-Users-tarikmoody-Documents-Projects-badgerbrief/memory/MEMORY.md`. Most session state is in `badgerbrief-decision-support-gap.md` (MOO-409 epic + all of 411/412/413/410 + chat tool + sponsors/nav + gate lessons) and `badgerbrief-voter-feedback-james-hart.md` (the feedback driving Features A/B).
- **Convex rules:** read `convex/_generated/ai/guidelines.md` before Convex work. **Next 16 is NOT stock** — read `node_modules/next/dist/docs/` before App Router code (AGENTS.md).
- **Process that worked all session:** `superpowers:brainstorming` → `writing-plans` → `subagent-driven-development` (fresh implementer subagent per task, per-task spec+quality review, opus whole-branch review at the end) → `finishing-a-development-branch`. Specs → `docs/superpowers/specs/`, plans → `docs/superpowers/plans/`, SDD ledger → `.superpowers/sdd/progress.md` (gitignored; has `411-*`, `412-*` entries — check after any compaction before re-dispatching).

## 1. Shipped this session (live, don't redo)
- **MOO-411** — `/compare/[slug]` rebuilt issue-by-issue from sourced positions. **Done** in Linear. Commits `a44ca6b`/`8311e53`/`bf064fc`.
- **MOO-412** — `/match` issue-alignment on-ramp (statewide-first progressive, issue-primary results, honest per-issue empty state). **Done**. Spec/plan `docs/superpowers/{specs,plans}/2026-07-26-moo-412-*`. Commits `0e5b8eb`→`b41bd45`.
- **Chat matching tool** `matchBallotByIssues` (Voter Help) — shipped after one iteration; **passed golden gate on prod (golden-expectations 93%→94%)**. Commit `d331bba` (final). Signed-in only (chat still Clerk-gated → MOO-410).
- **`/match` in main nav** (header + mobile "More", i18n EN/ES). Commit `4f31de2`.
- **GitHub Sponsors** (`.github/FUNDING.yml` + footer link) + **Ko-fi floating button** (`src/components/kofi-widget.tsx`), incl. a mobile fix lifting Ko-fi above the bottom tab bar (`globals.css`).

## 2. In progress / parked / queued (the actual work)

### Feature A — "Make sense of the guide" (APPROVED design → write spec next)
Guided `/start` path **+** inline explainers. Full approved design is in this session's transcript and summarized here:
- **Inline explainers:** one reusable `WhatThisMeans` component (tap-to-expand, reuse the `<details>` idiom, no tooltip lib) + a neutral content map for the confusing concepts (v1): stance labels (support/oppose/mixed/evolving/unclear), campaign finance (PAC vs individual $, cash-on-hand, "money ≠ endorsement"), voting record (roll-call / "deciding vote", aye–no), and sourced-position-vs-campaign-claim. Placed inline on candidate pages (stance chips, finance, votes), compare, and `/match` cards; link to `/methodology` where deeper.
- **Guided path:** `/start` route (intro + 3-step framing) + a `GuidedRail` client component mounted in the root layout that renders **only when `?guide=<step>` is present** ("Step X of 3 · label", back/next, param carried through links — guest-friendly, SSR-safe, no auth/persistence backend). Steps: ① ballot+issues → `/match`; ② read a candidate (callout → the inline explainers); ③ how to vote → `/vote`; then a finish. Entry from the home hero ("New here? Start here →").
- **No backend/data change.** Non-goals: no scoring/endorsement; `/es` deferred (English v1); the "help improve" pathway is Feature B.
- **Next step:** invoke `superpowers:writing-plans` to spec+plan this (design already approved — the brainstorm is done), then SDD it.

### MOO-410 — un-gate `/chat` + budget guardrails (design DONE, parked mid-spec)
Design was presented and refined; **not yet written to a spec.** Decisions locked:
- **Scope:** MVP = anon guest sessions + #1 global daily cap + #2 per-guest limit + #4 per-message bounds + #6 kill switch. Defer #3 bot wall + #5 quota-nudge to phase 2.
- **Architecture (locked):** keep the **Convex-client send path** (unchanged streaming). Guest identity = client `localStorage` UUID (`bb_guest_id`) passed as a `guestId` arg; backend agent `userId` = Clerk `_id` when signed in, else `guest:<uuid>`. **Key constraint discovered:** the chat runs over the Convex client (WebSocket direct to Convex, bypassing Vercel's edge), so per-IP limiting + bot wall aren't cheaply doable → deferred to phase 2. The **global daily cap is the true backstop.**
- **Guardrails in `sendMessage` (`convex/voterHelpQueries.ts`, the choke point):** kill switch (`VOTER_HELP_DISABLED` env, everyone) → global daily cap (guests only, new `chat_usage` day-counter table, `GUEST_DAILY_CAP` default 500) → per-guest daily cap (`GUEST_MSG_CAP` default 30). Hand-rolled counters table — **no `@convex-dev/rate-limiter` dep.** Signed-in users bypass the caps.
- **Per-message bounds (agent, `convex/voterHelp.ts`):** add `maxOutputTokens` (~1024), Anthropic **prompt caching** on the static system prompt + tool schemas, **trim `getRaceInfo`'s ~62KB output**. Proposed to KEEP `stepCountIs(8)` (reducing it is the most gate-risky lever). **These changes re-run the golden gate.**
- **Un-gate:** remove `/chat(.*)` from the protected matcher in `src/middleware.ts` (keep `/admin`).
- **Open inputs Tarik hadn't finalized:** exact cap numbers (defaults proposed, env-tunable) and whether to reduce `stepCountIs`. Next step: `writing-plans` from this design (skip re-brainstorm; it's decided).

### Feature B — "help improve the guide" contribution pathway (NOT brainstormed)
Signal from James Hart: an engaged supporter with no get-involved path (only `/feedback` = error reports). Scope idea: suggest a candidate/source, flag a data gap, volunteer, sponsor (Ko-fi/GitHub already exist). Needs its own `brainstorming` cycle.

### MOO-413 — data gaps (IN PROGRESS, needs Tarik, not code)
**~320 position drafts pending review at `/admin` → Editorial → Position filter** (Clerk role=admin). Includes the 43 gap-fill drafts (Steil/Carranza/Wied/Martin) + **19 agriculture drafts** across 7 gov candidates + the forced-re-extraction re-confirmations. Approve accurate ones → they publish and flow into `/compare` + `/match`. Nothing publishes without human approval (the editorial gate). Details + the `research.run` gotchas are in `badgerbrief-decision-support-gap.md`.

## 3. Landmines / gotchas discovered this session (all in memory too)
- **`npx vercel --prod` does NOT deploy Convex functions.** New Convex functions need `npx convex deploy --yes` separately — a `/match` deploy crashed live because `positionsForRaces` wasn't in prod Convex. **Always live-verify a client-interactive page after deploy** (tsc/build/tests all passed while it crashed).
- **Golden gate (`npm run eval:gate -- --name X --baseline sonnet-5-tuned`)** for any `voterHelp` change: **only golden-expectations gates** (≥90% floor + ≤5pt drop; `scripts/eval-gate.mjs:351-357`). `--dev` targets dev but **dev lacks prod data** → false failures; only a **prod** run is valid. Chat is Clerk-gated → deploy-to-prod → eval → **revert-on-fail** is the workable loop (used it: v1 regressed 93%→83% from rule-text leaking into unrelated answers; v2 scoped the rule and passed 94%). citation-faithfulness is non-gating + judge-noisy (pre-existing voting-DATE assertion weakness — a candidate future fix).
- **Linear MCP token EXPIRED** mid-session — couldn't read/update issues. Re-auth interactively (`/mcp` or the Linear plugin login). **Pending Linear writes:** mark nothing new (411/412 already Done); file James's feedback + Features A/B under MOO-409; MOO-414 overlaps Feature A.
- `useSearchParams()` needs a `<Suspense>` boundary to statically prerender under `revalidate`.
- Reuse over rebuild: `buildIssueComparison`/`buildIssueMatch` (`src/lib/`), `candidate-order.ts`, `positionsForRaces` query, `SourceList`/`PartyBadge`, `relevantRaces` + `/api/geocode`. Convex CAN import from `../src/lib/*` (e.g. `voterHelpQueries` imports `relevantRaces`).

## 4. Suggested skills for next session
- `superpowers:writing-plans` then `superpowers:subagent-driven-development` for **Feature A** (design already approved — go straight to plan) and, when picked up, MOO-410 (design done).
- `superpowers:brainstorming` for **Feature B** (contribution pathway — not yet designed).
- `superpowers:verification-before-completion` before claiming done; live-verify client pages in a browser after every deploy.
- For MOO-413: it's editorial review at `/admin`, not code.

## 5. Immediate first step
Invoke `superpowers:writing-plans` for **Feature A** using the approved design in §2 above (guided `/start` + `GuidedRail` + `WhatThisMeans` inline explainers). No re-brainstorm needed. Confirm with Tarik whether to write the Feature-A spec doc first (recommended, matches the session's spec→plan→SDD rhythm).
