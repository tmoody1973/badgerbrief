import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const USER = { subject: "clerk_pref_user" };
const setup = () => convexTest(schema, modules);

describe("savePrefs", () => {
  test("patches existing prefs row, preserving districts", async () => {
    const t = setup();
    const userId = await t.run((ctx) => ctx.db.insert("users", { clerkId: "clerk_pref_user", email: "p@x.com" }));
    await t.run((ctx) =>
      ctx.db.insert("user_preferences", {
        userId,
        address: "a",
        congressionalDistrict: "4",
        stateSenateDistrict: "3",
        stateAssemblyDistrict: "8",
        savedRaceIds: [],
        savedIssues: [],
        detailLevel: "standard",
      }),
    );
    await t.withIdentity(USER).mutation(api.preferences.savePrefs, {
      savedRaceIds: ["WI-GOV-2026"],
      savedIssues: ["housing"],
      detailLevel: "deep",
    });
    const row = await t.run(async (ctx) =>
      ctx.db.query("user_preferences").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
    );
    expect(row).toMatchObject({
      savedRaceIds: ["WI-GOV-2026"],
      savedIssues: ["housing"],
      detailLevel: "deep",
      congressionalDistrict: "4",
    });
  });

  test("creates a prefs row when none exists (districts come later)", async () => {
    const t = setup();
    const userId = await t.run((ctx) => ctx.db.insert("users", { clerkId: "clerk_pref_user", email: "p@x.com" }));
    await t.withIdentity(USER).mutation(api.preferences.savePrefs, {
      savedRaceIds: [],
      savedIssues: ["schools"],
      detailLevel: "short",
    });
    const row = await t.run(async (ctx) =>
      ctx.db.query("user_preferences").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
    );
    expect(row).toMatchObject({ savedIssues: ["schools"], detailLevel: "short" });
  });
});

describe("listIssueSlugs", () => {
  test("distinct sorted slugs from published positions", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      // Create a draft to reference for draftId
      const draftId = await ctx.db.insert("candidate_positions_drafts", {
        candidateSlug: "kelda-roys",
        raceId: "WI-GOV-2026",
        issueSlug: "housing",
        stance: "support" as const,
        summary: "test",
        confidence: 0.9,
        sources: [],
        reviewStatus: "approved",
        extractedAt: 1,
      });
      const base = {
        raceId: "WI-GOV-2026",
        candidateSlug: "kelda-roys",
        summary: "s",
        stance: "support" as const,
        confidence: 0.8,
        sources: [],
        draftId,
        publishedAt: 1,
        lastReviewedAt: 1,
      };
      await ctx.db.insert("candidate_positions_published", { ...base, issueSlug: "housing" });
      await ctx.db.insert("candidate_positions_published", { ...base, issueSlug: "immigration" });
      await ctx.db.insert("candidate_positions_published", {
        ...base,
        candidateSlug: "joel-brennan",
        issueSlug: "housing",
      });
    });
    expect(await t.query(api.public.listIssueSlugs, {})).toEqual(["housing", "immigration"]);
  });
});
