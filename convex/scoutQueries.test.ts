import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { sortByRotation } from "./lib/scoutParse";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);
const SOURCE = { url: "https://elections.wi.gov/media/41846/download", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };
const ON = { onBallot: true, source: SOURCE };
const OFF = { onBallot: false, source: SOURCE };

function setup() {
  return convexTest(schema, modules);
}

// On the November ballot: the news job only searches for those.
const baseCandidate = {
  raceId: "WI-GOV-2026",
  sources: [],
  dataAsOf: "2026-07-18",
  general: ON,
};

/** The pool is statewide executive offices and the U.S. House, so a candidate's race must say its level. */
const seedRaces = (t: ReturnType<typeof setup>) =>
  t.run(async (ctx) => {
    for (const [raceId, office] of [["WI-GOV-2026", "Governor of Wisconsin"], ["WI-AG-2026", "Attorney General of Wisconsin"]]) {
      await ctx.db.insert("races", { raceId, electionSlug: "wi-2026", office, level: "State Executive", sources: [], dataAsOf: "2026-10-12" });
    }
  });

describe("listScoutCandidates", () => {
  test("returns only candidates in the news scope", async () => {
    const t = setup();
    await seedRaces(t);
    await t.run((ctx) =>
      ctx.db.insert("candidates", { ...baseCandidate, slug: "joel-brennan", name: "Joel Brennan" }),
    );
    await t.run((ctx) =>
      ctx.db.insert("candidates", {
        ...baseCandidate,
        raceId: "WI-ASSEMBLY-42-2026", // legislative: outside the news scope
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
    await seedRaces(t);
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
        raceId: "WI-ASSEMBLY-42-2026", // legislative: outside the news scope
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

describe("recordAttempt", () => {
  test("a candidate scouted with zero inserts still advances rotation, sorting to the back on the next call", async () => {
    const t = setup();
    await seedRaces(t);
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

    // Simulate a scout run that finds nothing new for brennan (status
    // "empty" in scout.ts) — zero article_sources rows inserted, but the
    // scout still recorded that it attempted this candidate.
    await t.mutation(internal.scoutQueries.recordAttempt, { candidateSlug: "joel-brennan" });

    const rows = await t.query(internal.scoutQueries.listScoutCandidates, {});
    const brennan = rows.find((r) => r.slug === "joel-brennan");
    const kaul = rows.find((r) => r.slug === "josh-kaul");
    expect(brennan?.lastProposedAt).toBeGreaterThan(0);
    expect(kaul?.lastProposedAt).toBeUndefined();

    // Without attempt-based rotation, brennan (zero article_sources rows)
    // would sort BEFORE never-scouted kaul forever — this is the starvation
    // bug. With it, brennan correctly sorts to the back.
    expect(sortByRotation(rows).map((r) => r.slug)).toEqual(["josh-kaul", "joel-brennan"]);
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

  test("keeps the image the scout read from the article page", async () => {
    const t = setup();
    await t.mutation(internal.scoutQueries.insertProposed, {
      rows: [{ candidateSlug: "tom-tiffany", raceId: "WI-GOV-2026", url: "https://wpr.org/img", outlet: "WPR", headline: "H", whyRelevant: "r", imageUrl: "https://wpr.org/img.jpg" }],
    });
    const [row] = await t.run((ctx) => ctx.db.query("article_sources").collect());
    expect(row.imageUrl).toBe("https://wpr.org/img.jpg");
  });

  test("creates one draft outlet per distinct outletKey, and never a duplicate", async () => {
    const t = setup();
    const row = {
      candidateSlug: "joel-brennan",
      raceId: "WI-GOV-2026",
      outlet: "Wisconsin Public Radio",
      outletKey: "wisconsin public radio",
      headline: "One",
      whyRelevant: "r",
    };

    await t.mutation(internal.scoutQueries.insertProposed, {
      rows: [
        { ...row, url: "https://wpr.org/one" },
        // same outlet, second article in the same batch → still one outlet row
        { ...row, url: "https://wpr.org/two", headline: "Two" },
        // no outletKey → no outlet row
        { ...row, url: "https://blog.example/x", outlet: "Unkeyed", outletKey: undefined },
      ],
    });

    let outlets = await t.run((ctx) => ctx.db.query("outlets").collect());
    expect(outlets).toHaveLength(1);
    expect(outlets[0]).toMatchObject({
      key: "wisconsin public radio",
      displayName: "Wisconsin Public Radio",
      type: "other",
      reviewStatus: "draft",
    });

    // a later batch with the same key must not create a second row
    await t.mutation(internal.scoutQueries.insertProposed, {
      rows: [{ ...row, url: "https://wpr.org/three", headline: "Three" }],
    });
    outlets = await t.run((ctx) => ctx.db.query("outlets").collect());
    expect(outlets).toHaveLength(1);
  });

  test("does not downgrade an already-approved outlet back to draft", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("outlets", {
        key: "wisconsin public radio",
        displayName: "Wisconsin Public Radio",
        type: "public_media",
        reviewStatus: "approved",
        updatedAt: Date.now(),
      }),
    );

    await t.mutation(internal.scoutQueries.insertProposed, {
      rows: [{
        candidateSlug: "joel-brennan",
        raceId: "WI-GOV-2026",
        url: "https://wpr.org/one",
        outlet: "Wisconsin Public Radio",
        outletKey: "wisconsin public radio",
        headline: "One",
        whyRelevant: "r",
      }],
    });

    const outlets = await t.run((ctx) => ctx.db.query("outlets").collect());
    expect(outlets).toHaveLength(1);
    expect(outlets[0].reviewStatus).toBe("approved");
    expect(outlets[0].type).toBe("public_media");
  });
});

test("the news job covers on-ballot statewide and U.S. House candidates, with each race's name", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const race = (raceId: string, office: string, level: string) =>
      ctx.db.insert("races", { raceId, electionSlug: "wi-2026", office, level, sources: [], dataAsOf: "2026-10-12" });
    const cand = (slug: string, raceId: string, general?: typeof ON) =>
      ctx.db.insert("candidates", { slug, raceId, name: slug, sources: [], dataAsOf: "2026-10-12", ...(general ? { general } : {}) });
    await race("WI-GOV-2026", "Governor of Wisconsin", "State Executive");
    await race("WI-US-HOUSE-D3-2026", "U.S. House — Wisconsin District 3", "Federal");
    await race("WI-STATE-ASSEMBLY-D3-2026", "Wisconsin State Assembly — District 3", "State Legislative");
    await cand("gov-on", "WI-GOV-2026", ON);
    await cand("gov-off", "WI-GOV-2026", OFF);
    await cand("gov-no-facts", "WI-GOV-2026");
    await cand("house-on", "WI-US-HOUSE-D3-2026", ON);
    await cand("assembly-on", "WI-STATE-ASSEMBLY-D3-2026", ON);
  });
  const pool = await t.query(internal.scoutQueries.listScoutCandidates, {});
  expect(pool.map((c) => `${c.slug} | ${c.office}`).sort()).toEqual([
    "gov-on | Governor of Wisconsin",
    "house-on | U.S. House — Wisconsin District 3",
  ]);
});

test("a failing news job raises one alert, not one a day, and a healthy run closes it", async () => {
  const t = convexTest(schema, modules);
  const failing = { attempted: 32, errors: 32, proposed: 0, sampleError: "perplexity request failed (http 401)" };
  const open = () => t.run(async (ctx) => (await ctx.db.query("alerts").collect()).filter((a) => !a.resolved));

  const first = await t.mutation(internal.scoutQueries.recordRunHealth, failing);
  expect(first).toContain("32 of 32 searches failed");
  expect(await t.mutation(internal.scoutQueries.recordRunHealth, failing)).toBeNull();
  expect(await open()).toHaveLength(1);
  expect((await open())[0]).toMatchObject({ kind: "sync_failure", severity: "critical", refTable: "article_sources", refId: "article-scout:failing" });

  await t.mutation(internal.scoutQueries.recordRunHealth, { attempted: 32, errors: 0, proposed: 4 });
  expect(await open()).toHaveLength(0);
});

test("when the problem changes, the old alert closes and the new one opens", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("article_sources", {
      url: "https://news.example/old", outlet: "WPR", headline: "H", whyRelevant: "r", status: "proposed",
      proposedAt: Date.now() - 5 * 86_400_000,
    }),
  );
  const open = () => t.run(async (ctx) => (await ctx.db.query("alerts").collect()).filter((a) => !a.resolved).map((a) => a.refId));

  await t.mutation(internal.scoutQueries.recordRunHealth, { attempted: 32, errors: 32, proposed: 0, sampleError: "http 401" });
  expect(await open()).toEqual(["article-scout:failing"]);
  // The key is fixed and searches succeed, but nothing new has been found for five days.
  const opened = await t.mutation(internal.scoutQueries.recordRunHealth, { attempted: 32, errors: 0, proposed: 0 });
  expect(opened).toContain("found nothing new for 5 days");
  expect(await open()).toEqual(["article-scout:quiet"]);
});
