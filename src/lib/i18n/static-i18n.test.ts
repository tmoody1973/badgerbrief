// @vitest-environment node
import { describe, expect, test } from "vitest";
import { hreflangFor } from "./locale";
import { homeEn } from "./home-en";
import { homeEs } from "./home-es";
import { aboutEn } from "./about-en";
import { aboutEs } from "./about-es";
import { methodologyEn } from "./methodology-en";
import { methodologyEs } from "./methodology-es";

/** Recursively collects dotted key paths of an object, ignoring function
 * values (leaf) — used to assert ES dicts have exactly the same shape as EN. */
function keyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .flatMap((k) => keyPaths((obj as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k));
}

describe("hreflang reciprocity for the Phase 1 static pages", () => {
  test.each(["/", "/about", "/methodology"] as const)("hreflangFor(%s) is reciprocal", (path) => {
    const h = hreflangFor(path);
    expect(h.en).toBe(path);
    expect(h.es).toBe(path === "/" ? "/es" : `/es${path}`);
    expect(h["x-default"]).toBe(path);
  });
});

describe("ES dict parity", () => {
  test("home: ES dict has the same keys as EN dict", () => {
    expect(keyPaths(homeEs)).toEqual(keyPaths(homeEn));
  });
  test("about: ES dict has the same keys as EN dict", () => {
    expect(keyPaths(aboutEs)).toEqual(keyPaths(aboutEn));
  });
  test("methodology: ES dict has the same keys as EN dict", () => {
    expect(keyPaths(methodologyEs)).toEqual(keyPaths(methodologyEn));
  });
});
