import { describe, test, expect } from "vitest";
import {
  federalBillParts,
  federalBillUrl,
  parseCrsSummary,
} from "./federalBillSummary";

describe("federalBillParts", () => {
  test("splits letters and digits, lowercasing the type", () => {
    expect(federalBillParts("HR 3838")).toEqual({ type: "hr", number: "3838" });
    expect(federalBillParts("S5")).toEqual({ type: "s", number: "5" });
    expect(federalBillParts("HJRES 20")).toEqual({ type: "hjres", number: "20" });
  });
  test("returns null for shapes without a bill endpoint", () => {
    expect(federalBillParts("")).toBeNull();
    expect(federalBillParts("Quorum Call")).toBeNull();
  });
});

describe("federalBillUrl", () => {
  test("maps known types to congress.gov long-form slugs", () => {
    expect(federalBillUrl("119", "HR 1")).toBe(
      "https://www.congress.gov/bill/119th-congress/house-bill/1",
    );
    expect(federalBillUrl("119", "S 5")).toBe(
      "https://www.congress.gov/bill/119th-congress/senate-bill/5",
    );
  });
  test("falls back to search for an unknown/blank type", () => {
    expect(federalBillUrl("119", "XYZ 9")).toContain("/search?q=");
  });
});

describe("parseCrsSummary", () => {
  test("returns null when there are no summaries", () => {
    expect(parseCrsSummary({ summaries: [] })).toBeNull();
    expect(parseCrsSummary({})).toBeNull();
    expect(parseCrsSummary(null)).toBeNull();
  });

  test("picks the most recent summary by updateDate and strips HTML", () => {
    const payload = {
      summaries: [
        { text: "<p>Old text.</p>", updateDate: "2025-01-01T00:00:00Z" },
        {
          text: "<p>This bill would&nbsp;expand rural broadband &amp; grants.</p>",
          updateDate: "2025-06-01T00:00:00Z",
        },
      ],
    };
    expect(parseCrsSummary(payload)).toBe(
      "This bill would expand rural broadband & grants.",
    );
  });

  test("returns null for an empty/whitespace summary body", () => {
    expect(parseCrsSummary({ summaries: [{ text: "<p>   </p>", updateDate: "2025-01-01" }] })).toBeNull();
    expect(parseCrsSummary({ summaries: [{ updateDate: "2025-01-01" }] })).toBeNull();
  });

  test("caps a long summary at a sentence boundary", () => {
    const long = "First sentence. " + "Filler sentence about the program. ".repeat(80);
    const out = parseCrsSummary({ summaries: [{ text: long, updateDate: "2025-01-01" }] })!;
    expect(out.length).toBeLessThanOrEqual(1500);
    expect(out.endsWith(".")).toBe(true); // ended cleanly, no mid-word cut
    expect(out.startsWith("First sentence.")).toBe(true);
  });
});
