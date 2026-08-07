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

test("upsertBreakdown inserts then updates in place", async () => {
  const t = convexTest(schema, modules);
  const doc = {
    candidateSlug: "david-crowley",
    raceId: "WI-GOV-2026",
    source: "sunshine" as const,
    coverageEndDate: "filings through Aug 3, 2026",
    categories: [
      { key: "individuals", amount: 100, count: 2, topDonors: [{ name: "A", amount: 60 }] },
    ],
    sizeBuckets: [{ key: "small", amount: 100, count: 2 }],
    geo: {
      inState: { amount: 100, count: 2 },
      outOfState: { amount: 0, count: 0 },
      unknown: { amount: 0, count: 0 },
    },
    monthly: [{ month: "2026-07", receipts: 100 }],
    takeaways: ["test sentence"],
  };
  await t.mutation(internal.finance.upsertBreakdown, doc);
  await t.mutation(internal.finance.upsertBreakdown, {
    ...doc,
    takeaways: ["updated sentence"],
  });
  const rows = await t.run((ctx) => ctx.db.query("finance_breakdowns").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].takeaways).toEqual(["updated sentence"]);
  expect(rows[0].fetchedAt).toBeGreaterThan(0);
});

test("financeGapAlert: alerted=false when clean, true when a gap exists", async () => {
  const t = convexTest(schema, modules);
  // no rows → clean, no alert
  expect(await t.action(internal.finance.financeGapAlert, {})).toEqual({ count: 0, alerted: false });
  // a row missing receipts → alert fires (feedback.notify no-ops without RESEND_API_KEY)
  await t.run(async (ctx) => {
    await ctx.db.insert("finance_totals", {
      candidateSlug: "gapped", raceId: "R", source: "sunshine", cashOnHand: 5, fetchedAt: 0,
    });
  });
  const r = await t.action(internal.finance.financeGapAlert, {});
  expect(r).toEqual({ count: 1, alerted: true });
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

const donorDoc = (n: number) => ({
  donorKey: `donor ${n}`,
  donorName: `Donor ${n}`,
  candidateSlug: "david-crowley",
  raceId: "WI-GOV-2026",
  source: "sunshine" as const,
  category: "individuals",
  total: n * 100,
  giftCount: 1,
  gifts: [{ date: "2026-07-01", amount: n * 100 }],
  coverageEndDate: "filings through Aug 3, 2026",
});

test("insertDonors stamps fetchedAt; clearDonors pages until done", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.finance.insertDonors, {
    docs: [donorDoc(1), donorDoc(2), donorDoc(3)],
  });
  const rows = await t.run((ctx) => ctx.db.query("donor_totals").collect());
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => r.fetchedAt > 0)).toBe(true);

  let cursor: string | null = null;
  let deleted = 0;
  for (;;) {
    const res: { deleted: number; continueCursor: string | null; isDone: boolean } = await t.mutation(internal.finance.clearDonors, {
      raceId: "WI-GOV-2026",
      candidateSlug: "david-crowley",
      source: "sunshine",
      cursor,
    });
    deleted += res.deleted;
    if (res.isDone) break;
    cursor = res.continueCursor;
  }
  expect(deleted).toBe(3);
  const left = await t.run((ctx) => ctx.db.query("donor_totals").collect());
  expect(left).toHaveLength(0);
});
