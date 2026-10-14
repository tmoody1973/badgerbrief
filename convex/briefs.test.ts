import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { NOVEMBER_BRIEFS_SINCE } from "./briefs";
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
const SOURCE = { url: "https://elections.wi.gov/media/41846/download", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };
const ON = { onBallot: true, source: SOURCE };
const AFTER = NOVEMBER_BRIEFS_SINCE + 1;
async function seedBallotWorld(t: ReturnType<typeof setup>, userId: Id<"users">) {
  await t.run(async (ctx) => {
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-GOV-2026", office: "Governor", level: "State Executive", general: ON });
    // On the state's list, but not a separate contest: elected on the governor ticket.
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-LTGOV-2026", office: "Lieutenant Governor", level: "State Executive", general: { onBallot: false, source: SOURCE } });
    // Never loaded from the state's list.
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-SCOTUS-2026", office: "Supreme Court", level: "State Judicial" });
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-US-HOUSE-D4-2026", office: "U.S. House WI-4", level: "Federal", general: ON });
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-US-HOUSE-D5-2026", office: "U.S. House WI-5", level: "Federal", general: ON });
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-STATE-SENATE-2026", office: "State Senate", level: "State Legislative", districts: [{ district: 3 }, { district: 5 }], general: ON });
    await ctx.db.insert("races", { ...raceBase, raceId: "WI-STATE-ASSEMBLY-2026", office: "State Assembly", level: "State Legislative", districts: [{ district: 8 }], general: ON });
    const person = { sources: raceBase.sources, dataAsOf: raceBase.dataAsOf, raceId: "WI-GOV-2026" };
    // Lost the August primary: not on the November ballot.
    await ctx.db.insert("candidates", { ...person, slug: "kelda-roys", name: "Kelda Roys", party: "Democratic" });
    await ctx.db.insert("candidates", { ...person, slug: "david-crowley", name: "David Crowley", party: "Democrat", general: { onBallot: true, ballotName: "David Crowley / Sarah Godlewski", party: "Democratic", ballotOrder: 2, source: SOURCE } });
    await ctx.db.insert("candidates", { ...person, slug: "tom-tiffany", name: "Thomas Tiffany", party: "Republican", general: { onBallot: true, ballotName: "Tom Tiffany / David Varnam", party: "Republican", ballotOrder: 1, source: SOURCE } });
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
    // Lieutenant Governor (not a separate contest) and a race never loaded from the state's list are left out.
    expect(ctxBlock.races.map((r) => r.raceId).sort()).toEqual([
      "WI-GOV-2026",
      "WI-STATE-ASSEMBLY-2026",
      "WI-STATE-SENATE-2026", // senate 3 is odd → up in 2026
      "WI-US-HOUSE-D4-2026", // D5 excluded
    ]);
    expect(ctxBlock.preferences.detailLevel).toBe("standard");
    // Only people on the November ballot, in the state's order, named and labeled as the state prints them.
    expect(ctxBlock.races.find((r) => r.raceId === "WI-GOV-2026")!.candidates.map(({ slug, name, party }) => ({ slug, name, party }))).toEqual([
      { slug: "tom-tiffany", name: "Tom Tiffany", party: "Republican" },
      { slug: "david-crowley", name: "David Crowley", party: "Democratic" },
    ]);
    expect(ctxBlock.votingInfo).toEqual({ electionDate: "November 3, 2026", available: true });
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
    // MOO-313: terminal failure writes an /admin alert
    const alerts = await t.run((ctx) => ctx.db.query("alerts").collect());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: "brief_generation_failure",
      severity: "warning",
      resolved: false,
      refId: briefId,
    });

    // legacy row without status reads as ready
    await t.run((ctx) => ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "x", generatedAt: Date.now() + 1 }));
    const latest = await t.withIdentity(USER).query(api.briefs.getLatest, {});
    expect(latest!.status).toBe("ready");
  });

  test("listMine returns only ready briefs, newest first", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "a", generatedAt: AFTER + 1, status: "ready" });
      await ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "b", generatedAt: AFTER + 2, status: "failed" });
      await ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "c", generatedAt: AFTER + 3, status: "ready" });
    });
    const list = await t.withIdentity(USER).query(api.briefs.listMine, {});
    expect(list.map((b) => b.openuiSource)).toEqual(["c", "a"]);
  });

  test("checkEntityRefs flags unknown races, candidates, and issues (MOO-313)", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedBallotWorld(t, userId);

    const clean = await t.query(internal.briefs.checkEntityRefs, {
      raceIds: ["WI-GOV-2026"],
      candidateSlugs: ["tom-tiffany"],
      issueSlugs: ["housing"],
    });
    expect(clean).toEqual([]);

    const missing = await t.query(internal.briefs.checkEntityRefs, {
      raceIds: ["WI-GOV-2026", "WI-FAKE-RACE"],
      candidateSlugs: ["tom-tiffany", "made-up-person", "kelda-roys"],
      issueSlugs: ["housing", "not-an-issue"],
    });
    expect(missing).toEqual([
      'raceId "WI-FAKE-RACE"',
      'candidateSlug "made-up-person"',
      'candidateSlug "kelda-roys" (not on the November 3, 2026 ballot)',
      'issueSlug "not-an-issue"',
    ]);
  });

  test("a brief written for the primary is not shown, so the voter makes a November one", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await t.run((ctx) =>
      ctx.db.insert("voter_briefs", { userId, electionSlug: "wi-2026", openuiSource: "intro = AssistantNote(\"the August 11 primary\")", generatedAt: NOVEMBER_BRIEFS_SINCE - 1, status: "ready" }),
    );
    expect(await t.withIdentity(USER).query(api.briefs.getLatest, {})).toBeNull();
    expect(await t.withIdentity(USER).query(api.briefs.listMine, {})).toEqual([]);
  });

  test("the off switch stops new briefs and says so", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedBallotWorld(t, userId);
    process.env.BRIEF_DISABLED = "1";
    try {
      await expect(t.withIdentity(USER).mutation(api.briefs.generate, {})).rejects.toThrow(/paused/i);
    } finally {
      delete process.env.BRIEF_DISABLED;
    }
    expect(await t.run((ctx) => ctx.db.query("voter_briefs").collect())).toEqual([]);
  });
});
