# BadgerBrief handoff — continue at MOO-314 (launch gate, due Aug 4)

## What this is
Non-partisan Wisconsin voter guide, live at **https://badgerbrief.vercel.app**.
Primary Aug 11 2026. Repo: `/Users/tarikmoody/Documents/Projects/badgerbrief`.
Tarik: architecture-trained, non-traditional dev; Socratic per global CLAUDE.md
unless he says ship it — recent sessions were full ship-mode ("continue").

## Authoritative artifacts (read, don't re-derive)
- Specs: `docs/superpowers/specs/` — M1 design 2026-07-17 is the contract.
- **`docs/eval-gate.md` is now LAW for agent changes**: any prompt/instruction/
  model change runs `pnpm eval:gate -- --name X --baseline opus-4-8-comparison`
  first; regression = don't ship.
- Linear: MOO-314 carries Intent/Acceptance/Verification. MOO-313's Done
  comment holds the full eval-stack evidence + the Haiku-revert narrative.
- Process ledger: `.superpowers/sdd/progress.md` (gitignored, local).
- Memory: `badgerbrief-moo313-state.md` is current (ax CLI landmines, Arize IDs).

## Board (as of 2026-07-19 ~15:00 CT)
- ✅ Done w/ evidence: 302–308, 310, 311, 312, 313 (eval stack — THIS session),
  319, 320, 322, 324, 327, 328.
- ▶ **Next: MOO-314** (launch gate). Independent: 315 (Google ads, High), 316,
  317, 318, 321 (PWA), 323 (X ingestion), 325 (telemetry-lib consolidation —
  target `convex/lib/agentTelemetry.ts`, 5 older copies to migrate), 326 (site
  mapping). 309 Meta-blocked.

## MOO-313 outcome you must respect
- **Voter Help is back on `claude-opus-4-8`** (MODEL const, `convex/voterHelp.ts`).
  The golden gate decided it: haiku 79% vs opus 93% on grounded golden-
  expectations (haiku invented "leads polls", under-answered voter-ID, skipped
  a no-record disclosure). Don't re-litigate without a new gate run.
- Eval stack live: 5 sonnet-5 judges; continuous task `badgerbrief-agent-quality`
  (25% sampling, AGENT spans only); `pnpm eval:monitor` writes `eval_regression`
  alerts (2 informational ones left open on /admin — resolvable in UI);
  /admin deep-links every draft/task/article-source to its Arize trace.
- `voterHelp:evalAnswer` (internal) is the harness: model/instructions
  overrides, returns toolTrace, NO telemetry (won't pollute production evals).

## Session-earned gotchas (new since docs/handoff-moo-313.md)
1. ax CLI 0.26.0: fixed `ai-integrations list`, BROKE `spans export` for our
   spans (raw OTel kind `""`). `ax@old` = 0.25.1 pinned via
   `pipx install arize-ax-cli==0.25.1 --suffix @old`; scripts fall back
   automatically. Many creates "fail" client-side but succeed server-side —
   verify by listing, never trust exit codes.
2. `ax tasks trigger-run` 422s on any time window (naive datetimes). For
   project-task backfills use the bundled SDK
   (`~/.local/pipx/venvs/arize-ax-cli/bin/python`, `ArizeClient`, tz-aware
   datetimes). Dataset-task triggers need no window and work via CLI.
3. Arize filtering: ONLY the task-level `--query-filter` is honored
   (per-evaluator query_filters silently ignored), and `span_kind` matches
   NOTHING for manually-created spans — use
   `attributes.openinference.span.kind = 'AGENT'`.
4. `ax experiments export` omits task-attached evals. Read
   `GET https://api.arize.com/v2/experiments/{id}/runs` — flat
   `eval.<name>.label/.score/.explanation` columns. API key lives in
   `~/.arize/profiles/default.toml`.
5. `ax datasets export` nests user fields under `additional_properties`.
6. LLM-judge grounding matters: judges that can't see tool output flag
   correct tool-sourced facts as fabrication. The golden judge gets the
   harness's toolTrace (30K/tool — a 3K truncation made real 62KB race
   payloads read as invented candidates). Only golden-expectations gates;
   the other four are advisory in gate context.
7. Judges need function calling (integration flag + `--use-function-calling`
   per version) or labels come back NOT_PARSABLE / contradicting their own
   explanation.
8. `ballotForUser` now takes `v.string()` + normalizeId (eval harness runs
   under synthetic userId "eval-gate" → reads as signed-out, doesn't crash).
9. Eval index lags traces 1–2h; export limit 500; backfill windows end ≥2h ago.
10. Vitest count now **120**; verify with a real run.

## Environment facts (verified this session)
- Convex dev `greedy-armadillo-714`, prod `precious-axolotl-906`. Deploy order:
  `npx convex deploy -y` BEFORE `npx vercel deploy --prod --yes` (vercel's
  first attempt sometimes errors — retry once). pnpm; dev server :3001.
- `npx tsc --noEmit` clean; `npx next build` clean; 120 tests green.
- Chat model back to `claude-opus-4-8`; all agents opus. Arize project
  `badgerbrief` (base64 `TW9kZWw6ODgzOTMxNjQxOTo3NzFI`), org/space IDs in
  `src/lib/arize.ts`.
- Headless Clerk recipe unchanged (MOO-311 handoff gotcha 5); Playwright MCP
  `browser_run_code_unsafe` wants Playwright-style `async (page) => {}` files.

## Process that worked (keep it)
linear-build loop (issue = contract; In Progress → build → verify against real
data, never assert → commit straight to main → Done + evidence comment). The
eval gate caught its own harness bugs by being run against reality three times
(field nesting, truncation-as-fabrication, ungrounded-judge noise) — run the
loop, read the failures, fix the harness, re-run. Deliberately degraded
configs are cheap regression-detector proof.
