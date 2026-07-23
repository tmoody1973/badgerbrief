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

const quote = (over: Partial<Record<string, string>> = {}) => ({
  candidateSlug: "david-crowley",
  raceId: "WI-GOV-2026",
  speaker: "David Crowley",
  text: "We have to expand BadgerCare as a public health option.",
  context: 'Asked on WisconsinEye\'s "Campaign 2026": what would your top priority be?',
  outlet: "WisconsinEye",
  date: "2026-07-22",
  sourceUrl: "https://wiseye.org/2026/07/22/campaign-2026-david-crowley-d-candidate-for-governor/?t=115",
  ...over,
});

const ingest = (t: ReturnType<typeof convexTest>, quotes: ReturnType<typeof quote>[], as = ADMIN) =>
  t.withIdentity(as).mutation(api.quoteIngest.ingestTranscriptQuotes, { quotes });

describe("ingestTranscriptQuotes", () => {
  test("inserts a draft plus an open review task", async () => {
    const t = convexTest(schema, modules);
    expect(await ingest(t, [quote()])).toEqual({ inserted: 1, duplicates: 0 });

    await t.run(async (ctx) => {
      const drafts = await ctx.db.query("quote_drafts").collect();
      expect(drafts).toHaveLength(1);
      // Never auto-approved: a transcript quote is a proposal, not a publication.
      expect(drafts[0].reviewStatus).toBe("pending");
      const tasks = await ctx.db.query("review_tasks").collect();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].kind).toBe("quote");
      expect(tasks[0].status).toBe("open");
    });
  });

  test("requires the admin role", async () => {
    const t = convexTest(schema, modules);
    await expect(ingest(t, [quote()], READER)).rejects.toThrow();
  });

  test("re-running extraction does not duplicate the same quote", async () => {
    const t = convexTest(schema, modules);
    await ingest(t, [quote()]);
    expect(await ingest(t, [quote()])).toEqual({ inserted: 0, duplicates: 1 });
  });

  // The gate that matters: WisconsinEye's terms prohibit sharing the media
  // location link their download flow generates, so only their PUBLIC program
  // permalink may ever be stored as a source.
  test("rejects any source that is not a wiseye.org program page", async () => {
    const t = convexTest(schema, modules);
    for (const sourceUrl of [
      "https://cdn.wiseye.org/media/abc123.mp4?token=secret", // the media host
      "https://wiseye.org.evil.com/x?t=10",                   // lookalike host
      "http://wiseye.org/program/?t=10",                       // not https
      "not-a-url",
    ]) {
      await expect(ingest(t, [quote({ sourceUrl })])).rejects.toThrow();
    }
  });

  test("requires a ?t= anchor so a reviewer can hear the quote", async () => {
    const t = convexTest(schema, modules);
    await expect(
      ingest(t, [quote({ sourceUrl: "https://wiseye.org/2026/07/22/campaign-2026-david-crowley-d-candidate-for-governor/" })]),
    ).rejects.toThrow();
    await expect(ingest(t, [quote({ sourceUrl: "https://wiseye.org/x/?t=abc" })])).rejects.toThrow();
  });

  test("rejects rows publishQuote would later refuse", async () => {
    const t = convexTest(schema, modules);
    await expect(ingest(t, [quote({ text: "   " })])).rejects.toThrow();
    await expect(ingest(t, [quote({ context: "" })])).rejects.toThrow();
    await expect(ingest(t, [quote({ speaker: "" })])).rejects.toThrow();
    await expect(ingest(t, [quote({ date: "July 22, 2026" })])).rejects.toThrow();
  });
});
