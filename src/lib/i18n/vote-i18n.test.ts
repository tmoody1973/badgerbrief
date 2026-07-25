// @vitest-environment node
import { describe, expect, test } from "vitest";
import { hreflangFor } from "@/lib/i18n/locale";
import { voteEs } from "@/lib/i18n/vote-es";

const KEYS = ["voter-id","absentee","election-day","disability","felony-conviction","name-change","id-name-mismatch","homelessness"];

describe("hreflang reciprocity (shared source of truth)", () => {
  test("hreflangFor('/vote') has reciprocal en/es + x-default", () => {
    expect(hreflangFor("/vote")).toMatchObject({ en: "/vote", es: "/es/vote", "x-default": "/vote" });
  });
});

describe("ES dict parity", () => {
  test("ACCESS_ES translates all 8 voter-access keys", () => {
    for (const key of KEYS) {
      const row: any = { key, title: "EN-ONLY", summary: "EN-ONLY", details: "EN-ONLY", sources: [], order: 1 };
      const t = voteEs.accessText(row);
      // a translated row must differ from the English passthrough fallback
      expect(t.title).not.toBe("EN-ONLY");
    }
  });
});
