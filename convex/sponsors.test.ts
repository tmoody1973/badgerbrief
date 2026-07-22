import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

test("upsertEnrichment preserves existing facts and approved narrative when re-run returns undefined", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();

  await t.run(async (ctx) => {
    await ctx.db.insert("sponsors", {
      key: "acme-pac",
      displayName: "Acme PAC",
      topDonors: [{ name: "Jane Donor", amount: 5000 }],
      totalRaised: 100000,
      sources: [{ label: "FEC", url: "https://fec.gov" }],
      narrative: "Acme PAC is a longstanding donor group.",
      narrativeStatus: "approved",
      reviewStatus: "approved",
      enrichedAt: now,
      updatedAt: now,
    });
  });

  await t.mutation(internal.sponsors.upsertEnrichment, {
    key: "acme-pac",
    displayName: "Acme PAC",
    sources: [],
  });

  const row = await t.run(async (ctx) => {
    return await ctx.db
      .query("sponsors")
      .withIndex("by_key", (q) => q.eq("key", "acme-pac"))
      .unique();
  });

  expect(row).not.toBeNull();
  expect(row!.totalRaised).toBe(100000);
  expect(row!.topDonors).toEqual([{ name: "Jane Donor", amount: 5000 }]);
  expect(row!.narrative).toBe("Acme PAC is a longstanding donor group.");
  expect(row!.narrativeStatus).toBe("approved");
  expect(row!.enrichedAt).toBeGreaterThanOrEqual(now);
});

describe("sponsorScorecard", () => {
  test("rolls this sponsor's ads into supported/attacked with summed spend", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const base = { platform: "meta" as const, firstSeenAt: 0, lastSeenAt: 0, pageOrCommittee: "A Better Wisconsin Together" };
      await ctx.db.insert("ads", { ...base, platformAdId: "a1", raceId: "R1", candidateSlug: "tom-tiffany", stance: "oppose", spendLower: 60000, spendUpper: 80000 });
      await ctx.db.insert("ads", { ...base, platformAdId: "a2", raceId: "R1", candidateSlug: "tom-tiffany", stance: "oppose", spendLower: 20000, spendUpper: 20000 });
      await ctx.db.insert("ads", { ...base, platformAdId: "a3", raceId: "R2", candidateSlug: "rebecca-cooke", stance: "support", spendLower: 10000, spendUpper: 20000 });
      // Different sponsor — must be excluded.
      await ctx.db.insert("ads", { platform: "meta", firstSeenAt: 0, lastSeenAt: 0, platformAdId: "b1", pageOrCommittee: "Other PAC", candidateSlug: "x", stance: "support", spendLower: 1, spendUpper: 1 });
    });
    const r = await t.query(api.sponsors.sponsorScorecard, { key: "a better wisconsin together" });
    expect(r.attacked).toEqual([{ candidateSlug: "tom-tiffany", raceId: "R1", spend: 90000, adCount: 2 }]);
    expect(r.supported).toEqual([{ candidateSlug: "rebecca-cooke", raceId: "R2", spend: 15000, adCount: 1 }]);
  });
});

describe("sponsorPublicProfile tiered gate", () => {
  test("exact facts always public; narrative hidden until approved", async () => {
    const t = convexTest(schema, modules);
    const baseDoc = { key: "acme pac", displayName: "Acme PAC", disclosesDonors: true, totalRaised: 100, sources: [], reviewStatus: "draft" as const, updatedAt: 0, enrichedAt: 1, narrative: "Secret story.", leadership: [{ name: "A", role: "CEO" }] };
    await t.run(async (ctx) => { await ctx.db.insert("sponsors", { ...baseDoc, narrativeStatus: "draft" as const }); });
    let p = await t.query(api.sponsors.sponsorPublicProfile, { key: "acme pac" });
    expect(p?.totalRaised).toBe(100);
    expect(p?.narrative).toBeUndefined();
    expect(p?.leadership).toBeUndefined();
    await t.run(async (ctx) => {
      const row = await ctx.db.query("sponsors").withIndex("by_key", (q) => q.eq("key", "acme pac")).unique();
      await ctx.db.patch(row!._id, { narrativeStatus: "approved" });
    });
    p = await t.query(api.sponsors.sponsorPublicProfile, { key: "acme pac" });
    expect(p?.narrative).toBe("Secret story.");
    expect(p?.leadership).toEqual([{ name: "A", role: "CEO" }]);
  });
});
