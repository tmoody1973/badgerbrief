// @vitest-environment node
import { describe, expect, test } from "vitest";
import { chromeEn } from "./chrome-en";
import { chromeEs } from "./chrome-es";
import { localeFromPath } from "./chrome-dict";

describe("chrome dict parity + locale detection", () => {
  test("ES chrome has every key EN has", () => {
    expect(Object.keys(chromeEs.navLabels).sort()).toEqual(Object.keys(chromeEn.navLabels).sort());
    expect(chromeEs.ctaElectionDay).not.toBe(chromeEn.ctaElectionDay);
    expect(chromeEn.ctaElectionDay).toBe("Nov 3");
    expect(chromeEs.ctaElectionDay).toBe("3 de noviembre");
  });
  test("localeFromPath detects /es", () => {
    expect(localeFromPath("/es")).toBe("es");
    expect(localeFromPath("/es/about")).toBe("es");
    expect(localeFromPath("/about")).toBe("en");
    expect(localeFromPath("/")).toBe("en");
  });
});

test("both languages label the Ko-fi link that replaced the floating button", () => {
  expect(chromeEn.footer.kofi).toBe("Support on Ko-fi");
  expect(chromeEs.footer.kofi).toBe("Apoye en Ko-fi");
});
