import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const SOURCE = { url: "https://elections.wi.gov/media/41846/download", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("races", {
      raceId: "WI-SOS-2026", electionSlug: "wi-2026", office: "Secretary of State of Wisconsin",
      level: "State Executive", sources: [], dataAsOf: "2026-07-17", general: { onBallot: true, source: SOURCE },
    });
    await ctx.db.insert("candidates", {
      slug: "pete-karas", raceId: "WI-SOS-2026", name: "Pete Karas", party: "Green", sources: [], dataAsOf: "2026-07-17",
      general: { onBallot: true, ballotName: "Pete Karas", party: "Wisconsin Green", ballotOrder: 3, source: SOURCE },
    });
    await ctx.db.insert("candidates", {
      slug: "someone-else", raceId: "WI-SOS-2026", name: "Someone Else", party: "Democratic", sources: [], dataAsOf: "2026-07-17",
      general: { onBallot: false, source: SOURCE },
    });
    await ctx.db.insert("candidates", {
      slug: "no-block", raceId: "WI-SOS-2026", name: "No Block", sources: [], dataAsOf: "2026-07-17",
    });
  });
  return t;
}

describe("public queries carry November ballot facts", () => {
  test("the directory says who is on the ballot and under which party", async () => {
    const t = await seeded();
    const rows = await t.query(api.public.listCandidateDirectory, {});
    const by = Object.fromEntries(rows.map((r) => [r.slug, r]));
    expect(by["pete-karas"]).toMatchObject({ onGeneralBallot: true, generalParty: "Wisconsin Green", ballotName: "Pete Karas" });
    expect(by["no-block"].ballotName).toBe("No Block");
    expect(by["someone-else"]).toMatchObject({ onGeneralBallot: false, generalParty: "Democratic" });
    expect(by["no-block"]).toMatchObject({ onGeneralBallot: false, generalParty: null });
  });

  test("a candidate page gets the same facts for everyone in the race", async () => {
    const t = await seeded();
    const data = await t.query(api.public.getCandidateBySlug, { slug: "pete-karas" });
    const by = Object.fromEntries((data?.field ?? []).map((f) => [f.slug, f]));
    expect(by["pete-karas"]).toMatchObject({ onGeneralBallot: true, ballotName: "Pete Karas", generalParty: "Wisconsin Green", ballotOrder: 3 });
    expect(by["someone-else"]).toMatchObject({ onGeneralBallot: false, ballotName: "Someone Else" });
    expect(by["no-block"].onGeneralBallot).toBe(false);
  });
});
