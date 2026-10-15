import { describe, expect, test } from "vitest";
import { TRACKED_META_PAGES } from "./trackedMetaPages";

describe("TRACKED_META_PAGES (certified by Tarik, 2026-10-15)", () => {
  test("holds the 118 approved pages, each once, with a numeric Meta page id", () => {
    expect(TRACKED_META_PAGES).toHaveLength(118);
    expect(new Set(TRACKED_META_PAGES.map((p) => p.entityId)).size).toBe(118);
    expect(TRACKED_META_PAGES.every((p) => /^\d+$/.test(p.entityId))).toBe(true);
  });

  test("leaves out the 7 pages he excluded", () => {
    const names = TRACKED_META_PAGES.map((p) => p.pageName);
    for (const excluded of ["Realtors for Derrick Van Orden", "Yee Leng Xiong for DC Everest School Board", "Alfonso for Congress", "Matt Brown for GT Council"]) {
      expect(names.some((n) => n.startsWith(excluded))).toBe(false);
    }
  });

  test("every page points at a 2026 race", () => {
    expect(TRACKED_META_PAGES.every((p) => /^WI-.+-2026$/.test(p.raceId))).toBe(true);
  });
});
