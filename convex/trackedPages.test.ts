import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);

const ad = (platformAdId: string, pageOrCommittee: string, extra: Record<string, unknown> = {}) => ({
  platform: "meta" as const,
  platformAdId,
  pageOrCommittee,
  matchConfidence: 0.6,
  ...extra,
});

describe("attributeTrackedPage", () => {
  test("attaches a certified page's unattributed ads to its candidate and closes their review tasks", async () => {
    const t = convexTest(schema, modules);
    const own = await t.mutation(internal.ads.upsertAd, ad("1", "Tom Tiffany"));
    await t.mutation(internal.ads.openAdReviewTask, { adId: own, note: "name match → tom-tiffany" });
    const other = await t.mutation(internal.ads.upsertAd, ad("2", "Some PAC"));
    const already = await t.mutation(internal.ads.upsertAd, ad("3", "Tom Tiffany", { candidateSlug: "x", raceId: "WI-X", matchConfidence: 1 }));

    const r = await t.mutation(internal.ads.attributeTrackedPage, {
      pageName: "Tom Tiffany",
      candidateSlug: "tom-tiffany",
      raceId: "WI-GOV-2026",
    });

    expect(r).toEqual({ attributed: 1, resolvedTasks: 1 });
    const rows = await t.run(async (ctx) => ({
      own: await ctx.db.get(own),
      other: await ctx.db.get(other),
      already: await ctx.db.get(already),
      tasks: await ctx.db.query("review_tasks").collect(),
    }));
    expect(rows.own).toMatchObject({ candidateSlug: "tom-tiffany", raceId: "WI-GOV-2026", matchConfidence: 0.98 });
    expect(rows.other?.candidateSlug).toBeUndefined();
    expect(rows.already?.candidateSlug).toBe("x"); // a human's earlier call is never overwritten
    expect(rows.tasks.map((x) => x.status)).toEqual(["resolved"]);
  });
});
