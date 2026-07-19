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

const MAX_PROMPT_CHARS = 2000;

async function currentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
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
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    return await threadIdForUser(ctx, user._id);
  },
});

/** Save the user's message and schedule the streamed answer. */
export const sendMessage = mutation({
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }) => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) throw new ConvexError("Type a question first.");
    if (trimmed.length > MAX_PROMPT_CHARS) {
      throw new ConvexError(`Keep questions under ${MAX_PROMPT_CHARS} characters.`);
    }
    const user = await currentUser(ctx);
    if (!user) throw new ConvexError("Sign in to use Voter Help.");

    const threadId =
      (await threadIdForUser(ctx, user._id)) ??
      (await createThread(ctx, components.agent, {
        userId: user._id,
        title: "Voter Help",
      }));

    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      userId: user._id,
      prompt: trimmed,
    });
    await ctx.scheduler.runAfter(0, internal.voterHelp.streamAnswer, {
      threadId,
      promptMessageId: messageId,
      userId: user._id,
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
  },
  handler: async (ctx, { threadId, paginationOpts, streamArgs }) => {
    const user = await currentUser(ctx);
    if (!user) throw new ConvexError("Sign in to use Voter Help.");
    const thread = await ctx.runQuery(components.agent.threads.getThread, { threadId });
    if (!thread || thread.userId !== user._id) {
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
export const ballotForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
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
