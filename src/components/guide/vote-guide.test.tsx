// @vitest-environment node
import { describe, expect, test } from "vitest";
import { voteEn } from "@/lib/i18n/vote-en";

const info: any = {
  primaryDate: "August 11, 2026", pollsOpen: "7:00 AM", pollsClose: "8:00 PM",
  photoIdRequired: true, officialVoterInfoUrl: "https://myvote.wi.gov/",
  sources: [], lastCheckedAt: 0,
};

const d = {
  electionDate: "November 3, 2026",
  registration: [["online", "x"]] as [string, string][],
  absenteeRequest: [["by_mail", "y"]] as [string, string][],
  absenteeReturn: [["in_person", "z"]] as [string, string][],
  early: { available: true, start_date: "October 20, 2026", end_date: "November 1, 2026" },
};

describe("voteEn dict", () => {
  test("builds the six logistics FAQs from data", () => {
    const faqs = voteEn.faqs(info, d);
    expect(faqs.length).toBeGreaterThanOrEqual(6);
  });
  test("names the general election and its date, not the primary", () => {
    const faqs = voteEn.faqs(info, d);
    expect(faqs[0].q).toContain("general election");
    expect(faqs[0].a).toContain("November 3, 2026");
    expect(faqs[0].a).not.toContain("August 11, 2026");
    expect(voteEn.h1.toLowerCase()).not.toContain("primary");
    expect(voteEn.meta.title.toLowerCase()).not.toContain("primary");
    expect(voteEn.meta.description).not.toContain("August 11");
  });
  test("early voting is stated as possible, not promised (clerks decide)", () => {
    const early = voteEn.faqs(info, d).find((f) => f.q.includes("early voting"));
    expect(early?.a).toContain("may begin as early as October 20, 2026");
    expect(early?.a).toContain("may run through November 1, 2026");
    expect(early?.a).toContain("vary by municipality");
    expect(early?.a).not.toContain("runs");
  });
  test("absentee answer points special-case voters to MyVote", () => {
    const absentee = voteEn.faqs(info, d).find((f) => f.q.includes("request an absentee"));
    expect(absentee?.a).toContain("military, hospitalized and indefinitely confined");
  });
  test("accessText passes through the row fields", () => {
    const row: any = { key: "voter-id", title: "T", summary: "S", details: "D", sources: [], order: 1 };
    expect(voteEn.accessText(row)).toEqual({ title: "T", summary: "S", details: "D" });
  });
  test("deadlineLabel humanizes keys", () => {
    expect(voteEn.deadlineLabel("by_mail")).toBe("by mail");
  });
});
