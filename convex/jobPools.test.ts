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

  test("the finance report lists on-ballot statewide and House candidates with no finance record", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      const race = (raceId: string, office: string, general: typeof ON) =>
        ctx.db.insert("races", { raceId, electionSlug: "wi-2026", office, level: "State Executive", sources: [], dataAsOf: "2026-10-12", general });
      await race("WI-GOV-2026", "Governor of Wisconsin", ON);
      await race("WI-LTGOV-2026", "Lieutenant Governor of Wisconsin", OFF);
      await ctx.db.insert("candidates", person("on-ballot-no-finance", ON));
      // A running mate files no committee of their own: the ticket's money is the governor candidate's.
      await ctx.db.insert("candidates", person("running-mate", ON, { raceId: "WI-LTGOV-2026" }));
    });
    const { count, missing } = await t.query(internal.finance.financeMissing, {});
    expect(count).toBe(1);
    expect(missing).toEqual([{ raceId: "WI-GOV-2026", candidateSlug: "on-ballot-no-finance", name: "on-ballot-no-finance" }]);
  });

  test("the daily federal finance sync covers only candidates on the ballot", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("candidates", person("house-on", ON, { raceId: "WI-US-HOUSE-D4-2026", fecCandidateId: "H0WI00001" }));
      await ctx.db.insert("candidates", person("house-off", OFF, { raceId: "WI-US-HOUSE-D4-2026", fecCandidateId: "H0WI00002" }));
    });
    const rows = await t.query(internal.finance.listFecCandidates, {});
    expect(rows.map((r) => r.slug)).toEqual(["house-on"]);
  });

  test("social tracking does not follow a running mate, who is not in the governor race", async () => {
    const t = await seeded();
    await t.run((ctx) => ctx.db.insert("candidates", person("running-mate", ON, { raceId: "WI-LTGOV-2026" })));
    const tracked = await t.query(internal.social.candidatesToTrack, {});
    expect(tracked.map((x) => x.slug)).toEqual(["on-ballot"]);
  });
});
