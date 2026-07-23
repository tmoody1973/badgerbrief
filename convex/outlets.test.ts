import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
const t = () => convexTest(schema, modules);
const admin = { metadata: { role: "admin" } };

test("upsertOutlet dedups by key; publicOutlet hides drafts", async () => {
  const c = t();
  await c.mutation(internal.outlets.upsertOutlet, {
    key: "urban milwaukee", displayName: "Urban Milwaukee", type: "nonprofit",
  });
  await c.mutation(internal.outlets.upsertOutlet, {
    key: "urban milwaukee", displayName: "Urban Milwaukee", type: "nonprofit",
    ownership: "Independent nonprofit",
  });
  // still one row, latest fields win
  const row = await c.query(internal.outlets.outletByKey, { key: "urban milwaukee" });
  expect(row?.ownership).toBe("Independent nonprofit");
  // draft not public yet
  expect(await c.query(api.outlets.publicOutlet, { key: "urban milwaukee" })).toBeNull();
  // approve → public
  await c.withIdentity(admin).mutation(api.outlets.approveOutlet, { key: "urban milwaukee" });
  expect((await c.query(api.outlets.publicOutlet, { key: "urban milwaukee" }))?.displayName).toBe("Urban Milwaukee");
});
