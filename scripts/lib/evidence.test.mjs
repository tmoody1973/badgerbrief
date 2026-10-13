// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { EVIDENCE, STATE_CANDIDATES_XLSX, alteredEvidence, expectedFingerprint, fingerprint } from "./evidence.mjs";

describe("the state documents saved under docs/evidence", () => {
  test("are byte for byte what the state served", () => {
    expect(alteredEvidence()).toEqual([]);
  });

  test("cover the four documents the build and its tests read", () => {
    expect(EVIDENCE.map((e) => e.path.split("/").pop())).toEqual([
      "All-Contests-and-Candidates_November-3-2026.xlsx",
      "Type-C-Notice-of-Referendum-2026-11-03.pdf",
      "Type-C-Notice-of-Referendum-2026-11-03.txt",
      "Referendum-Listing-10.6.26.xlsx",
    ]);
    for (const e of EVIDENCE) expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("alteredEvidence", () => {
  // What happened on 2026-10-13: the spreadsheet was opened in an app and saved.
  // Every cell was the same and every byte was different.
  test("names a document whose bytes changed, such as a spreadsheet re-saved by an app", () => {
    const read = (path) => (path === STATE_CANDIDATES_XLSX ? Buffer.from("re-saved by an app") : readFileSync(path));
    expect(alteredEvidence(undefined, read)).toEqual([STATE_CANDIDATES_XLSX]);
  });

  test("checks only the documents it is asked about", () => {
    const read = () => Buffer.from("anything");
    expect(alteredEvidence([STATE_CANDIDATES_XLSX], read)).toEqual([STATE_CANDIDATES_XLSX]);
    expect(alteredEvidence([], read)).toEqual([]);
  });

  test("treats a document it has no fingerprint for as altered", () => {
    expect(alteredEvidence(["docs/evidence/some-other-file.xlsx"], () => Buffer.from("x"))).toEqual(["docs/evidence/some-other-file.xlsx"]);
    expect(expectedFingerprint(STATE_CANDIDATES_XLSX)).toBe(fingerprint(readFileSync(STATE_CANDIDATES_XLSX)));
  });
});
