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
