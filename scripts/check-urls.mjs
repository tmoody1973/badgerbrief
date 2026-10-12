#!/usr/bin/env node
/**
 * Check that every address in a saved list still returns a page.
 *
 *   node scripts/check-urls.mjs --base https://badgerbrief.org --list <file>
 *
 * READS ONLY. Exits 1 if any address does not answer 200.
 */
import { readFileSync } from "node:fs";
import { failures } from "./lib/url-check.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = flag("base");
const list = flag("list");
if (!base || !list) {
  console.error("--base <origin> and --list <file> are required");
  process.exit(2);
}

const paths = readFileSync(list, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
const check = async (path) => {
  try {
    const res = await fetch(new URL(path, base), { redirect: "follow", headers: { "user-agent": "badgerbrief-url-check" } });
    return { path, status: res.status };
  } catch {
    return { path, status: 0 };
  }
};

// Eight at a time: quick, and gentle on the site.
const results = [];
for (let i = 0; i < paths.length; i += 8) {
  results.push(...(await Promise.all(paths.slice(i, i + 8).map(check))));
}
const failed = failures(results);
console.log(`${results.length} addresses checked against ${base}: ${results.length - failed.length} return a page, ${failed.length} do not`);
for (const f of failed) console.error(`  ${f.status || "no answer"}  ${f.path}`);
if (failed.length > 0) process.exit(1);
