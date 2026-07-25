import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { voterAccessPayload } from "./voterHelp";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

function setup() {
  return convexTest(schema, modules);
}

const officialRow = {
  key: "voter-id",
  title: "What photo ID can I use to vote?",
  summary: "Wisconsin requires an acceptable photo ID to vote.",
  details: "A Wisconsin driver license, state ID, US passport, and several others qualify.",
  order: 1,
  sources: [{ name: "Wisconsin Elections Commission — bringit.wi.gov", url: "https://bringit.wi.gov/" }],
};

describe("upsertVoterAccess publish gate", () => {
  test("accepts a row with an official-domain source", async () => {
    const t = setup();
    await t.mutation(internal.seed.upsertVoterAccess, officialRow);
    const rows = await t.run(async (ctx) => ctx.db.query("voter_access").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].lastCheckedAt).toBeGreaterThan(0);
  });

  test("rejects an advocacy-only row (no official-domain source)", async () => {
    const t = setup();
    await expect(
      t.mutation(internal.seed.upsertVoterAccess, {
        ...officialRow,
        sources: [{ name: "VoteRiders", url: "https://www.voteriders.org/wisconsin/" }],
      }),
    ).rejects.toThrow("official-domain source");
  });

  test("rejects a look-alike host that only contains an official domain as a substring", async () => {
    const t = setup();
    await expect(
      t.mutation(internal.seed.upsertVoterAccess, {
        ...officialRow,
        sources: [{ name: "spoof", url: "https://not-elections.wi.gov.attacker.net/" }],
      }),
    ).rejects.toThrow("official-domain source");
  });

  test("upserts by key (second call updates, not duplicates)", async () => {
    const t = setup();
    await t.mutation(internal.seed.upsertVoterAccess, officialRow);
    await t.mutation(internal.seed.upsertVoterAccess, { ...officialRow, summary: "Updated." });
    const rows = await t.run(async (ctx) => ctx.db.query("voter_access").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe("Updated.");
  });
});

describe("getVoterAccess query", () => {
  test("returns rows sorted by order", async () => {
    const t = setup();
    await t.mutation(internal.seed.upsertVoterAccess, { ...officialRow, key: "b", order: 2 });
    await t.mutation(internal.seed.upsertVoterAccess, { ...officialRow, key: "a", order: 1 });
    const rows = await t.query(api.public.getVoterAccess, {});
    expect(rows.map((r) => r.key)).toEqual(["a", "b"]);
  });
});

describe("voterAccessPayload", () => {
  test("includes the no-legal-advice directive and the rows", () => {
    const payload = JSON.parse(
      voterAccessPayload([{ key: "voter-id", title: "ID?", summary: "s", details: "d", sources: [], order: 1, lastCheckedAt: 1 }]),
    );
    expect(payload.directive).toMatch(/legal advice/i);
    expect(payload.rows).toHaveLength(1);
  });

  test("empty rows still carries the directive", () => {
    const payload = JSON.parse(voterAccessPayload([]));
    expect(payload.directive).toMatch(/official source/i);
    expect(payload.rows).toEqual([]);
  });
});
