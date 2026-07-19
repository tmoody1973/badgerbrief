import { ConvexError, v } from "convex/values";
import { mutation, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { logAudit } from "./audit";

/**
 * Publish gates — the ONLY paths from draft to published civic content.
 * Spec §2: invalid records physically cannot publish. These mutations are
 * never exposed as agent tools; agents write drafts, humans publish.
 */

async function requireAdmin(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("publish requires authentication");
  }
  // metadata.role comes from the Clerk "convex" JWT template custom claims
  // (wired the same way as the session token; enforced UI lands in MOO-312)
  const role = (identity as { metadata?: { role?: string } }).metadata?.role;
  if (role !== "admin") {
    throw new ConvexError("publish requires the admin role");
  }
}

function requireNonEmpty(value: string | undefined, field: string): string {
  if (!value || value.trim().length === 0) {
    throw new ConvexError(`publish gate: ${field} is required and must be non-empty`);
  }
  return value;
}

export const publishQuote = mutation({
  args: { draftId: v.id("quote_drafts") },
  handler: async (ctx, { draftId }) => {
    await requireAdmin(ctx);
    const draft = await ctx.db.get(draftId);
    if (!draft) throw new ConvexError("quote draft not found");
    if (draft.reviewStatus !== "approved") {
      throw new ConvexError("publish gate: quote draft must be approved by a human reviewer");
    }
    // Gate: speaker + source URL + date + excerpt + context, all present.
    const speaker = requireNonEmpty(draft.speaker, "speaker");
    const text = requireNonEmpty(draft.text, "text (excerpt)");
    const context = requireNonEmpty(draft.context, "context");
    const date = requireNonEmpty(draft.date, "date");
    const sourceUrl = requireNonEmpty(draft.sourceUrl, "sourceUrl");
    if (!sourceUrl.startsWith("http")) {
      throw new ConvexError("publish gate: sourceUrl must be a valid URL");
    }
    // Idempotent per draft: retries/double-clicks return the existing row
    // instead of duplicating (publishPosition already upserts by design).
    const existing = await ctx.db
      .query("quote_published")
      .withIndex("by_candidate", (q) =>
        q.eq("raceId", draft.raceId).eq("candidateSlug", draft.candidateSlug),
      )
      .filter((q) => q.eq(q.field("draftId"), draftId))
      .first();
    if (existing) return existing._id;
    const publishedId = await ctx.db.insert("quote_published", {
      candidateSlug: draft.candidateSlug,
      raceId: draft.raceId,
      speaker,
      text,
      context,
      outlet: draft.outlet,
      date,
      sourceUrl,
      draftId,
      publishedAt: Date.now(),
    });
    await logAudit(ctx, {
      action: "publish",
      refTable: "quote_drafts",
      refId: draftId,
    });
    return publishedId;
  },
});

export const publishPosition = mutation({
  args: { draftId: v.id("candidate_positions_drafts") },
  handler: async (ctx, { draftId }) => {
    await requireAdmin(ctx);
    const draft = await ctx.db.get(draftId);
    if (!draft) throw new ConvexError("position draft not found");
    if (draft.reviewStatus !== "approved") {
      throw new ConvexError("publish gate: position draft must be approved by a human reviewer");
    }
    // Gate: issue tag + summary + ≥1 source link.
    requireNonEmpty(draft.issueSlug, "issueSlug");
    requireNonEmpty(draft.summary, "summary");
    if (draft.sources.length < 1) {
      throw new ConvexError("publish gate: position requires at least one source link");
    }
    for (const s of draft.sources) {
      if (!s.url.startsWith("http")) {
        throw new ConvexError(`publish gate: invalid source URL: ${s.url}`);
      }
    }
    // Versioning: replace any prior published record for this candidate+issue.
    const prior = await ctx.db
      .query("candidate_positions_published")
      .withIndex("by_candidate_issue", (q) =>
        q
          .eq("raceId", draft.raceId)
          .eq("candidateSlug", draft.candidateSlug)
          .eq("issueSlug", draft.issueSlug),
      )
      .unique();
    const doc = {
      candidateSlug: draft.candidateSlug,
      raceId: draft.raceId,
      issueSlug: draft.issueSlug,
      stance: draft.stance,
      summary: draft.summary,
      confidence: draft.confidence,
      sources: draft.sources,
      draftId,
      publishedAt: prior?.publishedAt ?? Date.now(),
      lastReviewedAt: Date.now(),
    };
    let publishedId: Id<"candidate_positions_published">;
    if (prior) {
      await ctx.db.patch(prior._id, doc);
      publishedId = prior._id;
    } else {
      publishedId = await ctx.db.insert("candidate_positions_published", doc);
    }
    await logAudit(ctx, {
      action: "publish",
      refTable: "candidate_positions_drafts",
      refId: draftId,
    });
    return publishedId;
  },
});

export const setDraftReviewStatus = mutation({
  args: {
    kind: v.union(v.literal("quote"), v.literal("position")),
    draftId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    reviewerNote: v.optional(v.string()),
  },
  handler: async (ctx, { kind, draftId, status, reviewerNote }) => {
    await requireAdmin(ctx);
    if (kind === "quote") {
      await ctx.db.patch(draftId as Id<"quote_drafts">, {
        reviewStatus: status,
      });
    } else {
      await ctx.db.patch(draftId as Id<"candidate_positions_drafts">, {
        reviewStatus: status,
        ...(reviewerNote === undefined ? {} : { reviewerNote }),
      });
    }
    await logAudit(ctx, {
      action: `review:${status}`,
      refTable: kind === "quote" ? "quote_drafts" : "candidate_positions_drafts",
      refId: draftId,
      detail: reviewerNote,
    });
  },
});
