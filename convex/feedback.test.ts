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
});
