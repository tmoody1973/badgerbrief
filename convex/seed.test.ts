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
  slug: "mandela-barnes",
  raceId: "WI-GOV-2026",
  name: "Mandela Barnes",
  sources: [],
  dataAsOf: "2026-07-19",
};

describe("setCampaignWebsite", () => {
  test("sets the homepage for a candidate that had none", async () => {
    const t = setup();
    await t.run((ctx) => ctx.db.insert("candidates", baseCandidate));

    const result = await t.mutation(internal.seed.setCampaignWebsite, {
      slug: "mandela-barnes",
      url: "https://www.mandelabarnes.com/",
    });

    expect(result).toEqual({
      slug: "mandela-barnes",
      previous: null,
      current: "https://www.mandelabarnes.com/",
    });
    const row = await t.run((ctx) =>
      ctx.db
        .query("candidates")
        .withIndex("by_slug_only", (q) => q.eq("slug", "mandela-barnes"))
        .first(),
    );
    expect(row!.socialMedia?.campaign_website).toBe("https://www.mandelabarnes.com/");
  });

  test("preserves other social handles when merging", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("candidates", {
        ...baseCandidate,
        socialMedia: {
          twitter_x: "https://x.com/TheOtherMandela",
          instagram: "https://instagram.com/mandelabarnes",
        },
      }),
    );

    await t.mutation(internal.seed.setCampaignWebsite, {
      slug: "mandela-barnes",
      url: "https://www.mandelabarnes.com/",
    });

    const row = await t.run((ctx) =>
      ctx.db
        .query("candidates")
        .withIndex("by_slug_only", (q) => q.eq("slug", "mandela-barnes"))
        .first(),
    );
    expect(row!.socialMedia).toEqual({
      twitter_x: "https://x.com/TheOtherMandela",
      instagram: "https://instagram.com/mandelabarnes",
      campaign_website: "https://www.mandelabarnes.com/",
    });
  });

  test("reports the prior value when correcting an existing URL", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("candidates", {
        ...baseCandidate,
        socialMedia: { campaign_website: "https://old.example.com/" },
      }),
    );

    const result = await t.mutation(internal.seed.setCampaignWebsite, {
      slug: "mandela-barnes",
      url: "https://www.mandelabarnes.com/",
    });
    expect(result.previous).toBe("https://old.example.com/");
  });

  test("throws for an unknown slug rather than silently doing nothing", async () => {
    const t = setup();
    await expect(
      t.mutation(internal.seed.setCampaignWebsite, {
        slug: "nobody",
        url: "https://example.com/",
      }),
    ).rejects.toThrow(/no candidate/);
  });
});
