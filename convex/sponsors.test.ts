import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
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
