// @vitest-environment node
import { describe, expect, test } from "vitest";
import { esTwin, enTwin, hreflangFor, localizeHref, TRANSLATED_PATHS } from "./locale";

describe("localizeHref (locale-persistent nav)", () => {
  test("Spanish page: translated paths route to their /es twin", () => {
    expect(localizeHref("/", "es")).toBe("/es");
    expect(localizeHref("/vote", "es")).toBe("/es/vote");
    expect(localizeHref("/about", "es")).toBe("/es/about");
  });
  test("Spanish page: untranslated paths stay English (no twin yet)", () => {
    expect(localizeHref("/races/wi-gov-2026", "es")).toBe("/races/wi-gov-2026");
    expect(localizeHref("/feedback", "es")).toBe("/feedback");
  });
  test("English page: unchanged", () => {
    expect(localizeHref("/vote", "en")).toBe("/vote");
    expect(localizeHref("/", "en")).toBe("/");
  });
});

describe("locale path mapping", () => {
  test("esTwin maps home and sub-paths", () => {
    expect(esTwin("/")).toBe("/es");
    expect(esTwin("/about")).toBe("/es/about");
    expect(esTwin("/vote")).toBe("/es/vote");
  });
  test("enTwin is the inverse", () => {
    expect(enTwin("/es")).toBe("/");
    expect(enTwin("/es/about")).toBe("/about");
  });
  test("hreflangFor is reciprocal with x-default=en", () => {
    expect(hreflangFor("/vote")).toEqual({ en: "/vote", es: "/es/vote", "x-default": "/vote" });
    expect(hreflangFor("/")).toEqual({ en: "/", es: "/es", "x-default": "/" });
  });
  test("TRANSLATED_PATHS covers the phase-1 set", () => {
    ["/", "/vote", "/about", "/methodology"].forEach((p) => expect(TRANSLATED_PATHS.has(p)).toBe(true));
  });
});
