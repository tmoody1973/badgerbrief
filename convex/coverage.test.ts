import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
const t = () => convexTest(schema, modules);

async function seedArticle(c: ReturnType<typeof t>, over: Record<string, unknown>) {
  return c.run(async (ctx: any) => ctx.db.insert("article_sources", {
    url: "https://x/" + Math.random(), outlet: "Urban Milwaukee", outletKey: "urban milwaukee",
    headline: "H", whyRelevant: "r", status: "proposed", proposedAt: Date.now(), ...over,
  }));
}

test("hub shows only hubStatus:auto; entity shows only approved", async () => {
  const c = t();
  await seedArticle(c, { hubStatus: "auto", status: "proposed", raceId: "WI-GOV-2026", candidateSlug: "francesca-hong" });
  await seedArticle(c, { hubStatus: "hidden", status: "approved", raceId: "WI-GOV-2026", candidateSlug: "francesca-hong" });

  const hub = await c.query(api.coverage.hubArticles, {});
  expect(hub.map((r) => r.article.hubStatus)).toEqual(["auto"]); // hidden excluded

  const entity = await c.query(api.coverage.inTheNewsForCandidate, { candidateSlug: "francesca-hong" });
  expect(entity.length).toBe(1); // only the approved one, though it's hub-hidden
  expect(entity[0].status).toBe("approved");
});

test("hubModerationList returns both auto and hidden rows; hubArticles still only auto", async () => {
  const c = t();
  await seedArticle(c, { hubStatus: "auto", status: "proposed", raceId: "WI-GOV-2026", candidateSlug: "francesca-hong" });
  await seedArticle(c, { hubStatus: "hidden", status: "approved", raceId: "WI-GOV-2026", candidateSlug: "francesca-hong" });

  const hub = await c.query(api.coverage.hubArticles, {});
  expect(hub.map((r) => r.article.hubStatus)).toEqual(["auto"]);

  const asAdmin = c.withIdentity({ metadata: { role: "admin" } } as any);
  const moderation = await asAdmin.query(api.coverage.hubModerationList, {});
  expect(moderation.map((r) => r.article.hubStatus).sort()).toEqual(["auto", "hidden"]);
});
