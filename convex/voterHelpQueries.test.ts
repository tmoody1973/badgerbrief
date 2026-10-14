import { register as registerAgentComponent } from "@convex-dev/agent/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);
const SOURCE = { url: "https://elections.wi.gov/media/41846/download", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };
const ON = { onBallot: true, source: SOURCE };
const OFF = { onBallot: false, source: SOURCE };
const USER = { subject: "clerk_chat_user" };
const setup = () => {
  const t = convexTest(schema, modules);
  registerAgentComponent(t);
  return t;
};

async function seedUser(t: ReturnType<typeof setup>) {
  return await t.run((ctx) =>
    ctx.db.insert("users", { clerkId: "clerk_chat_user", email: "c@x.com" }),
  );
}

afterEach(() => {
  delete process.env.VOTER_HELP_DISABLED;
  delete process.env.GUEST_MSG_CAP;
  delete process.env.GUEST_DAILY_CAP;
});

// Convention (briefs.test.ts): cover the paths that stop before the agent
// component — thread creation/streaming is live-verified.
describe("voterHelp guards", () => {
  test("sendMessage rejects a signed-out send with no guestId", async () => {
    const t = setup();
    await expect(t.mutation(api.voterHelpQueries.sendMessage, { prompt: "hi" })).rejects.toThrow(
      /reload/i,
    );
  });

  test("sendMessage rejects empty and over-length prompts before touching the thread", async () => {
    const t = setup();
    await seedUser(t);
    const authed = t.withIdentity(USER);
    await expect(authed.mutation(api.voterHelpQueries.sendMessage, { prompt: "   " })).rejects.toThrow(
      /question/i,
    );
    await expect(
      authed.mutation(api.voterHelpQueries.sendMessage, { prompt: "x".repeat(2001) }),
    ).rejects.toThrow(/2000/);
  });

  test("listThreadMessages rejects when signed out with no guestId", async () => {
    const t = setup();
    await expect(
      t.query(api.voterHelpQueries.listThreadMessages, {
        threadId: "any",
        paginationOpts: { numItems: 10, cursor: null },
        streamArgs: undefined,
      }),
    ).rejects.toThrow(/reload/i);
  });
});

describe("sendMessage guardrails", () => {
  test("kill switch throws for everyone, guest or signed in", async () => {
    process.env.VOTER_HELP_DISABLED = "1";
    const t = setup();
    await expect(
      t.mutation(api.voterHelpQueries.sendMessage, { prompt: "hi", guestId: "g1" }),
    ).rejects.toThrow(/paused/i);
  });

  test("caps a guest at GUEST_MSG_CAP sends/day", async () => {
    process.env.GUEST_MSG_CAP = "2";
    process.env.GUEST_DAILY_CAP = "1000";
    const t = setup();
    await t.mutation(api.voterHelpQueries.sendMessage, { prompt: "q1", guestId: "g1" });
    await t.mutation(api.voterHelpQueries.sendMessage, { prompt: "q2", guestId: "g1" });
    await expect(
      t.mutation(api.voterHelpQueries.sendMessage, { prompt: "q3", guestId: "g1" }),
    ).rejects.toThrow(/limit/i);
  });
});

describe("ballotForUser", () => {
  // Real November contests: the chat lists nothing else.
  const raceBase = { electionSlug: "wi-2026", sources: [], dataAsOf: "2026-07-01", general: ON };

  async function seedWorld(t: ReturnType<typeof setup>) {
    await t.run(async (ctx) => {
      await ctx.db.insert("races", {
        ...raceBase,
        raceId: "WI-GOV-2026",
        office: "Governor",
        level: "State Executive",
      });
      await ctx.db.insert("races", {
        ...raceBase,
        raceId: "WI-US-HOUSE-D4-2026",
        office: "U.S. House WI-4",
        level: "Federal",
      });
      await ctx.db.insert("races", {
        ...raceBase,
        raceId: "WI-US-HOUSE-D5-2026",
        office: "U.S. House WI-5",
        level: "Federal",
      });
      await ctx.db.insert("candidates", {
        slug: "kelda-roys",
        raceId: "WI-GOV-2026",
        name: "Kelda Roys",
        party: "Democratic",
        sources: [],
        dataAsOf: "2026-07-01",
        general: ON,
      });
    });
  }

  test("returns district-relevant races with candidate names", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedWorld(t);
    await t.run((ctx) =>
      ctx.db.insert("user_preferences", {
        userId,
        congressionalDistrict: "4",
        stateSenateDistrict: "3",
        stateAssemblyDistrict: "8",
        savedRaceIds: [],
        savedIssues: [],
        detailLevel: "standard",
      }),
    );

    const ballot = await t.query(internal.voterHelpQueries.ballotForUser, { userId });
    expect(ballot.districts).toEqual({ congressional: 4, senate: 3, assembly: 8 });
    const raceIds = ballot.races.map((r) => r.raceId);
    expect(raceIds).toContain("WI-GOV-2026");
    expect(raceIds).toContain("WI-US-HOUSE-D4-2026");
    expect(raceIds).not.toContain("WI-US-HOUSE-D5-2026");
    const gov = ballot.races.find((r) => r.raceId === "WI-GOV-2026")!;
    expect(gov.candidates).toEqual([
      { slug: "kelda-roys", name: "Kelda Roys", party: "Democratic", ballotLine: "Kelda Roys (Democratic)" },
    ]);
  });

  test("districts null when the user has no saved address", async () => {
    const t = setup();
    const userId = await seedUser(t);
    await seedWorld(t);
    const ballot = await t.query(internal.voterHelpQueries.ballotForUser, { userId });
    expect(ballot).toEqual({ districts: null, races: [] });
  });
});

describe("the chat's ballot queries follow the November ballot", () => {
  async function seededRaces() {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const race = (raceId: string, office: string, level: string, general?: typeof ON) =>
        ctx.db.insert("races", { raceId, electionSlug: "wi-2026", office, level, sources: [], dataAsOf: "2026-10-12", ...(general ? { general } : {}) });
      await race("WI-GOV-2026", "Governor of Wisconsin", "State Executive", ON);
      await race("WI-LTGOV-2026", "Lieutenant Governor of Wisconsin", "State Executive", OFF);
      await race("WI-SCOTUS-2026", "Wisconsin Supreme Court", "State Judicial", OFF);
      await race("WI-NOT-LOADED-2026", "Not loaded", "State Executive");
    });
    return t;
  }

  test("the statewide fallback is the statewide November contests only", async () => {
    const t = await seededRaces();
    expect(await t.query(internal.voterHelpQueries.statewideRaceIds, {})).toEqual(["WI-GOV-2026"]);
  });

  test("a voter's ballot lists November contests with only the people on the ballot", async () => {
    const t = await seededRaces();
    const userId = await t.run(async (ctx) => {
      await ctx.db.insert("candidates", { slug: "david-crowley", raceId: "WI-GOV-2026", name: "David Crowley", party: "Democratic", status: "Active", sources: [], dataAsOf: "2026-10-12", general: { ...ON, ballotName: "David Crowley / Sarah Godlewski", party: "Democratic", ballotOrder: 2 } });
      await ctx.db.insert("candidates", { slug: "francesca-hong", raceId: "WI-GOV-2026", name: "Francesca Hong", party: "Democratic", status: "Active", sources: [], dataAsOf: "2026-10-12", general: OFF });
      const id = await ctx.db.insert("users", { clerkId: "clerk_ballot_test" });
      await ctx.db.insert("user_preferences", { userId: id, congressionalDistrict: "4", stateSenateDistrict: "7", stateAssemblyDistrict: "19", savedRaceIds: [], savedIssues: [], detailLevel: "standard" });
      return id;
    });
    const ballot = await t.query(internal.voterHelpQueries.ballotForUser, { userId });
    expect(ballot.races.map((r) => r.raceId)).toEqual(["WI-GOV-2026"]);
    expect(ballot.races[0].candidates).toEqual([
      { slug: "david-crowley", name: "David Crowley", party: "Democratic", ballotLine: "David Crowley / Sarah Godlewski (Democratic)" },
    ]);
    expect(JSON.stringify(ballot)).not.toMatch(/primaryDate|Francesca Hong/);
  });
});

describe("startNewConversation", () => {
  const guest = { guestId: "guest-new-conv" };

  test("a new conversation becomes the one the chat shows, leaving the old one behind", async () => {
    const t = setup();
    const { threadId: first } = await t.mutation(api.voterHelpQueries.sendMessage, { prompt: "When is the deadline?", ...guest });
    const { threadId: fresh } = await t.mutation(api.voterHelpQueries.startNewConversation, guest);
    expect(fresh).not.toBe(first);
    expect(await t.query(api.voterHelpQueries.getMyThread, guest)).toBe(fresh);
  }, 20_000);

  test("pressing it again before asking anything reuses the empty conversation", async () => {
    const t = setup();
    const { threadId: a } = await t.mutation(api.voterHelpQueries.startNewConversation, guest);
    const { threadId: b } = await t.mutation(api.voterHelpQueries.startNewConversation, guest);
    expect(b).toBe(a);
  });

  test("refuses a signed-out visitor with no guest id", async () => {
    const t = setup();
    await expect(t.mutation(api.voterHelpQueries.startNewConversation, {})).rejects.toThrow(/reload/i);
  });
});
