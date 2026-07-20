import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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

  test("emits campaign_site semantics for auto-registered own-site subpages", async () => {
    const t = setup();
    await t.run((ctx) => ctx.db.insert("candidates", baseCandidate));
    await t.run((ctx) =>
      ctx.db.insert("article_sources", {
        ...baseArticleSource,
        url: "https://www.brennanforwisconsin.com/Plan",
        outlet: "Joel Brennan",
        sourceKind: "campaign_site" as const,
        status: "approved" as const,
        decidedAt: 1500,
      }),
    );

    const targets = await t.query(internal.researchQueries.listResearchTargets, {});
    const plan = targets.find(
      (tg) => tg.url === "https://www.brennanforwisconsin.com/Plan",
    );

    expect(plan).toBeDefined();
    expect(plan!.sourceKind).toBe("campaign_site");
    // No outlet, so saveExtraction cites the candidate rather than a publication.
    expect(plan!.outlet).toBeUndefined();
  });

  test("treats a sourceKind-less row as an article (back-compat)", async () => {
    const t = setup();
    await t.run((ctx) => ctx.db.insert("candidates", baseCandidate));
    await t.run((ctx) =>
      ctx.db.insert("article_sources", {
        ...baseArticleSource,
        status: "approved" as const,
        decidedAt: 1500,
      }),
    );

    const targets = await t.query(internal.researchQueries.listResearchTargets, {});
    const story = targets.find(
      (tg) => tg.url === "https://urbanmilwaukee.com/2026/06/01/brennan-education",
    );

    expect(story!.sourceKind).toBe("article");
    expect(story!.outlet).toBe("Urban Milwaukee");
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

describe("saveExtraction per-source drafts (MOO-324)", () => {
  const ADMIN = { subject: "user_admin", metadata: { role: "admin" } };

  const positionFor = (summary: string, stance = "support") => ({
    positions: [
      {
        issueSlug: "education",
        stance,
        summary,
        confidence: 0.8,
        evidenceExcerpt: summary,
      },
    ],
    quotes: [],
  });

  const campaignArgs = {
    candidateSlug: "joel-brennan",
    raceId: "WI-GOV-2026",
    sourceUrl: "https://brennanforwisconsin.com",
    sourceName: "Joel Brennan",
  };

  const articleArgs = {
    candidateSlug: "joel-brennan",
    raceId: "WI-GOV-2026",
    sourceUrl: "https://urbanmilwaukee.com/2026/06/01/brennan-education",
    sourceName: "Joel Brennan",
    sourceLabel: "Urban Milwaukee",
  };

  test("cross-source extractions on the same issue both survive with their own citations and review tasks", async () => {
    const t = setup();
    await t.run((ctx) => ctx.db.insert("candidates", baseCandidate));

    await t.mutation(internal.researchQueries.saveExtraction, {
      ...campaignArgs,
      extraction: positionFor("Campaign site: fully fund schools."),
      traceId: "trace-campaign-1",
    });
    await t.mutation(internal.researchQueries.saveExtraction, {
      ...articleArgs,
      extraction: positionFor("Article: supports referendum reform.", "mixed"),
    });

    const drafts = await t.run((ctx) => ctx.db.query("candidate_positions_drafts").collect());
    expect(drafts).toHaveLength(2);
    const urls = drafts.map((d) => d.sources[0].url).sort();
    expect(urls).toEqual([
      "https://brennanforwisconsin.com",
      "https://urbanmilwaukee.com/2026/06/01/brennan-education",
    ]);
    const campaignDraft = drafts.find((d) => d.sources[0].url === campaignArgs.sourceUrl)!;
    expect(campaignDraft.summary).toBe("Campaign site: fully fund schools.");
    expect(campaignDraft.stance).toBe("support");

    const tasks = await t.run((ctx) => ctx.db.query("review_tasks").collect());
    expect(tasks).toHaveLength(2);
    expect(new Set(tasks.map((task) => task.refId)).size).toBe(2);
    // MOO-313: the review task carries the originating trace for Arize deep-links
    const campaignTask = tasks.find((task) => task.refId === campaignDraft._id)!;
    expect(campaignTask.traceId).toBe("trace-campaign-1");
  });

  test("re-extraction from the same source updates its own pending draft, no new row", async () => {
    const t = setup();
    await t.run((ctx) => ctx.db.insert("candidates", baseCandidate));

    await t.mutation(internal.researchQueries.saveExtraction, {
      ...campaignArgs,
      extraction: positionFor("First pass."),
    });
    await t.mutation(internal.researchQueries.saveExtraction, {
      ...campaignArgs,
      extraction: positionFor("Updated after site refresh.", "evolving"),
    });

    const drafts = await t.run((ctx) => ctx.db.query("candidate_positions_drafts").collect());
    expect(drafts).toHaveLength(1);
    expect(drafts[0].summary).toBe("Updated after site refresh.");
    expect(drafts[0].stance).toBe("evolving");

    const tasks = await t.run((ctx) => ctx.db.query("review_tasks").collect());
    expect(tasks).toHaveLength(1);
  });

  test("publish path unchanged: approving either per-source draft upserts the one published row", async () => {
    const t = setup();
    await t.run((ctx) => ctx.db.insert("candidates", baseCandidate));

    await t.mutation(internal.researchQueries.saveExtraction, {
      ...campaignArgs,
      extraction: positionFor("Campaign stance."),
    });
    await t.mutation(internal.researchQueries.saveExtraction, {
      ...articleArgs,
      extraction: positionFor("Article stance.", "mixed"),
    });

    const drafts = await t.run((ctx) => ctx.db.query("candidate_positions_drafts").collect());
    const campaignDraft = drafts.find((d) => d.sources[0].url === campaignArgs.sourceUrl)!;
    const articleDraft = drafts.find((d) => d.sources[0].url === articleArgs.sourceUrl)!;

    const admin = t.withIdentity(ADMIN);
    await admin.mutation(api.publish.setDraftReviewStatus, {
      kind: "position",
      draftId: campaignDraft._id,
      status: "approved",
    });
    await admin.mutation(api.publish.publishPosition, { draftId: campaignDraft._id });

    await admin.mutation(api.publish.setDraftReviewStatus, {
      kind: "position",
      draftId: articleDraft._id,
      status: "approved",
    });
    await admin.mutation(api.publish.publishPosition, { draftId: articleDraft._id });

    const published = await t.run((ctx) =>
      ctx.db.query("candidate_positions_published").collect(),
    );
    expect(published).toHaveLength(1);
    expect(published[0].summary).toBe("Article stance.");
    expect(published[0].draftId).toBe(articleDraft._id);
  });
});
