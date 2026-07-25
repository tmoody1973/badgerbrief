// @vitest-environment node
import { describe, expect, test } from "vitest";
import { esTwin, enTwin, hreflangFor, TRANSLATED_PATHS } from "./locale";

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
