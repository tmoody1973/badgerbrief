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

const ADMIN = { subject: "user_admin", metadata: { role: "admin" } };
const READER = { subject: "user_reader", metadata: { role: "reader" } };

const validQuoteDraft = {
  candidateSlug: "joel-brennan",
  raceId: "WI-GOV-2026",
  speaker: "Joel Brennan",
  text: "We need to invest in Wisconsin's future.",
  context: "Campaign launch speech in Milwaukee",
  outlet: "WUWM",
  date: "2026-06-01",
  sourceUrl: "https://www.wuwm.com/example",
  reviewStatus: "approved" as const,
  extractedAt: 0,
};

function setup() {
  return convexTest(schema, modules);
}

describe("quote publish gate", () => {
  test("approved, fully-sourced quote publishes", async () => {
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("quote_drafts", validQuoteDraft),
    );
    const id = await t
      .withIdentity(ADMIN)
      .mutation(api.publish.publishQuote, { draftId });
    expect(id).toBeDefined();
  });

  test("quote without source URL is rejected", async () => {
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("quote_drafts", { ...validQuoteDraft, sourceUrl: undefined }),
    );
    await expect(
      t.withIdentity(ADMIN).mutation(api.publish.publishQuote, { draftId }),
    ).rejects.toThrow(/sourceUrl is required/);
  });

  test("quote without context is rejected", async () => {
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("quote_drafts", { ...validQuoteDraft, context: "  " }),
    );
    await expect(
      t.withIdentity(ADMIN).mutation(api.publish.publishQuote, { draftId }),
    ).rejects.toThrow(/context is required/);
  });

  test("unapproved quote is rejected", async () => {
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("quote_drafts", {
        ...validQuoteDraft,
        reviewStatus: "pending" as const,
      }),
    );
    await expect(
      t.withIdentity(ADMIN).mutation(api.publish.publishQuote, { draftId }),
    ).rejects.toThrow(/approved/);
  });

  test("non-admin and anonymous callers are rejected", async () => {
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("quote_drafts", validQuoteDraft),
    );
    await expect(
      t.withIdentity(READER).mutation(api.publish.publishQuote, { draftId }),
    ).rejects.toThrow(/admin role/);
    await expect(
      t.mutation(api.publish.publishQuote, { draftId }),
    ).rejects.toThrow(/authentication/);
  });
});

describe("position publish gate", () => {
  const validPositionDraft = {
    candidateSlug: "joel-brennan",
    raceId: "WI-GOV-2026",
    issueSlug: "education",
    stance: "support" as const,
    summary: "Supports increased K-12 funding.",
    confidence: 0.9,
    sources: [{ name: "Campaign site", url: "https://example.com/issues" }],
    reviewStatus: "approved" as const,
    extractedAt: 0,
  };

  test("approved, sourced position publishes; republish updates in place", async () => {
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("candidate_positions_drafts", validPositionDraft),
    );
    const first = await t
      .withIdentity(ADMIN)
      .mutation(api.publish.publishPosition, { draftId });
    const second = await t
      .withIdentity(ADMIN)
      .mutation(api.publish.publishPosition, { draftId });
    expect(second).toEqual(first); // versioned update, not a duplicate
  });

  test("position without sources is rejected", async () => {
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("candidate_positions_drafts", {
        ...validPositionDraft,
        sources: [],
      }),
    );
    await expect(
      t.withIdentity(ADMIN).mutation(api.publish.publishPosition, { draftId }),
    ).rejects.toThrow(/at least one source/);
  });
});

describe("seed idempotency", () => {
  const race = {
    raceId: "WI-GOV-2026",
    electionSlug: "wi-2026",
    office: "Governor of Wisconsin",
    level: "State Executive",
    sources: [{ name: "Ballotpedia", url: "https://ballotpedia.org/x" }],
    dataAsOf: "July 17, 2026",
  };
  const candidates = [
    {
      slug: "joel-brennan",
      name: "Joel Brennan",
      party: "Democratic",
      sources: [{ name: "Campaign", url: "https://www.brennanforwi.com/" }],
    },
  ];

  test("upsertRace twice yields identical counts", async () => {
    const t = setup();
    await t.mutation(internal.seed.upsertRace, { race, candidates });
    const after1 = await t.mutation(internal.seed.counts, {});
    await t.mutation(internal.seed.upsertRace, { race, candidates });
    const after2 = await t.mutation(internal.seed.counts, {});
    expect(after2).toEqual(after1);
    expect(after1.races).toBe(1);
    expect(after1.candidates).toBe(1);
    expect(after1.sources).toBe(2);
  });

  test("voting info without official https URL is rejected", async () => {
    const t = setup();
    await expect(
      t.mutation(internal.seed.upsertVotingInfo, {
        electionSlug: "wi-2026",
        primaryDate: "August 11, 2026",
        officialVoterInfoUrl: "not-a-url",
        sources: [],
      }),
    ).rejects.toThrow(/official https source/);
  });
});
