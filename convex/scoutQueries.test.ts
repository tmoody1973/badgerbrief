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
  raceId: "WI-GOV-2026",
  sources: [],
  dataAsOf: "2026-07-18",
};

describe("listScoutCandidates", () => {
  test("returns only candidates in contested races", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("candidates", { ...baseCandidate, slug: "joel-brennan", name: "Joel Brennan" }),
    );
    await t.run((ctx) =>
      ctx.db.insert("candidates", {
        ...baseCandidate,
        raceId: "WI-ASSEMBLY-42-2026", // not in CONTESTED_RACE_IDS
        slug: "someone-else",
        name: "Someone Else",
      }),
    );

    const rows = await t.query(internal.scoutQueries.listScoutCandidates, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: "joel-brennan", name: "Joel Brennan", raceId: "WI-GOV-2026" });
    expect(rows[0].lastProposedAt).toBeUndefined();
  });

  test("computes lastProposedAt as the max proposedAt across all statuses, and forms a rotation-ready contested pool", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("candidates", { ...baseCandidate, slug: "joel-brennan", name: "Joel Brennan" }),
    );
    await t.run((ctx) =>
      ctx.db.insert("candidates", {
        ...baseCandidate,
        raceId: "WI-AG-2026",
        slug: "josh-kaul",
        name: "Josh Kaul",
      }),
    );

    // Brennan has two prior proposals (one approved, one rejected) — max wins.
    await t.run((ctx) =>
      ctx.db.insert("article_sources", {
        candidateSlug: "joel-brennan",
        raceId: "WI-GOV-2026",
        url: "https://wpr.org/old",
        outlet: "WPR",
        headline: "Old",
        whyRelevant: "r",
        status: "approved",
        proposedAt: 1000,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("article_sources", {
        candidateSlug: "joel-brennan",
        raceId: "WI-GOV-2026",
        url: "https://wpr.org/newer",
        outlet: "WPR",
        headline: "Newer",
        whyRelevant: "r",
        status: "rejected",
        proposedAt: 5000,
      }),
    );

    const rows = await t.query(internal.scoutQueries.listScoutCandidates, {});
    const brennan = rows.find((r) => r.slug === "joel-brennan");
    const kaul = rows.find((r) => r.slug === "josh-kaul");
    expect(brennan?.lastProposedAt).toBe(5000);
    expect(kaul?.lastProposedAt).toBeUndefined();

    // Rotation: never-proposed first, then least-recently-proposed.
    const sorted = [...rows].sort(
      (a, b) => (a.lastProposedAt ?? 0) - (b.lastProposedAt ?? 0),
    );
    expect(sorted.map((r) => r.slug)).toEqual(["josh-kaul", "joel-brennan"]);
  });

  test("explicit slugs bypass the contested pool — out-of-pool candidates resolve", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("candidates", { ...baseCandidate, slug: "joel-brennan", name: "Joel Brennan" }),
    );
    await t.run((ctx) =>
      ctx.db.insert("candidates", {
        ...baseCandidate,
        raceId: "WI-ASSEMBLY-42-2026", // NOT in CONTESTED_RACE_IDS
        slug: "out-of-pool",
        name: "Out Of Pool",
      }),
    );

    const rows = await t.query(internal.scoutQueries.listScoutCandidates, {
      slugs: ["out-of-pool"],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: "out-of-pool", raceId: "WI-ASSEMBLY-42-2026" });
  });
});

describe("knownSourceUrls", () => {
  test("flags URLs already present in article_sources regardless of status", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("article_sources", {
        candidateSlug: "joel-brennan",
        raceId: "WI-GOV-2026",
        url: "https://wpr.org/already-rejected",
        outlet: "WPR",
        headline: "H",
        whyRelevant: "r",
        status: "rejected",
        proposedAt: 1000,
      }),
    );

    const known = await t.query(internal.scoutQueries.knownSourceUrls, {
      urls: ["https://wpr.org/already-rejected", "https://wpr.org/brand-new"],
    });
    expect(known).toEqual(["https://wpr.org/already-rejected"]);
  });

  test("flags URLs equal to a candidate's campaign_website", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("candidates", {
        ...baseCandidate,
        slug: "joel-brennan",
        name: "Joel Brennan",
        socialMedia: { campaign_website: "https://brennanforwi.com" },
      }),
    );

    const known = await t.query(internal.scoutQueries.knownSourceUrls, {
      urls: ["https://brennanforwi.com", "https://wpr.org/brand-new"],
    });
    expect(known).toEqual(["https://brennanforwi.com"]);
  });

  test("returns empty when nothing is known", async () => {
    const t = setup();
    const known = await t.query(internal.scoutQueries.knownSourceUrls, {
      urls: ["https://wpr.org/brand-new"],
    });
    expect(known).toEqual([]);
  });
});

describe("insertProposed", () => {
  test("inserts rows with status proposed and server-set proposedAt, ignoring caller-provided values", async () => {
    const t = setup();
    const before = Date.now();
    const count = await t.mutation(internal.scoutQueries.insertProposed, {
      rows: [
        {
          candidateSlug: "joel-brennan",
          raceId: "WI-GOV-2026",
          url: "https://wpr.org/one",
          outlet: "WPR",
          headline: "One",
          whyRelevant: "r",
        },
        {
          candidateSlug: "joel-brennan",
          raceId: "WI-GOV-2026",
          url: "https://wpr.org/two",
          outlet: "WPR",
          headline: "Two",
          publishedAt: "2026-06-01",
          whyRelevant: "r2",
        },
      ],
      traceId: "trace-123",
    });
    expect(count).toBe(2);

    const rows = await t.run((ctx) => ctx.db.query("article_sources").collect());
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe("proposed");
      expect(row.proposedAt).toBeGreaterThanOrEqual(before);
      expect(row.traceId).toBe("trace-123");
    }
  });
});
