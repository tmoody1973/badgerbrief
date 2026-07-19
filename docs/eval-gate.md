# Agent eval gate (MOO-313)

Continuous quality measurement on the trust-critical agent behaviors, plus an
on-demand golden-dataset experiment that is **the pre-deploy gate for any agent
prompt, instruction, or model change**. Regression = don't ship. Spec §10a.

## The rule

Before deploying ANY change to an agent's instructions, prompt contract, or
`MODEL` const (voterHelp / briefAgent / research / qa / scout):

```bash
# 1. Run the candidate config against the golden dataset
node scripts/eval-gate.mjs --name <change>-$(date +%Y%m%d) \
  [--model claude-xyz] [--instructions-file candidate.txt] \
  --baseline <last-passing-experiment>

# 2. Exit 0 → ship. Exit 1 → regression: do not deploy; fix and re-run.
```

- `--model` / `--instructions-file` run the CANDIDATE config against prod data
  without deploying anything (the harness `voterHelp:evalAnswer` takes them as
  overrides).
- `--baseline` compares per-evaluator pass rates against a previous
  experiment. **Only `golden-expectations` gates** (floor 90% absolute, and
  no drop >5 points vs baseline) — it is the one judge that sees the agent's
  tool trace, so its verdicts are grounded. The other four evaluators run
  ungrounded in gate context (their templates are shared with the production
  task) and systematically flag correct tool-sourced facts; they print as
  advisory columns.
- Experiments live in Arize under dataset `voter-help-golden` → full
  per-question judge explanations for any failure.

Current baseline experiment: **`sonnet-5-tuned`** (2026-07-19).
Model-decision history, all decided by this gate on 2026-07-19:
- `haiku-4-5-baseline-v3`: 79% — FAILED (invented "leads polls", under-
  answered questions it had data for, skipped a no-record disclosure).
  Reverted to opus.
- `opus-4-8-comparison`: 93% — passed (interim baseline).
- `sonnet-5-check` (untuned instructions): 79% — FAILED (emitted a literal
  `handoffOfficialLink:pollingPlace` pseudo-link with no tool call; skipped
  the municipal-coverage disclosure).
- `sonnet-5-tuned`: **93%, ties opus** — instructions gained rule 3
  (links copied verbatim from tool results only) and an explicit
  out-of-coverage disclosure for county/municipal races. **Shipped:**
  Voter Help runs `claude-sonnet-5` with the tuned instructions.
  Known nit: the Green Bay-mayor disclosure sentence lands ~14/15 runs.

## Pieces

| Piece | Where |
|---|---|
| Golden dataset (15 questions + expectations) | Arize dataset `voter-help-golden`; source of truth `scripts/voter-help-golden.json` |
| Gate runner | `scripts/eval-gate.mjs` |
| Judges (LLM-as-judge, claude-sonnet-5, function calling, temp 0) | Arize evaluators: Citation Faithfulness, Neutrality, Official Source First, Refusal Correctness, Golden Expectations |
| Continuous production scoring | Arize task `badgerbrief-agent-quality` — continuous, 25% sampling, AGENT spans only (`attributes.openinference.span.kind = 'AGENT'`) |
| Eval-score → /admin alerts | `scripts/eval-monitor.mjs` (run daily / after shipping agent changes); >20% failing on ≥5 samples → `eval_regression` warning alert, >40% → critical |
| Code evaluators | OpenUI parse gate `convex/lib/briefValidate.ts` + entity-ID existence `convex/briefs.checkEntityRefs` (wired into `briefAgent.composeAttempt` retry loop; terminal failures write a `brief_generation_failure` alert) |
| Trace provenance | `voter_briefs`, drafts, `article_sources`, and `review_tasks` store `traceId`; /admin renders "View trace in Arize" deep links (`src/lib/arize.ts`) |

## Updating the golden dataset

Edit `scripts/voter-help-golden.json`, then append the new rows:

```bash
ax datasets append voter-help-golden --space "tarikjmoody Space" --json '[...]'
```

Keep questions in the proven-live categories: procedural (official-source
checks), candidate/race info (citation checks), refusal traps (legal,
endorsement, combined double-traps — deliberately harder combined questions are
cheap and high-signal), unknown-data (no-invention checks), personalization
(signed-out behavior).

## Gotchas (earned 2026-07-19)

- `ax` CLI: 0.26.0 fixed `ai-integrations list` but broke `spans export` on
  our spans (raw OTel kind is `""`); keep `ax@old` (0.25.1 via
  `pipx install arize-ax-cli==0.25.1 --suffix @old`) for exports — scripts
  fall back automatically.
- `ax tasks trigger-run` with a time window 422s ("Invalid ISO datetime") —
  the CLI sends naive datetimes. Use the bundled SDK with tz-aware datetimes
  (see git history of this issue) or dataset-based triggers (no window needed).
- Project-task filtering only works at the TASK level (`--query-filter`);
  per-evaluator `query_filter` entries were silently ignored. `span_kind`
  itself matches nothing for our spans — filter on
  `attributes.openinference.span.kind`.
- The eval index lags the trace store 1–2h: backfill windows must end ≥2h ago.
- `ax datasets export` nests user fields under `additional_properties`.
- Judge evaluators must run with function calling (integration-level flag AND
  `--use-function-calling` on the evaluator version) — without it, labels
  occasionally come back `NOT_PARSABLE` or contradict their own explanation.
- `evalAnswer` deliberately emits NO telemetry spans, so gate runs never
  pollute the continuous production evaluators.
