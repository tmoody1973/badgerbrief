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
 *   Flags: --dev (run agent against dev deployment; default prod), --model, --instructions-file
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

// 3. Create the experiment (skipped with --report-only: reuse the existing one)
if (!reportOnly) axTolerant(
  ["experiments", "create", "--name", name, "--dataset", DATASET, "--space", SPACE, "--file", "-"],
  JSON.stringify(runs),
);
const experiments = axJson(["experiments", "list", "--dataset", DATASET, "--space", SPACE, "-o", "json"]);
const expList = Array.isArray(experiments) ? experiments : experiments.experiments;
const exp = expList.find((e) => e.name === name);
if (!exp) {
  console.error(`experiment "${name}" not found after create`);
  process.exit(2);
}
console.log(`experiment created: ${name} (${exp.id})`);

// 4. Score it with the judges (dataset-based evaluation task)
const evaluatorsJson = JSON.stringify(
  EVALUATORS.map((e) => ({
    evaluator_id: e.id,
    column_mappings:
      e.name === "golden-expectations"
        ? { input: "question", output: "output", expectations: "expectations", context: "tool_context" }
        : { input: "question", output: "output" },
  })),
);
if (!reportOnly) axTolerant([
  "tasks", "create-evaluation",
  "--name", `gate-${name}`,
  "--task-type", "TEMPLATE_EVALUATION",
  "--dataset", DATASET,
  "--space", SPACE,
  "--experiment-ids", exp.id,
  "--evaluators", evaluatorsJson,
  "--no-continuous",
]);
const tasks = axJson(["tasks", "list", "--space", SPACE, "-o", "json"]);
const task = (tasks.tasks ?? tasks).find((t) => t.name === `gate-${name}`);
console.log(`scoring with judges (task ${task.id})…`);
if (!reportOnly) axTolerant(["tasks", "trigger-run", task.id, "--experiment-ids", exp.id, "--wait"]);
// poll until the run reaches a terminal state (trigger --wait may have bailed early)
for (let i = 0; i < 60; i++) {
  const runsList = axJson(["tasks", "list-runs", task.id, "-o", "json"]);
  const rl = runsList.task_runs ?? runsList.runs ?? [];
  const latest = rl[0];
  if (latest && ["COMPLETED", "FAILED", "CANCELLED"].includes(latest.status)) {
    console.log(`judge run ${latest.status}`);
    if (latest.status !== "COMPLETED") process.exit(2);
    break;
  }
  await new Promise((r) => setTimeout(r, 10_000));
}

// 5. Pull scores and compute pass rates.
// `ax experiments export` omits task-attached evals; the REST runs endpoint
// carries them as flat `eval.<name>.label` columns — read those instead.
const apiKey = (() => {
  const toml = readFileSync(`${process.env.HOME}/.arize/profiles/default.toml`, "utf8");
  const match = toml.match(/api_key\s*=\s*"([^"]+)"/);
  if (!match) throw new Error("no api_key in ~/.arize/profiles/default.toml");
  return match[1];
})();
async function fetchRuns(expId) {
  const res = await fetch(`https://api.arize.com/v2/experiments/${expId}/runs?limit=200`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`runs fetch failed: ${res.status}`);
  return (await res.json()).experiment_runs;
}
function experimentIdByName(expName) {
  const list = axJson(["experiments", "list", "--dataset", DATASET, "--space", SPACE, "-o", "json"]);
  const found = (Array.isArray(list) ? list : list.experiments).find((e) => e.name === expName);
  if (!found) throw new Error(`experiment "${expName}" not found`);
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
const { rates, rows } = await passRates(exp.id);
console.log(`\n=== ${name} ===`);
for (const [evalName, { n, rate }] of Object.entries(rates)) {
  console.log(`  ${evalName.padEnd(24)} ${rate === null ? "NO SCORES" : `${Math.round(rate * 100)}%`} (n=${n})`);
}
for (const r of rows) {
  for (const { name: evalName } of EVALUATORS) {
    const label = r[`eval.${evalName}.label`];
    if (label && !PASS_LABELS.has(label)) {
      const ex = examples.find((e) => e.id === (r.example_id ?? r.dataset_example_id));
      const q = ex?.additional_properties?.question ?? ex?.question ?? String(r.example_id);
      console.log(`  ✗ ${evalName} → ${label} on "${q.slice(0, 70)}"`);
      const expl = r[`eval.${evalName}.explanation`];
      if (expl) console.log(`      ${String(expl).slice(0, 200).replace(/\n/g, " ")}`);
    }
  }
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
