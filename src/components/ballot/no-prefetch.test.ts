// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

/**
 * Next pre-loads the pages that visible links point to. On My Ballot those
 * links are the voter's own contests, so pre-loading them would tell the
 * server the voter's districts without a click (decision 018).
 * scripts/privacy-capture.mjs proves this in a real browser; this keeps a
 * new link from slipping in between runs.
 */
test("no link on My Ballot is pre-loaded", () => {
  const dir = join(process.cwd(), "src/components/ballot");
  const links: string[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".tsx") && !name.includes(".test."))) {
    for (const match of readFileSync(join(dir, file), "utf8").matchAll(/<Link\b[^>]*>/g)) links.push(`${file}: ${match[0]}`);
  }
  expect(links.length).toBeGreaterThan(0);
  expect(links.filter((link) => !link.includes("prefetch={false}"))).toEqual([]);
});
