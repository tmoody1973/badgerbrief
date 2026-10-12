import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const SOURCE = { url: "https://elections.wi.gov/media/41846/download", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };
const ON = { onBallot: true, source: SOURCE };
const OFF = { onBallot: false, source: SOURCE };

const person = (slug: string, general: typeof ON | undefined, extra: Record<string, unknown> = {}) => ({
  slug, raceId: "WI-GOV-2026", name: slug, sources: [], dataAsOf: "2026-10-12",
  socialMedia: { campaign_website: `https://${slug}.example`, twitter_x: `https://x.com/${slug}` },
  ...(general ? { general } : {}),
  ...extra,
});

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("candidates", person("on-ballot", ON));
    await ctx.db.insert("candidates", person("off-ballot", OFF));
    await ctx.db.insert("candidates", person("no-facts", undefined));
    for (const slug of ["on-ballot", "off-ballot"]) {
      await ctx.db.insert("article_sources", {
        candidateSlug: slug, raceId: "WI-GOV-2026", url: `https://news.example/${slug}`, outlet: "WPR",
        headline: "H", whyRelevant: "r", status: "approved", proposedAt: 1,
      });
      // Missing cash-on-hand: a gap the finance audit reports.
      await ctx.db.insert("finance_totals", {
        candidateSlug: slug, raceId: "WI-GOV-2026", source: "sunshine", receipts: 100, fetchedAt: 1,
      });
    }
  });
  return t;
}

describe("scheduled jobs work only on candidates on the November ballot", () => {
  test("site mapping", async () => {
    const t = await seeded();
    const targets = await t.query(internal.researchQueries.listMapTargets, {});
    expect(targets.map((x) => x.slug)).toEqual(["on-ballot"]);
  });

  test("research: campaign sites and approved articles", async () => {
    const t = await seeded();
    const targets = await t.query(internal.researchQueries.listResearchTargets, {});
    expect(targets.map((x) => `${x.slug}:${x.sourceKind}`).sort()).toEqual(["on-ballot:article", "on-ballot:campaign_site"]);
  });

  test("social tracking follows the governor candidates on the ballot", async () => {
    const t = await seeded();
    const tracked = await t.query(internal.social.candidatesToTrack, {});
    expect(tracked.map((x) => x.slug)).toEqual(["on-ballot"]);
  });

  test("ad matching still knows everyone, and says who is on the ballot", async () => {
    const t = await seeded();
    const rows = await t.query(internal.ads.listCandidatesForMatching, {});
    const by = Object.fromEntries(rows.map((r) => [r.slug, r.onBallot]));
    expect(by).toEqual({ "on-ballot": true, "off-ballot": false, "no-facts": false });
  });

  test("the finance audit reports gaps only for candidates on the ballot", async () => {
    const t = await seeded();
    const { count, gaps } = await t.query(internal.finance.financeGaps, {});
    expect(count).toBe(1);
    expect(gaps[0]).toMatchObject({ candidateSlug: "on-ballot", missing: ["cashOnHand"] });
  });
});
