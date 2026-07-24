import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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

describe("votingRecord", () => {
  test("returns the candidate's position with the bill and tally", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    const rows = await t.query(api.votesQueries.votingRecord, {
      candidateSlug: "francesca-hong",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      billNumber: "AB 388",
      billTitle: "CHILD CARE CENTER RENOVATIONS LOAN PROGRAM",
      voteType: "PASSAGE",
      position: "nay",
      ayes: 62,
      nays: 35,
      sourceUrl: "https://docs.legis.wisconsin.gov/2023/related/votes/assembly/av0083",
    });
  });

  test("keyword search matches the official title, case-insensitively", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    expect(
      await t.query(api.votesQueries.votingRecord, {
        candidateSlug: "francesca-hong",
        query: "child care",
      }),
    ).toHaveLength(1);
    expect(
      await t.query(api.votesQueries.votingRecord, {
        candidateSlug: "francesca-hong",
        query: "AB 388",
      }),
    ).toHaveLength(1);
    // No match returns nothing rather than a guess.
    expect(
      await t.query(api.votesQueries.votingRecord, {
        candidateSlug: "francesca-hong",
        query: "transportation budget",
      }),
    ).toHaveLength(0);
  });

  test("passage votes sort ahead of procedural ones on the same bill", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    await t.mutation(internal.votesQueries.storeRollCall, {
      rollCall: {
        ...ROLL_CALL,
        voteKey: "2023-assembly-av0082",
        voteId: "av0082",
        voteType: "TABLE",
        votedOn: "2023-09-14",
      },
    });
    const rows = await t.query(api.votesQueries.votingRecord, {
      candidateSlug: "francesca-hong",
      query: "AB 388",
    });
    expect(rows[0].voteType).toBe("PASSAGE");
    // The reader is told the other recorded vote exists.
    expect(rows[0].otherVotesOnBill).toBe(1);
  });

  test("otherVotesOnBill is not inflated across sessions sharing a bill number", async () => {
    // Regression test: Wisconsin bill numbers reset every biennium, so "AB 388"
    // in 2023 and "AB 388" in 2025 are unrelated bills. A legislator who voted
    // on both must not have one session's vote counted as "another vote on the
    // same bill" for the other.
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("candidates", {
        slug: "francesca-hong",
        raceId: "WI-GOV-2026",
        name: "Francesca Hong",
        sources: [],
        dataAsOf: "2026-07-23",
        legislatorName: { name: "HONG", chamber: "assembly", sessions: ["2023", "2025"] },
      });
    });
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    await t.mutation(internal.votesQueries.storeRollCall, {
      rollCall: {
        ...ROLL_CALL,
        voteKey: "2025-assembly-av0083",
        session: "2025",
        voteId: "av0083-2025",
        votedOn: "2025-09-14",
      },
    });

    const rows = await t.query(api.votesQueries.votingRecord, {
      candidateSlug: "francesca-hong",
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.otherVotesOnBill).toBe(0);
    }
  });

  test("word-set search returns both bills when the query words match two different titles", async () => {
    // Regression test: a query whose words appear in two unrelated bill titles
    // must return BOTH rows, each with its own billNumber/billTitle/position —
    // never collapse them into one row or cross a position between them.
    const t = convexTest(schema, modules);
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
    await t.mutation(internal.votesQueries.storeRollCall, {
      rollCall: { ...ROLL_CALL, votes: [{ name: "HONG", party: "D", position: "aye" as const }] },
    });
    await t.mutation(internal.votesQueries.storeRollCall, {
      rollCall: {
        ...ROLL_CALL,
        voteKey: "2023-assembly-av0090",
        voteId: "av0090",
        billNumber: "SB 210",
        billTitle: "STUDENT LOAN REFINANCING ASSISTANCE",
        votes: [{ name: "HONG", party: "D", position: "nay" as const }],
      },
    });

    const rows = await t.query(api.votesQueries.votingRecord, {
      candidateSlug: "francesca-hong",
      query: "loan",
    });
    expect(rows).toHaveLength(2);

    const childCare = rows.find((r) => r.billNumber === "AB 388");
    const studentLoan = rows.find((r) => r.billNumber === "SB 210");
    expect(childCare).toBeDefined();
    expect(studentLoan).toBeDefined();
    expect(childCare).toMatchObject({
      billTitle: "CHILD CARE CENTER RENOVATIONS LOAN PROGRAM",
      position: "aye",
    });
    expect(studentLoan).toMatchObject({
      billTitle: "STUDENT LOAN REFINANCING ASSISTANCE",
      position: "nay",
    });
  });

  test("boundary-anchored word match: 'aid' does not match a title containing only 'paid'", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, {
      rollCall: { ...ROLL_CALL, billTitle: "REQUIRING WAGES BE PAID PROMPTLY" },
    });
    const rows = await t.query(api.votesQueries.votingRecord, {
      candidateSlug: "francesca-hong",
      query: "aid",
    });
    expect(rows).toHaveLength(0);
  });
});

describe("votingRecordSummary", () => {
  test("returns null for a candidate with no votes", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    expect(await t.query(api.votesQueries.votingRecordSummary, { candidateSlug: "francesca-hong" })).toBeNull();
  });

  test("totals, per-position and per-session counts reconcile", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL }); // 2023, HONG nay
    const summary = await t.query(api.votesQueries.votingRecordSummary, { candidateSlug: "francesca-hong" });
    expect(summary).toMatchObject({
      total: 1,
      byPosition: { aye: 0, nay: 1, not_voting: 0 },
      chamber: "assembly",
      sessions: [{ session: "2023", count: 1 }],
    });
  });
});

describe("votingRecordPage", () => {
  // Two 2023 votes for HONG: a passage (nay) and a procedural TABLE (aye) on the same bill.
  async function seedTwo(t: ReturnType<typeof convexTest>) {
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL }); // PASSAGE, nay
    await t.mutation(internal.votesQueries.storeRollCall, {
      rollCall: { ...ROLL_CALL, voteKey: "2023-assembly-av0082", voteId: "av0082", voteType: "TABLE",
        votes: [{ name: "HONG", party: "D", position: "aye" as const }] },
    });
  }

  test("returns a session's rows, final votes first, with billUrl and null summary", async () => {
    const t = convexTest(schema, modules);
    await seedTwo(t);
    const res = await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2023" });
    expect(res.total).toBe(2);
    expect(res.hasMore).toBe(false);
    expect(res.rows[0].voteType).toBe("PASSAGE"); // final first
    expect(res.rows[0].billUrl).toBe("https://docs.legis.wisconsin.gov/2023/related/proposals/ab388");
    expect(res.rows[0].summary).toBeNull();
    expect(res.rows[0].otherVotesOnBill).toBe(1); // the TABLE vote on the same bill
  });

  test("limit slices and reports hasMore without changing total", async () => {
    const t = convexTest(schema, modules);
    await seedTwo(t);
    const res = await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2023", limit: 1 });
    expect(res.rows).toHaveLength(1);
    expect(res.total).toBe(2);
    expect(res.hasMore).toBe(true);
  });

  test("position filter narrows the rows but leaves otherVotesOnBill intact", async () => {
    const t = convexTest(schema, modules);
    await seedTwo(t);
    const res = await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2023", position: "aye" });
    expect(res.total).toBe(1);
    expect(res.rows[0].voteType).toBe("TABLE");
    expect(res.rows[0].otherVotesOnBill).toBe(1); // still counts the passage vote
  });

  test("query search matches title/number whole-word", async () => {
    const t = convexTest(schema, modules);
    await seedTwo(t);
    expect((await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2023", query: "child care" })).total).toBe(2);
    expect((await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2023", query: "transportation" })).total).toBe(0);
  });

  test("only returns the requested session", async () => {
    const t = convexTest(schema, modules);
    await seedTwo(t);
    expect((await t.query(api.votesQueries.votingRecordPage, { candidateSlug: "francesca-hong", session: "2025" })).total).toBe(0);
  });
});

describe("legislator_votes.session", () => {
  test("storeRollCall records the session on the legislator_votes row", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.mutation(internal.votesQueries.storeRollCall, { rollCall: ROLL_CALL });
    await t.run(async (ctx) => {
      const [p] = await ctx.db.query("legislator_votes").collect();
      expect(p.session).toBe("2023");
    });
  });

  test("backfillLegislatorSession fills rows missing a session from the voteKey prefix", async () => {
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    // Simulate a pre-migration row: session omitted.
    await t.run(async (ctx) => {
      await ctx.db.insert("legislator_votes", {
        voteKey: "2013-assembly-av0100",
        candidateSlug: "francesca-hong",
        position: "aye",
      });
    });
    const res = await t.mutation(internal.votesQueries.backfillLegislatorSession, {});
    expect(res.updated).toBe(1);
    expect(res.isDone).toBe(true);
    await t.run(async (ctx) => {
      const [p] = await ctx.db.query("legislator_votes").collect();
      expect(p.session).toBe("2013");
    });
  });

  test("backfillLegislatorSession drives across pages via the returned cursor", async () => {
    // The prod table exceeds the 4096-doc read+write budget of one mutation, so
    // the backfill paginates and the caller loops the cursor until isDone. With
    // numItems=1, three rows require three passes; every row must end filled.
    const t = convexTest(schema, modules);
    await seedCandidate(t);
    await t.run(async (ctx) => {
      for (const voteKey of ["2011-assembly-av1", "2013-assembly-av2", "2015-assembly-av3"]) {
        await ctx.db.insert("legislator_votes", {
          voteKey,
          candidateSlug: "francesca-hong",
          position: "aye",
        });
      }
    });

    let cursor: string | null = null;
    let total = 0;
    let passes = 0;
    for (;;) {
      const res: { updated: number; continueCursor: string; isDone: boolean } =
        await t.mutation(internal.votesQueries.backfillLegislatorSession, { cursor, numItems: 1 });
      total += res.updated;
      passes++;
      if (res.isDone) break;
      cursor = res.continueCursor;
    }
    expect(total).toBe(3);
    expect(passes).toBeGreaterThanOrEqual(3);
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("legislator_votes").collect();
      expect(rows.every((r) => r.session === r.voteKey.split("-")[0])).toBe(true);
    });
  });
});
