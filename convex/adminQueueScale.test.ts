import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const ADMIN = { subject: "user_admin", metadata: { role: "admin" } };

// Production on 2026-10-13: 5,947 open ad_match tasks. Convex allows 4,096
// reads per query, and the admin tab counts and the ad queue looked up each
// task's ad one at a time, so the whole admin panel failed to load.
const TASKS = 4300;

async function seed() {
  const t = convexTest(schema, modules);
  for (let start = 0; start < TASKS; start += 500) {
    await t.run(async (ctx) => {
      for (let i = start; i < Math.min(start + 500, TASKS); i++) {
        const adId = await ctx.db.insert("ads", {
          platform: i % 10 === 0 ? ("tv" as const) : ("meta" as const),
          platformAdId: `ad-${i}`,
          pageOrCommittee: `Committee ${i}`,
          spendUpper: i,
          firstSeenAt: 0,
          lastSeenAt: 0,
        });
        await ctx.db.insert("review_tasks", { kind: "ad_match", refTable: "ads", refId: adId, status: "open", createdAt: i });
      }
    });
  }
  return t;
}

test("the admin tab counts load with more open ad tasks than Convex allows reads", async () => {
  const t = await seed();
  const counts = await t.withIdentity(ADMIN).query(api.adminQueue.counts, {});
  expect(counts).toMatchObject({ adMatch: TASKS, tv: TASKS / 10, unattributed: TASKS });
}, 120_000);

test("the ad queue loads too, biggest spenders first, capped at 300", async () => {
  const t = await seed();
  const queue = await t.withIdentity(ADMIN).query(api.adminQueue.adQueue, {});
  expect(queue.openCount).toBe(TASKS);
  expect(queue.rows).toHaveLength(300);
  expect(queue.rows[0].ad.spendUpper).toBe(TASKS - 1);
  expect(queue.rows[299].ad.spendUpper).toBe(TASKS - 300);
}, 120_000);
