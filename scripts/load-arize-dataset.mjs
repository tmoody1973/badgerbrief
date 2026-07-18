#!/usr/bin/env node
/**
 * Load the golden voter-question fixtures into an Arize dataset (MOO-304).
 * Usage: node scripts/load-arize-dataset.mjs [--name badgerbrief-golden-questions] [--space <space>]
 *
 * Uses the `ax` CLI (credentials come from `ax profiles` / ARIZE_* env — never
 * hardcoded). Idempotent-ish: creates the dataset if absent, otherwise appends.
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const name = flag("name", "badgerbrief-golden-questions");
const space = flag("space", process.env.ARIZE_SPACE);

const fixtures = JSON.parse(
  readFileSync(new URL("./golden-questions.json", import.meta.url), "utf8"),
);
if (!Array.isArray(fixtures) || fixtures.length === 0) {
  console.error("golden-questions.json must be a non-empty JSON array");
  process.exit(2);
}
for (const [i, row] of fixtures.entries()) {
  if (!row.question || !row.expected_topic) {
    console.error(`fixture ${i} missing required fields (question, expected_topic)`);
    process.exit(2);
  }
}

const ax = (argv) => {
  try {
    return execFileSync("ax", argv, { stdio: ["ignore", "pipe", "pipe"] }).toString();
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error(
        "The `ax` CLI is not installed. Install it and run `ax profiles create` " +
          "(or `ax auth login`) to configure Arize credentials, then re-run.",
      );
      process.exit(1);
    }
    throw err;
  }
};

const spaceArgs = space ? ["--space", space] : [];
// The ax CLI infers format from the extension, so stage a real .json file.
const tmpFile = join(tmpdir(), `golden-questions-${process.pid}.json`);
writeFileSync(tmpFile, JSON.stringify(fixtures));

let exists = false;
try {
  ax(["datasets", "get", name, ...spaceArgs]);
  exists = true;
} catch {
  exists = false;
}

try {
  if (exists) {
    ax(["datasets", "append", name, ...spaceArgs, "--file", tmpFile]);
    console.log(`Appended ${fixtures.length} examples to Arize dataset "${name}"`);
  } else {
    ax(["datasets", "create", "--name", name, ...spaceArgs, "--file", tmpFile]);
    console.log(`Created Arize dataset "${name}" with ${fixtures.length} examples`);
  }
} catch (err) {
  if (!space) {
    console.error(
      'Arize dataset create needs a space: pass --space "<name-or-id>" ' +
        "(find yours with `ax spaces list`) or set ARIZE_SPACE.",
    );
    process.exit(1);
  }
  throw err;
} finally {
  rmSync(tmpFile, { force: true });
}
