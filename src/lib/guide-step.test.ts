import { describe, it, expect } from "vitest";
import { parseGuideStep, nextHref, prevHref, GUIDE_STEPS } from "./guide-step";

describe("parseGuideStep", () => {
  it("parses valid steps", () => {
    expect(parseGuideStep("1")).toBe(1);
    expect(parseGuideStep("2")).toBe(2);
    expect(parseGuideStep("3")).toBe(3);
    expect(parseGuideStep("done")).toBe("done");
  });
  it("returns null for absent or invalid", () => {
    expect(parseGuideStep(null)).toBeNull();
    expect(parseGuideStep("")).toBeNull();
    expect(parseGuideStep("9")).toBeNull();
    expect(parseGuideStep("abc")).toBeNull();
  });
});

describe("navigation", () => {
  it("advances 1 -> 2 -> 3 -> done", () => {
    expect(nextHref(1)).toBe("/match?guide=2");
    expect(nextHref(2)).toBe("/vote?guide=3");
    expect(nextHref(3)).toBe("/start?guide=done");
    expect(nextHref("done")).toBeNull();
  });
  it("goes back, and step 1 has no back", () => {
    expect(prevHref(1)).toBeNull();
    expect(prevHref(2)).toBe("/match?guide=1");
  });
  it("labels the three numbered steps", () => {
    expect(GUIDE_STEPS.filter((s) => s.step !== "done")).toHaveLength(3);
  });
});
