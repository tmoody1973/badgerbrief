# BadgerBrief handoff — continue at MOO-313 (evals), then MOO-314 (launch)

## What this is
Non-partisan Wisconsin voter guide, live at **https://badgerbrief.vercel.app**.
Primary Aug 11 2026; launch gate MOO-314 due **Aug 4** (~15 days). Repo:
`/Users/tarikmoody/Documents/Projects/badgerbrief`. Tarik: architecture-trained,
non-traditional dev; Socratic per global CLAUDE.md unless he says ship it —
last two sessions he was in full ship-mode ("continue", "do haiku, please").

## Authoritative artifacts (read, don't re-derive)
- Specs: `docs/superpowers/specs/` — M1 design 2026-07-17 **§10a is MOO-313's
  contract**; `2026-07-19-moo-310-voter-help-design.md` is the chat's shape.
- Linear: MOO-313 carries full Intent/Acceptance/Verification. Done issues
  310, 311, 322, 324 have dense evidence comments (310's includes the Arize
  export command + defect-found-live narrative).
- Process ledger: `.superpowers/sdd/progress.md` (gitignored, local).
- Memory: `~/.claude/projects/-Users-tarikmoody-Documents-Projects-badgerbrief/memory/`
  — `badgerbrief-moo310-state.md` + `badgerbrief-moo324-state.md` are current.
- Prior handoff (still-valid env/process detail): `docs/handoff-moo-324-310.md`.

## Board (as of 2026-07-19 ~13:00 CT)
- ✅ Done w/ evidence: 302–308, 310 (Voter Help chat — shipped THIS session),
  311, 312, 319, 320, 322, 324 (per-source drafts — shipped this session),
  327, 328.
- ▶ **Next: MOO-313** (Arize evaluators + eval gating — the formal quality
  gate; also owed a specific decision, see below). Then **314** (launch).
  Independent: 315 (Google ads, High), 316, 317, 318, 321 (PWA), 323 (X
  ingestion), 325 (telemetry lib — target shape now EXISTS as
  `convex/lib/agentTelemetry.ts`, migrate the 5 older copies), 326 (site
  mapping). 309 Meta-blocked.

## MOO-313 context you need
- **Standing decision to execute:** Voter Help chat was switched to
  **claude-haiku-4-5** (Tarik's call, ~5x cheaper; `MODEL` const in
  `convex/voterHelp.ts`). Spot-verified live (cited deadlines, legal+
  endorsement double-refusal, no-invention) but **MOO-313's golden-dataset
  experiment is the formal gate** — build it, run Haiku vs Opus on it, keep
  or revert. Other agents (brief/research/qa) still `claude-opus-4-8`.
- Trace substrate is ready: every Voter Help run traces with
  `session.id = threadId`, AGENT→TOOL→LLM spans, project `badgerbrief`
  (base64 id `TW9kZWw6ODgzOTMxNjQxOTo3NzFI` — name alone fails for
  `ax spans export`; ARIZE keys in both convex deployments; `ax` CLI
  installed + profiled). Brief Agent stores `traceId` on `voter_briefs`;
  research drafts carry `traceId` → review_tasks deep-linking is partial
  plumbing already.
- Golden questions already proven live (reuse as dataset seeds): registration
  deadline, "who's on my ballot" (200 E Wells St → CD4/S7/A19), "should I
  sue my clerk", unknown races (Dane sheriff / Green Bay mayor / Racine exec),
  candidate info (kelda-roys, mandela-barnes). Transcripts in MOO-310's
  evidence comment.
- Code-evaluator targets that already exist: `validateBriefSource`
  (`convex/lib/briefValidate.ts`) parses OpenUI against
  `convex/lib/briefContract.json`; published-entity-ID existence check needs
  writing. `alerts` table + `/admin` alerts panel exist (`adminQueue.alerts`).
- Relevant skills for the work: `arize-evaluator`, `arize-dataset`,
  `arize-experiment`, `arize-trace`, `arize-link` (ax CLI based). Also
  `claude-api` before any judge-prompt/LLM code, `linear-build:linear-build`
  for the loop, superpowers brainstorm→spec→plan for real open decisions only.

## Session-earned gotchas (new since docs/handoff-moo-324-310.md)
1. **@convex-dev/agent `excludeToolMessages: true` silently drops assistant
   messages that carry a tool call AND interleaved text** — answer fragments
   vanish. Filter only `message.role === "tool"` server-side; hide text-less
   bubbles client-side (`voterHelpQueries.listThreadMessages` shows the fix).
2. Any file under `convex/` importing node-only packages needs its own
   `"use node"` — even pure lib files (`convex/lib/agentTelemetry.ts`);
   the bundler analyzes every convex/ file, not just entry points.
3. Agent-native streaming pattern that works end-to-end:
   mutation `saveMessage` → scheduled `"use node"` action
   `agent.streamText({saveStreamDeltas:true})` + `consumeStream()` →
   query pairing `listMessages`+`syncStreams` → `useThreadMessages({stream:true})`
   + `toUIMessages`/`useSmoothText`. Thread-per-user via
   `components.agent.threads.listThreadsByUserId`.
4. Headless Clerk (dev): create user now REQUIRES `password`;
   `UID` is a reserved zsh variable (use CUID); ticket flow unchanged
   (`signIn.create({strategy:"ticket"})` + `setActive`); delete test user after.
5. `npx convex data <table> --prod` output is PIPE-delimited with a header —
   parse by `|` columns. `--component agent threads` reads component tables.
6. `research:run` accepts `force: true` to bypass the content-hash gate.
   Per-source drafts mean force-runs fan the review queue out fast
   (kelda-roys 6→48 drafts) — intended.
7. `ax spans export` needs the base64 project id (or `--space`); session
   export: `ax spans export TW9kZWw6ODgzOTMxNjQxOTo3NzFI --session-id <id> --stdout`.
8. Playwright MCP `browser_type`/`fill_form` are broken in this setup
   ("target: expected string") — drive inputs via `browser_evaluate` with the
   native value setter + input event dispatch.
9. First `npx vercel deploy --prod --yes` sometimes returns transient
   `"status":"error"` — retry once; both attempts alias the same commit.
10. Vitest count now **117**; verify with a real run, never trust stale numbers.

## Environment facts (verified this session)
- Convex dev `greedy-armadillo-714`, prod `precious-axolotl-906`. Deploy
  order: `npx convex deploy -y` BEFORE `npx vercel deploy --prod --yes`
  (skip vercel when only convex code changed). pnpm; dev server :3001.
- `npx tsc --noEmit` clean; `npx next build` clean; 117 tests green.
- Chat model `claude-haiku-4-5`; other agents `claude-opus-4-8`;
  Arize project `badgerbrief`. PERPLEXITY key present but the perplexity
  MCP plugin's own key is dead (401) — use WebSearch instead.
- `.playwright-mcp/` is now gitignored (was polluting the index).

## Process that worked (keep it)
linear-build loop (issue = contract; In Progress → build → verify against
real data, never assert → commit straight to main → Done + evidence comment).
Small surgical changes inline (MOO-324 was 3 files); bigger features get a
short design doc in `docs/superpowers/specs/` first (MOO-310 did). Live
verification catches real defects (gotcha 1 was found by reading an actual
truncated answer, not by tests) — always drive the real flow. Deliberately
harder combined trap questions (legal advice + endorsement in one) are cheap
and高-signal for behavior checks — reuse that trick in the eval dataset.

## Suggested skills for the next session
- `arize-evaluator` + `arize-dataset` + `arize-experiment` (the core of 313),
  `arize-link` (admin deep-links), `claude-api` (mandatory before judge code)
- `superpowers:brainstorming` only for real open decisions (e.g. judge model
  choice, sampling rate, where the pre-deploy gate runs — script vs CI)
- `linear-build:linear-build`, `verify` before commit
- Playwright MCP + headless Clerk (gotcha 4/8) for /admin deep-link verification
