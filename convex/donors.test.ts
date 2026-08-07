import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

const doc = (key: string, total: number, slug = "david-crowley") => ({
  donorKey: key,
  donorName: key.toUpperCase(),
  candidateSlug: slug,
  raceId: "WI-GOV-2026",
  source: "sunshine" as const,
  category: "individuals",
  total,
  giftCount: 1,
  gifts: [{ date: "2026-07-01", amount: total }],
});

test("roster pages in descending total order", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.finance.insertDonors, {
    docs: [doc("a", 50), doc("b", 500), doc("c", 200)],
  });
  const page = await t.query(api.donors.roster, {
    raceId: "WI-GOV-2026",
    candidateSlug: "david-crowley",
    paginationOpts: { cursor: null, numItems: 2 },
  });
  expect(page.page.map((d) => d.total)).toEqual([500, 200]);
  expect(page.isDone).toBe(false);
  const rest = await t.query(api.donors.roster, {
    raceId: "WI-GOV-2026",
    candidateSlug: "david-crowley",
    paginationOpts: { cursor: page.continueCursor, numItems: 2 },
  });
  expect(rest.page.map((d) => d.total)).toEqual([50]);
});

test("profile aggregates across candidates; null when unknown", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.finance.insertDonors, {
    docs: [doc("weac pac", 86000, "kelda-roys"), doc("weac pac", 1000, "francesca-hong")],
  });
  const p = await t.query(api.donors.profile, { donorKey: "weac pac" });
  expect(p?.grandTotal).toBe(87000);
  expect(p?.donors.map((d) => d.candidateSlug).sort()).toEqual(["francesca-hong", "kelda-roys"]);
  expect(await t.query(api.donors.profile, { donorKey: "nobody" })).toBeNull();
});

test("raceMoney groups sunshine totals with names, categories, and fixed order", async (
) => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("races", { raceId: "WI-AG-2026", electionSlug: "wi-2026", office: "Attorney General", level: "State Executive", sources: [], dataAsOf: "2026-08-07" });
    await ctx.db.insert("races", { raceId: "WI-GOV-2026", electionSlug: "wi-2026", office: "Governor", level: "State Executive", sources: [], dataAsOf: "2026-08-07" });
    await ctx.db.insert("candidates", { slug: "josh-kaul", raceId: "WI-AG-2026", name: "Josh Kaul", sources: [], dataAsOf: "2026-08-07" });
    await ctx.db.insert("candidates", { slug: "david-crowley", raceId: "WI-GOV-2026", name: "David Crowley", sources: [], dataAsOf: "2026-08-07" });
    await ctx.db.insert("candidates", { slug: "francesca-hong", raceId: "WI-GOV-2026", name: "Francesca Hong", sources: [], dataAsOf: "2026-08-07" });
    const totals = [
      { candidateSlug: "josh-kaul", raceId: "WI-AG-2026", source: "sunshine" as const, receipts: 100, fetchedAt: 1 },
      { candidateSlug: "david-crowley", raceId: "WI-GOV-2026", source: "sunshine" as const, receipts: 200, coverageEndDate: "filings through Aug 3, 2026", fetchedAt: 1 },
      { candidateSlug: "francesca-hong", raceId: "WI-GOV-2026", source: "sunshine" as const, receipts: 300, fetchedAt: 1 },
      { candidateSlug: "gwen-moore", raceId: "WI-US-HOUSE-D4-2026", source: "openfec" as const, receipts: 999, fetchedAt: 1 },
    ];
    for (const x of totals) await ctx.db.insert("finance_totals", x);
    await ctx.db.insert("finance_breakdowns", {
      candidateSlug: "francesca-hong", raceId: "WI-GOV-2026", source: "sunshine",
      categories: [{ key: "individuals", amount: 300, count: 3, topDonors: [] }],
      sizeBuckets: [], geo: { inState: { amount: 0, count: 0 }, outOfState: { amount: 0, count: 0 }, unknown: { amount: 0, count: 0 } },
      monthly: [], takeaways: [], fetchedAt: 1,
    });
  });
  const races = await t.query(api.donors.raceMoney, {});
  expect(races.map((r) => r.raceId)).toEqual(["WI-GOV-2026", "WI-AG-2026"]); // openfec-only race absent; GOV first
  expect(races[0].office).toBe("Governor");
  expect(races[0].candidates.map((c) => c.slug)).toEqual(["francesca-hong", "david-crowley"]); // receipts desc
  expect(races[0].candidates[0].name).toBe("Francesca Hong");
  expect(races[0].candidates[0].categories?.[0].key).toBe("individuals");
  expect(races[0].candidates[1].categories).toBeNull(); // no breakdown doc
});
