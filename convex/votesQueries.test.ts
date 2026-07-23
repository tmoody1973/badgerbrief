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

const ROLL_CALL = {
  voteKey: "2023-assembly-av0083",
  session: "2023",
  chamber: "assembly" as const,
  voteId: "av0083",
  billNumber: "AB 388",
  billTitle: "CHILD CARE CENTER RENOVATIONS LOAN PROGRAM",
  voteType: "PASSAGE",
  votedOn: "2023-09-14",
  ayes: 62,
  nays: 35,
  notVoting: 2,
  vacantSeats: 0,
  sourceUrl: "https://docs.legis.wisconsin.gov/2023/related/votes/assembly/av0083",
  votes: [
    { name: "HONG", party: "D", position: "nay" as const },
    { name: "ALLEN", party: "R", position: "aye" as const },
  ],
};

async function seedCandidate(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("candidates", {
      slug: "francesca-hong",
      raceId: "WI-GOV-2026",
      name: "Francesca Hong",
      sources: [],
      dataAsOf: "2026-07-23",
      legislatorName: { name: "HONG", chamber: "assembly", sessions: ["2023"] },
    });
  });
}

describe("storeRollCall", () => {
  test("stores the roll call and only tracked legislators' positions", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });

    await t.run(async (ctx) => {
      const votes = await ctx.db.query("legislative_votes").collect();
      expect(votes).toHaveLength(1);
      expect(votes[0].billNumber).toBe("AB 388");

      // ALLEN is not a tracked candidate, so no row for him.
      const positions = await ctx.db.query("legislator_votes").collect();
      expect(positions).toHaveLength(1);
      expect(positions[0]).toMatchObject({
        candidateSlug: "francesca-hong",
        position: "nay",
      });
    });
  });

  test("re-ingesting the same roll call does not duplicate", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("legislative_votes").collect()).toHaveLength(1);
      expect(await ctx.db.query("legislator_votes").collect()).toHaveLength(1);
    });
  });

  test("a candidate whose session does not match gets no row", async () => {
    // Hong's mapping covers 2023 only; a 2025 vote must not attach to her.
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, {
      rollCall: { ...ROLL_CALL, voteKey: "2025-assembly-av0001", session: "2025", voteId: "av0001" },
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("legislator_votes").collect()).toHaveLength(0);
    });
  });

  test("a candidate with no legislatorName is never matched", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("candidates", {
        slug: "someone-else",
        raceId: "WI-GOV-2026",
        name: "Someone Else",
        sources: [],
        dataAsOf: "2026-07-23",
      });
    });
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("legislator_votes").collect()).toHaveLength(0);
    });
  });

  test("two candidates with same surname but different exact names each receive only their own vote", async () => {
    // Regression test: two different members can share a surname (e.g. ANDERSON, C and ANDERSON, J).
    // The matching must be exact-string, not prefix/substring. If the predicate were changed to
    // startsWith() or other fuzzy matching, both votes would incorrectly attach to both candidates.
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("candidates", {
        slug: "cynthia-anderson",
        raceId: "WI-GOV-2026",
        name: "Cynthia Anderson",
        sources: [],
        dataAsOf: "2026-07-23",
        legislatorName: { name: "ANDERSON, C", chamber: "assembly", sessions: ["2023"] },
      });
      await ctx.db.insert("candidates", {
        slug: "john-anderson",
        raceId: "WI-GOV-2026",
        name: "John Anderson",
        sources: [],
        dataAsOf: "2026-07-23",
        legislatorName: { name: "ANDERSON, J", chamber: "assembly", sessions: ["2023"] },
      });
    });
    const rollCall = {
      ...ROLL_CALL,
      votes: [
        { name: "ANDERSON, C", party: "D", position: "aye" as const },
        { name: "ANDERSON, J", party: "R", position: "nay" as const },
        { name: "SMITH", party: "D", position: "aye" as const },
      ],
    };
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall });

    await t.run(async (ctx) => {
      const positions = await ctx.db.query("legislator_votes").collect();
      expect(positions).toHaveLength(2);
      const cynthia = positions.find((p) => p.candidateSlug === "cynthia-anderson");
      const john = positions.find((p) => p.candidateSlug === "john-anderson");
      expect(cynthia).toBeDefined();
      expect(john).toBeDefined();
      expect(cynthia!.position).toBe("aye");
      expect(john!.position).toBe("nay");
    });
  });
});

describe("ingestedKeys", () => {
  test("reports which vote ids are already stored", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    const keys = await t.query(internal.votesQueries.ingestedKeys, {
      session: "2023",
      chamber: "assembly",
    });
    expect(keys).toEqual(["av0083"]);
  });
});
