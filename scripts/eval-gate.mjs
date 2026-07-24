#!/usr/bin/env node
/**
 * MOO-313 golden-dataset pre-deploy gate.
 *
 * Runs the Voter Help agent over the `voter-help-golden` Arize dataset,
 * uploads the answers as an Arize experiment, scores them with the five
 * LLM-as-judge evaluators, and prints per-evaluator pass rates.
 * Regression = don't ship (see docs/eval-gate.md).
 *
 * Usage:
 *   node scripts/eval-gate.mjs --name haiku-baseline                 # current prod model
 *   node scripts/eval-gate.mjs --name opus-check --model claude-opus-4-8
 *   node scripts/eval-gate.mjs --name degraded --instructions-file bad.txt
 *   node scripts/eval-gate.mjs --name candidate --baseline haiku-baseline
 *   node scripts/eval-gate.mjs --name candidate --judge-passes 1   # single noisy run
 *   Flags: --dev (run agent against dev deployment; default prod), --model,
 *          --instructions-file, --judge-passes N (default 3)
 *
 * The judge is NOT deterministic. Three runs over identical code and identical
 * answers scored golden-expectations 67%, 72% and 94%, with different questions
 * failing each time, so a single pass cannot certify anything against a 90%
 * floor. Answers are therefore generated once and judged N times, and a
 * question fails only on a majority verdict. Generating answers is the
 * expensive half (one live agent call each), so the extra passes are cheap.
 *
 * Requires: `ax` CLI with a profile, `npx convex` auth for this project.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SPACE = "tarikjmoody Space";
const DATASET = "voter-help-golden";
const EVALUATORS = [
  { id: "RXZhbHVhdG9yOjExNTA5OjlvMC8=", name: "citation-faithfulness" },
  { id: "RXZhbHVhdG9yOjExNTEwOlZDRVk=", name: "neutrality" },
  { id: "RXZhbHVhdG9yOjExNTExOkdieFY=", name: "official-source-first" },
  { id: "RXZhbHVhdG9yOjExNTEyOk52S3o=", name: "refusal-correctness" },
  { id: "RXZhbHVhdG9yOjExNTEzOmVxUjk=", name: "golden-expectations" },
];
const PASS_LABELS = new Set(["faithful", "neutral", "official_first", "correct", "meets"]);
const MIN_GOLDEN_RATE = 0.9; // absolute floor for golden-expectations
const MAX_BASELINE_DROP = 0.05; // any evaluator dropping more than this vs baseline fails

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const name = arg("--name");
if (!name) {
  console.error("--name <experiment-name> is required");
  process.exit(2);
}
const model = arg("--model");
const instructionsFile = arg("--instructions-file");
const baseline = arg("--baseline");
const useDev = process.argv.includes("--dev");
const reportOnly = process.argv.includes("--report-only"); // reprint rates for an existing experiment
// How many times the SAME answers are judged before taking a majority. The
// judge is non-deterministic (67/72/94% observed on identical input), so 1 is
// only for reproducing a single historical run.
const judgePasses = Math.max(1, Number(arg("--judge-passes") ?? 3));

function ax(args, input) {
  return execFileSync("ax", args, { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
/** ax 0.26 sometimes fails client-side deserializing a SUCCESSFUL create/trigger
 * response (new server fields). Run the command, swallow that failure, and let
 * the caller verify server-side state by listing. */
function axTolerant(args, input) {
  try {
    return ax(args, input);
  } catch (err) {
    console.warn(`  (ax exited non-zero on ${args[0]} ${args[1]} — verifying server-side)`);
    return null;
  }
}
function axJson(args, input) {
  const raw = ax(args, input);
  const start = raw.indexOf("[") >= 0 && (raw.indexOf("[") < raw.indexOf("{") || raw.indexOf("{") < 0)
    ? raw.indexOf("[")
    : raw.indexOf("{");
  return JSON.parse(raw.slice(start));
}

// 1. Export golden dataset
const examples = axJson(["datasets", "export", DATASET, "--space", SPACE, "--stdout"]);
console.log(`golden dataset: ${examples.length} examples`);

// 2. Answer each question with the real agent (via convex run — real tools, real published data)
const instructions = instructionsFile ? readFileSync(instructionsFile, "utf8") : undefined;
const runs = [];
for (const ex of reportOnly ? [] : examples) {
  const f = ex.additional_properties ?? ex; // ax export nests user fields
  const payload = { prompt: f.question };
  if (model) payload.model = model;
  if (instructions) payload.instructions = instructions;
  const convexArgs = ["convex", "run", "voterHelp:evalAnswer", JSON.stringify(payload)];
  if (!useDev) convexArgs.push("--prod");
  const t0 = Date.now();
  const out = execFileSync("npx", convexArgs, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const parsed = JSON.parse(out.slice(out.indexOf("{")));
  runs.push({
    example_id: ex.id,
    output: parsed.text,
    tool_context: parsed.toolTrace ?? "[]",
    metadata: { model: parsed.model, latency_ms: Date.now() - t0, category: f.category },
  });
  console.log(`  ${f.category}: ${Date.now() - t0}ms — ${f.question.slice(0, 60)}`);
}

// 3. Create the experiment(s) and score each.
//
// MAJORITY-OF-N, AND WHY IT IS CHEAP. The judge is not deterministic: three
// runs over identical code and identical answers scored golden-expectations
// 67%, 72% and 94%, with DIFFERENT questions failing each time. Against that,
// a single run cannot certify anything — a 90% floor passes or fails largely on
// which way the judge happened to fall.
//
// The expensive half is generating the answers (one live agent call per
// question, already done above in step 2). Judging is comparatively cheap, so
// the SAME answers are uploaded as N experiments and judged N times, and a
// question only counts as failing when a majority of passes say so. That
// collapses the variance without re-running the agent N times.
const evaluatorsJson = JSON.stringify(
  EVALUATORS.map((e) => ({
    evaluator_id: e.id,
    column_mappings:
      e.name === "golden-expectations"
        ? { input: "question", output: "output", expectations: "expectations", context: "tool_context" }
        : { input: "question", output: "output" },
  })),
);

/** Upload the answers as `expName` and score them once. Returns its rows. */
async function judgePass(expName) {
  if (!reportOnly) {
    axTolerant(
      ["experiments", "create", "--name", expName, "--dataset", DATASET, "--space", SPACE, "--file", "-"],
      JSON.stringify(runs),
    );
  }
  const expId = experimentIdByName(expName);
  console.log(`experiment: ${expName} (${expId})`);

  if (!reportOnly) {
    axTolerant([
      "tasks", "create-evaluation",
      "--name", `gate-${expName}`,
      "--task-type", "TEMPLATE_EVALUATION",
      "--dataset", DATASET,
      "--space", SPACE,
      "--experiment-ids", expId,
      "--evaluators", evaluatorsJson,
      "--no-continuous",
    ]);
  }
  const tasks = axJson(["tasks", "list", "--space", SPACE, "-o", "json"]);
  const task = (tasks.tasks ?? tasks).find((t) => t.name === `gate-${expName}`);
  if (!task) {
    console.error(`evaluation task "gate-${expName}" not found after create`);
    process.exit(2);
  }
  console.log(`  scoring with judges (task ${task.id})…`);
  if (!reportOnly) axTolerant(["tasks", "trigger-run", task.id, "--experiment-ids", expId, "--wait"]);
  await awaitTaskRun(task.id);
  return fetchRuns(expId);
}

// `ax tasks list-runs` is a landmine: the server now returns a `failure_reason`
// field on TaskRun that ax's client-side model doesn't know, so it throws on
// deserialization even though the run completed fine server-side (see
// docs/eval-gate.md ax CLI landmines). Poll the REST endpoint instead — same
// API the score-fetch below already uses.
const apiKey = (() => {
  const toml = readFileSync(`${process.env.HOME}/.arize/profiles/default.toml`, "utf8");
  const match = toml.match(/api_key\s*=\s*"([^"]+)"/);
  if (!match) throw new Error("no api_key in ~/.arize/profiles/default.toml");
  return match[1];
})();
async function fetchTaskRuns(taskId) {
  const res = await fetch(`https://api.arize.com/v2/tasks/${taskId}/runs?limit=5`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`task runs fetch failed: ${res.status}`);
  return (await res.json()).task_runs;
}
/** Poll until the run reaches a terminal state (trigger --wait may bail early). */
async function awaitTaskRun(taskId) {
  for (let i = 0; i < 60; i++) {
    const latest = (await fetchTaskRuns(taskId))[0];
    if (latest && ["COMPLETED", "FAILED", "CANCELLED"].includes(latest.status)) {
      console.log(`  judge run ${latest.status}`);
      if (latest.status !== "COMPLETED") process.exit(2);
      return;
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.error("  judge run did not reach a terminal state in time");
  process.exit(2);
}

// 5. Pull scores and compute pass rates.
// `ax experiments export` omits task-attached evals; the REST runs endpoint
// carries them as flat `eval.<name>.label` columns — read those instead.
async function fetchRuns(expId) {
  const res = await fetch(`https://api.arize.com/v2/experiments/${expId}/runs?limit=200`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`runs fetch failed: ${res.status}`);
  return (await res.json()).experiment_runs;
}
/**
 * `ax experiments list` pages at 15 by default, so a baseline silently falls
 * off the end as experiments accumulate and the lookup throws "not found" for
 * an experiment that plainly exists. Ask for a large page instead of trusting
 * the default.
 */
function experimentIdByName(expName) {
  const all = [];
  let cursor;
  // 100 is the server's hard cap (a larger --limit is a 422), so follow the
  // cursor rather than assuming one page holds everything.
  for (let page = 0; page < 20; page++) {
    const argv = [
      "experiments", "list",
      "--dataset", DATASET, "--space", SPACE,
      "--limit", "100",
      "-o", "json",
    ];
    if (cursor) argv.push("--cursor", cursor);
    const res = axJson(argv);
    const batch = Array.isArray(res) ? res : res.experiments;
    all.push(...batch);
    cursor = Array.isArray(res) ? undefined : (res.next_cursor ?? res.cursor);
    if (!cursor || batch.length === 0) break;
  }
  const found = all.find((e) => e.name === expName);
  if (!found) {
    throw new Error(
      `experiment "${expName}" not found among ${all.length} experiments on ` +
        `dataset "${DATASET}" (names: ${all.map((e) => e.name).join(", ")})`,
    );
  }
  return found.id;
}
async function passRates(expId) {
  const rows = await fetchRuns(expId);
  const rates = {};
  for (const { name: evalName } of EVALUATORS) {
    const scored = rows.filter((r) => {
      const label = r[`eval.${evalName}.label`];
      return label && label !== "NOT_PARSABLE"; // judge noise, matches eval-monitor
    });
    const passed = scored.filter((r) => PASS_LABELS.has(r[`eval.${evalName}.label`]));
    rates[evalName] = { n: scored.length, rate: scored.length ? passed.length / scored.length : null };
  }
  return { rates, rows };
}
// Judge the same answers `judgePasses` times. Pass 1 keeps the bare experiment
// name so --report-only and any existing baseline still resolve.
const passRows = [];
for (let p = 1; p <= judgePasses; p++) {
  passRows.push(await judgePass(p === 1 ? name : `${name}-j${p}`));
}

const rowKey = (r) => r.example_id ?? r.dataset_example_id;
const questionFor = (id) => {
  const ex = examples.find((e) => e.id === id);
  return ex?.additional_properties?.question ?? ex?.question ?? String(id);
};

/**
 * Collapse N judge passes into one verdict per (question, evaluator).
 *
 * A question fails only when a MAJORITY of passes call it a failure, so a
 * single judge misfire no longer moves the gate. NOT_PARSABLE is not a vote in
 * either direction — it is judge noise (same treatment as eval-monitor) — so a
 * question is skipped entirely when no pass produced a usable label.
 */
function majority() {
  const rates = {};
  const failures = [];
  for (const { name: evalName } of EVALUATORS) {
    let scored = 0;
    let passed = 0;
    for (const id of new Set(passRows.flat().map(rowKey))) {
      const labels = passRows
        .map((rows) => rows.find((r) => rowKey(r) === id)?.[`eval.${evalName}.label`])
        .filter((l) => l && l !== "NOT_PARSABLE");
      if (labels.length === 0) continue;
      scored++;
      const yes = labels.filter((l) => PASS_LABELS.has(l)).length;
      if (yes * 2 > labels.length) passed++;
      else failures.push({ evalName, id, labels });
    }
    rates[evalName] = { n: scored, rate: scored ? passed / scored : null };
  }
  return { rates, failures };
}

const { rates, failures } = majority();

// Per-pass rates are printed alongside the majority so the judge's spread stays
// visible — a wide spread here is the signal that the floor is being measured
// with a noisy instrument, not that the agent changed.
if (judgePasses > 1) {
  console.log(`\n=== ${name}: golden-expectations per pass ===`);
  passRows.forEach((rows, i) => {
    const scored = rows.filter((r) => {
      const l = r["eval.golden-expectations.label"];
      return l && l !== "NOT_PARSABLE";
    });
    const ok = scored.filter((r) => PASS_LABELS.has(r["eval.golden-expectations.label"]));
    const pct = scored.length ? Math.round((ok.length / scored.length) * 100) : 0;
    console.log(`  pass ${i + 1}: ${pct}% (n=${scored.length})`);
  });
}

console.log(`\n=== ${name} (majority of ${judgePasses}) ===`);
for (const [evalName, { n, rate }] of Object.entries(rates)) {
  console.log(`  ${evalName.padEnd(24)} ${rate === null ? "NO SCORES" : `${Math.round(rate * 100)}%`} (n=${n})`);
}
for (const f of failures) {
  console.log(`  ✗ ${f.evalName} → ${f.labels.join("/")} on "${questionFor(f.id).slice(0, 70)}"`);
  const expl = passRows
    .flat()
    .find((r) => rowKey(r) === f.id && r[`eval.${f.evalName}.explanation`])
    ?.[`eval.${f.evalName}.explanation`];
  if (expl) console.log(`      ${String(expl).slice(0, 200).replace(/\n/g, " ")}`);
}

// 6. Gate verdict
let failed = false;
const golden = rates["golden-expectations"];
if (golden.rate === null) {
  console.error("\nGATE ERROR: no golden-expectations scores landed — check column mappings/task run");
  process.exit(2);
}
if (golden.rate < MIN_GOLDEN_RATE) {
  console.error(`\nGATE FAIL: golden-expectations ${Math.round(golden.rate * 100)}% < ${MIN_GOLDEN_RATE * 100}%`);
  failed = true;
}
if (baseline) {
  const { rates: baseRates } = await passRates(experimentIdByName(baseline));
  console.log(`\n=== vs baseline ${baseline} ===`);
  for (const [evalName, { rate }] of Object.entries(rates)) {
    const b = baseRates[evalName]?.rate;
    if (rate === null || b === null || b === undefined) continue;
    const delta = rate - b;
    console.log(`  ${evalName.padEnd(24)} ${Math.round(b * 100)}% → ${Math.round(rate * 100)}% (${delta >= 0 ? "+" : ""}${Math.round(delta * 100)})`);
    // Only golden-expectations gates: it is the one judge that sees the tool
    // trace, so its deltas are real. The other four run ungrounded here (their
    // templates are shared with the production task) and systematically flag
    // correct tool-sourced facts — advisory only in gate context (learned
    // 2026-07-19: opus beat haiku +14 on grounded golden while "losing" -13 on
    // ungrounded citation-faithfulness purely by writing richer answers).
    if (evalName === "golden-expectations" && delta < -MAX_BASELINE_DROP) {
      console.error(`  GATE FAIL: ${evalName} regressed more than ${MAX_BASELINE_DROP * 100} points`);
      failed = true;
    }
  }
}
console.log(failed ? "\nRESULT: REGRESSION — do not ship." : "\nRESULT: PASS");
process.exit(failed ? 1 : 0);
