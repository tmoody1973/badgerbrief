# BadgerBrief handoff — continue at MOO-311 (Brief Agent + preferences)

## What this is
Non-partisan Wisconsin voter guide, live at **https://badgerbrief.vercel.app**.
Primary Aug 11, 2026; launch issue MOO-314 due **Aug 4**. Repo:
`/Users/tarikmoody/Documents/Projects/badgerbrief`. Tarik is architecture-trained,
non-traditional dev — Socratic mode per global CLAUDE.md unless he says ship it.

## Authoritative artifacts (read, don't re-derive)
- **Design spec:** `docs/superpowers/specs/2026-07-17-badgerbrief-m1-design.md`
  — §3 "Brief Agent" (durable workflow) + §7 (OpenUI) are MOO-311's contract.
- **MOO-305 spec** (the registry MOO-311 composes over):
  `docs/superpowers/specs/2026-07-18-moo-305-openui-brief-renderer-design.md`.
- **Linear:** MOO-311 has the full Intent/Acceptance/Verification —
  `get_issue MOO-311`. Evidence comments on Done issues record what was proven
  (MOO-305/307/312 comments are dense with integration facts).
- Project memory: `~/.claude/projects/-Users-tarikmoody-Documents-Projects-badgerbrief/memory/`
  (`badgerbrief-moo305-state.md` carries this week's gotchas incl. MOO-312's).
- Process ledger: `.superpowers/sdd/progress.md` (recorded Minor debt lives here).

## Board state (as of 2026-07-18 evening)
- ✅ Done w/ evidence: 302, 303, 304, 306, 308, 319, 320, **305** (OpenUI
  registry + /brief), **307** (address→districts, live on prod), **312**
  (editorial pipeline: Research+QA agents, /admin, audit_log, monitor crons).
- ▶ **Next: MOO-311** (signature feature, High). Then 310 (chat), 313 (evals),
  314 (launch). Independent: 315 (Google ads, High) → 316; 317 (polls);
  318 (FCC TV); 321 (PWA — Ionic evaluated and rejected). 309 Meta-blocked.

## MOO-311 in one breath
Signed-in user sets preferences (address→districts, starred races, issues,
detail level) and generates a personal source-linked brief: a **durable
workflow** (@convex-dev/workflow, spec §3) resolves ballot races → gathers
published data via read-only tools → LLM emits **OpenUI Lang over the MOO-305
registry** → parser validates (off-registry ⇒ automatic retry, never a broken
save) → `voter_briefs` row with timestamp + Arize traceId. `/brief` streams
progressively, lists saved briefs, prints cleanly.

## Everything MOO-311 needs already exists — wire, don't build
- **System prompt:** import `briefPrompt` from `src/lib/brief/prompt.ts` —
  NOT raw `library.prompt()` (we strip OpenUI's injected "generate
  realistic/plausible data" default rule there; test guards it).
- **Registry + parser:** `briefLibrary` in `src/lib/brief/library.tsx`;
  `createParser(briefLibrary.toJSONSchema()).parse(src)` → `meta.errors` /
  `meta.unresolved` is the validation loop's signal. Component set + arg
  shapes: see MOO-305 spec table (candidateSlug/raceId args; compare card max
  4 slugs; senate district only if odd/up in 2026 — filter logic in
  `src/lib/districts.ts` `relevantRaces`).
- **Renderer:** `BriefRenderer({source, isStreaming})` in
  `src/components/brief/renderer.tsx`; `/brief` page + `BriefLoader`
  (`src/components/brief/loader.tsx`) currently falls back to
  `src/lib/brief/fixture.ts` when `api.briefs.getMine` is null — replace the
  fallback path with generate-CTA + streaming, keep fixture for signed-out
  demos if desired. Print CSS + beforeprint `<details>` expansion done.
- **Preferences plumbing:** `convex/preferences.ts` (`saveDistricts`,
  `getMine`), `user_preferences` schema already has `savedRaceIds`,
  `savedIssues`, `detailLevel` (short/standard/deep) — the prefs UI extends
  the existing `BallotFinder` flow (`src/components/guide/ballot-finder.tsx`).
- **Published content:** flows through /admin approvals (MOO-312). Per
  deployment! Dev has one published position (kelda-roys immigration); prod
  research cron (12:00 UTC daily, 3 candidates/run rotated) starts filling
  Tarik's prod queue 2026-07-19. Quotes/stances may be sparse — brief
  composition must degrade gracefully (components already render null/fallback).
- **Agent substrate:** copy `convex/helloAgent.ts` telemetry pattern (manual
  AGENT/TOOL/LLM spans — @convex-dev/agent v0.6 does NOT forward
  experimental_telemetry; createTool uses `inputSchema`/`execute`).
  `@convex-dev/workflow` installed+configured since MOO-304.
- **Governance:** agents get READ-ONLY tools (`api.public.*` + voting_info +
  district-filtered races); publish mutations never exposed; only
  `AssistantNote` carries free text; no endorsement language.

## Open design decisions (brainstorm with Tarik BEFORE building)
(a) Streaming transport: workflow writes chunks to a table the client
    subscribes to, vs. HTTP action streaming, vs. generate-then-save with
    skeleton-only progress. Spec says "streams progressively"; the renderer
    already handles partial OpenUI Lang (hoisting = skeletons).
(b) Tools-vs-prefetch: give the LLM read tools (agentic) or assemble one
    context block (races/positions/finance for the user's districts) and
    single-shot generateText. Cheaper+more deterministic = prefetch; spec §3
    says "fetch via tools". Discuss cost/latency.
(c) Retry policy on parse errors: how many attempts, and does the error
    feedback loop use OpenUI's structured `onError`-style messages.
(d) Preferences UI placement: extend /brief page vs. separate /preferences.
(e) detailLevel → composition-level only (locked in MOO-305 spec; the prompt
    already carries the rule — confirm no per-component density creep).

## Hard-won gotchas (this session's additions)
1. Clerk "convex" JWT template now maps `metadata: {{user.public_metadata}}`
   (patched via Clerk API this session — PATCH must resend `name`). Admin =
   `public_metadata.role: "admin"`; Tarik's tarikjmoody@gmail.com has it.
2. Admin/authed Convex `useQuery` hooks must pass `"skip"` until
   `useConvexAuth().isAuthenticated` — the token exchange window otherwise
   crashes pages whose queries throw on unauth.
3. **"use node" Convex modules may only export actions** — queries/mutations
   live in sibling `*Queries.ts` files (see research/qa/monitor pairs).
4. `npx convex env get X` exits 0 even when unset — use `env list`.
5. Headless Clerk verification: backend API create user (+
   `public_metadata.role` if admin) → `POST /v1/sign_in_tokens` → browser
   `signIn.create({strategy:"ticket"})`. Turnstile blocks headless sign-UP.
   Write tokens to a file under `.playwright-mcp/` and run via
   browser_run_code_unsafe `filename` (allowed roots: repo + .playwright-mcp;
   hand-copying JWTs corrupts them). Delete test users after.
6. `research:run {candidateSlugs, force: true}` is the manual
   extraction/retry lever; hash short-circuit skips unchanged pages.
7. TS circularity: annotate return types on same-file `ctx.runQuery` calls.
   `ai` pinned ^6; zod 4; import zod from "zod" (registry uses it).
8. Seed data changes go through `docs/wisconsin_2026_primary_elections.json`
   → `node scripts/seed.mjs [--prod]` (idempotent). Crowley is Active again.
9. vitest: repo default env edge-runtime; node-only tests need
   `// @vitest-environment node` first line; `@/` alias works via
   vitest.config.mts.

## Environment facts (verified)
- Convex dev `greedy-armadillo-714`, prod `precious-axolotl-906`. Keys set in
  BOTH: ANTHROPIC_API_KEY, ARIZE_*, OPENFEC_API_KEY, CLERK_JWT_ISSUER_DOMAIN,
  **FIRECRAWL_API_KEY** (also in .env.local).
- **pnpm, not npm.** Dev server usually already running on :3001.
- Model for agents: `claude-opus-4-8` (repo precedent, load /claude-api skill
  before agent code). Arize project `badgerbrief`.
- Deploy order: `npx convex deploy -y` BEFORE `npx vercel deploy --prod --yes`.
- Suite: `npx vitest run` — 47 passing. `npx tsc --noEmit` clean.

## Process that worked (keep it)
linear-build loop (issue = contract; In Progress → build → **verify against
real data, never assert** → commit `feat: … (MOO-311)` → Done + evidence
comment) combined with: superpowers:brainstorming (resolve a–e above) →
spec → superpowers:writing-plans → superpowers:subagent-driven-development
(sonnet implementers for judgment tasks, haiku for verbatim transcription,
sonnet reviewers, most-capable final whole-branch review — final reviews
caught real bugs both times). Commits go straight to main (project pattern).

## Suggested skills for the MOO-311 session
- `superpowers:brainstorming` FIRST (decisions a–e), then writing-plans +
  subagent-driven-development
- `claude-api` (mandatory before agent code), `openui` (Lang/parser API),
  `linear-build:linear-build` (the loop), `verify` before commit
- Playwright MCP tools for browser verification (pattern in gotcha 5)
