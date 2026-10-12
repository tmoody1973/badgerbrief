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

describe("ES dict names the general election", () => {
  const info = { primaryDate: "August 11, 2026", pollsOpen: "7:00 AM", pollsClose: "8:00 PM", photoIdRequired: true } as unknown as Parameters<typeof voteEs.faqs>[0];
  const d = {
    electionDate: "November 3, 2026",
    registration: [] as [string, string][], absenteeRequest: [["by_mail", "y"]] as [string, string][], absenteeReturn: [] as [string, string][],
    early: { available: true, start_date: "October 20, 2026", end_date: "November 1, 2026" },
  };
  test("date and wording are November's, not the primary's", () => {
    const faqs = voteEs.faqs(info, d);
    expect(faqs[0].a).toContain("3 de noviembre de 2026");
    expect(faqs[0].a).not.toContain("11 de agosto");
    expect(voteEs.h1.toLowerCase()).not.toContain("primaria");
    expect(voteEs.meta.description).not.toContain("11 de agosto");
  });
  test("early voting is stated as possible, not promised", () => {
    const early = voteEs.faqs(info, d).find((f) => f.q.includes("anticipada"));
    expect(early?.a).toContain("puede comenzar");
    expect(early?.a).not.toContain(" va del ");
  });
});
