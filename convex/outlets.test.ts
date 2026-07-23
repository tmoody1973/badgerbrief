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

test("upsertOutlet never clobbers a hand-set type with the enrich fallback", async () => {
  const c = t();
  await c.withIdentity(admin).mutation(api.outlets.saveOutlet, {
    key: "wisconsin watch", displayName: "Wisconsin Watch", type: "nonprofit",
  });
  // a failed enrich returns type "other" — must not overwrite the human value
  await c.mutation(internal.outlets.upsertOutlet, {
    key: "wisconsin watch", displayName: "Wisconsin Watch", type: "other",
  });
  expect((await c.query(internal.outlets.outletByKey, { key: "wisconsin watch" }))?.type).toBe("nonprofit");
  // an explicit non-fallback type still wins
  await c.mutation(internal.outlets.upsertOutlet, {
    key: "wisconsin watch", displayName: "Wisconsin Watch", type: "public_media",
  });
  expect((await c.query(internal.outlets.outletByKey, { key: "wisconsin watch" }))?.type).toBe("public_media");
});

test("outlet admin surfaces reject a non-admin identity", async () => {
  const c = t();
  await c.withIdentity(admin).mutation(api.outlets.saveOutlet, {
    key: "x", displayName: "X", type: "other",
  });
  const asEditor = c.withIdentity({ metadata: { role: "editor" } });

  await expect(asEditor.mutation(api.outlets.approveOutlet, { key: "x" })).rejects.toThrow();
  await expect(asEditor.mutation(api.outlets.saveOutlet, { key: "x", displayName: "X", type: "other" })).rejects.toThrow();
  await expect(asEditor.query(api.outlets.listDraftOutlets, {})).rejects.toThrow();

  // anonymous is rejected too
  await expect(c.mutation(api.outlets.approveOutlet, { key: "x" })).rejects.toThrow();
  await expect(c.query(api.outlets.listDraftOutlets, {})).rejects.toThrow();

  // and the gate actually held: still a draft
  expect(await c.query(api.outlets.publicOutlet, { key: "x" })).toBeNull();
});
