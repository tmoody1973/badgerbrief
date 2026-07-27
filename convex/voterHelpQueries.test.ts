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
  const raceBase = { electionSlug: "wi-2026", sources: [], dataAsOf: "2026-07-01" };

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
      { slug: "kelda-roys", name: "Kelda Roys", party: "Democratic" },
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
