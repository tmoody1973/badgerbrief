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

  test("pendingBillsForCandidates includes federal final votes whose type is not WI-shaped", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      // US House final passage — "...Suspend the Rules and Pass" has no "PASSAGE"
      // substring, so a WI-only isFinal would wrongly drop it.
      await ctx.db.insert("legislative_votes", { voteKey: "119-house-h1", session: "119", chamber: "us_house", voteId: "1-10", billNumber: "HR 3838", billTitle: "t", voteType: "On Motion to Suspend the Rules and Pass", votedOn: "2025-03-01", ayes: 300, nays: 100, notVoting: 5, present: 0, result: "Passed", measure: "HR 3838", sourceUrl: "s", ingestedAt: 0 } as any);
      await ctx.db.insert("legislator_votes", { voteKey: "119-house-h1", candidateSlug: "some-rep", position: "aye", session: "119" } as any);
      await ctx.db.insert("bills", { session: "119", billNumber: "HR 3838", billUrl: "u", summary: "This bill would fund rural broadband.", fetchedAt: 0 });
    });
    const pending = await t.query(internal.billClassify.pendingBillsForCandidates, { candidateSlugs: ["some-rep"] });
    expect(pending.map((p) => p.billNumber)).toEqual(["HR 3838"]);
  });
});

describe("listForReview", () => {
  test("returns pending + needs_review bills (default statuses), excluding approved and unclassified", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("bills", {
        session: "2025", billNumber: "AB 100", billUrl: "u", summary: "s1", fetchedAt: 0,
        issueSlugs: ["healthcare"], outcome: "expand BadgerCare eligibility", classifyConfidence: 0.9, classifyStatus: "approved", classifiedAt: 0,
      });
      await ctx.db.insert("bills", {
        session: "2025", billNumber: "AB 200", billUrl: "u", summary: "s2", fetchedAt: 0,
        issueSlugs: ["education"], outcome: "increase school funding", classifyConfidence: 0.6, classifyStatus: "pending", classifiedAt: 0,
      });
      await ctx.db.insert("bills", {
        session: "2025", billNumber: "AB 300", billUrl: "u", summary: "s3", fetchedAt: 0,
        issueSlugs: ["taxes-budget"], outcome: "cut the state income tax", classifyConfidence: 0.4, classifyStatus: "needs_review", classifiedAt: 0,
      });
      await ctx.db.insert("bills", { session: "2025", billNumber: "AB 400", billUrl: "u", summary: "s4", fetchedAt: 0 }); // unclassified
    });
    const rows = await t.query(internal.billClassify.listForReview, {});
    expect(rows.map((r) => r.billNumber)).toEqual(["AB 300", "AB 200"]); // classifyStatus asc ("needs_review" < "pending"), then billNumber
    const pending = rows.find((r) => r.billNumber === "AB 200")!;
    expect(pending.outcome).toBe("increase school funding");
    expect(pending.issueSlugs).toEqual(["education"]);
    const review = rows.find((r) => r.billNumber === "AB 300")!;
    expect(review.outcome).toBe("cut the state income tax");
    expect(review.issueSlugs).toEqual(["taxes-budget"]);
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

  test("is jurisdiction-neutral so a federal CRS summary is not framed as a Wisconsin/LRB bill", () => {
    const p = buildBillClassifyPrompt("HR 1 One Big Beautiful Bill Act", "This act reduces taxes and increases the debt limit.");
    expect(p).toContain("This act reduces taxes and increases the debt limit.");
    expect(p).not.toMatch(/Wisconsin/i);
    expect(p).not.toMatch(/\bLRB\b/);
  });
});
