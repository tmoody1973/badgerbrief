import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);

async function articleWithImage() {
  const t = convexTest(schema, modules);
  const id = await t.run((ctx) =>
    ctx.db.insert("article_sources", {
      candidateSlug: "tom-tiffany",
      raceId: "WI-GOV-2026",
      url: "https://www.jsonline.com/story/x/",
      outlet: "Milwaukee Journal Sentinel",
      headline: "H",
      whyRelevant: "r",
      status: "proposed",
      proposedAt: 1,
      imageUrl: "https://www.jsonline.com/img.jpg",
    }),
  );
  return { t, id };
}

test("a page the date check could not open does not erase the image the scout already saved", async () => {
  const { t, id } = await articleWithImage();
  await t.mutation(internal.publishedDateSync.recordPublishedDate, { id, publishedAt: "2026-10-12", verified: true });
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.imageUrl).toBe("https://www.jsonline.com/img.jpg");
  expect(row?.publishedAt).toBe("2026-10-12");
});

test("an image the date check does find replaces the saved one", async () => {
  const { t, id } = await articleWithImage();
  await t.mutation(internal.publishedDateSync.recordPublishedDate, { id, verified: false, imageUrl: "https://www.jsonline.com/new.jpg" });
  expect((await t.run((ctx) => ctx.db.get(id)))?.imageUrl).toBe("https://www.jsonline.com/new.jpg");
});
