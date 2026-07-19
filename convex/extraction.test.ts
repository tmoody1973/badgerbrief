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
    const p = buildExtractionPrompt("Kelda Roys", "https://x.com", "site text", "campaign_site");
    expect(p).toContain("verbatim");
    for (const slug of ISSUE_SLUGS) expect(p).toContain(slug);
  });
  it("campaign_site prompt contains the hardening block before the content marker", () => {
    const p = buildExtractionPrompt("Kelda Roys", "https://x.com", "site text", "campaign_site");
    expect(p).toMatch(/untrusted web content/i);
    expect(p).toMatch(/ignore (them|any instructions)/i);
    expect(p.indexOf(/untrusted web content/i.exec(p)![0])).toBeLessThan(
      p.indexOf("PAGE CONTENT"),
    );
  });
  it("article prompt attributes the outlet and restricts quotes to the candidate", () => {
    const p = buildExtractionPrompt(
      "Kelda Roys",
      "https://urbanmilwaukee.com/roys-education",
      "article text",
      "article",
      "Urban Milwaukee",
    );
    expect(p).toContain("news article from Urban Milwaukee");
    expect(p).toContain("only quotes the article directly attributes to Kelda Roys");
    expect(p).toMatch(/never extract the journalist's characterization/i);
  });
  it("article prompt also contains the hardening block before the content marker", () => {
    const p = buildExtractionPrompt(
      "Kelda Roys",
      "https://urbanmilwaukee.com/roys-education",
      "article text",
      "article",
      "Urban Milwaukee",
    );
    expect(p).toMatch(/untrusted web content/i);
    expect(p).toMatch(/ignore (them|any instructions)/i);
  });
});
