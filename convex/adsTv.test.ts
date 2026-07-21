import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

describe("ads schema — tv", () => {
  test("accepts a platform:tv row with TV fields", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) =>
      ctx.db.insert("ads", {
        platform: "tv",
        platformAdId: "fm-uuid-1",
        pageOrCommittee: "Barnes/D/Governor",
        spendLower: 24550,
        spendUpper: 24550,
        station: "WISN-TV",
        dma: "Milwaukee",
        spotCount: 18,
        flightStart: "2026-07-14",
        flightEnd: "2026-07-20",
        fccDocUrl: "https://publicfiles.fcc.gov/x.pdf",
        orderRef: "4443972",
        firstSeenAt: 0,
        lastSeenAt: 0,
      } as any),
    );
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.platform).toBe("tv");
    expect(row?.station).toBe("WISN-TV");
    expect(row?.spotCount).toBe(18);
  });
});
