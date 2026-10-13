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
  --dataset voter-help-golden-general \
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
- `voting-record-v10` (2026-07-23, Task 8 — `getVotingRecord` tool + rule 9):
  **93%, ties `sonnet-5-tuned`.** Golden-expectations on this ~15-question
  dataset is noisy run-to-run (observed 63%–100% across ~10 gate runs for
  the *same* candidate config, purely from agent sampling variance — not a
  deterministic effect of instruction wording) — retry a couple of times
  before concluding a real regression. Rule 9 (one line, after rule 8):
  "Voting records: state the passage/concurrence/adoption vote's position
  and tally, name the official bill title, and flag otherVotesOnBill>0."
  Removing rule 9 entirely reproduced 100% in one run, confirming genuine
  (if noisy) attention dilution from any 9th rule — kept minimal per the
  no-expansion policy below.

## Pieces

| Piece | Where |
|---|---|
| Golden dataset (25 questions + expectations, written for the Nov 3, 2026 general election) | Arize dataset `voter-help-golden-general`; source of truth `scripts/voter-help-golden.json`. The primary-era set, `voter-help-golden`, is kept with its results and is no longer the gate. |
| Gate runner | `scripts/eval-gate.mjs` |
| Judges (LLM-as-judge, claude-sonnet-5, function calling, temp 0) | Arize evaluators: Citation Faithfulness, Neutrality, Official Source First, Refusal Correctness, Golden Expectations |
| Continuous production scoring | Arize task `badgerbrief-agent-quality` — continuous, 25% sampling, AGENT spans only (`attributes.openinference.span.kind = 'AGENT'`) |
| Eval-score → /admin alerts | `scripts/eval-monitor.mjs` (run daily / after shipping agent changes); >20% failing on ≥5 samples → `eval_regression` warning alert, >40% → critical |
| Code evaluators | OpenUI parse gate `convex/lib/briefValidate.ts` + entity-ID existence `convex/briefs.checkEntityRefs` (wired into `briefAgent.composeAttempt` retry loop; terminal failures write a `brief_generation_failure` alert) |
| Trace provenance | `voter_briefs`, drafts, `article_sources`, and `review_tasks` store `traceId`; /admin renders "View trace in Arize" deep links (`src/lib/arize.ts`) |

## Updating the golden dataset

Edit `scripts/voter-help-golden.json`. The service can append rows but cannot
rewrite them, so:

- **Adding questions:** append the new rows.

  ```bash
  ax datasets append voter-help-golden-general --space "tarikjmoody Space" --json '[...]'
  ```

- **Changing existing questions:** create a new dataset from the file and point
  the gate at it. Keep the old one; its experiments are the history.

  ```bash
  ax datasets create --name voter-help-golden-<label> --space U3BhY2U6NDU0NjU6SWVhZA== --file scripts/voter-help-golden.json
  ax datasets list --space "tarikjmoody Space"        # verify by listing; do not trust the exit code
  node scripts/eval-gate.mjs --name <experiment> --dataset voter-help-golden-<label>
  ```

A baseline is only comparable within one dataset. The first passing run on a
new dataset becomes that dataset's baseline.

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
- **"judge run FAILED" with `num_errors` equal to every row** means the judges
  could not call their model. Read the reason:
  `GET https://api.arize.com/v2/tasks/<task-id>/runs?limit=1` → `failure_reason`.
  On 2026-10-12 it was `invalid x-api-key (status 401)`: the Anthropic key in
  the AI integration `anthropic-judge` had stopped working. That key is
  separate from the chat's own key in Convex, so the chat can answer while the
  judges cannot score. Fix it in Arize (Settings → AI Integrations →
  `anthropic-judge`), then re-run the gate.
- **The installed `ax` (0.26) is too old for the service as of 2026-10.**
  `experiments create|list`, `tasks list` and `datasets create` all fail with
  "additional fields (not defined in …) in the input". Version 0.39.0 works.
  Either upgrade (`ax upgrade`), or leave the install alone and point the gate
  at a pinned copy:

  ```bash
  printf '#!/bin/sh\nexec pipx run --quiet --spec arize-ax-cli==0.39.0 ax "$@"\n' > /tmp/ax39 && chmod +x /tmp/ax39
  AX_BIN=/tmp/ax39 node scripts/eval-gate.mjs --name <experiment>
  ```

  A run that dies after "Creating experiment" has still uploaded its answers:
  the experiment exists, unscored. Re-run under a new name.
- `ax … create` with `--space "tarikjmoody Space"` fails from 2026-10 with
  "additional fields (not defined in Space) in the input: is_private", and
  creates nothing. Pass the space ID (`U3BhY2U6NDU0NjU6SWVhZA==`) instead;
  `scripts/eval-gate.mjs` does.
- **The gate judges the whole visible answer (from 2026-10-12).** `evalAnswer`
  used to return `result.text`, which is the model's LAST step only. The chat
  shows a voter every step's text, so any answer that wrote a sentence, called
  a tool, then wrote another was judged with its opening cut off. On "Who's
  running for mayor of Green Bay?" the required "BadgerBrief doesn't cover
  municipal races" sentence was in the first step and the gate saw only the
  link. This is the likely cause of the old "lands ~14/15 runs" nit above.
  Scores from before this date were measured with the shorter text and are not
  directly comparable.
- `evalAnswer` deliberately emits NO telemetry spans, so gate runs never
  pollute the continuous production evaluators.
- `ax tasks list-runs` / `ax tasks trigger-run` (0.25.1 AND 0.26.0): the
  server now returns a `failure_reason` field on `TaskRun` that neither ax
  version's client model knows, so it throws "additional fields... not
  defined in TaskRun" on an otherwise-successful call. `eval-gate.mjs` polls
  `GET /v2/tasks/{id}/runs` directly instead — same REST pattern already
  used for pulling scores.
