/**
 * Ingest quotes extracted from a WisconsinEye interview transcript into the
 * existing quote review pipeline (quote_drafts -> review_tasks -> publish.publishQuote).
 *
 * Extraction itself runs locally (scripts/extract-wiseye-quotes.mjs) because
 * the transcripts are local files: WisconsinEye's archive is account-gated and
 * their terms prohibit sharing the media location link their download flow
 * generates, so the audio never enters the app and neither does any media URL.
 * What arrives here is text plus the PUBLIC program permalink, nothing else.
 *
 * Everything downstream already exists and is deliberately not duplicated:
 * this only writes drafts. Nothing reaches a candidate page until a human
 * approves the draft and publishQuote's gate passes.
 */
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAdmin } from "./sponsors";

/** Only WisconsinEye program permalinks, and only with the timestamp anchor a
 *  reviewer needs to jump straight to the words being attributed. Blocks the
 *  account-gated media host from ever being stored as a source. */
function assertProgramUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConvexError(`ingest gate: sourceUrl is not a URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new ConvexError("ingest gate: sourceUrl must be https");
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "wiseye.org") {
    throw new ConvexError(`ingest gate: sourceUrl must be a wiseye.org program page, got ${host}`);
  }
  const t = parsed.searchParams.get("t");
  if (!t || !/^\d+$/.test(t)) {
    throw new ConvexError("ingest gate: sourceUrl needs a ?t=<seconds> anchor so a reviewer can hear the quote");
  }
}

const nonEmpty = (value: string, field: string) => {
  const trimmed = value.trim();
  if (!trimmed) throw new ConvexError(`ingest gate: ${field} is required`);
  return trimmed;
};

export const ingestTranscriptQuotes = mutation({
  args: {
    quotes: v.array(
      v.object({
        candidateSlug: v.string(),
        raceId: v.string(),
        speaker: v.string(),
        text: v.string(),
        context: v.string(),
        outlet: v.string(),
        date: v.string(),
        sourceUrl: v.string(),
      }),
    ),
  },
  handler: async (ctx, { quotes }) => {
    await requireAdmin(ctx);

    let inserted = 0;
    let duplicates = 0;
    let refreshed = 0;
    for (const q of quotes) {
      const text = nonEmpty(q.text, "text");
      // publishQuote requires all of these later; failing here means a reviewer
      // never sees a draft that could not have been published anyway.
      nonEmpty(q.speaker, "speaker");
      nonEmpty(q.context, "context");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
        throw new ConvexError(`ingest gate: date must be YYYY-MM-DD, got "${q.date}"`);
      }
      assertProgramUrl(q.sourceUrl);

      // Same dedup rule the article extractor uses: identical text for the same
      // candidate is one quote, so re-running extraction is safe.
      const duplicate = await ctx.db
        .query("quote_drafts")
        .withIndex("by_candidate", (x) =>
          x.eq("raceId", q.raceId).eq("candidateSlug", q.candidateSlug),
        )
        .filter((x) => x.eq(x.field("text"), text))
        .first();
      if (duplicate) {
        // Re-running extraction with improved context should refresh a draft
        // nobody has looked at yet — otherwise a fix to how we derive the
        // interviewer's question can never reach rows already queued.
        //
        // Only while `pending`. Once a reviewer has approved or rejected it the
        // row is theirs, and silently rewriting the context under an approval
        // would republish something a human never actually read.
        if (
          duplicate.reviewStatus === "pending" &&
          (duplicate.context !== q.context.trim() || duplicate.sourceUrl !== q.sourceUrl)
        ) {
          await ctx.db.patch(duplicate._id, {
            context: q.context.trim(),
            sourceUrl: q.sourceUrl,
          });
          refreshed++;
          continue;
        }
        duplicates++;
        continue;
      }

      const draftId = await ctx.db.insert("quote_drafts", {
        candidateSlug: q.candidateSlug,
        raceId: q.raceId,
        speaker: q.speaker.trim(),
        text,
        context: q.context.trim(),
        outlet: q.outlet.trim(),
        date: q.date,
        sourceUrl: q.sourceUrl,
        reviewStatus: "pending",
        extractedAt: Date.now(),
      });

      await ctx.db.insert("review_tasks", {
        kind: "quote",
        refTable: "quote_drafts",
        refId: draftId,
        status: "open",
        createdAt: Date.now(),
      });
      inserted++;
    }

    return { inserted, duplicates, refreshed };
  },
});
