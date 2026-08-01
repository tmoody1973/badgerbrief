import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { buildBillClassifyPrompt } from "./billClassify";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => convexTest(schema, modules);

describe("bill classification storage", () => {
  test("setBillClassification patches the bills row by session+billNumber", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("bills", { session: "2025", billNumber: "AB 100", billUrl: "u", summary: "This bill would expand BadgerCare.", fetchedAt: 0 });
    });
    await t.mutation(internal.billClassify.setBillClassification, {
      session: "2025", billNumber: "AB 100", issueSlugs: ["healthcare"], outcome: "expand BadgerCare eligibility", confidence: 0.9, status: "approved",
    });
    const row = await t.run(async (ctx) =>
      ctx.db.query("bills").withIndex("by_session_bill", (q) => q.eq("session", "2025").eq("billNumber", "AB 100")).unique());
    expect(row?.issueSlugs).toEqual(["healthcare"]);
    expect(row?.outcome).toBe("expand BadgerCare eligibility");
    expect(row?.classifyStatus).toBe("approved");
  });

  test("pendingBillsForCandidates returns unclassified bills those candidates voted on (substantive only)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      // a substantive vote Hong cast on AB 100 (has LRB summary, unclassified)
      await ctx.db.insert("legislative_votes", { voteKey: "2025-assembly-av1", session: "2025", chamber: "assembly", voteId: "av1", billNumber: "AB 100", billTitle: "t", voteType: "PASSAGE", votedOn: "2025-01-01", ayes: 50, nays: 40, notVoting: 0, sourceUrl: "s", ingestedAt: 0 } as any);
      await ctx.db.insert("legislator_votes", { voteKey: "2025-assembly-av1", candidateSlug: "francesca-hong", position: "aye", session: "2025" } as any);
      await ctx.db.insert("bills", { session: "2025", billNumber: "AB 100", billUrl: "u", summary: "This bill would expand BadgerCare.", fetchedAt: 0 });
      // a procedural vote → excluded
      await ctx.db.insert("legislative_votes", { voteKey: "2025-assembly-av2", session: "2025", chamber: "assembly", voteId: "av2", billNumber: "AB 200", billTitle: "t", voteType: "MOTION", votedOn: "2025-01-02", ayes: 1, nays: 1, notVoting: 0, sourceUrl: "s", ingestedAt: 0 } as any);
      await ctx.db.insert("legislator_votes", { voteKey: "2025-assembly-av2", candidateSlug: "francesca-hong", position: "nay", session: "2025" } as any);
      await ctx.db.insert("bills", { session: "2025", billNumber: "AB 200", billUrl: "u", summary: "x", fetchedAt: 0 });
    });
    const pending = await t.query(internal.billClassify.pendingBillsForCandidates, { candidateSlugs: ["francesca-hong"] });
    expect(pending.map((p) => p.billNumber)).toEqual(["AB 100"]); // AB 200 excluded (procedural)
    expect(pending[0].summary).toBe("This bill would expand BadgerCare.");
  });
});

describe("bill classify prompt", () => {
  test("constrains to the 11 issues, demands a neutral YES-vote outcome, embeds the LRB summary", () => {
    const p = buildBillClassifyPrompt("AB 100 relating to health coverage", "This bill would expand BadgerCare eligibility.");
    expect(p).toContain("This bill would expand BadgerCare eligibility.");
    expect(p.toLowerCase()).toContain("yes vote"); // outcome is framed as what a YES does
    expect(p).toContain("healthcare");
    expect(p).toContain("public-safety"); // the fixed slug list is present
    expect(p.toLowerCase()).toContain("do not"); // neutrality guard present
  });
});
