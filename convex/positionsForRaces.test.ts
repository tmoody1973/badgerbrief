import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => convexTest(schema, modules);
const SOURCE = { url: "https://elections.wi.gov/media/41846/download", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };
// /match shows only November contests and the people on the ballot.
const ON = { onBallot: true, source: SOURCE };

test("positionsForRaces returns candidates + published positions per race, in id order", async () => {
  const t = setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("races", {
      raceId: "WI-GOV-2026", electionSlug: "wi-2026", office: "Governor",
      level: "State Executive", sources: [], dataAsOf: "2026-07-26", general: ON,
    });
    await ctx.db.insert("candidates", {
      slug: "barnes", raceId: "WI-GOV-2026", name: "Mandela Barnes", party: "Democratic",
      sources: [], dataAsOf: "2026-07-26", general: ON,
    });
    const draftId = await ctx.db.insert("candidate_positions_drafts", {
      candidateSlug: "barnes", raceId: "WI-GOV-2026", issueSlug: "healthcare",
      stance: "support", summary: "…", confidence: 0.8,
      sources: [{ name: "Site", url: "https://x" }],
      reviewStatus: "approved", extractedAt: 1,
    });
    await ctx.db.insert("candidate_positions_published", {
      candidateSlug: "barnes", raceId: "WI-GOV-2026", issueSlug: "healthcare",
      stance: "support", summary: "…", confidence: 0.8,
      sources: [{ name: "Site", url: "https://x" }],
      draftId, publishedAt: 1, lastReviewedAt: 1,
    });
  });

  const out = await t.query(api.public.positionsForRaces, { raceIds: ["WI-GOV-2026", "MISSING"] });
  expect(out).toHaveLength(1);
  expect(out[0].raceId).toBe("WI-GOV-2026");
  expect(out[0].office).toBe("Governor");
  expect(out[0].level).toBe("State Executive");
  expect(out[0].candidates).toEqual([{ slug: "barnes", name: "Mandela Barnes", party: "Democratic", incumbent: undefined }]);
  expect(out[0].positions[0]).toMatchObject({ candidateSlug: "barnes", issueSlug: "healthcare", stance: "support" });
});

test("positionsForRaces returns only November contests, with only the people on the ballot", async () => {
  const t = setup();
  await t.run(async (ctx) => {
    const race = (raceId: string, office: string, general?: { onBallot: boolean; source: typeof SOURCE }) =>
      ctx.db.insert("races", { raceId, electionSlug: "wi-2026", office, level: "State Executive", sources: [], dataAsOf: "2026-10-12", ...(general ? { general } : {}) });
    await race("WI-GOV-2026", "Governor", { onBallot: true, source: SOURCE });
    await race("WI-LTGOV-2026", "Lieutenant Governor", { onBallot: false, source: SOURCE });
    await race("WI-NOT-LOADED-2026", "Not loaded");

    type General = { onBallot: boolean; ballotName?: string; ballotOrder?: number; source: typeof SOURCE };
    const cand = (slug: string, raceId: string, name: string, general: General) =>
      ctx.db.insert("candidates", { slug, raceId, name, party: "Democratic", sources: [], dataAsOf: "2026-10-12", general });
    await cand("david-crowley", "WI-GOV-2026", "David Crowley", { onBallot: true, ballotName: "David Crowley / Sarah Godlewski", ballotOrder: 2, source: SOURCE });
    await cand("francesca-hong", "WI-GOV-2026", "Francesca Hong", { onBallot: false, source: SOURCE });
    await cand("sarah-godlewski", "WI-LTGOV-2026", "Sarah Godlewski", { onBallot: true, ballotName: "David Crowley / Sarah Godlewski", source: SOURCE });
    await ctx.db.insert("candidates", { slug: "someone", raceId: "WI-NOT-LOADED-2026", name: "Someone", sources: [], dataAsOf: "2026-10-12" });

    for (const candidateSlug of ["david-crowley", "francesca-hong"]) {
      const draftId = await ctx.db.insert("candidate_positions_drafts", {
        candidateSlug, raceId: "WI-GOV-2026", issueSlug: "healthcare", stance: "support", summary: "…", confidence: 0.8,
        sources: [{ name: "Site", url: "https://x" }], reviewStatus: "approved", extractedAt: 1,
      });
      await ctx.db.insert("candidate_positions_published", {
        candidateSlug, raceId: "WI-GOV-2026", issueSlug: "healthcare", stance: "support", summary: "…", confidence: 0.8,
        sources: [{ name: "Site", url: "https://x" }], draftId, publishedAt: 1, lastReviewedAt: 1,
      });
    }
  });

  const out = await t.query(api.public.positionsForRaces, { raceIds: ["WI-GOV-2026", "WI-LTGOV-2026", "WI-NOT-LOADED-2026"] });
  // Lieutenant Governor is not a separate contest; a race with no ballot facts is not shown as one.
  expect(out.map((r) => r.raceId)).toEqual(["WI-GOV-2026"]);
  // The person's own name, not the ticket line: the position is theirs.
  expect(out[0].candidates.map((c) => c.name)).toEqual(["David Crowley"]);
  expect(out[0].positions.map((p) => p.candidateSlug)).toEqual(["david-crowley"]);
});
