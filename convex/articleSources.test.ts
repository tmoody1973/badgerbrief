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

const baseSource = {
  candidateSlug: "joel-brennan",
  raceId: "WI-GOV-2026",
  url: "https://urbanmilwaukee.com/2026/06/01/brennan-education",
  outlet: "Urban Milwaukee",
  headline: "Brennan lays out education plan",
  whyRelevant: "Direct quotes on K-12 funding stance",
  status: "proposed" as const,
  proposedAt: 1000,
};

describe("decideArticleSource", () => {
  test("non-admin and anonymous callers are rejected", async () => {
    const t = setup();
    const sourceId = await t.run((ctx) => ctx.db.insert("article_sources", baseSource));
    await expect(
      t.withIdentity(READER).mutation(api.adminQueue.decideArticleSource, {
        sourceId,
        decision: "approved",
      }),
    ).rejects.toThrow(/admin role/);
    await expect(
      t.mutation(api.adminQueue.decideArticleSource, {
        sourceId,
        decision: "approved",
      }),
    ).rejects.toThrow(/authentication/);
  });

  test("admin approves a proposed row: status set, decidedAt set, one audit_log row", async () => {
    const t = setup();
    const sourceId = await t.run((ctx) => ctx.db.insert("article_sources", baseSource));
    await t.withIdentity(ADMIN).mutation(api.adminQueue.decideArticleSource, {
      sourceId,
      decision: "approved",
    });
    const source = await t.run((ctx) => ctx.db.get(sourceId));
    expect(source?.status).toBe("approved");
    expect(source?.decidedAt).toBeTypeOf("number");

    const auditRows = await t.run((ctx) =>
      ctx.db
        .query("audit_log")
        .withIndex("by_ref", (q) =>
          q.eq("refTable", "article_sources").eq("refId", sourceId),
        )
        .collect(),
    );
    expect(auditRows).toHaveLength(1);
  });

  test("admin rejects a proposed row: status set to rejected", async () => {
    const t = setup();
    const sourceId = await t.run((ctx) => ctx.db.insert("article_sources", baseSource));
    await t.withIdentity(ADMIN).mutation(api.adminQueue.decideArticleSource, {
      sourceId,
      decision: "rejected",
    });
    const source = await t.run((ctx) => ctx.db.get(sourceId));
    expect(source?.status).toBe("rejected");
    expect(source?.decidedAt).toBeTypeOf("number");
  });
});

describe("listArticleSources", () => {
  test("returns only proposed rows, newest first, with joined candidateName", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("candidates", {
        slug: "joel-brennan",
        raceId: "WI-GOV-2026",
        name: "Joel Brennan",
        sources: [],
        dataAsOf: "2026-07-18",
      }),
    );
    const olderId = await t.run((ctx) =>
      ctx.db.insert("article_sources", { ...baseSource, proposedAt: 1000 }),
    );
    const newerId = await t.run((ctx) =>
      ctx.db.insert("article_sources", {
        ...baseSource,
        url: "https://wpr.org/brennan-second",
        proposedAt: 2000,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("article_sources", {
        ...baseSource,
        url: "https://jsonline.com/brennan-old",
        status: "approved",
        proposedAt: 3000,
        decidedAt: 3500,
      }),
    );

    const rows = await t.withIdentity(ADMIN).query(api.adminQueue.listArticleSources, {});
    expect(rows).toHaveLength(2);
    expect(rows[0]._id).toBe(newerId);
    expect(rows[1]._id).toBe(olderId);
    expect(rows.every((r) => r.status === "proposed")).toBe(true);
    expect(rows[0].candidateName).toBe("Joel Brennan");
  });

  test("shows auto-registered own-site sources alongside proposed articles", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("candidates", {
        slug: "joel-brennan",
        raceId: "WI-GOV-2026",
        name: "Joel Brennan",
        sources: [],
        dataAsOf: "2026-07-18",
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("article_sources", {
        ...baseSource,
        url: "https://www.brennanforwisconsin.com/Plan",
        outlet: "Joel Brennan",
        sourceKind: "campaign_site" as const,
        status: "approved" as const,
        proposedAt: 5000,
        decidedAt: 5000,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("article_sources", {
        ...baseSource,
        url: "https://urbanmilwaukee.com/brennan-other",
        status: "approved" as const,
        proposedAt: 4000,
        decidedAt: 4000,
      }),
    );

    const rows = await t.withIdentity(ADMIN).query(api.adminQueue.listArticleSources, {});
    const urls = rows.map((r) => r.url);

    expect(urls).toContain("https://www.brennanforwisconsin.com/Plan");
    // An approved ARTICLE stays hidden — only own-site rows join the list.
    expect(urls).not.toContain("https://urbanmilwaukee.com/brennan-other");
    const ownSite = rows.find((r) => r.url === "https://www.brennanforwisconsin.com/Plan");
    expect(ownSite!.sourceKind).toBe("campaign_site");
    expect(ownSite!.candidateName).toBe("Joel Brennan");
  });

  test("non-admin is rejected", async () => {
    const t = setup();
    await expect(
      t.withIdentity(READER).query(api.adminQueue.listArticleSources, {}),
    ).rejects.toThrow(/admin role/);
  });
});
