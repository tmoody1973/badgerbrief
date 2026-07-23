/**
 * Hosting short video clips of the moment a published interview quote was said.
 *
 * Why video and not audio: WisconsinEye's terms require that "any sharing of
 * content must retain WisconsinEye branding watermarks". Their bug and lower
 * third are burned into every frame of the recording — verified at multiple
 * timestamps — so an uncropped video clip satisfies that clause by
 * construction, while an audio-only clip would strip the watermark entirely.
 * Audio is the non-compliant option here; video is the compliant one.
 *
 * The other clauses, and how the design meets them:
 *   - Not "in their entirety"; 2-5 minute clips permitted -> ours run ~10-30s.
 *   - The generated media location link may not be shared -> we host our own
 *     copy in Convex storage and serve a Convex URL. Their download link is
 *     never stored, logged, or returned.
 *   - Link clips back to the original program -> the quote's sourceUrl is a
 *     wiseye.org program permalink and is rendered next to every clip.
 *
 * Clips are cut and uploaded by scripts/clip-wiseye.mjs, which runs locally
 * because the source video never enters this app.
 */
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./sponsors";

/** Short-lived URL the local clip script POSTs the file to. */
export const generateClipUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Attach an uploaded clip to every published quote citing the same moment.
 *
 * Keyed on the quote's `sourceUrl` (program permalink + ?t=<seconds>) rather
 * than a row id, so re-running the clip script is idempotent and a clip cut
 * once covers any duplicate quote published from the same timestamp.
 */
export const attachClip = mutation({
  args: { sourceUrl: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { sourceUrl, storageId }) => {
    await requireAdmin(ctx);

    const host = (() => {
      try {
        return new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
      } catch {
        return null;
      }
    })();
    if (host !== "wiseye.org") {
      throw new ConvexError(
        `clip gate: sourceUrl must be a wiseye.org program page, got ${host ?? "an invalid URL"}`,
      );
    }

    const rows = await ctx.db
      .query("quote_published")
      .withIndex("by_sourceUrl", (q) => q.eq("sourceUrl", sourceUrl))
      .collect();
    if (rows.length === 0) {
      // Nothing to attach to: delete the upload rather than orphan a file in
      // storage that nothing references and nothing will ever clean up.
      await ctx.storage.delete(storageId);
      return { attached: 0 };
    }

    for (const row of rows) {
      // Replacing a clip: drop the old file so re-runs don't accumulate.
      if (row.clipStorageId && row.clipStorageId !== storageId) {
        await ctx.storage.delete(row.clipStorageId);
      }
      await ctx.db.patch(row._id, { clipStorageId: storageId });
    }
    return { attached: rows.length };
  },
});

/** Published quotes that still need a clip cut, for the local script to work through. */
export const quotesNeedingClips = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("quote_published").collect();
    return rows
      .filter((r) => !r.clipStorageId && r.sourceUrl.includes("wiseye.org") && r.sourceUrl.includes("?t="))
      .map((r) => ({
        candidateSlug: r.candidateSlug,
        sourceUrl: r.sourceUrl,
        text: r.text,
      }));
  },
});
