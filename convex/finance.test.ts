import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

const rpw = {
  committeeName: "Republican Party of Wisconsin",
  sunshineEntityId: 16896,
  periodStart: "2026-01-01",
  periodLabel: "since Jan 1, 2026",
  receiptsTotal: 8182285,
  receiptsCount: 771,
  topSources: [
    { name: "Diane M. Hendricks", entityType: "Individual", amount: 2500000, count: 2 },
  ],
  sourceNote: "WI Ethics Commission (Sunshine) filings, campaignfinance.wi.gov",
};

test("financeGaps flags rows missing receipts or cash-on-hand, skips complete rows", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("finance_totals", {
      candidateSlug: "complete", raceId: "R", source: "sunshine", receipts: 100, cashOnHand: 50, fetchedAt: 0,
    });
    await ctx.db.insert("finance_totals", {
      candidateSlug: "no-receipts", raceId: "R", source: "sunshine", cashOnHand: 50, fetchedAt: 0,
    });
    await ctx.db.insert("finance_totals", {
      candidateSlug: "no-coh", raceId: "R", source: "openfec", receipts: 100, fetchedAt: 0,
    });
    // 0 is a real value, not a gap
    await ctx.db.insert("finance_totals", {
      candidateSlug: "zeros", raceId: "R", source: "sunshine", receipts: 0, cashOnHand: 0, fetchedAt: 0,
    });
  });
  const { count, gaps } = await t.query(internal.finance.financeGaps, {});
  expect(count).toBe(2);
  const bySlug = Object.fromEntries(gaps.map((g) => [g.candidateSlug, g.missing]));
  expect(bySlug["no-receipts"]).toEqual(["receipts"]);
  expect(bySlug["no-coh"]).toEqual(["cashOnHand"]);
  expect(bySlug["complete"]).toBeUndefined();
  expect(bySlug["zeros"]).toBeUndefined();
});

test("upsertCommitteeFunding inserts then replaces by committee name", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.finance.upsertCommitteeFunding, rpw);
  await t.mutation(internal.finance.upsertCommitteeFunding, {
    ...rpw,
    receiptsTotal: 9000000,
    topSources: [
      { name: "Diane M. Hendricks", entityType: "Individual", amount: 3000000, count: 3 },
    ],
  });
  const rows = await t.run(async (ctx) => {
    return await ctx.db.query("committee_funding").collect();
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].receiptsTotal).toBe(9000000);
  expect(rows[0].topSources[0].amount).toBe(3000000);
});
