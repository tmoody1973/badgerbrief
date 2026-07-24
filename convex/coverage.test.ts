import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
const t = () => convexTest(schema, modules);
const admin = { metadata: { role: "admin" } };

async function seedArticle(c: ReturnType<typeof t>, over: Record<string, unknown>) {
  return c.run(async (ctx: any) => ctx.db.insert("article_sources", {
    url: "https://x/" + Math.random(), outlet: "Urban Milwaukee", outletKey: "urban milwaukee",
    headline: "H", whyRelevant: "r", status: "proposed", proposedAt: Date.now(), ...over,
  }));
}

// Filtering is asserted by WHICH articles come back, identified by headline —
// not by reading hubStatus/status off the result. Those fields are no longer in
// the public payload (they are internal editorial state), and a test that reads
// them would quietly force them back into every visitor's page source.
test("hub shows only hubStatus:auto; entity shows only approved", async () => {
  const c = t();
  await seedArticle(c, { headline: "on-hub", hubStatus: "auto", status: "proposed", raceId: "WI-GOV-2026", candidateSlug: "francesca-hong" });
  await seedArticle(c, { headline: "hidden-but-approved", hubStatus: "hidden", status: "approved", raceId: "WI-GOV-2026", candidateSlug: "francesca-hong" });

  const hub = await c.query(api.coverage.hubArticles, {});
  expect(hub.map((r) => r.article.headline)).toEqual(["on-hub"]); // hidden excluded

  const entity = await c.query(api.coverage.inTheNewsForCandidate, { candidateSlug: "francesca-hong" });
  // Only the approved one, though it is hub-hidden — the two axes are separate.
  expect(entity.map((r) => r.article.headline)).toEqual(["hidden-but-approved"]);
});

test("the public payload carries no internal editorial fields", async () => {
  // /news shipped 855KB of HTML with whyRelevant and relevanceReason 145 times
  // each, plus relevance scores and review status — none of it rendered. This
  // pins the projection so a convenient `...article` spread cannot put the
  // editorial machinery back into every visitor's page source.
  const c = t();
  await seedArticle(c, {
    hubStatus: "auto",
    status: "proposed",
    relevanceScore: 1,
    relevanceReason: "names candidate",
    raceId: "WI-GOV-2026",
  });
  const [row] = await c.query(api.coverage.hubArticles, {});
  const allowed = new Set(["_id", "headline", "url", "outlet", "imageUrl", "raceId", "publishedAt"]);
  const leaked = Object.keys(row.article).filter((k) => !allowed.has(k));
  expect(leaked).toEqual([]); // nothing beyond the rendered fields
  // The specific offenders that were being shipped.
  expect(row.article).not.toHaveProperty("whyRelevant");
  expect(row.article).not.toHaveProperty("relevanceReason");
  expect(row.article).not.toHaveProperty("relevanceScore");
  expect(row.article).not.toHaveProperty("status");
});

test("hubModerationList returns both auto and hidden rows; hubArticles still only auto", async () => {
  const c = t();
  await seedArticle(c, { hubStatus: "auto", status: "proposed", raceId: "WI-GOV-2026", candidateSlug: "francesca-hong" });
  await seedArticle(c, { hubStatus: "hidden", status: "approved", raceId: "WI-GOV-2026", candidateSlug: "francesca-hong" });

  const hub = await c.query(api.coverage.hubArticles, {});
  expect(hub).toHaveLength(1); // only the "auto" row is public

  const asAdmin = c.withIdentity(admin as any);
  const moderation = await asAdmin.query(api.coverage.hubModerationList, {});
  expect(moderation.map((r) => r.article.hubStatus).sort()).toEqual(["auto", "hidden"]);
});

test("hubModerationList rejects a non-admin identity", async () => {
  const c = t();
  await expect(
    c.withIdentity({ metadata: { role: "editor" } } as any).query(api.coverage.hubModerationList, {}),
  ).rejects.toThrow();
  await expect(c.query(api.coverage.hubModerationList, {})).rejects.toThrow();
});

test("rejecting an article also hides it from the hub; approving leaves hubStatus alone", async () => {
  const c = t();
  const rejected = await seedArticle(c, { hubStatus: "auto", headline: "gone", raceId: "WI-GOV-2026" });
  const approved = await seedArticle(c, { hubStatus: "auto", headline: "stays", raceId: "WI-GOV-2026" });

  const asAdmin = c.withIdentity(admin as any);
  await asAdmin.mutation(api.adminQueue.decideArticleSource, { sourceId: rejected, decision: "rejected" });
  await asAdmin.mutation(api.adminQueue.decideArticleSource, { sourceId: approved, decision: "approved" });

  const hub = await c.query(api.coverage.hubArticles, {});
  expect(hub.map((r) => r.article.headline)).toEqual(["stays"]);
});

test("dated coverage leads the feed; undated still appears, ordered by proposedAt", async () => {
  const c = t();
  const day = 86_400_000;
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  // seeded dated-first so the old ""-localeCompare comparator would have kept
  // both undated rows pinned below it regardless of how recent they are.
  // publishedAtVerified: only a date read from the article's own metadata is
  // trusted for display or sorting — an unverified LLM guess is ignored.
  await seedArticle(c, { headline: "dated", hubStatus: "auto", publishedAt: iso(now - 3 * day), publishedAtVerified: true, proposedAt: now });
  await seedArticle(c, { headline: "fresh-undated", hubStatus: "auto", proposedAt: now - day });
  await seedArticle(c, { headline: "stale-undated", hubStatus: "auto", proposedAt: now - 30 * day });

  const hub = await c.query(api.coverage.hubArticles, {});
  // Verified-dated coverage leads. Undated rows are NOT dropped — they follow,
  // ordered among themselves by when we found them.
  expect(hub.map((r) => r.article.headline)).toEqual(["dated", "fresh-undated", "stale-undated"]);
});
