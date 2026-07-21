import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  META_ADS_FIXTURE,
  META_ADS_FIXTURE_TRACKED_PAGES,
} from "./lib/metaAdsFixture";

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
  fixture: META_ADS_FIXTURE,
  trackedEntities: META_ADS_FIXTURE_TRACKED_PAGES,
};

afterEach(() => vi.unstubAllGlobals());

test("fixture sync attributes tracked pages, routes name-inferred to review", async () => {
  const t = convexTest(schema, modules);
  await seedGovRace(t);

  const result = await t.action(internal.ads.syncMetaAds, syncArgs);
  expect(result).toMatchObject({
    status: "ok",
    fetched: 3,
    attributed: 1,
    review: 1,
    unmatched: 1,
  });

  const ads = await t.query(api.ads.listAds, {});
  const byId = new Map(ads.map((a) => [a.platformAdId, a]));

  // Verified tracked page → public attribution.
  expect(byId.get("aid_1001")?.candidateSlug).toBe("kelda-roys");
  expect(byId.get("aid_1001")?.matchConfidence).toBeGreaterThanOrEqual(0.7);

  // Candidate named in an untracked PAC's ad → stored but NOT attributed.
  expect(byId.get("aid_1002")?.candidateSlug).toBeUndefined();
  // No candidate signal → stored, unattributed.
  expect(byId.get("aid_1003")?.candidateSlug).toBeUndefined();

  // The ambiguous one landed in the review queue, referencing that ad.
  const open = await t.run((ctx) =>
    ctx.db
      .query("review_tasks")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect(),
  );
  const adMatch = open.filter((r) => r.kind === "ad_match");
  expect(adMatch).toHaveLength(1);
  expect(adMatch[0].refId).toBe(byId.get("aid_1002")?._id);

  // Attributed candidate's page query returns only the public ad.
  const forRoys = await t.query(api.ads.adsForCandidate, {
    raceId: "WI-GOV-2026",
    candidateSlug: "kelda-roys",
  });
  expect(forRoys.map((a) => a.platformAdId)).toEqual(["aid_1001"]);
});

test("re-sync is idempotent and does not duplicate review tasks or metrics", async () => {
  const t = convexTest(schema, modules);
  await seedGovRace(t);
  await t.action(internal.ads.syncMetaAds, syncArgs);
  await t.action(internal.ads.syncMetaAds, syncArgs);

  const ads = await t.query(api.ads.listAds, {});
  expect(ads).toHaveLength(3);

  const metrics = await t.run((ctx) => ctx.db.query("ad_metrics_daily").collect());
  expect(metrics).toHaveLength(3); // one per ad per day, upserted not appended

  const open = await t.run((ctx) =>
    ctx.db
      .query("review_tasks")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect(),
  );
  expect(open.filter((r) => r.kind === "ad_match")).toHaveLength(1);
});

test("re-sync preserves a human-resolved attribution", async () => {
  const t = convexTest(schema, modules);
  await seedGovRace(t);
  await t.action(internal.ads.syncMetaAds, syncArgs);

  // A human confirms aid_1002 really is Roys and sets the attribution.
  await t.run(async (ctx) => {
    const ad = await ctx.db
      .query("ads")
      .withIndex("by_platform_ad", (q) =>
        q.eq("platform", "meta").eq("platformAdId", "aid_1002"),
      )
      .unique();
    await ctx.db.patch(ad!._id, {
      candidateSlug: "kelda-roys",
      raceId: "WI-GOV-2026",
    });
  });

  await t.action(internal.ads.syncMetaAds, syncArgs);

  const ad = await t.run((ctx) =>
    ctx.db
      .query("ads")
      .withIndex("by_platform_ad", (q) =>
        q.eq("platform", "meta").eq("platformAdId", "aid_1002"),
      )
      .unique(),
  );
  expect(ad?.candidateSlug).toBe("kelda-roys"); // not wiped by the sync
});

test("no token, no fixture → graceful skip with an info alert, no crash", async () => {
  const t = convexTest(schema, modules);
  const result = await t.action(internal.ads.syncMetaAds, {});
  expect(result).toMatchObject({ status: "skipped" });

  const alerts = await t.run((ctx) => ctx.db.query("alerts").collect());
  expect(alerts).toHaveLength(1);
  expect(alerts[0].severity).toBe("info");
  expect(alerts[0].resolved).toBe(false);
});

test("expired token → warning alert and graceful return, no crash", async () => {
  const t = convexTest(schema, modules);
  // Meta signals an expired/invalid token with error code 190.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ error: { code: 190, message: "Session expired" } }, {
        status: 400,
      }),
    ),
  );

  const result = await t.action(internal.ads.syncMetaAds, {
    token: "expired-token",
    trackedEntities: META_ADS_FIXTURE_TRACKED_PAGES,
  });
  expect(result).toMatchObject({ status: "token_expired" });

  const alerts = await t.run((ctx) => ctx.db.query("alerts").collect());
  expect(alerts).toHaveLength(1);
  expect(alerts[0].severity).toBe("warning");
});

test("purgeOffCycleAds removes off-cycle + undated ads, keeps in-scope + attribution", async () => {
  const t = convexTest(schema, modules);
  const base = { platform: "meta" as const, pageOrCommittee: "X", firstSeenAt: 0, lastSeenAt: 0 };
  await t.run(async (ctx) => {
    // in-scope 2025+ (one attributed) — must survive
    await ctx.db.insert("ads", { ...base, platformAdId: "keep1", deliveryStart: "2025-03-01" });
    await ctx.db.insert("ads", { ...base, platformAdId: "keep2", deliveryStart: "2026-07-01", candidateSlug: "tom-tiffany", raceId: "WI-GOV-2026" });
    // off-cycle dated — must go
    await ctx.db.insert("ads", { ...base, platformAdId: "old1", deliveryStart: "2024-11-01" });
    // undated (legacy, never re-synced) — must go
    await ctx.db.insert("ads", { ...base, platformAdId: "undated1" });
  });

  const dry = await t.mutation(internal.ads.purgeOffCycleAds, { dryRun: true });
  expect(dry).toMatchObject({ dryRun: true, total: 4, offCycleDated: 1, undated: 1, toRemove: 2, kept: 2 });
  // dry run touched nothing
  expect(await t.run((ctx) => ctx.db.query("ads").collect())).toHaveLength(4);

  const real = await t.mutation(internal.ads.purgeOffCycleAds, { dryRun: false });
  expect(real).toMatchObject({ dryRun: false, toRemove: 2, kept: 2 });
  const remaining = await t.run((ctx) => ctx.db.query("ads").collect());
  expect(remaining.map((a) => a.platformAdId).sort()).toEqual(["keep1", "keep2"]);
  // attribution preserved on the surviving in-scope ad
  expect(remaining.find((a) => a.platformAdId === "keep2")?.candidateSlug).toBe("tom-tiffany");
});
