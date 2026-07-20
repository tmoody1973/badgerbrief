import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  GOOGLE_ADS_FIXTURE,
  GOOGLE_ADS_FIXTURE_TRACKED_ENTITIES,
} from "./lib/googleAdsFixture";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

async function seedGovRace(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("races", {
      raceId: "WI-GOV-2026",
      electionSlug: "wi-2026",
      office: "Governor",
      level: "State Executive",
      sources: [],
      dataAsOf: "2026-07-20",
    });
    await ctx.db.insert("candidates", {
      slug: "kelda-roys",
      raceId: "WI-GOV-2026",
      name: "Kelda Roys",
      sources: [],
      dataAsOf: "2026-07-20",
    });
  });
}

const syncArgs = {
  fixture: GOOGLE_ADS_FIXTURE,
  trackedEntities: GOOGLE_ADS_FIXTURE_TRACKED_ENTITIES,
};

test("google fixture sync routes through the shared pipeline like Meta", async () => {
  const t = convexTest(schema, modules);
  await seedGovRace(t);

  const result = await t.action(internal.ads.syncGoogleAds, syncArgs);
  expect(result).toMatchObject({
    status: "ok",
    fetched: 3,
    attributed: 1,
    review: 1,
    unmatched: 1,
  });

  const ads = await t.query(api.ads.listAds, {});
  const byId = new Map(ads.map((a) => [a.platformAdId, a]));

  expect(byId.get("g_ad_2001")?.platform).toBe("google");
  expect(byId.get("g_ad_2001")?.candidateSlug).toBe("kelda-roys"); // tracked → public
  expect(byId.get("g_ad_2002")?.candidateSlug).toBeUndefined(); // name-inferred → review only
  expect(byId.get("g_ad_2003")?.candidateSlug).toBeUndefined(); // no signal

  const open = await t.run((ctx) =>
    ctx.db
      .query("review_tasks")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect(),
  );
  const adMatch = open.filter((r) => r.kind === "ad_match");
  expect(adMatch).toHaveLength(1);
  expect(adMatch[0].refId).toBe(byId.get("g_ad_2002")?._id);

  const forRoys = await t.query(api.ads.adsForCandidate, {
    raceId: "WI-GOV-2026",
    candidateSlug: "kelda-roys",
  });
  expect(forRoys.map((a) => a.platformAdId)).toEqual(["g_ad_2001"]);
});

test("google sync with no credentials skips gracefully with an info alert", async () => {
  const t = convexTest(schema, modules);
  const result = await t.action(internal.ads.syncGoogleAds, {});
  expect(result).toMatchObject({ status: "skipped" });

  const alerts = await t.run((ctx) => ctx.db.query("alerts").collect());
  expect(alerts).toHaveLength(1);
  expect(alerts[0].severity).toBe("info");
});
