import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

const ADMIN = { subject: "user_admin", metadata: { role: "admin" } };
const READER = { subject: "user_reader", metadata: { role: "reader" } };

function setup() {
  return convexTest(schema, modules);
}

const positionDraft = {
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

describe("adminQueue.list", () => {
  test("joins an open position task with its draft", async () => {
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("candidate_positions_drafts", positionDraft),
    );
    await t.run((ctx) =>
      ctx.db.insert("review_tasks", {
        kind: "position",
        refTable: "candidate_positions_drafts",
        refId: draftId,
        status: "open",
        createdAt: Date.now(),
      }),
    );
    const rows = await t.withIdentity(ADMIN).query(api.adminQueue.list, {});
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row.kind !== "position") throw new Error("expected a position row");
    expect(row.draft._id).toBe(draftId);
    expect(row.draft.summary).toBe(positionDraft.summary);
  });

  test("rejects non-admin and anonymous callers", async () => {
    const t = setup();
    await expect(
      t.withIdentity(READER).query(api.adminQueue.list, {}),
    ).rejects.toThrow(/admin/);
    await expect(t.query(api.adminQueue.list, {})).rejects.toThrow(/admin/);
  });
});

describe("adminQueue.editPositionDraft", () => {
  test("patches summary, resets reviewStatus to pending, and audit-logs the edit", async () => {
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("candidate_positions_drafts", positionDraft),
    );
    await t.withIdentity(ADMIN).mutation(api.adminQueue.editPositionDraft, {
      draftId,
      summary: "Updated summary text.",
    });
    const updated = await t.run((ctx) => ctx.db.get(draftId));
    expect(updated?.summary).toBe("Updated summary text.");
    expect(updated?.reviewStatus).toBe("pending");

    const entries = await t.withIdentity(ADMIN).query(api.audit.forRecord, {
      refTable: "candidate_positions_drafts",
      refId: draftId,
    });
    expect(entries.map((e) => e.action)).toEqual(["edit"]);
    expect(entries[0].detail).toContain("summary");
  });
});

describe("adminQueue.resolveTask", () => {
  test("flips status, audit-logs, and drops the task from list", async () => {
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("candidate_positions_drafts", positionDraft),
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
    await t.withIdentity(ADMIN).mutation(api.adminQueue.resolveTask, {
      taskId,
      outcome: "resolved",
    });
    const updated = await t.run((ctx) => ctx.db.get(taskId));
    expect(updated?.status).toBe("resolved");
    expect(updated?.resolvedAt).toBeDefined();

    const entries = await t.withIdentity(ADMIN).query(api.audit.forRecord, {
      refTable: "review_tasks",
      refId: taskId,
    });
    expect(entries.map((e) => e.action)).toEqual(["task:resolved"]);

    const rows = await t.withIdentity(ADMIN).query(api.adminQueue.list, {});
    expect(rows).toHaveLength(0);
  });
});

describe("adminQueue.resolveAlert", () => {
  test("flips resolved and audit-logs", async () => {
    const t = setup();
    const alertId = await t.run((ctx) =>
      ctx.db.insert("alerts", {
        kind: "staleness",
        message: "Source has not refreshed in 30 days.",
        severity: "warning",
        resolved: false,
        createdAt: Date.now(),
      }),
    );
    await t.withIdentity(ADMIN).mutation(api.adminQueue.resolveAlert, { alertId });
    const updated = await t.run((ctx) => ctx.db.get(alertId));
    expect(updated?.resolved).toBe(true);

    const entries = await t.withIdentity(ADMIN).query(api.audit.forRecord, {
      refTable: "alerts",
      refId: alertId,
    });
    expect(entries.map((e) => e.action)).toEqual(["resolve"]);
  });
});

describe("adminQueue.positionClusters (MOO-412 follow-up)", () => {
  async function seedPendingDraft(
    t: ReturnType<typeof setup>,
    overrides: Partial<typeof positionDraft> = {},
  ) {
    const draftId = await t.run((ctx) =>
      ctx.db.insert("candidate_positions_drafts", {
        ...positionDraft,
        reviewStatus: "pending" as const,
        ...overrides,
      }),
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

  test("groups duplicate drafts into one cluster, keeps the higher-confidence one", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("candidates", {
        slug: "joel-brennan",
        raceId: "WI-GOV-2026",
        name: "Joel Brennan",
        sources: [],
        dataAsOf: "2026-07-20",
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("races", {
        raceId: "WI-GOV-2026",
        electionSlug: "wi-2026",
        office: "Governor of Wisconsin",
        level: "State Executive",
        sources: [],
        dataAsOf: "2026-07-20",
      }),
    );
    const low = await seedPendingDraft(t, { confidence: 0.6, summary: "Short." });
    const high = await seedPendingDraft(t, {
      confidence: 0.9,
      summary: "A much longer, more detailed summary of the position.",
    });

    const { clusters } = await t
      .withIdentity(ADMIN)
      .query(api.adminQueue.positionClusters, {});
    expect(clusters).toHaveLength(1);
    const cluster = clusters[0];
    expect(cluster.candidateName).toBe("Joel Brennan");
    expect(cluster.office).toBe("Governor of Wisconsin");
    expect(cluster.keepDraftId).toBe(high.draftId);
    expect(cluster.drafts).toHaveLength(2);
    expect(cluster.drafts[0].isKeep).toBe(true);
    expect(cluster.drafts[0].draftId).toBe(high.draftId);
    expect(cluster.drafts[0].taskId).toBe(high.taskId);
    expect(cluster.drafts[1].isKeep).toBe(false);
    expect(cluster.drafts[1].taskId).toBe(low.taskId);
  });

  test("isNew is false when a published row exists for the key, true otherwise", async () => {
    const t = setup();
    await seedPendingDraft(t, { issueSlug: "education" });
    await seedPendingDraft(t, { issueSlug: "healthcare" });
    const publishedDraftId = await t.run((ctx) =>
      ctx.db.insert("candidate_positions_drafts", {
        ...positionDraft,
        issueSlug: "education",
        reviewStatus: "approved" as const,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("candidate_positions_published", {
        candidateSlug: positionDraft.candidateSlug,
        raceId: positionDraft.raceId,
        issueSlug: "education",
        stance: "support",
        summary: "Already published.",
        confidence: 0.9,
        sources: [],
        draftId: publishedDraftId,
        publishedAt: 0,
        lastReviewedAt: 0,
      }),
    );

    const { clusters } = await t
      .withIdentity(ADMIN)
      .query(api.adminQueue.positionClusters, {});
    expect(clusters).toHaveLength(2);
    const byIssue = new Map(clusters.map((c) => [c.issueSlug, c]));
    expect(byIssue.get("education")?.isNew).toBe(false);
    expect(byIssue.get("healthcare")?.isNew).toBe(true);
  });

  test("rejects non-admin and anonymous callers", async () => {
    const t = setup();
    await expect(
      t.withIdentity(READER).query(api.adminQueue.positionClusters, {}),
    ).rejects.toThrow(/admin/);
    await expect(t.query(api.adminQueue.positionClusters, {})).rejects.toThrow(
      /admin/,
    );
  });
});

describe("adQueue + confirmAdMatch (MOO-309)", () => {
  async function seedAdTask(t: ReturnType<typeof setup>) {
    return await t.run(async (ctx) => {
      await ctx.db.insert("candidates", {
        slug: "kelda-roys",
        raceId: "WI-GOV-2026",
        name: "Kelda Roys",
        sources: [],
        dataAsOf: "2026-07-20",
      });
      const adId = await ctx.db.insert("ads", {
        platform: "meta",
        platformAdId: "aid_x",
        pageOrCommittee: "Roys Victory Fund",
        creativeText: "Kelda Roys for Governor.",
        matchConfidence: 0.45,
        firstSeenAt: 0,
        lastSeenAt: 0,
      });
      const taskId = await ctx.db.insert("review_tasks", {
        kind: "ad_match",
        refTable: "ads",
        refId: adId,
        status: "open",
        note: "Roys Victory Fund: name matched → suggested: kelda-roys",
        createdAt: Date.now(),
      });
      return { adId, taskId };
    });
  }

  test("confirming attributes the ad publicly and resolves the task", async () => {
    const t = setup();
    const { adId, taskId } = await seedAdTask(t);

    const queue = await t.withIdentity(ADMIN).query(api.adminQueue.adQueue, {});
    expect(queue.openCount).toBe(1);
    expect(queue.rows[0].suggestedSlug).toBe("kelda-roys");

    await t.withIdentity(ADMIN).mutation(api.adminQueue.confirmAdMatch, {
      taskId,
      candidateSlug: "kelda-roys",
      stance: "support",
    });

    const ad = await t.run((ctx) => ctx.db.get(adId));
    expect(ad?.candidateSlug).toBe("kelda-roys");
    expect(ad?.raceId).toBe("WI-GOV-2026");
    expect(ad?.matchConfidence).toBe(1);
    expect(ad?.stance).toBe("support");
    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("resolved");

    // Now shows on the candidate's page.
    const forRoys = await t.query(api.ads.adsForCandidate, {
      raceId: "WI-GOV-2026",
      candidateSlug: "kelda-roys",
    });
    expect(forRoys).toHaveLength(1);
  });

  test("rejects a non-admin caller", async () => {
    const t = setup();
    const { taskId } = await seedAdTask(t);
    await expect(
      t.withIdentity(READER).mutation(api.adminQueue.confirmAdMatch, {
        taskId,
        candidateSlug: "kelda-roys",
        stance: "support",
      }),
    ).rejects.toThrow(/admin/);
  });
});
