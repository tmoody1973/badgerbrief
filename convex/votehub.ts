/**
 * Daily import of published Wisconsin polls from VoteHub's free polling API
 * (CC BY 4.0). Shaping and the rules about which polls belong are in
 * lib/votehub.ts; this file only fetches and stores.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { raceIdFor, selectPolls, type VoteHubPoll } from "./lib/votehub";

const API = "https://api.votehub.com/polls";
// The poll types VoteHub carries for offices on Wisconsin's November ballot.
const POLL_TYPES = ["governor", "attorney-general", "us-representative"];

/** Every stored candidate for each race (on the ballot or not), for name matching. */
export const candidatesForRaces = internalQuery({
  args: { raceIds: v.array(v.string()) },
  handler: async (ctx, { raceIds }) => {
    const entries = await Promise.all(
      raceIds.map(async (raceId) => {
        const rows = await ctx.db
          .query("candidates")
          .withIndex("by_slug", (q) => q.eq("raceId", raceId))
          .collect();
        return [raceId, rows.map((c) => ({ name: c.name, slug: c.slug }))] as const;
      }),
    );
    return Object.fromEntries(entries);
  },
});

async function fetchPolls(pollType: string): Promise<VoteHubPoll[]> {
  const res = await fetch(`${API}?poll_type=${pollType}`, {
    headers: { "User-Agent": "badgerbrief-polls/1.0 (+https://badgerbrief.org)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`VoteHub ${pollType}: HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error(`VoteHub ${pollType}: expected a list of polls`);
  return body as VoteHubPoll[];
}

export const syncVotehub = internalAction({
  args: {},
  handler: async (ctx) => {
    const fetched = (await Promise.all(POLL_TYPES.map(fetchPolls))).flat();
    const wisconsin = fetched.filter((p) => raceIdFor(p) !== null);
    const raceIds = [...new Set(wisconsin.map((p) => raceIdFor(p)!))];
    const candidates = await ctx.runQuery(internal.votehub.candidatesForRaces, { raceIds });
    const rows = selectPolls(wisconsin, candidates);
    for (const poll of rows) {
      await ctx.runMutation(internal.pollsQueries.storePoll, { poll });
    }
    return { fetched: fetched.length, wisconsin: wisconsin.length, stored: rows.length, pollKeys: rows.map((r) => r.pollKey) };
  },
});
