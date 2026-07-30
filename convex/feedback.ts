/**
 * Reader corrections and questions.
 *
 * Deliberately UNAUTHENTICATED. Every check the pipeline runs is arithmetic
 * against a document's own numbers, and parseRollCall says plainly what that
 * cannot catch: an internally-consistent page with two positions swapped. No
 * human reviews a parsed roll call before it appears on a real candidate's
 * profile — a reader is the only thing standing between that and a published
 * error. Putting a sign-in in front of the report would lose exactly the
 * person most likely to spot one.
 *
 * Unauthenticated means untrusted, so nothing here is ever displayed publicly.
 * Submissions land in an admin queue and are read by a person.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./sponsors";

const MAX_MESSAGE = 4000;
const MAX_FIELD = 500;

const clip = (s?: string) => {
  const t = s?.trim();
  return t ? t.slice(0, MAX_FIELD) : undefined;
};

/** Keep only http(s) URLs; anything else (javascript:, data:, mailto:, garbage) → undefined. */
function safeUrl(u: string | undefined): string | undefined {
  const clipped = clip(u);
  if (!clipped) return undefined;
  try {
    const proto = new URL(clipped).protocol;
    return proto === "http:" || proto === "https:" ? clipped : undefined;
  } catch {
    return undefined; // not a parseable absolute URL
  }
}

export const submit = mutation({
  args: {
    kind: v.union(
      v.literal("correction"),
      v.literal("question"),
      v.literal("other"),
      v.literal("suggest_candidate"),
      v.literal("suggest_source"),
      v.literal("data_gap"),
      v.literal("volunteer"),
    ),
    message: v.string(),
    pageUrl: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    contact: v.optional(v.string()),
    // Honeypot: a field hidden from people and filled in by bots. Named
    // plausibly enough that a scripted submitter fills it, and never rendered
    // visibly. A filled value is dropped SILENTLY — returning an error tells
    // the bot what to change.
    website: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.website) return { received: true };

    const message = args.message.trim();
    if (message.length < 10) {
      throw new ConvexError("Please describe what's wrong in a little more detail.");
    }
    if (message.length > MAX_MESSAGE) {
      throw new ConvexError("That's longer than this form accepts — please trim it.");
    }
    // A correction has to be checkable. This is the same rule the rest of the
    // site follows, applied to the people correcting it. A suggested source
    // is, definitionally, the same claim: no link, nothing to check.
    const needsSource = args.kind === "correction" || args.kind === "suggest_source";
    if (needsSource && !args.sourceUrl?.trim()) {
      throw new ConvexError(
        "A source suggestion needs a link to the source.",
      );
    }
    const sourceUrl = safeUrl(args.sourceUrl);
    if (needsSource && args.sourceUrl?.trim() && !sourceUrl) {
      throw new ConvexError("The source link must be a web address starting with http:// or https://.");
    }
    if (args.kind === "volunteer" && !args.contact?.trim()) {
      throw new ConvexError("Add a way to reach you so we can follow up.");
    }

    const pageUrl = safeUrl(args.pageUrl);
    const contact = clip(args.contact);
    await ctx.db.insert("feedback", {
      kind: args.kind,
      message,
      pageUrl,
      sourceUrl,
      contact,
      status: "new",
      submittedAt: Date.now(),
    });
    // The admin queue is the system of record; email is just a heads-up. Fire
    // it out-of-band (mutations can't do network I/O) and never let a mail
    // failure fail the submission.
    await ctx.scheduler.runAfter(0, internal.feedback.notify, {
      kind: args.kind,
      message,
      pageUrl,
      sourceUrl,
      contact,
    });
    return { received: true };
  },
});

const KIND_LABEL: Record<string, string> = {
  correction: "Correction",
  question: "Question",
  suggest_candidate: "Suggest candidate",
  suggest_source: "Suggest source",
  data_gap: "Data gap",
  volunteer: "Volunteer",
  other: "Other",
};

/**
 * Email a feedback submission to the editor via Resend. No-op when
 * RESEND_API_KEY is unset (dev, or before the key is configured), so the form
 * keeps working with email off. Reads the CONVEX deployment env — set with
 * `npx convex env set RESEND_API_KEY <key> --prod` (NOT .env.local / Vercel).
 */
export const notify = internalAction({
  args: {
    kind: v.string(),
    message: v.string(),
    pageUrl: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    contact: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return; // email off — admin queue still has it

    // `feedback@badgerbrief.org` needs the domain verified in Resend; until
    // then override with RESEND_FROM or fall back to Resend's shared test sender.
    const from = process.env.RESEND_FROM ?? "BadgerBrief <onboarding@resend.dev>";
    const to = process.env.FEEDBACK_NOTIFY_TO ?? "tarikjmoody@gmail.com";
    const topic = KIND_LABEL[args.kind] ?? "Other";

    const lines = [
      args.message,
      "",
      args.pageUrl ? `Page: ${args.pageUrl}` : null,
      args.sourceUrl ? `Source: ${args.sourceUrl}` : null,
      args.contact ? `Contact: ${args.contact}` : null,
    ].filter((l): l is string => l !== null);

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          subject: `[badgerbrief] ${topic}`,
          text: lines.join("\n"),
        }),
      });
      if (!res.ok) {
        console.error("Resend feedback notify failed", res.status, await res.text());
      }
    } catch (err) {
      // Never let a mail failure escape — the submission already succeeded.
      console.error("Resend feedback notify error", err);
    }
  },
});

/** Admin queue, newest first, corrections ahead of everything else. */
export const list = query({
  args: { status: v.optional(v.union(v.literal("new"), v.literal("reviewed"), v.literal("resolved"))) },
  handler: async (ctx, { status }) => {
    await requireAdmin(ctx);
    const rows = status
      ? await ctx.db.query("feedback").withIndex("by_status", (q) => q.eq("status", status)).collect()
      : await ctx.db.query("feedback").collect();
    // A factual correction outranks a question regardless of age: one is a
    // possible published error, the other can wait. Contribution kinds
    // (suggest_candidate/suggest_source/data_gap/volunteer) sort after those
    // two but ahead of "other" so they don't collapse into a single catch-all
    // bucket in the queue.
    const rank = (k: string) => (k === "correction" ? 0 : k === "question" ? 1 : k === "other" ? 3 : 2);
    return rows.sort((a, b) => rank(a.kind) - rank(b.kind) || b.submittedAt - a.submittedAt);
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("feedback"),
    status: v.union(v.literal("new"), v.literal("reviewed"), v.literal("resolved")),
    reviewerNote: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, reviewerNote }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(id, { status, ...(reviewerNote ? { reviewerNote } : {}) });
    return { id, status };
  },
});

/** Count of unread reports, for the admin nav badge. */
export const newCount = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("feedback").withIndex("by_status", (q) => q.eq("status", "new")).collect();
    return rows.length;
  },
});
