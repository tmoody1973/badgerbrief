# Handoff — BadgerBrief decision-support build (MOO-411→414) + chat budget (MOO-410)

**Date:** 2026-07-25 · **Repo:** `/Users/tarikmoody/Documents/Projects/badgerbrief` · branch `main`, clean + synced with origin. Everything below is deployed to badgerbrief.org unless noted.

**Next session's focus (in order Tarik gave):** build **MOO-411** (rebuild compare page), then **MOO-412** (issue-alignment on-ramp), **MOO-413** (fill/label data gaps), **MOO-414** (novice orientation). Also open: **MOO-410** (un-gate chat + budget guardrails).

---

## 0. Start here (read these first — don't re-derive)

- **Product-gap finding + full context:** memory `badgerbrief-decision-support-gap.md` and the Linear epic **MOO-409** (parent) with children **MOO-410/411/412/413/414**. Each Linear issue has scope + acceptance + the specific voter-review finding. **The issues are the source of truth for what to build — read them, don't re-scope.**
- **i18n project state (separate thread, mostly parked):** memory `badgerbrief-i18n-project.md`; issues **MOO-406** (epic, In Progress — Phase 1 live), **MOO-407** (Phase 2 data pipeline, spec written), **MOO-408** (Phase 3). Specs in `docs/superpowers/specs/2026-07-25-moo-406-*`.
- **Session memory index:** `~/.claude/projects/-Users-tarikmoody-Documents-Projects-badgerbrief/memory/MEMORY.md`.
- **Convex rules:** always read `convex/_generated/ai/guidelines.md` before Convex work. **Next 16 is NOT stock** — read `node_modules/next/dist/docs/` before App Router code (per AGENTS.md).

## 1. What this session shipped (all live)

MOO-401 (About conflict disclosure), MOO-398 (voter-access guide `/vote` + 8 rows + chat tool), MOO-399 (mobile app-feel PWA), MOO-400 (`/es/vote`), the header language toggle, and **MOO-406 Phase 1** (locale-aware chrome + `/es`, `/es/about`, `/es/methodology`) + follow-up fixes (BallotFinder localized, locale-persistent nav via `localizeHref`, RaceCard labels). Details in the memory files + each issue's Done comment. **Do not redo these.**

## 2. The decision-support build — what the next session is doing

The voter review (I walked badgerbrief.org as a lost, undecided voter) found: **the site informs but doesn't help anyone DECIDE**, and it does so for only a sliver of the ballot. Fixes preserve the **no-endorsement / source-first** stance — every fix is self-service tools + complete data, never recommendations. Build order:

### MOO-411 — Rebuild `/compare/[slug]` (do first, High)
Current page (`src/app/compare/[slug]/page.tsx`) is a candidate×column table using thin `keyPriorities` (≤3); ~14 of 18 gov candidates are blank dashes. **The richer data already exists**: `candidate_positions_published` (~10 sourced issues per marquee candidate, e.g. `/candidates/mandela-barnes`). Rebuild **issue-by-issue** (group by issue → each candidate's sourced position under it → real side-by-side), pull from published positions not priorities, and render **"No position on record"** instead of blank. Mobile-first (reuse the SectionNav/fold patterns from MOO-329/399). Keep it non-partisan (no scoring/ranking). See MOO-411 for acceptance.

### MOO-412 — Issue-alignment on-ramp (High)
"Which issues matter to you?" (existing issue taxonomy) → candidates in the voter's races with **sourced positions** on those issues, links straight to them, "no position on record" where missing. **Alignment, never endorsement/scoring.** Ties into the `BallotFinder` (their races) + the rebuilt compare page. Depends on data coverage (MOO-413).

### MOO-413 — Fill/label data gaps (Medium)
Down-ballot / Republican / judicial candidates are thin-to-empty and pages don't say so. Reuse the existing sourced-position pipeline where data exists; **explicitly label "no sourced positions on record yet"** everywhere else so no page/row is silently blank. Judicial candidates often decline to state positions — that's itself a fact to state.

### MOO-414 — Novice orientation (Medium)
(1) A short sourced "how the Aug 11 partisan primary works — you pick ONE party's ballot" explainer on home + `/vote`. (2) Per-office neutral "what this office does" one-liner on race pages. Orientation, not persuasion.

## 3. The chat budget thread (MOO-410) — decisions reached, not yet built

Un-gating `/chat` (currently Clerk-gated) for guests would expose the AI budget. **The guardrails are needed regardless of model** (a cheaper model still needs them). Agreed layers (Tarik's priority): **#1 global daily cap (circuit breaker)** + **#2 per-IP/per-guest rate limit** + **#4 max output tokens + Anthropic prompt caching + fewer tool steps + trim tool outputs** + **#6 Anthropic org spend limit + env kill switch**; **#3 bot wall (Vercel BotID/Turnstile)** and **#5 guest quota→sign-in** are strong adds.

**OpenRouter "cheap model" question — settled for now:** the agent already A/B'd cheap models via the golden gate — **Haiku 4.5 scored 79% (invented facts) → reverted to `claude-sonnet-5` (93%)** (see `convex/voterHelp.ts:21-27`). The golden gate (≥93% on Arize `voter-help-golden`) is the bar, NOT price. **Recon this session:** only `ANTHROPIC` + `ARIZE` keys are configured (no OpenRouter/Google/OpenAI key); no OpenRouter AI-SDK provider and no `@convex-dev/rate-limiter` installed. So testing an OpenRouter model needs: add key + install `@openrouter/ai-sdk-provider` + run `eval:gate` (Arize/ax setup — the landmine). **Verdict: can't declare an OpenRouter winner without that spike; do the budget guardrails regardless.** Biggest no-risk saving = **Anthropic prompt caching** on the large static system prompt + 7 tool schemas (not currently used).

Chat internals worth knowing (`convex/voterHelp.ts`): `MODEL = "claude-sonnet-5"`, `stopWhen: stepCountIs(8)` (up to 8 LLM round-trips/msg — the cost multiplier), `anthropic(model)` direct (no gateway spend cap), `getRaceInfo` ~62KB tool output, no maxOutputTokens. Tools gate on `ctx.userId` (getMyBallot needs sign-in). Chat design = one thread per user (MOO-310) → guest access needs an anonymous-session design.

## 4. How to work here (process that worked all session)

- **Superpowers flow per feature:** `brainstorming` → `writing-plans` → `subagent-driven-development` (fresh implementer subagent per task, per-task review, opus whole-branch review at the end). Specs → `docs/superpowers/specs/`, plans → `docs/superpowers/plans/`. MOO-411 is a real UI feature — brainstorm it first (the compare-page IA is a genuine design question).
- **SDD ledger:** `.superpowers/sdd/progress.md` (gitignored) — append one line per completed task; check it after any compaction before re-dispatching.
- **Deploys are Tarik-gated.** Convex data changes: `npx convex deploy --yes` (prod) then seed; frontend: `npx vercel --prod --yes`. Verify live with curl (cache header `public` + warm `x-vercel-cache: HIT`; EN output unchanged).
- **API instability seen this session:** subagents hit transient 529 / "connection closed" mid-task — work was usually committed or on disk; **check `git log`/`git status` + run tsc/tests before re-dispatching** (don't redo completed work).
- **Tests:** `npx vitest run <file>`; convex/next test files need `// @vitest-environment node` (global env is edge-runtime, crashes on next imports). Full suite currently 496 passing.

## 5. Suggested skills for next session

- `superpowers:brainstorming` then `superpowers:writing-plans` then `superpowers:subagent-driven-development` for MOO-411 (and 412/414).
- `superpowers:verification-before-completion` before claiming anything done.
- `linear-build:linear-build` is available; the MOO-411..414 issues already hold scope/acceptance — read them via the Linear MCP (`get_issue`).
- For MOO-413 data work: the existing sourced-position ingestion pipeline (Firecrawl/Perplexity per prior milestones) — check `convex/` editorial pipeline + `scripts/`.

## 6. Immediate first step for the next session

Read **MOO-411** (Linear) + the current `src/app/compare/[slug]/page.tsx` and a rich candidate page's positions rendering (`src/app/candidates/[slug]/page.tsx`, the `#positions` section) to see the `candidate_positions_published` shape, then **brainstorm the issue-by-issue compare IA** before coding. That's the highest-leverage decision-support fix.
