import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

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

/**
 * Pure, testable rubric prompt for the tone classifier. Tone is judged TOWARD
 * the candidate, not the raw sentiment of the words — most coverage is
 * neutral, and the candidate attacking an opponent reads as positive for them.
 */
export function buildToneRubricPrompt(headline: string, whyRelevant: string, candidateName: string): string {
  return [
    `Classify the tone of this news item TOWARD the candidate "${candidateName}".`,
    `Answer positive, neutral, or negative from the candidate's perspective — not the overall mood of the words.`,
    `Rules:`,
    `- If the candidate attacks an opponent or lands a hit, that is POSITIVE for the candidate, even though the words are harsh.`,
    `- Straight, factual coverage with no favorable/unfavorable slant is NEUTRAL. Most coverage is neutral.`,
    `- Scandal, criticism, gaffes, or bad polling for the candidate are NEGATIVE.`,
    `- If genuinely unsure, answer neutral with low confidence.`,
    ``,
    `Headline: ${headline}`,
    `Why it's relevant: ${whyRelevant}`,
  ].join("\n");
}

/** Approved article_sources rows not yet tone-classified, resolved to a display candidate name. */
export const pendingToClassify = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query("article_sources")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();
    const pending = rows.filter((r) => r.candidateSlug && r.tone === undefined).slice(0, limit);
    const out: Array<{ id: (typeof rows)[number]["_id"]; headline: string; whyRelevant: string; candidateName: string }> = [];
    for (const r of pending) {
      const cand = await ctx.db
        .query("candidates")
        .withIndex("by_race", (q) => q.eq("raceId", r.raceId!))
        .collect();
      const name = cand.find((c) => c.slug === r.candidateSlug)?.name ?? r.candidateSlug!;
      out.push({ id: r._id, headline: r.headline, whyRelevant: r.whyRelevant, candidateName: name });
    }
    return out;
  },
});
