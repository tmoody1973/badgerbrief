import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => convexTest(schema, modules);

async function addQuote(t: ReturnType<typeof setup>) {
  return t.run(async (ctx) => {
    const draftId = await ctx.db.insert("quote_drafts", {
      candidateSlug: "david-crowley",
      raceId: "WI-GOV-2026",
      speaker: "David Crowley",
      text: "One goal: make Wisconsin work for every family.",
      context: "Statement introducing Crowley's plan",
      sourceUrl: "https://www.crowleyforwi.com/issues",
      reviewStatus: "approved",
      extractedAt: 1,
    });
    return ctx.db.insert("quote_published", {
      candidateSlug: "david-crowley",
      raceId: "WI-GOV-2026",
      speaker: "David Crowley",
      text: "One goal: make Wisconsin work for every family.",
      context: "Statement introducing Crowley's plan",
      sourceUrl: "https://www.crowleyforwi.com/issues",
      draftId,
      publishedAt: 1,
    });
  });
}

test("points a published quote at the page it is on now, and records the old address", async () => {
  const t = setup();
  const quoteId = await addQuote(t);

  const out = await t.mutation(internal.maintenance.setQuoteSourceUrl, { quoteId, sourceUrl: "https://www.crowleyforwi.com/" });

  expect(out).toEqual({ from: "https://www.crowleyforwi.com/issues", to: "https://www.crowleyforwi.com/" });
  const after = await t.run((ctx) => ctx.db.get(quoteId));
  expect(after?.sourceUrl).toBe("https://www.crowleyforwi.com/");
  expect(after?.text).toBe("One goal: make Wisconsin work for every family.");
  const audit = await t.run((ctx) => ctx.db.query("audit_log").collect());
  expect(audit).toMatchObject([{ action: "edit", refTable: "quote_published", refId: quoteId, detail: "sourceUrl: https://www.crowleyforwi.com/issues -> https://www.crowleyforwi.com/" }]);
});

test("refuses an address that is not a web page", async () => {
  const t = setup();
  const quoteId = await addQuote(t);

  for (const sourceUrl of ["crowleyforwi.com/", "https://", "https://not a host/", "javascript:alert(1)"]) {
    await expect(t.mutation(internal.maintenance.setQuoteSourceUrl, { quoteId, sourceUrl })).rejects.toThrow(/http/);
  }
  const after = await t.run((ctx) => ctx.db.get(quoteId));
  expect(after?.sourceUrl).toBe("https://www.crowleyforwi.com/issues");
});

async function addHouseCandidate(t: ReturnType<typeof setup>, slug: string, fecCandidateId?: string) {
  return t.run((ctx) =>
    ctx.db.insert("candidates", {
      slug,
      raceId: "WI-US-HOUSE-D1-2026",
      name: slug,
      sources: [],
      dataAsOf: "2026-10-14",
      ...(fecCandidateId ? { fecCandidateId } : {}),
    }),
  );
}

test("sets FEC candidate IDs so the daily FEC sync can find these candidates, and reports what changed", async () => {
  const t = setup();
  const steil = await addHouseCandidate(t, "bryan-steil", "H8WI01088"); // a stored ID the FEC does not have
  const berman = await addHouseCandidate(t, "mitchell-berman");

  const out = await t.mutation(internal.maintenance.setFecCandidateIds, {
    ids: [
      { raceId: "WI-US-HOUSE-D1-2026", slug: "bryan-steil", fecCandidateId: "H8WI01156" },
      { raceId: "WI-US-HOUSE-D1-2026", slug: "mitchell-berman", fecCandidateId: "H6WI01283" },
    ],
  });

  expect(out).toEqual([
    { candidate: "WI-US-HOUSE-D1-2026/bryan-steil", from: "H8WI01088", to: "H8WI01156" },
    { candidate: "WI-US-HOUSE-D1-2026/mitchell-berman", from: undefined, to: "H6WI01283" },
  ]);
  const rows = await t.run(async (ctx) => [await ctx.db.get(steil), await ctx.db.get(berman)]);
  expect(rows.map((r) => r?.fecCandidateId)).toEqual(["H8WI01156", "H6WI01283"]);
});

test("refuses a malformed FEC ID or an unknown candidate, and changes nothing", async () => {
  const t = setup();
  const berman = await addHouseCandidate(t, "mitchell-berman");
  for (const ids of [
    [{ raceId: "WI-US-HOUSE-D1-2026", slug: "mitchell-berman", fecCandidateId: "C00123456" }],
    [
      { raceId: "WI-US-HOUSE-D1-2026", slug: "mitchell-berman", fecCandidateId: "H6WI01283" },
      { raceId: "WI-US-HOUSE-D1-2026", slug: "nobody", fecCandidateId: "H6WI01999" },
    ],
  ]) {
    await expect(t.mutation(internal.maintenance.setFecCandidateIds, { ids })).rejects.toThrow();
  }
  expect((await t.run((ctx) => ctx.db.get(berman)))?.fecCandidateId).toBeUndefined();
});
