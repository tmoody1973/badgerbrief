import { describe, expect, test } from "vitest";
import { coverageLine } from "./coverage-line";

describe("coverageLine", () => {
  test("keeps a label that already says 'through', without doubling it", () => {
    expect(coverageLine("filings through Sep 23, 2026")).toBe("Filings through Sep 23, 2026");
  });

  test("names a date range as the period covered", () => {
    expect(coverageLine("Jan 1 – Jun 30, 2026")).toBe("Covers Jan 1 – Jun 30, 2026");
  });
});
