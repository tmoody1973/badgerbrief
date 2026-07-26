import { describe, it, expect } from "vitest";
import { EXPLAINERS, type ExplainerTopic } from "./explainers";

const TOPICS: ExplainerTopic[] = [
  "stance-labels",
  "campaign-finance",
  "voting-record",
  "sourced-position-vs-claim",
];

describe("EXPLAINERS", () => {
  it("has a non-empty summary and body for every topic", () => {
    for (const t of TOPICS) {
      expect(EXPLAINERS[t].summary.length).toBeGreaterThan(0);
      expect(EXPLAINERS[t].body.length).toBeGreaterThan(0);
    }
  });

  it("only links to same-origin paths in learnMore", () => {
    for (const t of TOPICS) {
      const lm = EXPLAINERS[t].learnMore;
      if (lm) expect(lm.startsWith("/")).toBe(true);
    }
  });

  it("states money is not an endorsement in the finance explainer", () => {
    expect(EXPLAINERS["campaign-finance"].body.toLowerCase()).toContain("not an endorsement");
  });
});
