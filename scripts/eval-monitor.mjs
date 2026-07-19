#!/usr/bin/env node
/**
 * MOO-313 eval-score monitor: pulls the last 24h of scored production spans
 * from Arize, computes per-evaluator failure rates over AGENT spans only
 * (TOOL/LLM spans scored by early task runs are historical noise), and writes
 * an `eval_regression` alert to Convex when a rate crosses threshold —
 * surfaced on /admin next to editorial flags.
 *
 * Run daily (or before/after shipping agent changes):
 *   node scripts/eval-monitor.mjs            # writes alerts to prod
 *   node scripts/eval-monitor.mjs --dry-run  # print only
 */
import { execFileSync } from "node:child_process";

const PROJECT_ID = "TW9kZWw6ODgzOTMxNjQxOTo3NzFI"; // badgerbrief
const PASS_LABELS = new Set(["faithful", "neutral", "official_first", "correct", "meets"]);
const MIN_SAMPLES = 5;
const WARN_RATE = 0.2;
const CRITICAL_RATE = 0.4;
const dryRun = process.argv.includes("--dry-run");

function exportSpans() {
  const args = ["spans", "export", PROJECT_ID, "-l", "500", "--days", "1", "--stdout"];
  // ax 0.26 can't deserialize spans whose raw OTel kind is "" (all of ours);
  // fall back to the pinned 0.25.1 install (`pipx install arize-ax-cli==0.25.1 --suffix @old`).
  for (const bin of ["ax", "ax@old"]) {
    try {
      const raw = execFileSync(bin, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
      return JSON.parse(raw.slice(raw.indexOf("[")));
    } catch {
      /* try next binary */
    }
  }
  throw new Error("span export failed via both `ax` and `ax@old`");
}

const spans = exportSpans();
const agentSpans = spans.filter(
  (s) => s.attributes?.["openinference.span.kind"] === "AGENT" && s.evaluations?.length,
);
console.log(`${spans.length} spans in last 24h; ${agentSpans.length} scored AGENT spans`);

const byEvaluator = new Map();
for (const span of agentSpans) {
  for (const ev of span.evaluations) {
    if (!ev.label || ev.label === "NOT_PARSABLE") continue;
    const entry = byEvaluator.get(ev.name) ?? { n: 0, failures: 0 };
    entry.n += 1;
    if (!PASS_LABELS.has(ev.label)) entry.failures += 1;
    byEvaluator.set(ev.name, entry);
  }
}

let alerted = 0;
for (const [name, { n, failures }] of [...byEvaluator.entries()].sort()) {
  const rate = failures / n;
  const pct = Math.round(rate * 100);
  console.log(`  ${name.padEnd(24)} ${pct}% failing (${failures}/${n})`);
  if (n < MIN_SAMPLES || rate <= WARN_RATE) continue;
  const severity = rate > CRITICAL_RATE ? "critical" : "warning";
  const message = `eval "${name}" failing on ${pct}% of sampled agent runs (${failures}/${n}) in the last 24h`;
  if (dryRun) {
    console.log(`  would alert [${severity}]: ${message}`);
  } else {
    execFileSync(
      "npx",
      [
        "convex", "run", "monitorQueries:insertAlert",
        JSON.stringify({ kind: "eval_regression", severity, message }),
        "--prod",
      ],
      { encoding: "utf8" },
    );
    console.log(`  alert written [${severity}]`);
  }
  alerted += 1;
}
console.log(alerted ? `${alerted} alert(s)` : "all evaluators within thresholds — no alerts");
