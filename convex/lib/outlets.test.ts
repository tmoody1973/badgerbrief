import { describe, expect, test } from "vitest";
import { normalizeOutletKey, OUTLET_TYPES } from "./outlets";

describe("normalizeOutletKey", () => {
  test("lowercases, strips punctuation, collapses spaces", () => {
    expect(normalizeOutletKey("Milwaukee Journal Sentinel")).toBe("milwaukee journal sentinel");
    expect(normalizeOutletKey("Urban Milwaukee!")).toBe("urban milwaukee");
    expect(normalizeOutletKey("WPR.org")).toBe("wpr org");
  });
  test("same outlet, punctuation variants collapse to one key", () => {
    expect(normalizeOutletKey("Wisconsin Watch")).toBe(normalizeOutletKey("Wisconsin  Watch."));
  });
  test("taxonomy includes the eight v1 types", () => {
    expect(OUTLET_TYPES).toContain("nonprofit");
    expect(OUTLET_TYPES).toContain("public_media");
    expect(OUTLET_TYPES.length).toBe(8);
  });
});
