/**
 * MOO-310 Voter Help: default-runtime queries/mutations for the chat.
 * The LLM call lives in convex/voterHelp.ts ("use node"); this file owns
 * auth, thread-per-user lookup, message persistence, and the ballot query
 * the getMyBallot tool reads.
 */
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  createThread,
  listMessages,
  saveMessage,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import { components, internal } from "./_generated/api";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { relevantRaces, type Districts } from "../src/lib/districts";
import { capFromEnv, dayKey, isKillSwitchOn, isOverCap } from "./lib/chatUsage";

const MAX_PROMPT_CHARS = 2000;

async function currentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

/**
 * Signed-in → the user's own id; else a non-empty guestId → "guest:<id>";
 * else there's nothing to key a thread or a rate limit on.
 */
async function resolveSubject(
  ctx: QueryCtx | MutationCtx,
  guestId: string | undefined,
): Promise<{ subject: string; isGuest: boolean }> {
  const user = await currentUser(ctx);
  if (user) return { subject: user._id, isGuest: false };
  if (guestId) return { subject: `guest:${guestId}`, isGuest: true };
  throw new ConvexError("Reload and try again.");
}

/** Bump today's send count for `subject` and return the new total. */
async function incrementUsage(ctx: MutationCtx, subject: string, day: string) {
  const row = await ctx.db
    .query("chat_usage")
    .withIndex("by_subject_day", (q) => q.eq("subject", subject).eq("day", day))
    .unique();
  if (row) {
    await ctx.db.patch("chat_usage", row._id, { count: row.count + 1 });
    return row.count + 1;
  }
  await ctx.db.insert("chat_usage", { subject, day, count: 1 });
  return 1;
}

/** One persistent thread per user: newest active thread, or null. */
async function threadIdForUser(ctx: QueryCtx | MutationCtx, userId: string) {
  const threads = await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
    userId,
    order: "desc",
    paginationOpts: { numItems: 1, cursor: null },
  });
  return threads.page[0]?._id ?? null;
}

export const getMyThread = query({
  args: { guestId: v.optional(v.string()) },
  handler: async (ctx, { guestId }) => {
    const user = await currentUser(ctx);
    if (!user && !guestId) return null;
    return await threadIdForUser(ctx, user ? user._id : `guest:${guestId}`);
  },
});

/** Save the user's message and schedule the streamed answer. */
export const sendMessage = mutation({
  args: { prompt: v.string(), guestId: v.optional(v.string()) },
  handler: async (ctx, { prompt, guestId }) => {
    if (isKillSwitchOn(process.env.VOTER_HELP_DISABLED)) {
      throw new ConvexError("Voter Help is paused right now — try the guide.");
    }
    const trimmed = prompt.trim();
    if (trimmed.length === 0) throw new ConvexError("Type a question first.");
    if (trimmed.length > MAX_PROMPT_CHARS) {
      throw new ConvexError(`Keep questions under ${MAX_PROMPT_CHARS} characters.`);
    }
    const { subject, isGuest } = await resolveSubject(ctx, guestId);

    if (isGuest) {
      const day = dayKey(Date.now());
      const globalCount = await incrementUsage(ctx, "GLOBAL", day);
      if (isOverCap(globalCount, capFromEnv("GUEST_DAILY_CAP", 500))) {
        throw new ConvexError(
          "Voter Help is busy today — signed-in users still have access, and the guide is always open.",
        );
      }
      const guestCount = await incrementUsage(ctx, subject, day);
      if (isOverCap(guestCount, capFromEnv("GUEST_MSG_CAP", 30))) {
        throw new ConvexError(
          "You've reached today's Voter Help limit — sign in for more, or come back tomorrow.",
        );
      }
    }

    const threadId =
      (await threadIdForUser(ctx, subject)) ??
      (await createThread(ctx, components.agent, {
        userId: subject,
        title: "Voter Help",
      }));

    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      userId: subject,
      prompt: trimmed,
    });
    await ctx.scheduler.runAfter(0, internal.voterHelp.streamAnswer, {
      threadId,
      promptMessageId: messageId,
      userId: subject,
      prompt: trimmed,
    });
    return { threadId };
  },
});

/** Thread messages + stream deltas for useThreadMessages({ stream: true }). */
export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
    guestId: v.optional(v.string()),
  },
  handler: async (ctx, { threadId, paginationOpts, streamArgs, guestId }) => {
    const { subject } = await resolveSubject(ctx, guestId);
    const thread = await ctx.runQuery(components.agent.threads.getThread, { threadId });
    if (!thread || thread.userId !== subject) {
      throw new ConvexError("This conversation belongs to another account.");
    }
    const paginated = await listMessages(ctx, components.agent, {
      threadId,
      paginationOpts,
    });
    // Keep assistant messages that carry tool CALLS — their interleaved text
    // is part of the answer (excludeToolMessages would drop it). Only tool
    // RESULTS are noise here; the client hides text-less assistant messages.
    const page = paginated.page.filter((m) => m.message?.role !== "tool");
    const streams = await syncStreams(ctx, components.agent, { threadId, streamArgs });
    return { ...paginated, page, streams };
  },
});

/**
 * The getMyBallot tool's substrate: the user's district-relevant races with
 * candidate names. `districts: null` means the user hasn't saved an address.
 */
/**
 * Statewide races (State Executive / State Judicial) — on every WI ballot.
 * The issue-matching tool's fallback when the user has no saved address,
 * mirroring /match's statewide-first behavior.
 */
export const statewideRaceIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const races = await ctx.db.query("races").collect();
    return races
      .filter((r) => r.level === "State Executive" || r.level === "State Judicial")
      .map((r) => r.raceId);
  },
});

export const ballotForUser = internalQuery({
  // v.string() + normalizeId, not v.id: the MOO-313 eval harness runs the agent
  // under a synthetic userId, and that must read as "no saved address", not crash.
  args: { userId: v.string() },
  handler: async (ctx, { userId: rawUserId }) => {
    const userId = ctx.db.normalizeId("users", rawUserId);
    if (!userId) return { districts: null, races: [] };
    const prefs = await ctx.db
      .query("user_preferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!prefs?.congressionalDistrict || !prefs.stateSenateDistrict || !prefs.stateAssemblyDistrict) {
      return { districts: null, races: [] };
    }
    const districts: Districts = {
      congressional: Number(prefs.congressionalDistrict),
      senate: Number(prefs.stateSenateDistrict),
      assembly: Number(prefs.stateAssemblyDistrict),
    };
    const allRaces = await ctx.db.query("races").collect();
    const ballot = relevantRaces(districts, allRaces);
    const races = [];
    for (const race of ballot) {
      const candidates = await ctx.db
        .query("candidates")
        .withIndex("by_race", (q) => q.eq("raceId", race.raceId))
        .collect();
      races.push({
        raceId: race.raceId,
        office: race.office,
        level: race.level,
        primaryDate: race.primaryDate,
        candidates: candidates.map((c) => ({
          slug: c.slug,
          name: c.name,
          party: c.party ?? c.primaryParty,
        })),
      });
    }
    return { districts, races };
  },
});
