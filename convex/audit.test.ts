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

describe("audit log", () => {
  test("records approve and publish decisions for a quote draft", async () => {
    const t = setup();
    const draftId = await t.run((ctx) =>
      ctx.db.insert("quote_drafts", {
        candidateSlug: "tom-tiffany",
        raceId: "WI-GOV-2026",
        speaker: "Tom Tiffany",
        text: "A quote.",
        context: "From his site.",
        date: "2026-07-01",
        sourceUrl: "https://example.com/q",
        reviewStatus: "pending" as const,
        extractedAt: Date.now(),
      }),
    );
    const asAdmin = t.withIdentity(ADMIN);
    await asAdmin.mutation(api.publish.setDraftReviewStatus, {
      kind: "quote",
      draftId,
      status: "approved",
    });
    await asAdmin.mutation(api.publish.publishQuote, { draftId });
    const entries = await asAdmin.query(api.audit.forRecord, {
      refTable: "quote_drafts",
      refId: draftId,
    });
    expect(entries.map((e) => e.action)).toEqual(["review:approved", "publish"]);
    expect(entries[0].actor).toBe("user_admin");
  });

  test("rejects the audit query for non-admins and anonymous callers", async () => {
    const t = setup();
    await expect(
      t
        .withIdentity(READER)
        .query(api.audit.forRecord, { refTable: "quote_drafts", refId: "x" }),
    ).rejects.toThrow(/admin/);
    await expect(
      t.query(api.audit.forRecord, { refTable: "quote_drafts", refId: "x" }),
    ).rejects.toThrow(/admin/);
  });
});
