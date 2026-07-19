import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

function setup() {
  return convexTest(schema, modules);
}

const baseCandidate = {
  slug: "joel-brennan",
  raceId: "WI-GOV-2026",
  name: "Joel Brennan",
  sources: [],
  dataAsOf: "2026-07-18",
};

const baseArticleSource = {
  candidateSlug: "joel-brennan",
  raceId: "WI-GOV-2026",
  url: "https://urbanmilwaukee.com/2026/06/01/brennan-education",
  outlet: "Urban Milwaukee",
  headline: "Brennan lays out education plan",
  whyRelevant: "Direct quotes on K-12 funding stance",
  proposedAt: 1000,
};

describe("listResearchTargets", () => {
  test("emits the campaign-site target plus only the approved article target", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("candidates", {
        ...baseCandidate,
        socialMedia: { campaign_website: "https://brennanforwisconsin.com" },
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("article_sources", { ...baseArticleSource, status: "approved", decidedAt: 1500 }),
    );
    await t.run((ctx) =>
      ctx.db.insert("article_sources", {
        ...baseArticleSource,
        url: "https://jsonline.com/brennan-proposed",
        status: "proposed",
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("article_sources", {
        ...baseArticleSource,
        url: "https://wpr.org/brennan-rejected",
        status: "rejected",
        decidedAt: 1600,
      }),
    );

    const targets = await t.query(internal.researchQueries.listResearchTargets, {});

    expect(targets).toHaveLength(2);
    const campaignTarget = targets.find((tg) => tg.sourceKind === "campaign_site");
    const articleTarget = targets.find((tg) => tg.sourceKind === "article");
    expect(campaignTarget).toMatchObject({
      slug: "joel-brennan",
      name: "Joel Brennan",
      raceId: "WI-GOV-2026",
      url: "https://brennanforwisconsin.com",
      sourceKind: "campaign_site",
    });
    expect(articleTarget).toMatchObject({
      slug: "joel-brennan",
      name: "Joel Brennan",
      raceId: "WI-GOV-2026",
      url: "https://urbanmilwaukee.com/2026/06/01/brennan-education",
      sourceKind: "article",
      outlet: "Urban Milwaukee",
    });
  });
});

describe("saveExtraction sourceLabel", () => {
  const extraction = {
    positions: [
      {
        issueSlug: "education",
        stance: "support",
        summary: "Supports expanding K-12 funding.",
        confidence: 0.8,
        evidenceExcerpt: "We will fully fund our schools.",
      },
    ],
    quotes: [
      {
        text: "We will fully fund our schools.",
        context: "Education plan article",
      },
    ],
  };

  test("sourceLabel becomes the citation name; quote speaker stays the candidate name", async () => {
    const t = setup();
    await t.run((ctx) => ctx.db.insert("candidates", baseCandidate));

    await t.mutation(internal.researchQueries.saveExtraction, {
      candidateSlug: "joel-brennan",
      raceId: "WI-GOV-2026",
      sourceUrl: "https://urbanmilwaukee.com/2026/06/01/brennan-education",
      sourceName: "Joel Brennan",
      sourceLabel: "Urban Milwaukee",
      extraction,
    });

    const positions = await t.run((ctx) => ctx.db.query("candidate_positions_drafts").collect());
    expect(positions).toHaveLength(1);
    expect(positions[0].sources[0].name).toBe("Urban Milwaukee");

    const quotes = await t.run((ctx) => ctx.db.query("quote_drafts").collect());
    expect(quotes).toHaveLength(1);
    expect(quotes[0].speaker).toBe("Joel Brennan");
  });

  test("without sourceLabel, citation name falls back to sourceName (campaign-site behavior unchanged)", async () => {
    const t = setup();
    await t.run((ctx) => ctx.db.insert("candidates", baseCandidate));

    await t.mutation(internal.researchQueries.saveExtraction, {
      candidateSlug: "joel-brennan",
      raceId: "WI-GOV-2026",
      sourceUrl: "https://brennanforwisconsin.com",
      sourceName: "Joel Brennan",
      extraction,
    });

    const positions = await t.run((ctx) => ctx.db.query("candidate_positions_drafts").collect());
    expect(positions[0].sources[0].name).toBe("Joel Brennan");
  });
});
