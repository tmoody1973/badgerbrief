import { describe, it, expect } from "vitest";
import { parseContributeKind, CONTRIBUTE_KINDS } from "./contribute-kind";

describe("parseContributeKind", () => {
  it("accepts the four valid kinds", () => {
    for (const k of ["suggest_candidate", "suggest_source", "data_gap", "volunteer"] as const) {
      expect(parseContributeKind(k)).toBe(k);
    }
  });
  it("defaults to suggest_source for absent/invalid", () => {
    expect(parseContributeKind(null)).toBe("suggest_source");
    expect(parseContributeKind("")).toBe("suggest_source");
    expect(parseContributeKind("correction")).toBe("suggest_source"); // not a contribute kind
    expect(parseContributeKind("garbage")).toBe("suggest_source");
  });
});

describe("CONTRIBUTE_KINDS", () => {
  it("marks suggest_source as needing a source and volunteer as needing contact", () => {
    const bySource = CONTRIBUTE_KINDS.find((k) => k.kind === "suggest_source");
    const byVol = CONTRIBUTE_KINDS.find((k) => k.kind === "volunteer");
    expect(bySource?.needs).toContain("source");
    expect(byVol?.needs).toContain("contact");
  });
});
