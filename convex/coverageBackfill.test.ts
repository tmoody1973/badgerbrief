import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const t = () => convexTest(schema, modules);

async function seed(c: ReturnType<typeof t>) {
  await c.run(async (ctx) => {
    await ctx.db.insert("races", {
      raceId: "WI-GOV-2026",
      office: "Governor",
      level: "State Executive",
      electionSlug: "wi-2026",
      sources: [],
      dataAsOf: "2026-07-22",
    } as never);
    await ctx.db.insert("candidates", {
      slug: "francesca-hong",
      name: "Francesca Hong",
      raceId: "WI-GOV-2026",
      sources: [],
      dataAsOf: "2026-07-22",
    } as never);
    // Pre-feature rows: no outletKey/hubStatus.
    await ctx.db.insert("article_sources", {
      url: "https://urbanmilwaukee.com/a",
      outlet: "Urban Milwaukee",
      headline: "Francesca Hong unveils housing plan",
      whyRelevant: "r",
      status: "approved",
      proposedAt: Date.now(),
    } as never);
    await ctx.db.insert("article_sources", {
      url: "https://espn.com/b",
      outlet: "ESPN",
      headline: "Packers sign new quarterback",
      whyRelevant: "r",
      status: "proposed",
      proposedAt: Date.now(),
    } as never);
  });
}

test("campaign sites are never decorated, never become outlets, never hit the hub", async () => {
  const c = t();
  await seed(c);
  await c.run(async (ctx) => {
    await ctx.db.insert("article_sources", {
      url: "https://hongforwi.com/issues",
      outlet: "Francesca Hong (campaign site)",
      headline: "Francesca Hong on housing", // would otherwise score 1.0
      whyRelevant: "r",
      status: "approved",
      sourceKind: "campaign_site",
      proposedAt: Date.now(),
    } as never);
  });
  const res = await c.mutation(internal.coverageBackfill.backfillCoverage, {
    dryRun: false,
  });
  expect(res.scanned).toBe(2); // the campaign-site row is skipped
  const hub = await c.query(api.coverage.hubArticles, {});
  expect(hub).toHaveLength(1);
  expect(hub[0].article.sourceKind).not.toBe("campaign_site");
  await c.run(async (ctx) => {
    const outlets = await ctx.db.query("outlets").collect();
    expect(outlets.map((o) => o.displayName)).not.toContain(
      "Francesca Hong (campaign site)",
    );
  });
});

test("dryRun reports counts without writing", async () => {
  const c = t();
  await seed(c);
  const res = await c.mutation(internal.coverageBackfill.backfillCoverage, {});
  expect(res.dryRun).toBe(true);
  expect(res.scanned).toBe(2);
  expect(res.wouldSetHubAuto).toBe(1); // only the candidate-named one
  // nothing written
  expect(await c.query(api.coverage.hubArticles, {})).toHaveLength(0);
  await c.run(async (ctx) => {
    expect(await ctx.db.query("outlets").collect()).toHaveLength(0);
  });
});

test("real run stamps rows, seeds draft outlets, and is idempotent", async () => {
  const c = t();
  await seed(c);
  const res = await c.mutation(internal.coverageBackfill.backfillCoverage, {
    dryRun: false,
  });
  expect(res.scanned).toBe(2);
  expect(res.outletsCreated).toBe(2);

  // The relevant article now reaches the hub; the off-topic one does not.
  const hub = await c.query(api.coverage.hubArticles, {});
  expect(hub).toHaveLength(1);
  expect(hub[0].article.headline).toContain("Francesca Hong");

  // Outlets landed as drafts (not auto-approved — reviewer curates them).
  await c.run(async (ctx) => {
    const outlets = await ctx.db.query("outlets").collect();
    expect(outlets).toHaveLength(2);
    expect(outlets.every((o) => o.reviewStatus === "draft")).toBe(true);
  });

  // Re-running finds nothing left to do (rows already carry outletKey).
  const again = await c.mutation(internal.coverageBackfill.backfillCoverage, {
    dryRun: false,
  });
  expect(again.scanned).toBe(0);
  expect(again.outletsCreated).toBe(0);
});
