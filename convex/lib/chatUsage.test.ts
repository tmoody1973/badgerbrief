import { describe, it, expect } from "vitest";
import { dayKey, capFromEnv, isOverCap, isKillSwitchOn } from "./chatUsage";

describe("dayKey", () => {
  it("returns the UTC YYYY-MM-DD for a timestamp", () => {
    // 2026-08-11T04:30:00Z
    expect(dayKey(Date.parse("2026-08-11T04:30:00Z"))).toBe("2026-08-11");
  });
});

describe("capFromEnv", () => {
  it("parses a numeric env var", () => {
    process.env.__TEST_CAP = "42";
    expect(capFromEnv("__TEST_CAP", 500)).toBe(42);
    delete process.env.__TEST_CAP;
  });
  it("falls back when unset or non-numeric", () => {
    delete process.env.__TEST_CAP;
    expect(capFromEnv("__TEST_CAP", 500)).toBe(500);
    process.env.__TEST_CAP = "abc";
    expect(capFromEnv("__TEST_CAP", 500)).toBe(500);
    delete process.env.__TEST_CAP;
  });
});

describe("isOverCap", () => {
  it("is true only strictly above the cap", () => {
    expect(isOverCap(30, 30)).toBe(false); // the 30th is allowed
    expect(isOverCap(31, 30)).toBe(true);  // the 31st is not
  });
});

describe("isKillSwitchOn", () => {
  it("is OFF for unset or falsy-looking values", () => {
    expect(isKillSwitchOn(undefined)).toBe(false);
    expect(isKillSwitchOn("")).toBe(false);
    expect(isKillSwitchOn("0")).toBe(false);
    expect(isKillSwitchOn("false")).toBe(false);
    expect(isKillSwitchOn("off")).toBe(false);
    expect(isKillSwitchOn("no")).toBe(false);
    expect(isKillSwitchOn("  FALSE ")).toBe(false); // trim + case-insensitive
  });
  it("is ON for an explicit truthy value", () => {
    expect(isKillSwitchOn("1")).toBe(true);
    expect(isKillSwitchOn("true")).toBe(true);
    expect(isKillSwitchOn("yes")).toBe(true);
  });
});
