import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
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
