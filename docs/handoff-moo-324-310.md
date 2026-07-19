# BadgerBrief handoff — continue at MOO-324 (quick fix), then MOO-310 (chat)

## What this is
Non-partisan Wisconsin voter guide, live at **https://badgerbrief.vercel.app**.
Primary Aug 11 2026; launch gate MOO-314 due **Aug 4** (~16 days). Repo:
`/Users/tarikmoody/Documents/Projects/badgerbrief`. Tarik: architecture-trained,
non-traditional dev; Socratic per global CLAUDE.md unless he says ship it —
this session he was in full ship-mode ("word", "build MOO-322", "do it").

## Authoritative artifacts (read, don't re-derive)
- Specs/plans: `docs/superpowers/specs/` + `docs/superpowers/plans/`
  (M1 design 2026-07-17 §3 Voter Help Agent is MOO-310's contract; MOO-311 +
  MOO-322 specs/plans show the working shapes).
- Linear: issues carry full Intent/Acceptance/Verification; Done issues have
  dense evidence comments (311, 322 especially).
- Process ledger: `.superpowers/sdd/progress.md` (per-task history + Minors).
- Memory: `~/.claude/projects/-Users-tarikmoody-Documents-Projects-badgerbrief/memory/`
  (`badgerbrief-moo311-state.md` is current; carries this session's gotchas).

## Board (as of 2026-07-19)
- ✅ Done w/ evidence: 302-308, 311 (Brief Agent), 312, 319, 320, 322
  (article discovery), 327 (/admin triage UX), 328 (candidate photos).
- ▶ **Next: MOO-324** (per-source position drafts — NOW URGENT: 99 sources
  feed extraction; cross-source same-issue extractions silently overwrite
  pending drafts' stance/citations; ~215 open review tasks at risk on every
  cron run). Then **MOO-310** (Voter Help Agent chat — last signature
  feature), 313 (evals), 314 (launch). Independent: 315 (Google ads, High),
  316, 317, 318, 321 (PWA), 323 (X ingestion, data-ready), 325 (telemetry
  lib ×5 copies), 326 (automated site mapping — manual one-shot already run).
  309 Meta-blocked (Content Library application = the nonprofit route).

## Content pipeline state (transformed this session)
- Published on prod: ~45+ positions across 9 issues, ~17+ quotes (Tarik
  actively publishing; counts move). `listIssueSlugs` is live-populated.
- ~215 open review tasks + 35 own-site policy pages recently in the source
  queue. Crons: scout 11:00 UTC (3 contested candidates/run), research
  extraction 12:00 UTC. Manual levers:
  `npx convex run scout:run '{"candidateSlugs":[...]}' --prod` and
  `npx convex run research:run '{"candidateSlugs":[...],"limit":30}' --prod`
  (limit counts TARGET URLS not candidates; explicit slugs bypass pools).
- jsonline.com ≈ zero yield (paywall teaser only; extraction correctly
  produces nothing). Productive outlets: WUWM, WPR, Urban Milwaukee.
- Approval flow: /admin "Article sources" (source approval) → extraction →
  review queue (draft approval) → publish → candidate pages + briefs
  instantly (briefs re-render live).

## MOO-310 in one breath (when you get there)
Spec §3 Voter Help Agent: user-facing chat, read-only tools over published
tables + voting_info, `handoffOfficialLink` tool, official-sources-first,
always cite, no endorsements/legal advice; one thread per user via
@convex-dev/agent component (helloAgent.ts is the substrate precedent —
manual Arize spans, v0.6 doesn't forward experimental_telemetry); answers may
include inline OpenUI components (§7) via the MOO-305 registry — the
brief contract artifact (`convex/lib/briefContract.json`, regenerate with
`pnpm generate:brief-contract`) is how convex code gets prompt/schema.
Brainstorm transport/streaming with Tarik (MOO-311 chose DB-chunk streaming;
chat may want @convex-dev/agent's own thread streaming — discuss).

## Session-earned gotchas (new since the MOO-311 handoff)
1. **Plain `Error` messages are REDACTED on prod Convex clients** ("Server
   Error"). User-facing gate reasons must be `ConvexError` (publish.ts now
   does this; `asMessage` in draft-row.tsx unwraps `.data`). Apply to any
   new user-facing mutation errors.
2. Convex bundler can't resolve `@/` aliases → server code consumes the
   registry via the checked-in contract artifact; React-free src files CAN
   be imported relatively (`../src/lib/districts`).
3. `npx convex data` prints a TABLE; row-count by lines starting with a
   quoted id — id prefixes differ per table (drafts `kd7/jn7`, published
   `js7`), don't grep a fixed prefix. `--prod` flag targets prod.
4. Scout rotation keys on scout_attempts (attempt-based; proposedAt-keyed
   starves on empty yields). Sources approved AFTER a research run sit
   unread until the next run — force-run after approval batches.
5. Site-map path-regex misses candidate-BRANDED platform pages (found:
   `mandelabarnes.com/wisconsinway` by hand) — MOO-326 comment has the fix
   direction (Firecrawl /map titles, nav sweep).
6. Quote publish gate requires non-empty `date`; extraction only sets it
   when the page states one → dateless drafts need an /admin edit before
   publish. Some approved-but-unpublished dateless quotes may linger.
7. Source credit: `src/lib/source-label.ts` (outlet ?? known-domain map ??
   hostname); extraction now stamps `outlet` on article quote drafts.
8. `convex run` executes internal functions on dev AND prod; admin-gated
   (identity-checked) mutations can NOT be run via CLI — use the browser
   with headless Clerk (gotcha in prior handoff still accurate).
9. One pre-existing orphaned `"generating"` voter_briefs row on dev (left
   intentionally); MOO-311's workflow lacks onComplete (10-min idempotency
   window is the escape hatch) — folded into MOO-325's scope notes.
10. Vitest count moves fast — verify with a real run, don't trust stale
    numbers (final review caught a 127-vs-104 claim). Currently 108.

## Environment facts (verified this session)
- Convex dev `greedy-armadillo-714`, prod `precious-axolotl-906`. Keys in
  BOTH: ANTHROPIC_API_KEY, ARIZE_*, FIRECRAWL_API_KEY, **PERPLEXITY_API_KEY**
  (also .env.local), CLERK_JWT_ISSUER_DOMAIN, OPENFEC_API_KEY.
- **pnpm.** Dev server usually already on :3001 (:3000 is a stale unrelated
  project). Deploy order: `npx convex deploy -y` BEFORE
  `npx vercel deploy --prod --yes`.
- Suite `npx vitest run` — 108 passing; `npx tsc --noEmit` clean.
- Model for agents: `claude-opus-4-8`; Arize project `badgerbrief`.
- `npx convex logs --prod` TAILS forever — run in background or with timeout.

## Process that worked (keep it)
linear-build loop (issue = contract; In Progress → build → verify against
real data, never assert → commit straight to main → Done + evidence comment)
× superpowers: brainstorming (only for real open decisions — skip when the
issue already records them) → spec → writing-plans → subagent-driven-development
(sonnet implementers/reviewers, haiku for pure transcription, most-capable
model for final whole-branch review — final reviews caught real defects in
BOTH 311 and 322, including defects in my own specs). Task briefs via the
skill's `scripts/task-brief`; review packages via `scripts/review-package`
(record BASE before dispatch). For small surgical fixes (ConvexError,
source-label) inline work without subagents was right.

## Suggested skills for the next session
- `superpowers:brainstorming` (MOO-310 open decisions), then writing-plans +
  subagent-driven-development
- `claude-api` (mandatory before agent code), `openui` (inline chat
  components), `linear-build:linear-build`, `verify` before commit
- Playwright MCP for browser verification (headless Clerk pattern in the
  MOO-311 handoff §gotcha 5)
