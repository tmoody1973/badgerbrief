// @vitest-environment node
import { describe, expect, test } from "vitest";
import { chromeEn } from "./chrome-en";
import { chromeEs } from "./chrome-es";
import { localeFromPath } from "./chrome-dict";

describe("chrome dict parity + locale detection", () => {
  test("ES chrome has every key EN has", () => {
    expect(Object.keys(chromeEs.navLabels).sort()).toEqual(Object.keys(chromeEn.navLabels).sort());
    expect(chromeEs.ctaAug11).not.toBe(chromeEn.ctaAug11);
  });
  test("localeFromPath detects /es", () => {
    expect(localeFromPath("/es")).toBe("es");
    expect(localeFromPath("/es/about")).toBe("es");
    expect(localeFromPath("/about")).toBe("en");
    expect(localeFromPath("/")).toBe("en");
  });
});
