import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);

/** Minimal legislative_votes row for a given session/bill. */
async function seedRoll(t: ReturnType<typeof convexTest>, session: string, chamber: "assembly" | "senate", voteId: string, billNumber: string) {
  await t.run(async (ctx) => {
    await ctx.db.insert("legislative_votes", {
      voteKey: `${session}-${chamber}-${voteId}`,
      session, chamber, voteId, billNumber,
      billTitle: "X", voteType: "PASSAGE", votedOn: `${session}-01-01`,
      ayes: 1, nays: 0, notVoting: 0, sourceUrl: "http://x", ingestedAt: 0,
    });
  });
}

describe("storeBill", () => {
  test("inserts then updates the same (session, billNumber) without duplicating", async () => {
    const t = convexTest(schema, modules);
    const args = { session: "2023", billNumber: "AB 388", billUrl: "http://u", summary: null as string | null };
    expect(await t.mutation(internal.billsQueries.storeBill, args)).toEqual({ stored: "inserted" });
    expect(await t.mutation(internal.billsQueries.storeBill, { ...args, summary: "This bill…" })).toEqual({ stored: "updated" });
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("bills").collect();
      expect(rows).toHaveLength(1);
      expect(rows[0].summary).toBe("This bill…");
    });
  });
});

describe("unenrichedBillsForSession", () => {
  test("returns each distinct billNumber in the session not yet in bills", async () => {
    const t = convexTest(schema, modules);
    // Two roll calls on AB 1 (same bill), one on AB 2, all in 2013.
    await seedRoll(t, "2013", "assembly", "av1", "AB 1");
    await seedRoll(t, "2013", "assembly", "av2", "AB 1");
    await seedRoll(t, "2013", "assembly", "av3", "AB 2");
    // A different session must not leak in.
    await seedRoll(t, "2015", "assembly", "av9", "AB 9");
    // AB 1 is already enriched.
    await t.mutation(internal.billsQueries.storeBill, { session: "2013", billNumber: "AB 1", billUrl: "http://u", summary: "x" });

    const out = await t.query(internal.billsQueries.unenrichedBillsForSession, { session: "2013" });
    expect(out.sort()).toEqual(["AB 2"]); // AB 1 already enriched; AB 9 is 2015
  });
});
