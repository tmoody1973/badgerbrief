// @vitest-environment node
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// The script reads and writes fixed paths under the current directory, so each
// test runs it in a throwaway copy of exactly the files it touches.
const NEEDED = [
  "scripts/ballot-extras.mjs",
  "scripts/lib/ballot-extras-files.mjs",
  "scripts/lib/ballot-questions.mjs",
  "scripts/lib/evidence.mjs",
  "scripts/lib/wec-county.mjs",
  "scripts/lib/wec-general.mjs",
  "scripts/lib/wec-legislative.mjs",
  "docs/evidence/2026-10-12-wec-general/All-Contests-and-Candidates_November-3-2026.xlsx",
  "docs/evidence/2026-10-13-wec-referenda/Type-C-Notice-of-Referendum-2026-11-03.txt",
  "convex/lib/data/county-contests-2026.json",
  "convex/lib/data/ballot-questions-2026.json",
  "docs/evidence/ballot-extras/county-offices-review.md",
  "docs/evidence/ballot-extras/statewide-questions-review.md",
];
const COUNTY = "convex/lib/data/county-contests-2026.json";
const QUESTIONS = "convex/lib/data/ballot-questions-2026.json";
const OUTPUTS = [COUNTY, QUESTIONS, "docs/evidence/ballot-extras/county-offices-review.md", "docs/evidence/ballot-extras/statewide-questions-review.md"];

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "ballot-extras-"));
  for (const path of NEEDED) cpSync(path, join(dir, path), { recursive: true });
  const read = (path) => readFileSync(join(dir, path), "utf8");
  return {
    read,
    json: (path) => JSON.parse(read(path)),
    write: (path, text) => writeFileSync(join(dir, path), text),
    outputs: () => OUTPUTS.map(read),
    run: (...args) => spawnSync("node", ["scripts/ballot-extras.mjs", ...args], { cwd: dir, encoding: "utf8" }),
  };
}

const STATE_XLSX = "docs/evidence/2026-10-12-wec-general/All-Contests-and-Candidates_November-3-2026.xlsx";

describe("node scripts/ballot-extras.mjs", () => {
  test("refuses to build from a state document whose bytes changed on disk", () => {
    const box = sandbox();
    box.write(STATE_XLSX, "re-saved by an app");
    const before = box.outputs();
    for (const args of [[], ["--certify", "Test Certifier"]]) {
      const result = box.run(...args);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/All-Contests-and-Candidates_November-3-2026\.xlsx.*changed on disk/s);
    }
    expect(box.outputs()).toEqual(before);
  });
});

describe("node scripts/ballot-extras.mjs --certify", () => {
  test("refuses to sign when the questions changed after the review sheet was written", () => {
    const box = sandbox();
    const edited = box.json(QUESTIONS);
    box.write(QUESTIONS, `${JSON.stringify({ ...edited, questions: edited.questions.map((q) => (q.number === 3 ? { ...q, note: "A different note nobody reviewed." } : q)) }, null, 2)}\n`);
    const before = box.outputs();
    const result = box.run("--certify", "Test Certifier");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/statewide-questions-review\.md.*out of date/s);
    expect(box.outputs()).toEqual(before);
  });

  test("refuses to sign when the county list changed after the review sheet was written", () => {
    const box = sandbox();
    box.write("docs/evidence/ballot-extras/county-offices-review.md", box.read("docs/evidence/ballot-extras/county-offices-review.md").replace("Denita R. Ball", "Somebody Else"));
    const before = box.outputs();
    const result = box.run("--certify", "Test Certifier");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/county-offices-review\.md.*out of date/s);
    expect(box.outputs()).toEqual(before);
  });

  test("refuses a flag where the name should be", () => {
    const box = sandbox();
    const before = box.outputs();
    const result = box.run("--certify", "--dry-run");
    expect(result.status).toBe(2);
    expect(box.outputs()).toEqual(before);
  });

  test("refuses an argument it does not know, rather than quietly doing a rebuild", () => {
    const box = sandbox();
    const before = box.outputs();
    expect(box.run("--certfy", "Test Certifier").status).toBe(2);
    expect(box.run('--certify=Test Certifier').status).toBe(2);
    expect(box.run("--certify", "Test Certifier", "extra").status).toBe(2);
    expect(box.outputs()).toEqual(before);
  });

  test("signs both files when the sheets are current, and a rebuild keeps the signature", () => {
    const box = sandbox();
    const result = box.run("--certify", "Test Certifier");
    expect(result.status).toBe(0);
    for (const path of [COUNTY, QUESTIONS]) {
      const file = box.json(path);
      expect(file.certifiedBy).toBe("Test Certifier");
      expect(file.certifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(file.certifiedSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(box.read("docs/evidence/ballot-extras/county-offices-review.md")).toContain("Signed by Test Certifier on ");
    const signed = box.outputs();
    expect(box.run().status).toBe(0);
    expect(box.outputs()).toEqual(signed);
  });
});
