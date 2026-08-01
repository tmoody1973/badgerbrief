import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => convexTest(schema, modules);

async function seedArticle(t: ReturnType<typeof setup>, slug: string, headline: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("article_sources", {
      candidateSlug: slug,
      raceId: "WI-GOV-2026",
      url: `https://example.com/${encodeURIComponent(headline)}`,
      outlet: "Example Outlet",
      headline,
      whyRelevant: "test",
      status: "approved",
      proposedAt: 0,
    } as any),
  );
}

describe("newsTone", () => {
  test("setArticleTone stores tone; newsToneForRace aggregates +/neutral/- and net", async () => {
    const t = setup();
    const a = await seedArticle(t, "francesca-hong", "Hong unveils housing plan");
    const b = await seedArticle(t, "francesca-hong", "Hong faces criticism over vote");
    await seedArticle(t, "francesca-hong", "Hong to appear at forum"); // stays unclassified → neutral bucket

    await t.mutation(internal.newsTone.setArticleTone, { id: a, tone: "positive", confidence: 0.9, rationale: "x" });
    await t.mutation(internal.newsTone.setArticleTone, { id: b, tone: "negative", confidence: 0.8, rationale: "x" });

    const rows = await t.query(api.newsTone.newsToneForRace, { raceId: "WI-GOV-2026" });
    const hong = rows.find((r) => r.candidateSlug === "francesca-hong")!;
    expect(hong.positive).toBe(1);
    expect(hong.negative).toBe(1);
    expect(hong.neutral).toBe(1); // unclassified counts neutral
    expect(hong.count).toBe(3);
    expect(hong.net).toBe(0); // positive - negative
    expect(hong.stories).toHaveLength(3);
  });
});
