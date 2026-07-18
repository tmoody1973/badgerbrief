// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractionSchema, buildExtractionPrompt, ISSUE_SLUGS } from "./lib/extraction";

const valid = {
  positions: [
    {
      issueSlug: "healthcare",
      stance: "support",
      summary: "Supports expanding BadgerCare.",
      confidence: 0.8,
      evidenceExcerpt: "We will expand BadgerCare to every family.",
    },
  ],
  quotes: [
    {
      text: "We will expand BadgerCare to every family.",
      context: "Campaign site healthcare page",
      date: "2026-06-01",
    },
  ],
};

describe("extraction contract", () => {
  it("accepts a valid extraction", () => {
    expect(extractionSchema.parse(valid)).toBeTruthy();
  });
  it("rejects an off-vocabulary issue slug", () => {
    const bad = structuredClone(valid);
    bad.positions[0].issueSlug = "ufo-policy";
    expect(() => extractionSchema.parse(bad)).toThrow();
  });
  it("rejects confidence outside 0..1", () => {
    const bad = structuredClone(valid);
    bad.positions[0].confidence = 1.5;
    expect(() => extractionSchema.parse(bad)).toThrow();
  });
  it("prompt forbids invention and pins the vocabulary", () => {
    const p = buildExtractionPrompt("Kelda Roys", "https://x.com", "site text");
    expect(p).toContain("verbatim");
    for (const slug of ISSUE_SLUGS) expect(p).toContain(slug);
  });
});
