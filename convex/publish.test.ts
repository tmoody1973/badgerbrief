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

  test("publishing the same quote draft twice yields one row and the same id", async () => {
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("quote_drafts", validQuoteDraft),
    );
    const first = await t
      .withIdentity(ADMIN)
      .mutation(api.publish.publishQuote, { draftId });
    const second = await t
      .withIdentity(ADMIN)
      .mutation(api.publish.publishQuote, { draftId });
    expect(second).toEqual(first);
    const published = await t.run((ctx) =>
      ctx.db.query("quote_published").collect(),
    );
    expect(published).toHaveLength(1);
  });

  test("quote WITHOUT a date publishes — campaign sites rarely carry one", async () => {
    // Requiring a date here left a reviewer two bad options: block a real,
    // sourced quote, or type in a date nobody can source. Absent beats invented.
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("quote_drafts", { ...validQuoteDraft, date: undefined }),
    );
    const id = await t.withIdentity(ADMIN).mutation(api.publish.publishQuote, { draftId });
    expect(id).toBeDefined();
    const [row] = await t.run((ctx) => ctx.db.query("quote_published").collect());
    expect(row.date).toBeUndefined();
  });

  test("a malformed date is still rejected", async () => {
    // Optional does not mean unvalidated: Date.parse("2026-06-") silently
    // invents June 1st, so a partial date must never reach a published row.
    const t = setup();
    for (const date of ["2026-06-", "June 1, 2026", "2026/06/01"]) {
      const draftId = await t.run((ctx) =>
        ctx.db.insert("quote_drafts", { ...validQuoteDraft, date }),
      );
      await expect(
        t.withIdentity(ADMIN).mutation(api.publish.publishQuote, { draftId }),
      ).rejects.toThrow(/YYYY-MM-DD/);
    }
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

describe("publish.bulkRejectPositions (MOO-412 follow-up)", () => {
  const pendingDraft = {
    candidateSlug: "joel-brennan",
    raceId: "WI-GOV-2026",
    issueSlug: "education",
    stance: "support" as const,
    summary: "Supports increased K-12 funding.",
    confidence: 0.6,
    sources: [{ name: "Campaign site", url: "https://example.com/issues" }],
    reviewStatus: "pending" as const,
    extractedAt: 0,
  };

  async function seedPendingWithTask(t: ReturnType<typeof setup>) {
    const draftId = await t.run((ctx) =>
      ctx.db.insert("candidate_positions_drafts", pendingDraft),
    );
    const taskId = await t.run((ctx) =>
      ctx.db.insert("review_tasks", {
        kind: "position",
        refTable: "candidate_positions_drafts",
        refId: draftId,
        status: "open",
        createdAt: Date.now(),
      }),
    );
    return { draftId, taskId };
  }

  test("rejects drafts, resolves their tasks, returns the count, and leaves the keep untouched", async () => {
    const t = setup();
    const reject1 = await seedPendingWithTask(t);
    const reject2 = await seedPendingWithTask(t);
    const keep = await seedPendingWithTask(t);

    const result = await t.withIdentity(ADMIN).mutation(api.publish.bulkRejectPositions, {
      items: [
        { draftId: reject1.draftId, taskId: reject1.taskId },
        { draftId: reject2.draftId, taskId: reject2.taskId },
      ],
    });
    expect(result).toEqual({ rejected: 2 });

    const [draft1, draft2, keptDraft] = await t.run((ctx) =>
      Promise.all([
        ctx.db.get(reject1.draftId),
        ctx.db.get(reject2.draftId),
        ctx.db.get(keep.draftId),
      ]),
    );
    expect(draft1?.reviewStatus).toBe("rejected");
    expect(draft2?.reviewStatus).toBe("rejected");
    expect(keptDraft?.reviewStatus).toBe("pending");

    const [task1, task2, keptTask] = await t.run((ctx) =>
      Promise.all([
        ctx.db.get(reject1.taskId),
        ctx.db.get(reject2.taskId),
        ctx.db.get(keep.taskId),
      ]),
    );
    expect(task1?.status).toBe("resolved");
    expect(task2?.status).toBe("resolved");
    expect(keptTask?.status).toBe("open");

    const entries = await t.withIdentity(ADMIN).query(api.audit.forRecord, {
      refTable: "candidate_positions_drafts",
      refId: reject1.draftId,
    });
    expect(entries.map((e) => e.action)).toEqual(["reject"]);
  });

  test("a null taskId rejects the draft without touching any task", async () => {
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("candidate_positions_drafts", pendingDraft),
    );
    const result = await t.withIdentity(ADMIN).mutation(api.publish.bulkRejectPositions, {
      items: [{ draftId, taskId: null }],
    });
    expect(result).toEqual({ rejected: 1 });
    const draft = await t.run((ctx) => ctx.db.get(draftId));
    expect(draft?.reviewStatus).toBe("rejected");
  });

  test("rejects non-admin and anonymous callers", async () => {
    const t = setup();
    const { draftId } = await seedPendingWithTask(t);
    await expect(
      t.withIdentity(READER).mutation(api.publish.bulkRejectPositions, {
        items: [{ draftId, taskId: null }],
      }),
    ).rejects.toThrow(/admin role/);
    await expect(
      t.mutation(api.publish.bulkRejectPositions, { items: [{ draftId, taskId: null }] }),
    ).rejects.toThrow(/authentication/);
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
