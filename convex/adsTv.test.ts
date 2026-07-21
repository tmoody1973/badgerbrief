import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

async function seedGovBarnes(t: ReturnType<typeof convexTest>) {
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
      slug: "mandela-barnes",
      raceId: "WI-GOV-2026",
      name: "Mandela Barnes",
      sources: [],
      dataAsOf: "2026-07-20",
    });
  });
}

const barnesExtraction = {
  advertiser: "Barnes/D/Governor",
  party: "D",
  office: "Governor",
  candidateName: "Mandela Barnes",
  station: "WISN-TV",
  dma: "Milwaukee",
  flightStart: "2026-07-14",
  flightEnd: "2026-07-20",
  spotCount: 18,
  grossSpend: 24550,
  netSpend: 20867.5,
  orderRef: "4443972",
  confidence: { overall: 0.95 },
};

const meta = {
  fileManagerId: "072a77e4-4a62-491a-8813-9580e543e991",
  fccDocUrl: "https://publicfiles.fcc.gov/x.pdf",
  year: 2026,
};

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

describe("ingestTvDoc", () => {
  test("Barnes order → one tv row (exact spend), unattributed + review w/ suggestion", async () => {
    const t = convexTest(schema, modules);
    await seedGovBarnes(t);

    const res = await t.action(internal.adsTv.ingestTvDoc, {
      extraction: barnesExtraction,
      ...meta,
    });
    expect(res.isPublic).toBe(false); // name match caps < public threshold

    const rows = await t.run((ctx) => ctx.db.query("ads").collect());
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.platform).toBe("tv");
    expect(row.spendLower).toBe(24550);
    expect(row.spendUpper).toBe(24550);
    expect(row.spendLower).toBe(row.spendUpper);
    expect(row.fccDocUrl).toBe(meta.fccDocUrl);
    expect(row.candidateSlug).toBeUndefined(); // human-gated

    const tasks = await t.run((ctx) =>
      ctx.db.query("review_tasks").collect(),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].kind).toBe("ad_match");
    expect(tasks[0].note).toContain("mandela-barnes"); // suggestion surfaced
  });

  test("re-ingesting same fileManagerId dedups (one row, one task)", async () => {
    const t = convexTest(schema, modules);
    await seedGovBarnes(t);
    await t.action(internal.adsTv.ingestTvDoc, { extraction: barnesExtraction, ...meta });
    await t.action(internal.adsTv.ingestTvDoc, { extraction: barnesExtraction, ...meta });

    const rows = await t.run((ctx) => ctx.db.query("ads").collect());
    expect(rows).toHaveLength(1);
    const tasks = await t.run((ctx) => ctx.db.query("review_tasks").collect());
    expect(tasks).toHaveLength(1);
  });

  test("issue-ad sponsor with no candidate match → unattributed + review (no suggestion)", async () => {
    const t = convexTest(schema, modules);
    await seedGovBarnes(t);
    const res = await t.action(internal.adsTv.ingestTvDoc, {
      extraction: {
        advertiser: "Americans for Prosperity",
        station: "WISN-TV",
        grossSpend: 90000,
        confidence: { overall: 0.9 },
      },
      fileManagerId: "issue-ad-1",
      fccDocUrl: "https://publicfiles.fcc.gov/y.pdf",
      year: 2026,
    });
    expect(res.isPublic).toBe(false);

    const row = (await t.run((ctx) => ctx.db.query("ads").collect()))[0];
    expect(row.candidateSlug).toBeUndefined();
    const tasks = await t.run((ctx) => ctx.db.query("review_tasks").collect());
    expect(tasks).toHaveLength(1);
    expect(tasks[0].note).not.toContain("suggested:");
  });
});
