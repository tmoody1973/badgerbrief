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

const THIRTY_DAYS_AGO = Date.now() - 30 * 86_400_000;

async function insertStalePublishedPosition(t: ReturnType<typeof setup>) {
  return t.run(async (ctx) => {
    const draftId = await ctx.db.insert("candidate_positions_drafts", {
      candidateSlug: "tom-tiffany",
      raceId: "WI-GOV-2026",
      issueSlug: "healthcare",
      stance: "support" as const,
      summary: "Supports expanding rural clinics.",
      confidence: 0.8,
      sources: [{ name: "Tom Tiffany", url: "https://example.com/site" }],
      reviewStatus: "approved" as const,
      extractedAt: THIRTY_DAYS_AGO,
    });
    return ctx.db.insert("candidate_positions_published", {
      candidateSlug: "tom-tiffany",
      raceId: "WI-GOV-2026",
      issueSlug: "healthcare",
      stance: "support" as const,
      summary: "Supports expanding rural clinics.",
      confidence: 0.8,
      sources: [{ name: "Tom Tiffany", url: "https://example.com/site" }],
      draftId,
      publishedAt: THIRTY_DAYS_AGO,
      lastReviewedAt: THIRTY_DAYS_AGO,
    });
  });
}

describe("monitor: stalenessSweep", () => {
  test("flags a published position not reviewed within maxAgeDays", async () => {
    const t = setup();
    const publishedId = await insertStalePublishedPosition(t);

    await t.mutation(internal.monitorQueries.stalenessSweep, {});

    const alerts = await t.run((ctx) => ctx.db.query("alerts").collect());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: "staleness",
      severity: "warning",
      refTable: "candidate_positions_published",
      refId: publishedId,
      resolved: false,
    });
    expect(alerts[0].message).toContain("tom-tiffany/healthcare");
  });

  test("running the sweep twice does not duplicate the alert", async () => {
    const t = setup();
    await insertStalePublishedPosition(t);

    await t.mutation(internal.monitorQueries.stalenessSweep, {});
    await t.mutation(internal.monitorQueries.stalenessSweep, {});

    const alerts = await t.run((ctx) => ctx.db.query("alerts").collect());
    expect(alerts).toHaveLength(1);
  });

  test("does not flag a recently reviewed position", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const draftId = await ctx.db.insert("candidate_positions_drafts", {
        candidateSlug: "fresh-candidate",
        raceId: "WI-GOV-2026",
        issueSlug: "economy",
        stance: "support" as const,
        summary: "Recently reviewed.",
        confidence: 0.9,
        sources: [{ name: "Fresh Candidate", url: "https://example.com/fresh" }],
        reviewStatus: "approved" as const,
        extractedAt: Date.now(),
      });
      await ctx.db.insert("candidate_positions_published", {
        candidateSlug: "fresh-candidate",
        raceId: "WI-GOV-2026",
        issueSlug: "economy",
        stance: "support" as const,
        summary: "Recently reviewed.",
        confidence: 0.9,
        sources: [{ name: "Fresh Candidate", url: "https://example.com/fresh" }],
        draftId,
        publishedAt: Date.now(),
        lastReviewedAt: Date.now(),
      });
    });

    await t.mutation(internal.monitorQueries.stalenessSweep, {});

    const alerts = await t.run((ctx) => ctx.db.query("alerts").collect());
    expect(alerts).toHaveLength(0);
  });
});
