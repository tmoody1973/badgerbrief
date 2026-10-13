import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => convexTest(schema, modules);
type T = ReturnType<typeof setup>;

const SOURCE = { url: "https://elections.wi.gov/media/41846/download", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };
const ON = { onBallot: true, source: SOURCE };
const OFF = { onBallot: false, source: SOURCE };

async function addRace(t: T, raceId: string, office: string, general?: typeof ON | typeof OFF) {
  await t.run((ctx) =>
    ctx.db.insert("races", { raceId, electionSlug: "wi-2026", office, level: "State Executive", sources: [], dataAsOf: "2026-10-13", ...(general ? { general } : {}) }),
  );
}

type General = { onBallot: boolean; ballotName?: string; party?: string; ballotOrder?: number };

async function addCandidate(t: T, raceId: string, slug: string, name: string, general: General) {
  await t.run((ctx) =>
    ctx.db.insert("candidates", { slug, raceId, name, party: "Stored Party", sources: [], dataAsOf: "2026-10-13", general: { ...general, source: SOURCE } }),
  );
}

/** One published position, one finance total and one tracked ad for a candidate. */
async function addRecords(t: T, raceId: string, candidateSlug: string) {
  await t.run(async (ctx) => {
    const row = { candidateSlug, raceId, issueSlug: "housing", stance: "support" as const, summary: "A summary.", confidence: 0.9, sources: [{ name: "Site", url: "https://x" }] };
    const draftId = await ctx.db.insert("candidate_positions_drafts", { ...row, reviewStatus: "approved" as const, extractedAt: 1 });
    await ctx.db.insert("candidate_positions_published", { ...row, draftId, publishedAt: 1, lastReviewedAt: 1 });
    await ctx.db.insert("finance_totals", { candidateSlug, raceId, source: "sunshine" as const, receipts: 100, fetchedAt: 1 });
    await ctx.db.insert("ads", { platform: "meta" as const, platformAdId: `ad-${candidateSlug}`, pageOrCommittee: "A committee", candidateSlug, raceId, firstSeenAt: 1, lastSeenAt: 1 });
  });
}

test("lists only contests the state's list marks as on the ballot", async () => {
  const t = setup();
  await addRace(t, "WI-GOV-2026", "Governor", ON);
  await addRace(t, "WI-LTGOV-2026", "Lieutenant Governor", OFF);
  await addRace(t, "WI-NOT-LOADED-2026", "Not loaded");

  const out = await t.query(api.public.ballotIndex, {});

  expect(out.map((r) => r.raceId)).toEqual(["WI-GOV-2026"]);
  expect(out[0]).toMatchObject({ office: "Governor", level: "State Executive", source: { url: SOURCE.url, documentDate: SOURCE.documentDate } });
});

test("names candidates as the state prints them, in ballot order, and leaves out anyone not on the ballot", async () => {
  const t = setup();
  await addRace(t, "WI-GOV-2026", "Governor", ON);
  await addCandidate(t, "WI-GOV-2026", "second", "Second Person", { onBallot: true, ballotName: "Second Person / Their Mate", party: "Republican", ballotOrder: 2 });
  await addCandidate(t, "WI-GOV-2026", "first", "First Person", { onBallot: true, ballotName: "First Person / Other Mate", party: "Democratic", ballotOrder: 1 });
  await addCandidate(t, "WI-GOV-2026", "lost", "Lost Primary", { onBallot: false });

  const [race] = await t.query(api.public.ballotIndex, {});

  expect(race.candidates).toEqual([
    { slug: "first", ballotName: "First Person / Other Mate", party: "Democratic" },
    { slug: "second", ballotName: "Second Person / Their Mate", party: "Republican" },
  ]);
});

test("says what the guide holds, counting only people on the ballot", async () => {
  const t = setup();
  await addRace(t, "WI-GOV-2026", "Governor", ON);
  await addCandidate(t, "WI-GOV-2026", "on", "On Ballot", { onBallot: true, ballotOrder: 1 });
  await addCandidate(t, "WI-GOV-2026", "lost", "Lost Primary", { onBallot: false });
  await addRecords(t, "WI-GOV-2026", "lost");

  const before = await t.query(api.public.ballotIndex, {});
  expect(before[0].holds).toEqual({ positions: false, money: false, ads: false });

  await addRecords(t, "WI-GOV-2026", "on");
  const after = await t.query(api.public.ballotIndex, {});
  expect(after[0].holds).toEqual({ positions: true, money: true, ads: true });
});

test("a contest with nothing published has all three flags false", async () => {
  const t = setup();
  await addRace(t, "WI-AG-2026", "Attorney General", ON);
  await addCandidate(t, "WI-AG-2026", "only", "Only Person", { onBallot: true, ballotOrder: 1 });

  const [race] = await t.query(api.public.ballotIndex, {});

  expect(race.holds).toEqual({ positions: false, money: false, ads: false });
});

test("records filed under another contest do not count for this one", async () => {
  const t = setup();
  await addRace(t, "WI-AG-2026", "Attorney General", ON);
  await addRace(t, "WI-SOS-2026", "Secretary of State", ON);
  await addCandidate(t, "WI-AG-2026", "same-slug", "Same Slug", { onBallot: true, ballotOrder: 1 });
  await addCandidate(t, "WI-SOS-2026", "same-slug", "Same Slug", { onBallot: true, ballotOrder: 1 });
  await addRecords(t, "WI-SOS-2026", "same-slug");

  const out = await t.query(api.public.ballotIndex, {});

  expect(out.find((r) => r.raceId === "WI-AG-2026")?.holds).toEqual({ positions: false, money: false, ads: false });
  expect(out.find((r) => r.raceId === "WI-SOS-2026")?.holds).toEqual({ positions: true, money: true, ads: true });
});
