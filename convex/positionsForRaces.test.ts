import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => convexTest(schema, modules);

test("positionsForRaces returns candidates + published positions per race, in id order", async () => {
  const t = setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("races", {
      raceId: "WI-GOV-2026", electionSlug: "wi-2026", office: "Governor",
      level: "State Executive", sources: [], dataAsOf: "2026-07-26",
    });
    await ctx.db.insert("candidates", {
      slug: "barnes", raceId: "WI-GOV-2026", name: "Mandela Barnes", party: "Democratic",
      sources: [], dataAsOf: "2026-07-26",
    });
    const draftId = await ctx.db.insert("candidate_positions_drafts", {
      candidateSlug: "barnes", raceId: "WI-GOV-2026", issueSlug: "healthcare",
      stance: "support", summary: "…", confidence: 0.8,
      sources: [{ name: "Site", url: "https://x" }],
      reviewStatus: "approved", extractedAt: 1,
    });
    await ctx.db.insert("candidate_positions_published", {
      candidateSlug: "barnes", raceId: "WI-GOV-2026", issueSlug: "healthcare",
      stance: "support", summary: "…", confidence: 0.8,
      sources: [{ name: "Site", url: "https://x" }],
      draftId, publishedAt: 1, lastReviewedAt: 1,
    });
  });

  const out = await t.query(api.public.positionsForRaces, { raceIds: ["WI-GOV-2026", "MISSING"] });
  expect(out).toHaveLength(1);
  expect(out[0].raceId).toBe("WI-GOV-2026");
  expect(out[0].office).toBe("Governor");
  expect(out[0].level).toBe("State Executive");
  expect(out[0].candidates).toEqual([{ slug: "barnes", name: "Mandela Barnes", party: "Democratic", incumbent: undefined }]);
  expect(out[0].positions[0]).toMatchObject({ candidateSlug: "barnes", issueSlug: "healthcare", stance: "support" });
});
