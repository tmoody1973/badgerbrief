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

const setup = () => convexTest(schema, modules);

const SOURCE = {
  url: "https://elections.wi.gov/media/41846/download",
  documentDate: "2026-10-06",
  retrievedAt: "2026-10-12T21:32:56Z",
};

const baseCandidate = {
  slug: "josh-kaul",
  raceId: "WI-AG-2026",
  name: "Josh Kaul",
  sources: [],
  dataAsOf: "2026-07-19",
};

describe("general ballot fields in the schema", () => {
  test("a candidate can carry a general block", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("candidates", {
        ...baseCandidate,
        general: {
          onBallot: true,
          ballotName: "Josh Kaul",
          party: "Democratic",
          ballotOrder: 2,
          source: SOURCE,
        },
      }),
    );
    const row = await t.run((ctx) =>
      ctx.db
        .query("candidates")
        .withIndex("by_slug_only", (q) => q.eq("slug", "josh-kaul"))
        .first(),
    );
    expect(row?.general?.onBallot).toBe(true);
    expect(row?.general?.ballotOrder).toBe(2);
  });

  test("a race can carry a general block with a note", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("races", {
        raceId: "WI-LTGOV-2026",
        electionSlug: "wi-2026",
        office: "Lieutenant Governor of Wisconsin",
        level: "State Executive",
        sources: [],
        dataAsOf: "2026-07-17",
        general: { onBallot: false, note: "Runs on the governor ticket.", source: SOURCE },
      }),
    );
    const race = await t.run((ctx) =>
      ctx.db
        .query("races")
        .withIndex("by_race_id", (q) => q.eq("raceId", "WI-LTGOV-2026"))
        .unique(),
    );
    expect(race?.general?.onBallot).toBe(false);
  });
});

const seedGovernor = async (t: ReturnType<typeof setup>) => {
  await t.run(async (ctx) => {
    await ctx.db.insert("races", {
      raceId: "WI-GOV-2026",
      electionSlug: "wi-2026",
      office: "Governor of Wisconsin",
      level: "State Executive",
      sources: [],
      dataAsOf: "2026-07-17",
    });
    await ctx.db.insert("candidates", {
      slug: "david-crowley", raceId: "WI-GOV-2026", name: "David Crowley",
      party: "Democratic", primaryParty: "Democratic", status: "Active",
      background: "Milwaukee County Executive", sources: [], dataAsOf: "2026-07-17",
    });
    await ctx.db.insert("candidates", {
      slug: "francesca-hong", raceId: "WI-GOV-2026", name: "Francesca Hong",
      party: "Democratic", primaryParty: "Democratic", status: "Active",
      sources: [], dataAsOf: "2026-07-17",
    });
  });
};

const certified = {
  source: SOURCE,
  dataAsOf: "2026-10-12",
  races: [{ raceId: "WI-GOV-2026", onBallot: true }],
  candidates: [
    { raceId: "WI-GOV-2026", slug: "david-crowley", onBallot: true, ballotName: "David Crowley / Sarah Godlewski", party: "Democratic", ballotOrder: 2, runningMate: "Sarah Godlewski" },
    { raceId: "WI-GOV-2026", slug: "francesca-hong", onBallot: false },
  ],
  newCandidates: [{ raceId: "WI-GOV-2026", slug: "pat-example", name: "Pat Example", party: "Independent", ballotOrder: 3 }],
};

const candidate = (t: ReturnType<typeof setup>, slug: string) =>
  t.run((ctx) =>
    ctx.db
      .query("candidates")
      .withIndex("by_slug", (q) => q.eq("raceId", "WI-GOV-2026").eq("slug", slug))
      .unique(),
  );

describe("applyGeneralBallot", () => {
  test("writes the general block and leaves every other field alone", async () => {
    const t = setup();
    await seedGovernor(t);
    const result = await t.mutation(internal.generalBallot.applyGeneralBallot, certified);
    expect(result).toEqual({ racesPatched: 1, candidatesPatched: 2, candidatesInserted: 1 });

    const crowley = await candidate(t, "david-crowley");
    expect(crowley?.general).toEqual({
      onBallot: true, ballotName: "David Crowley / Sarah Godlewski", party: "Democratic",
      ballotOrder: 2, runningMate: "Sarah Godlewski", source: SOURCE,
    });
    expect(crowley?.name).toBe("David Crowley");
    expect(crowley?.status).toBe("Active");
    expect(crowley?.background).toBe("Milwaukee County Executive");
    expect(crowley?.dataAsOf).toBe("2026-07-17");

    const hong = await candidate(t, "francesca-hong");
    expect(hong?.general).toEqual({ onBallot: false, source: SOURCE });
  });

  test("adds a candidate we never stored, with no primary party", async () => {
    const t = setup();
    await seedGovernor(t);
    await t.mutation(internal.generalBallot.applyGeneralBallot, certified);
    const pat = await candidate(t, "pat-example");
    expect(pat?.name).toBe("Pat Example");
    expect(pat?.party).toBe("Independent");
    expect(pat?.primaryParty).toBeUndefined();
    expect(pat?.general?.onBallot).toBe(true);
    expect(pat?.general?.ballotOrder).toBe(3);
    expect(pat?.sources[0].url).toBe(SOURCE.url);
  });

  test("running it twice leaves the same data and adds nobody twice", async () => {
    const t = setup();
    await seedGovernor(t);
    await t.mutation(internal.generalBallot.applyGeneralBallot, certified);
    const second = await t.mutation(internal.generalBallot.applyGeneralBallot, certified);
    expect(second).toEqual({ racesPatched: 1, candidatesPatched: 3, candidatesInserted: 0 });
    const all = await t.run((ctx) => ctx.db.query("candidates").collect());
    expect(all).toHaveLength(3);
  });

  test("an unknown candidate aborts the call and writes nothing", async () => {
    const t = setup();
    await seedGovernor(t);
    await expect(
      t.mutation(internal.generalBallot.applyGeneralBallot, {
        ...certified,
        candidates: [...certified.candidates, { raceId: "WI-GOV-2026", slug: "no-such-person", onBallot: false }],
      }),
    ).rejects.toThrow(/no-such-person/);
    const crowley = await candidate(t, "david-crowley");
    expect(crowley?.general).toBeUndefined();
    expect(await candidate(t, "pat-example")).toBeNull();
  });

  test("an unknown race aborts the call", async () => {
    const t = setup();
    await seedGovernor(t);
    await expect(
      t.mutation(internal.generalBallot.applyGeneralBallot, {
        ...certified,
        races: [{ raceId: "WI-NOPE-2026", onBallot: true }],
      }),
    ).rejects.toThrow(/WI-NOPE-2026/);
  });

  test("refuses a file that does not cover every stored candidate", async () => {
    // Otherwise a block written by an older file could survive and keep
    // someone "on the ballot" who is no longer listed.
    const t = setup();
    await seedGovernor(t);
    await expect(
      t.mutation(internal.generalBallot.applyGeneralBallot, { ...certified, candidates: [certified.candidates[0]] }),
    ).rejects.toThrow(/francesca-hong/);
    expect((await candidate(t, "david-crowley"))?.general).toBeUndefined();
  });

  test("refuses a file that does not cover every stored race", async () => {
    const t = setup();
    await seedGovernor(t);
    await expect(
      t.mutation(internal.generalBallot.applyGeneralBallot, { ...certified, races: [] }),
    ).rejects.toThrow(/WI-GOV-2026/);
    expect((await candidate(t, "david-crowley"))?.general).toBeUndefined();
  });

  test("refuses a new candidate whose address is used in another race", async () => {
    const t = setup();
    await seedGovernor(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("races", {
        raceId: "WI-AG-2026", electionSlug: "wi-2026", office: "Attorney General of Wisconsin",
        level: "State Executive", sources: [], dataAsOf: "2026-07-17",
      });
      await ctx.db.insert("candidates", { slug: "pat-example", raceId: "WI-AG-2026", name: "Pat Example", sources: [], dataAsOf: "2026-07-17" });
    });
    await expect(
      t.mutation(internal.generalBallot.applyGeneralBallot, {
        ...certified,
        races: [...certified.races, { raceId: "WI-AG-2026", onBallot: true }],
        candidates: [...certified.candidates, { raceId: "WI-AG-2026", slug: "pat-example", onBallot: false }],
      }),
    ).rejects.toThrow(/already used/);
    expect((await candidate(t, "david-crowley"))?.general).toBeUndefined();
  });

  test("the read-back carries the ballot name, party and order", async () => {
    const t = setup();
    await seedGovernor(t);
    await t.mutation(internal.generalBallot.applyGeneralBallot, certified);
    const rows = await t.query(internal.generalBallot.onBallotSlugs, {});
    expect(rows.find((r) => r.slug === "david-crowley")).toEqual({
      raceId: "WI-GOV-2026", slug: "david-crowley",
      ballotName: "David Crowley / Sarah Godlewski", party: "Democratic", ballotOrder: 2,
    });
  });

  test("onBallotSlugs reads back who is on the ballot", async () => {
    const t = setup();
    await seedGovernor(t);
    await t.mutation(internal.generalBallot.applyGeneralBallot, certified);
    const slugs = await t.query(internal.generalBallot.onBallotSlugs, {});
    expect(slugs.map((s) => s.slug).sort()).toEqual(["david-crowley", "pat-example"]);
  });
});
