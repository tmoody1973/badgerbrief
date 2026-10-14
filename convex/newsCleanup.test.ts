import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);

const row = (url: string, headline: string, extra: Record<string, unknown> = {}) => ({
  candidateSlug: "rebecca-cooke",
  raceId: "WI-US-HOUSE-D3-2026",
  url,
  outlet: "Wisconsin State Journal",
  headline,
  whyRelevant: "",
  status: "proposed" as const,
  proposedAt: 1,
  hubStatus: "auto" as const,
  ...extra,
});

test("opinion pieces come off /news (hidden, not deleted); news and campaign pages are untouched", async () => {
  const t = convexTest(schema, modules);
  const [opinion, news] = await t.run(async (ctx) => [
    await ctx.db.insert("article_sources", row("https://madison.com/opinion/letters/article_1.html", "Rebecca Cooke is best | Bob Gates")),
    await ctx.db.insert("article_sources", row("https://www.wpr.org/news/cooke-tariffs", "Cooke calls for reversing tariffs")),
  ]);

  expect(await t.mutation(internal.newsCleanup.hideOpinionFromHub, {})).toEqual({ hidden: 1 });

  const after = await t.run(async (ctx) => [await ctx.db.get(opinion), await ctx.db.get(news)]);
  expect(after[0]?.hubStatus).toBe("hidden");
  expect(after[1]?.hubStatus).toBe("auto");
});

test("lists /news stories with no picture, leaving out rejected rows and campaign sites", async () => {
  const t = convexTest(schema, modules);
  const [missing] = await t.run(async (ctx) => [
    await ctx.db.insert("article_sources", row("https://www.jsonline.com/story/a/", "No picture")),
    await ctx.db.insert("article_sources", row("https://www.jsonline.com/story/b/", "Has picture", { imageUrl: "https://x/img.jpg" })),
    await ctx.db.insert("article_sources", row("https://www.jsonline.com/story/c/", "Rejected", { status: "rejected" })),
    await ctx.db.insert("article_sources", row("https://www.crowleyforwi.com/", "Campaign", { sourceKind: "campaign_site" })),
  ]);

  expect(await t.query(internal.newsCleanup.storiesWithoutImage, { limit: 10 })).toEqual([{ id: missing, url: "https://www.jsonline.com/story/a/" }]);
});

test("saves a found picture on the story", async () => {
  const t = convexTest(schema, modules);
  const id = await t.run((ctx) => ctx.db.insert("article_sources", row("https://www.jsonline.com/story/a/", "No picture")));
  await t.mutation(internal.newsCleanup.setImage, { id, imageUrl: "https://www.jsonline.com/img.jpg" });
  expect((await t.run((ctx) => ctx.db.get(id)))?.imageUrl).toBe("https://www.jsonline.com/img.jpg");
});
