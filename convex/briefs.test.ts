import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);
const USER = { subject: "clerk_brief_user" };
const setup = () => convexTest(schema, modules);

async function seedUser(t: ReturnType<typeof setup>) {
  return await t.run((ctx) =>
    ctx.db.insert("users", { clerkId: "clerk_brief_user", email: "b@x.com" }),
  );
}

const raceBase = { electionSlug: "wi-2026", sources: [], dataAsOf: "2026-07-01" };
async function seedBallotWorld(t: ReturnType<typeof setup>, userId: Id<"users">) {
  await t.run(async (ctx) => {
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-GOV-2026", office: "Governor", level: "State Executive" });
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-US-HOUSE-D4-2026", office: "U.S. House WI-4", level: "Federal" });
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-US-HOUSE-D5-2026", office: "U.S. House WI-5", level: "Federal" });
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-STATE-SENATE-2026", office: "State Senate", level: "State Legislative", districts: [{ district: 3 }, { district: 5 }] });
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-STATE-ASSEMBLY-2026", office: "State Assembly", level: "State Legislative", districts: [{ district: 8 }] });
    await ctx.db.insert("candidates", {
      sources: raceBase.sources,
      dataAsOf: raceBase.dataAsOf,
      slug: "kelda-roys",
      raceId: "WI-GOV-2026",
      name: "Kelda Roys",
    });
    await ctx.db.insert("voting_info", { electionSlug: "wi-2026", primaryDate: "2026-08-11", officialVoterInfoUrl: "https://myvote.wi.gov", sources: [], lastCheckedAt: Date.now() });
    await ctx.db.insert("user_preferences", {
      userId,
      address: "200 E Wells St, Milwaukee, WI 53202",
      congressionalDistrict: "4",
      stateSenateDistrict: "3",
      stateAssemblyDistrict: "8",
      savedRaceIds: ["WI-GOV-2026"],
      savedIssues: ["housing"],
      detailLevel: "standard",
    });
  });
}

describe("briefs lifecycle", () => {
  test("getLatest null when signed out", async () => {
    expect(await setup().query(api.briefs.getLatest, {})).toBeNull();
  });

  test("assembleContext returns exactly the district-correct races", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedBallotWorld(t, userId);
    const ctxBlock = await t.query(internal.briefs.assembleContext, { userId });
    expect(ctxBlock.races.map((r) => r.raceId).sort()).toEqual([
      "WI-GOV-2026",
      "WI-STATE-ASSEMBLY-2026",
      "WI-STATE-SENATE-2026", // senate 3 is odd → up in 2026
      "WI-US-HOUSE-D4-2026", // D5 excluded
    ]);
    expect(ctxBlock.preferences.detailLevel).toBe("standard");
    expect(ctxBlock.races.find((r) => r.raceId === "WI-GOV-2026")!.candidates[0].slug).toBe("kelda-roys");
  });

  test("assembleContext rejects when senate/assembly districts are missing", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await t.run((ctx) =>
      ctx.db.insert("user_preferences", {
        userId,
        congressionalDistrict: "4", // senate/assembly unset
        savedRaceIds: [],
        savedIssues: [],
        detailLevel: "standard",
      }),
    );
    await expect(t.query(internal.briefs.assembleContext, { userId })).rejects.toThrow(/districts/i);
  });

  test("generate throws without districts", async () => {
    const t = setup();
    await seedUser(t);
    await expect(t.withIdentity(USER).mutation(api.briefs.generate, {})).rejects.toThrow(/address/i);
  });

  test("beginAttempt/setSource/finalize lifecycle; getLatest defaults legacy rows to ready", async () => {
    const t = setup();
    const userId = await seedUser(t);
    const briefId = await t.run((ctx) =>
      ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "old", generatedAt: 1, status: "generating", attempt: 1 }),
    );
    await t.mutation(internal.briefs.beginAttempt, { briefId, attempt: 2 });
    await t.mutation(internal.briefs.setSource, { briefId, source: "root = Stack([])" });
    await t.mutation(internal.briefs.finalize, { briefId, traceId: "trace-1" });
    const row = await t.run((ctx) => ctx.db.get(briefId));
    expect(row).toMatchObject({ status: "ready", attempt: 2, traceId: "trace-1", openuiSource: "root = Stack([])" });
    expect(row!.generatedAt).toBeGreaterThan(1);

    await t.mutation(internal.briefs.finalize, { briefId, error: "failed after 3 attempts" });
    expect((await t.run((ctx) => ctx.db.get(briefId)))!.status).toBe("failed");

    // legacy row without status reads as ready
    await t.run((ctx) => ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "x", generatedAt: 2 }));
    const latest = await t.withIdentity(USER).query(api.briefs.getLatest, {});
    expect(latest!.status).toBe("ready");
  });

  test("listMine returns only ready briefs, newest first", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "a", generatedAt: 1, status: "ready" });
      await ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "b", generatedAt: 2, status: "failed" });
      await ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "c", generatedAt: 3, status: "ready" });
    });
    const list = await t.withIdentity(USER).query(api.briefs.listMine, {});
    expect(list.map((b) => b.openuiSource)).toEqual(["c", "a"]);
  });
});
