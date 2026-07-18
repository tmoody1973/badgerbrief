# BadgerBrief handoff — continue at MOO-304 (agent infrastructure + Arize)

## What this is
BadgerBrief: non-partisan Wisconsin voter guide for the Aug 11, 2026 primary. Live at
**https://badgerbrief.vercel.app**. Repo: `/Users/tarikmoody/Documents/Projects/badgerbrief`.
The user (Tarik) is an architecture-trained, non-traditional dev — strong on Next.js/Convex/product,
weaker on CS fundamentals; explain Meta/API/dashboard flows at click level when asked.

## Authoritative artifacts (read these, don't re-derive)
- **Design spec (the contract):** `docs/superpowers/specs/2026-07-17-badgerbrief-m1-design.md`
- **Linear project:** "BadgerBrief M1 — Primary Guide + Agents" (team Moodyco), issues MOO-302…314,
  each with Intent / Acceptance / Verification sections. Evidence comments on closed issues record
  what was proven and how.
- Source docs/data: `docs/wisconsin_2026_primary_elections.json` (seed), campaign finance guide in `docs/`.
- Project memory: `~/.claude/projects/-Users-tarikmoody-Documents-Projects-badgerbrief/memory/`

## Board state
- ✅ Done with evidence: **MOO-302** (Next.js+Convex+Clerk+RetroUI scaffold), **MOO-303** (17-table
  schema, publish gates, 16 races/47 candidates seeded dev+prod, 9 vitest passing), **MOO-306**
  (public pages + JSON-LD/sitemap/robots, live), **MOO-308** (OpenFEC daily cron + Sunshine CSV
  importer; real FEC + Sunshine money live).
- ▶ **Next: MOO-304 — Agent infrastructure + Arize tracing.** Read the issue via
  `linear-server get_issue MOO-304` for the full contract. Summary: install `@convex-dev/agent` +
  `@convex-dev/workflow`, hello-world agent with one typed tool in a Convex action, AI SDK (Claude)
  telemetry → Arize via OpenTelemetry/OpenInference (span tag `agent.name`, session = thread id,
  user id on authed calls), durable-workflow retry demo, golden-question dataset scaffold loadable
  into Arize. Verification wants a real trace screenshot in the Arize UI (arize-link skill builds
  deep links) and a forced-failure retry demo.
- Then: MOO-305 (OpenUI brief components), MOO-307 (Census geocoder districts), MOO-310/311 (agents),
  MOO-312, MOO-313, MOO-309 (Meta ads — see blockers), MOO-314 (launch, due Aug 4).

## Process (how we've been working)
linear-build loop per issue: move In Progress → build to acceptance criteria → **verify against real
data, never assert** → commit referencing the issue id → mark Done + evidence comment. Commit style:
`feat: … (MOO-3xx)`. Tests: vitest + convex-test (`npx vitest run`); config in `vitest.config.mts`;
convex tests live in `convex/*.test.ts` (glob pattern in `convex/publish.test.ts` — vite's tinyglobby
doesn't support extglobs).

## Environment facts (verified working)
- Convex: dev `greedy-armadillo-714`, prod `precious-axolotl-906`. Clerk dev instance
  `amazed-hyena-57.clerk.accounts.dev`; `CLERK_JWT_ISSUER_DOMAIN` set in both Convex deployments.
- Vercel project `badgerbrief` (user `tmoody1973`), env vars set for prod+preview.
- CLIs authenticated on host: `vercel`, `clerk` (v1.3.0), `npx convex`. Linear via
  `mcp__plugin_linear-build_linear-server__*` tools (ToolSearch to load).
- `OPENFEC_API_KEY` set in both Convex deployments (registered key, working).
- **Missing for MOO-304:** `ANTHROPIC_API_KEY` and Arize credentials (space id / api key) — not yet
  in Convex env; ask the user or have them add to `.env.local` and copy via `npx convex env set`.

## Hard-won gotchas (do not relearn these)
1. **Deploy order:** `npx convex deploy` BEFORE `npx vercel deploy --prod --yes` — Vercel build's
   generateStaticParams reads prod Convex; wrong order = build failure (bit us once).
2. `.env.local` is Next.js/CLI-side only; Convex actions read Convex env (`npx convex env set`, add
   `--prod` for prod). User's key names may differ from code's (FEC key arrived as `FEC_API_KEY`).
3. Clerk v7: no `SignedIn`/`SignedOut` components — use server-side `auth()`. Session-token custom
   claims live in **instance config** (`clerk config patch --json '{"session":{"claims":{"metadata":
   "{{user.public_metadata}}"}}}'` — already applied). **Open follow-up (MOO-312):** the Clerk→Convex
   JWT template needs the same `metadata` claim before `convex/publish.ts` requireAdmin works for real
   users; tests simulate it.
4. Publish gates: agents must NEVER receive publish mutations as tools (`convex/publish.ts` is
   human-only). Agents write drafts + `review_tasks` only. Spec §3 governance is structural.
5. `npx convex run` can invoke internal functions; `convex data <table>` to inspect.
6. Curl-testing Clerk-protected routes returns 404 with `x-clerk-auth-reason: protect-rewrite,
   dev-browser-missing` — that IS the gate working, not a bug.
7. Local dev server runs on **:3001** (another project owns :3000).

## External blockers / timed events
- **Meta ad tracker (MOO-309):** user's political-ads identity verification submitted 2026-07-17
  (1–3 business days). `ads_archive` currently returns "App role required" (subcode 2332004) — retry
  the same Graph Explorer query after approval; `ads_read` permission NOT required (basic token +
  verified identity). Meta app "BadgerBrief" exists (no-use-case type). Fallback if still 403 after
  verification: recreate app via legacy "Other"/Business + Ad Library API product + accept terms.
- **July 29, 2026:** Sunshine pre-primary filings drop — the gov frontrunners (Roys, Crowley,
  Tiffany, Brennan, Hughes, Hong) have NO gubernatorial filings yet (verified in real exports).
  User re-exports transactions then; run `node scripts/import-sunshine.mjs <csv> --prod --coverage
  "pre-primary filings"`. Unmatched committees print for mapping in `scripts/sunshine-committees.json`
  ("Wisconsin Rebuild" deliberately unmapped — unidentified independent; never guess).
- Legislative export (`~/Downloads/transactions (1).csv`) banked for M2 (no legislative candidate
  pages in M1). Francesca Hong has $13,951 in her **Assembly** committee (2024-tagged) — decision
  made NOT to show it on her governor page (same mislabeling class as the Tiffany FEC fix).

## Suggested skills for next session
- `linear-build:linear-build` (the build loop — fires on "build MOO-304")
- `arize-instrumentation` + `arize-dataset` (tracing setup, golden dataset), `arize-link` (trace deep links)
- `claude-api` (before writing AI SDK/Claude model code)
- `context7-mcp`/WebFetch for `@convex-dev/agent` + `@convex-dev/workflow` current docs
- `verify` before committing nontrivial changes; `superpowers:verification-before-completion`
