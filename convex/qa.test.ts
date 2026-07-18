// @vitest-environment node
import { describe, expect, it } from "vitest";
import { qaSchema, buildQaPrompt } from "./lib/qa";

const valid = {
  claimSupport: 0.9,
  unsupportedClaims: [],
  missingCitations: [],
  notes: "Draft matches source.",
};

describe("qa contract", () => {
  it("accepts a valid QA scoring, neutralRewrite omitted", () => {
    expect(qaSchema.parse(valid)).toBeTruthy();
  });
  it("accepts an explicit neutralRewrite", () => {
    expect(
      qaSchema.parse({ ...valid, neutralRewrite: "A more neutral phrasing." }),
    ).toBeTruthy();
  });
  it("rejects claimSupport above 1", () => {
    expect(() => qaSchema.parse({ ...valid, claimSupport: 1.5 })).toThrow();
  });
  it("rejects claimSupport below 0", () => {
    expect(() => qaSchema.parse({ ...valid, claimSupport: -0.1 })).toThrow();
  });
  it("prompt contains the draft summary, source text, and key vocabulary", () => {
    const p = buildQaPrompt({
      kind: "position",
      draftJson: JSON.stringify({ summary: "Supports expanding BadgerCare." }),
      sourceText: "We will expand BadgerCare to every family.",
    });
    expect(p).toContain("Supports expanding BadgerCare.");
    expect(p).toContain("We will expand BadgerCare to every family.");
    expect(p).toContain("unsupported");
    expect(p).toContain("neutral");
  });
});
