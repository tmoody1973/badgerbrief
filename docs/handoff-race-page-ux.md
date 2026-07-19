# BadgerBrief handoff — implement the race-page scroll UX spec, then finish MOO-314

## What this is
Non-partisan Wisconsin voter guide, live at **https://badgerbrief.vercel.app**.
Primary Aug 11 2026; launch gate MOO-314 due **Aug 4**. Repo:
`/Users/tarikmoody/Documents/Projects/badgerbrief`. Tarik: architecture-trained,
non-traditional dev; Socratic per global CLAUDE.md unless he says ship it —
this session was ship-mode throughout ("a", "yep", "continue").

## THE NEXT ACTION (start here)
The race-page scroll-UX design is **approved and spec'd**:
`docs/superpowers/specs/2026-07-19-race-page-scroll-ux-design.md` (committed).
Continue the superpowers flow: invoke **superpowers:writing-plans** on that
spec, then implement. It's frontend-only (no agent/prompt change → **eval gate
NOT required**). Consider creating a Linear issue for it first per the
linear-build loop (it grew out of MOO-314 UX polish but is its own shippable).

Spec TL;DR: sticky chip jump-nav (`Democrats (7) · Republicans (2) ·
Independent · The money · Sources`, plain anchors, no scroll-spy), 2-up
compact candidate tiles on mobile (`CandidateCard` gains `variant="compact"`,
default stays `full`), did-not-file candidates fold into a collapsed
`<details>` per party — **Rodriguez (Withdrawn) and Hughes (Suspended) stay
VISIBLE: they're on the printed ballot per WEC's official list** — finance
table top-5 + show-all, everything stays in the DOM. New pure helper
`isOnBallot()` in new `src/lib/ballot-status.ts` (false only for "not on" /
"did not file", case-insensitive) + unit test. Acceptance: wi-gov race page
**5.8 → ≤3 screens at 390×844** (measure with the snippet below), no
horizontal scroll at 320/390, chips land with headings visible
(`scroll-mt` on sections).

Scroll-measurement snippet (Playwright, same one that diagnosed it):
`document.body.scrollHeight / viewportHeight` at 390×844 and 1280×800.

## Board (as of 2026-07-19 ~18:30 CT)
- ✅ Done w/ evidence: 302–308, 310, 311, **313** (eval stack; Voter Help now
  runs **claude-sonnet-5 with gate-tuned instructions** — haiku 79% FAIL →
  opus 93% → sonnet untuned 79% FAIL (emitted a literal
  `handoffOfficialLink:pollingPlace` pseudo-link) → sonnet tuned 93% PASS;
  gate baseline = experiment `sonnet-5-tuned`), 312, 319, 320, 322, 324, 327, 328.
- ▶ **MOO-314 In Progress** — day-1 hardening DONE with evidence comment on
  the issue (all §10 items executed or honestly N/A). Remaining are
  Tarik/launch-day items (steps in `docs/launch-runbook.md`):
  domain decision · Search Console + sitemap submit · 48h cron screenshot ·
  phone-off-wifi test · triage Crowley-quote alert on /admin.
- Independent: 315 (Google ads, High), 316, 317, 318, 321 (PWA), 323, 325
  (telemetry consolidation), 326. 309 Meta-blocked.

## What shipped this session (all committed to main, prod-deployed)
1. **MOO-313 complete + amended**: 5 sonnet-5 judges in Arize (fn-calling,
   temp 0), continuous task `badgerbrief-agent-quality` (25% sampling,
   task-level filter `attributes.openinference.span.kind = 'AGENT'` — the ONLY
   filter level that works), golden dataset `voter-help-golden` (15 Qs),
   gate `pnpm eval:gate` + monitor `pnpm eval:monitor`, entity-ID code
   evaluator in brief compose loop, review_tasks.traceId + /admin Arize
   deep-links (`src/lib/arize.ts`). **docs/eval-gate.md is LAW: any agent
   prompt/instruction/model change runs the gate vs baseline `sonnet-5-tuned`
   first.**
2. **MOO-314 day-1**: /methodology page + footer link; launch runbook +
   rollback plan (`docs/launch-runbook.md`) with first prod snapshot taken
   (`backups/prod-20260719.zip`); §10 evidence bundle on the Linear issue.
   TWO data fixes vs WEC official xlsx: Jacobson → not-on-ballot (was Active);
   "Independent primary" header → "Independent — November general election
   only". One editorial flag: published Crowley quote no longer exists on
   crowleyforwi.com → `source_change` alert filed (refId `kh75n977…`).
3. **Mobile nav**: hamburger menu below `sm` (`mobile-nav.tsx`), nav
   destinations centralized in `nav-links.tsx` (Races, How to vote, Voter
   Help, My Brief, Methodology); desktop row keeps inline links. Verified
   live at 390/1280. Ionic evaluated and rejected (PWA via MOO-321 is the
   mobile path; Capacitor only if store presence needed post-election).

## Session-earned gotchas (beyond docs/handoff-moo-314.md, which still holds)
1. Race page composition: 13 shown candidate cards ≈ 3.5 of the 5.8 mobile
   screens; 5 are not-on-ballot. `CandidateCard` is in
   `src/components/guide/cards.tsx`; race page party sections at
   `src/app/races/[slug]/page.tsx` (~L102); `StatusBadge` label logic in
   `labels.tsx` ("not on"/"did not file" → "Not on ballot") — `isOnBallot`
   mirrors it deliberately.
2. WEC official sources for candidate truth: contests xlsx
   `elections.wi.gov/media/40146/download`, write-in docx `media/40176`
   (only Hulsey is a registered governor write-in). Both need a real browser
   (curl gets a bot wall); Playwright download pattern is in this session.
3. `npx convex data <table> --prod --format json` exists — stop parsing the
   pipe tables.
4. Playwright MCP: `browser_run_code_unsafe` has NO `require()`; write
   Playwright-style `async (page) => {}` files under `.playwright-mcp/`
   (gitignored) and run via `filename`.
5. WEC 2026 dates verified official: Aug 11 primary (Wis. Stat. 5.02(12s)),
   Jul 22 mail/online reg deadline; early voting Jul 28–Aug 9 consistent with
   WEC's 14-day pattern.
6. Two informational `eval_regression` warnings + one Crowley `source_change`
   warning are OPEN on /admin by design — Tarik resolves in UI.
7. Vitest count **120**; verify with a real run.

## Environment facts (verified this session)
- Convex dev `greedy-armadillo-714`, prod `precious-axolotl-906`. Deploy order:
  `npx convex deploy -y` BEFORE `npx vercel deploy --prod --yes` (first vercel
  attempt sometimes errors — retry once; both alias the same commit). pnpm;
  dev server :3001.
- `npx tsc --noEmit` clean; `npx next build` clean; 120 tests green.
- Voter Help chat: `claude-sonnet-5` + tuned INSTRUCTIONS (convex/voterHelp.ts);
  other agents `claude-opus-4-8`. Arize project `badgerbrief`
  (`TW9kZWw6ODgzOTMxNjQxOTo3NzFI`); ax CLI landmines in
  docs/eval-gate.md + memory `badgerbrief-moo313-state`.
- Task tracker has the MOO-314 items (#27–36 completed) and brainstorm items
  (#37–39; #39 = "handoff to writing-plans" is what the next session does).

## Process that worked (keep it)
linear-build loop (issue = contract; verify against real data, never assert;
commit straight to main; Done + evidence comment). superpowers
brainstorm → spec → writing-plans for real design decisions (this race-page
spec came out of exactly that flow — measurements first, then one question at
a time). Launch checks against OFFICIAL sources (WEC xlsx/docx) caught two
real data errors the tests never would have.
