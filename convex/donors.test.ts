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
