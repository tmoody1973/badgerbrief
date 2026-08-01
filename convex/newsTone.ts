import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

/** Persist an LLM tone classification onto an article_sources row. */
export const setArticleTone = internalMutation({
  args: {
    id: v.id("article_sources"),
    tone: v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative")),
    confidence: v.number(),
    rationale: v.string(),
  },
  handler: async (ctx, { id, tone, confidence, rationale }) => {
    await ctx.db.patch(id, { tone, toneConfidence: confidence, toneRationale: rationale, toneClassifiedAt: Date.now() });
  },
});

/**
 * Per-candidate earned-media tone for the race: counts of positive/neutral/
 * negative approved stories, a net (positive - negative) score, and the linked
 * headlines so the reader can audit the classifier. Unclassified approved
 * stories count as neutral.
 */
export const newsToneForRace = query({
  args: { raceId: v.string() },
  handler: async (ctx, { raceId }) => {
    const rows = await ctx.db
      .query("article_sources")
      .withIndex("by_race", (q) => q.eq("raceId", raceId))
      .collect();
    const approved = rows.filter((r) => r.status === "approved" && r.candidateSlug);
    const byCand = new Map<string, typeof approved>();
    for (const r of approved) {
      const g = byCand.get(r.candidateSlug!) ?? [];
      g.push(r);
      byCand.set(r.candidateSlug!, g);
    }
    return [...byCand.entries()].map(([candidateSlug, arts]) => {
      const tone = (r: (typeof arts)[number]) => r.tone ?? "neutral";
      const positive = arts.filter((r) => tone(r) === "positive").length;
      const negative = arts.filter((r) => tone(r) === "negative").length;
      const neutral = arts.length - positive - negative;
      return {
        candidateSlug,
        positive,
        neutral,
        negative,
        net: positive - negative,
        count: arts.length,
        stories: arts.map((r) => ({ headline: r.headline, url: r.url, outlet: r.outlet, tone: tone(r) })),
      };
    });
  },
});
