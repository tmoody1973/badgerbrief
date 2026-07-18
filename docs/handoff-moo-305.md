# BadgerBrief handoff — continue at MOO-305 (OpenUI component library + brief renderer)

## What this is
Non-partisan Wisconsin voter guide, live at **https://badgerbrief.vercel.app**.
Primary Aug 11, 2026; launch issue MOO-314 due **Aug 4**. Repo:
`/Users/tarikmoody/Documents/Projects/badgerbrief`. Tarik is architecture-trained,
non-traditional dev — explain flows at click level when asked; Socratic mode per
global CLAUDE.md unless he says ship it.

## Authoritative artifacts (read, don't re-derive)
- **Design spec (the contract):** `docs/superpowers/specs/2026-07-17-badgerbrief-m1-design.md`
  — §7 is the OpenUI brief section and the heart of MOO-305.
- **Linear:** project "BadgerBrief M1 — Primary Guide + Agents" (team Moodyco).
  MOO-305 has the full Intent/Acceptance/Verification contract — read it via
  `get_issue MOO-305`. Evidence comments on Done issues record what was proven.
- Project memory: `~/.claude/projects/-Users-tarikmoody-Documents-Projects-badgerbrief/memory/`
  (`badgerbrief-moo304-state.md` holds this week's hard-won facts).

## Board state (as of 2026-07-18 midday)
- ✅ Done w/ evidence: MOO-302, 303, 306, 308, **304** (agent substrate + Arize traces,
  commits 7367b0c→ff039be), **319** (state cash/debts via Sunshine tRPC), **320**
  (donor pass-through drill-down, live on tom-tiffany).
- ▶ **Next: MOO-305.** Then 307 (districts), 310/311 (agents — 311 consumes 305's
  `library.prompt()`), 312, 313; new scope 315 (Google ads), 316 (clustering,
  blocked by 315), 317 (polling), 318 (FCC TV ads); 309 Meta-blocked; 314 launch.

## MOO-305 in one breath
Generative **composition**, not generative content: an OpenUI `defineComponent`
registry of RetroUI-styled components that take **entity IDs only** (e.g.
`RaceCard("WI-GOV-2026")`) and fetch published Convex data at render — the LLM
can never write facts. Parser rejects off-registry output. Briefs stored as
OpenUI Lang source (re-render against current data). Streaming skeletons; print
stylesheet. Brief Agent itself is MOO-311, NOT this issue.

## Component brainstorm (seed for the session-start discussion with Tarik)
Ranked by voter UX value for an Aug 11 primary brief:
1. **BriefHeader** — orientation + days-to-election countdown; cheap, do first.
2. **VotingChecklist + DeadlineBanner** — the action layer (register, absentee,
   polling place). Highest stakes, zero partisan risk; data from `getVotingInfo`.
3. **RaceCard** — the workhorse: office, candidates w/ existing Party/Status
   badges, one-line stakes. Binds to `api.public.getRace`.
4. **CandidateCompareCard** — the decision tool for contested races.
   **Open question (a):** gov Dem primary has ~6 actives — side-by-side pair or
   matrix? Recommend matrix capped at 4 + "full race" link; discuss.
5. **IssueStanceCard** — personalization payoff via `user_preferences.savedIssues`;
   published positions only.
6. **FinanceSnapshot** — NOT in the issue's list but argue for it: the money
   panels (raised/spent/cash/debts + org donors + pass-through drill-down) already
   exist as server components in `src/components/guide/finance.tsx` — wrapping
   them as a registry component is nearly free and money is our differentiator.
   Ask Tarik; if yes, note it as a deliberate contract addition on the issue.
7. **QuoteCard** (published quotes w/ sources) and **SourceTrustLabel** — build
   SourceTrustLabel INTO every data component rather than standalone-first.
8. **AssistantNote** — governance-critical: visually distinct style for the only
   free text the agent may emit.
Deferred (data lands later): AdActivityCard (315/318), PollSnapshot (317).

Other decisions to discuss BEFORE building (superpowers:brainstorming first):
- (b) Brief shape: single scroll in ballot order w/ contested races first within
  groups (recommended) vs. tabs per race.
- (c) How `detailLevel` affects composition (agent picks fewer/more components)
  vs. component-internal density. Recommend composition-level only for M1.
- (d) Print behavior: `<details>` drill-downs (finance) should print expanded.
- (e) Rendering: server components + Suspense skeletons per component; briefs
  page is Clerk-gated (`/vote`? check existing routes) — confirm placement.

## Process
linear-build loop: In Progress → build to acceptance → **verify against real
seeded data, never assert** → commit `feat: … (MOO-305)` → Done + evidence
comment. Tests: `npx vitest run` (12 passing; convex tests in `convex/*.test.ts`).

## Environment facts (verified)
- Convex dev `greedy-armadillo-714`, prod `precious-axolotl-906`. **All keys set
  in BOTH deployments:** ANTHROPIC_API_KEY, ARIZE_API_KEY, ARIZE_SPACE_ID,
  ARIZE_PROJECT_NAME, OPENFEC_API_KEY, CLERK_JWT_ISSUER_DOMAIN.
- **pnpm, not npm** (npm crashes on the .pnpm layout). Local dev on :3001.
- Arize project `badgerbrief` id `TW9kZWw6ODgzOTMxNjQxOTo3NzFI`; `ax` CLI authed.
- Deploy order: `npx convex deploy` BEFORE `npx vercel deploy --prod --yes`.

## Hard-won gotchas
1. `@convex-dev/agent` v0.6: createTool uses `inputSchema`/`execute`; it does
   **NOT forward experimental_telemetry** — manual TOOL/LLM span pattern lives in
   `convex/helloAgent.ts` (copy it for any agent work).
2. `ai` pinned ^6; `@arizeai/openinference-vercel` ^2 (v3 needs ai v7). Check
   `@openuidev/*` peer deps against ai@6/react 19 before installing.
3. Publish gates are structural: agents/components never mutate; brief components
   read PUBLISHED tables only (`api.public.*`).
4. Sunshine tRPC API (`campaignfinance.wi.gov/api/trpc/publicFrontendApi.*`) is
   public JSON — getReports embeds cash/debt balances; getTransactions filters by
   `createdByEntityId`. Kelda Roys transactions still unimported (only balances).
5. TS circularity: annotate return types on same-file `ctx.runQuery` calls.
6. `npx convex run` invokes internal functions; curl-404 on Clerk routes = gate
   working; vitest picks up any `*.test.mjs` — write vitest-style tests.

## Suggested skills for the MOO-305 session
- `superpowers:brainstorming` FIRST (resolve open questions a–e with Tarik)
- `openui` (the OpenUI/defineComponent skill — exact current API), plus WebFetch
  openui docs if gaps
- `linear-build:linear-build` (the loop), `frontend-design` or `impeccable`
  (component polish), `verify` before commit
- `claude-api` only if touching agent code (out of scope here)
