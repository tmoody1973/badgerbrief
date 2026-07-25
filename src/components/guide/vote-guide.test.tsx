// @vitest-environment node
import { describe, expect, test } from "vitest";
import { voteEn } from "@/lib/i18n/vote-en";

const info: any = {
  primaryDate: "August 11, 2026", pollsOpen: "7:00 AM", pollsClose: "8:00 PM",
  photoIdRequired: true, officialVoterInfoUrl: "https://myvote.wi.gov/",
  sources: [], lastCheckedAt: 0,
};

describe("voteEn dict", () => {
  test("builds the six logistics FAQs from data", () => {
    const faqs = voteEn.faqs(info, { registration: [["online", "x"]], absenteeRequest: [["by_mail", "y"]], absenteeReturn: [["in_person", "z"]], early: { available: true, start_date: "a", end_date: "b" } });
    expect(faqs.length).toBeGreaterThanOrEqual(6);
    expect(faqs[0].a).toContain("August 11, 2026");
  });
  test("accessText passes through the row fields", () => {
    const row: any = { key: "voter-id", title: "T", summary: "S", details: "D", sources: [], order: 1 };
    expect(voteEn.accessText(row)).toEqual({ title: "T", summary: "S", details: "D" });
  });
  test("deadlineLabel humanizes keys", () => {
    expect(voteEn.deadlineLabel("by_mail")).toBe("by mail");
  });
});
