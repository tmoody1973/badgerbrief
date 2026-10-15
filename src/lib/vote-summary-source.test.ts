import { describe, expect, test } from "vitest";
import { voteSummarySource } from "./vote-summary-source";

describe("voteSummarySource", () => {
  test("U.S. House votes (a Congress number) credit the Congressional Research Service, whatever race the candidate is in now", () => {
    expect(voteSummarySource(["119", "118"])).toBe("Congressional Research Service");
  });

  test("Wisconsin votes (a session year) credit the Legislative Reference Bureau", () => {
    expect(voteSummarySource(["2023", "2025"])).toBe("Legislative Reference Bureau");
  });

  test("a record with both names both, each for its own votes", () => {
    expect(voteSummarySource(["2019", "119"])).toBe(
      "Congressional Research Service (U.S. House votes) and the Legislative Reference Bureau (Wisconsin votes)",
    );
  });
});
