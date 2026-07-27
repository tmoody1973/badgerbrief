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
const setup = () => convexTest(schema, modules);

describe("feedback.submit", () => {
  test("suggest_source without sourceUrl throws", async () => {
    const t = setup();
    await expect(
      t.mutation(api.feedback.submit, { kind: "suggest_source", message: "check this out please" }),
    ).rejects.toThrow(/source/i);
  });

  test("volunteer without contact throws", async () => {
    const t = setup();
    await expect(
      t.mutation(api.feedback.submit, { kind: "volunteer", message: "I'd like to help out" }),
    ).rejects.toThrow(/contact|reach you/i);
  });

  test("valid data_gap inserts with status new", async () => {
    const t = setup();
    await t.mutation(api.feedback.submit, {
      kind: "data_gap",
      message: "This race is missing a candidate entirely.",
    });
    const rows = await t.run((ctx) => ctx.db.query("feedback").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "data_gap", status: "new" });
  });

  test("honeypot-filled submit does not insert", async () => {
    const t = setup();
    await t.mutation(api.feedback.submit, {
      kind: "data_gap",
      message: "This is a spam bot message here",
      website: "https://spam.example",
    });
    const rows = await t.run((ctx) => ctx.db.query("feedback").collect());
    expect(rows).toHaveLength(0);
  });

  test("suggest_source with a javascript: sourceUrl throws (bad scheme)", async () => {
    const t = setup();
    await expect(
      t.mutation(api.feedback.submit, {
        kind: "suggest_source",
        message: "check this out please",
        sourceUrl: "javascript:alert(1)",
      }),
    ).rejects.toThrow(/http/i);
  });

  test("suggest_source with a valid https sourceUrl inserts it as-is", async () => {
    const t = setup();
    await t.mutation(api.feedback.submit, {
      kind: "suggest_source",
      message: "check this out please",
      sourceUrl: "https://example.com/article",
    });
    const rows = await t.run((ctx) => ctx.db.query("feedback").collect());
    expect(rows[0]).toMatchObject({ sourceUrl: "https://example.com/article" });
  });

  test("data_gap with a javascript: pageUrl inserts but drops the bad-scheme pageUrl", async () => {
    const t = setup();
    await t.mutation(api.feedback.submit, {
      kind: "data_gap",
      message: "This race is missing a candidate entirely.",
      pageUrl: "javascript:alert(1)",
    });
    const rows = await t.run((ctx) => ctx.db.query("feedback").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].pageUrl).toBeUndefined();
  });
});

describe("feedback.list ordering", () => {
  const ADMIN = { subject: "user_admin", metadata: { role: "admin" } };

  test("corrections and questions outrank contribution kinds, which outrank other", async () => {
    const t = setup();
    for (const kind of ["other", "volunteer", "data_gap", "question", "correction"] as const) {
      await t.mutation(api.feedback.submit, {
        kind,
        message: `a ${kind} report from a reader`,
        ...(kind === "correction" ? { sourceUrl: "https://example.com" } : {}),
        ...(kind === "volunteer" ? { contact: "reader@example.com" } : {}),
      });
    }
    const rows = await t.withIdentity(ADMIN).query(api.feedback.list, {});
    const index = (kind: string) => rows.findIndex((r) => r.kind === kind);
    expect(index("correction")).toBeLessThan(index("question"));
    expect(index("question")).toBeLessThan(index("data_gap"));
    expect(index("question")).toBeLessThan(index("volunteer"));
    expect(index("data_gap")).toBeLessThan(index("other"));
    expect(index("volunteer")).toBeLessThan(index("other"));
  });
});
