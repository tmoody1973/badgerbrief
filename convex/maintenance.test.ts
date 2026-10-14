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
