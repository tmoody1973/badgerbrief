"use node";
/**
 * Enrich the bills cache with each bill's first LRB analysis sentence.
 *
 * Source is docs.legis.wisconsin.gov proposal pages, one fetch per unique
 * (session, billNumber). A fetch failure is NOT stored (so it retries next
 * run); a successful fetch with no analysis IS stored with summary=null (so it
 * is not retried forever). Bounded per run by `limit`.
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { billUrl } from "./lib/votingRecord";
import { parseLrbFirstSentence } from "./lib/billAnalysis";

const UA = "BadgerBrief/1.0 (nonpartisan voter guide; +https://badgerbrief.org)";

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return await res.text();
  } catch (error) {
    return null;
  }
}

export const enrich = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 300 }): Promise<{ stored: number; storedNull: number; fetchFailed: number }> => {
    let stored = 0;
    let storedNull = 0;
    let fetchFailed = 0;
    const sessions: string[] = await ctx.runQuery(internal.billsQueries.sessionsWithVotes, {});
    for (const session of sessions) {
      if (stored + storedNull + fetchFailed >= limit) break;
      const billNumbers: string[] = await ctx.runQuery(
        internal.billsQueries.unenrichedBillsForSession,
        { session },
      );
      for (const billNumber of billNumbers) {
        if (stored + storedNull + fetchFailed >= limit) break;
        const url = billUrl(session, billNumber);
        const html = await fetchText(url);
        if (html === null) {
          fetchFailed++;
          continue; // do not store — retry next run
        }
        const summary = parseLrbFirstSentence(html);
        await ctx.runMutation(internal.billsQueries.storeBill, {
          session, billNumber, billUrl: url, summary,
        });
        if (summary === null) storedNull++;
        else stored++;
      }
    }
    return { stored, storedNull, fetchFailed };
  },
});
