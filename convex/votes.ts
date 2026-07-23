"use node";
/**
 * Crawl the Wisconsin Legislature's roll-call documents.
 *
 * Source is docs.legis.wisconsin.gov only. Open States cannot serve this —
 * their own report card grades Wisconsin a "D" and notes the state "does not
 * provide stand-alone roll call votes".
 *
 * Verified volume: 233 Assembly roll calls in 2023, 302 in 2025. Roughly 1,000
 * documents across both chambers and sessions, so a weekly full pass is fine.
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  parseRollCall,
  parseVoteIndex,
  rollCallUrl,
  voteIndexUrl,
  type Chamber,
} from "./lib/rollCall";

const SESSIONS = ["2023", "2025"];
const CHAMBERS: Chamber[] = ["assembly", "senate"];
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

export const ingest = internalAction({
  args: {
    sessions: v.optional(v.array(v.string())),
    chambers: v.optional(v.array(v.union(v.literal("assembly"), v.literal("senate")))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ stored: number; skipped: number; rejected: number; fetchFailed: number; deferred: number }> => {
    const sessions = args.sessions ?? SESSIONS;
    const chambers = args.chambers ?? CHAMBERS;
    let stored = 0;
    let skipped = 0;
    let rejected = 0;
    let fetchFailed = 0;
    let deferred = 0;

    for (const session of sessions) {
      for (const chamber of chambers) {
        const indexUrl = voteIndexUrl(session, chamber);
        const indexHtml = await fetchText(indexUrl);
        if (!indexHtml) {
          console.warn(`vote index fetch failed: ${indexUrl}`);
          fetchFailed++;
          continue;
        }
        const ids = parseVoteIndex(indexHtml, chamber);
        const done = new Set(
          await ctx.runQuery(internal.votesQueries.ingestedKeys, { session, chamber }),
        );
        const limit = args.limit ?? 10_000;
        const filtered = ids.filter((id) => !done.has(id));
        skipped += done.size;
        deferred += Math.max(0, filtered.length - limit);
        const todo = filtered.slice(0, limit);

        for (const voteId of todo) {
          const rollUrl = rollCallUrl(session, chamber, voteId);
          const html = await fetchText(rollUrl);
          if (!html) {
            console.warn(`vote fetch failed: ${rollUrl}`);
            fetchFailed++;
            continue;
          }
          const parsed = parseRollCall(html, { session, chamber, voteId });
          if ("error" in parsed) {
            // Rejected, never stored. A partial parse must not enter the
            // database — that is the failure mode reviewing output can't catch.
            console.warn(`reject ${session}/${chamber}/${voteId}: ${parsed.error}`);
            rejected++;
            continue;
          }
          const res = await ctx.runMutation(internal.votesQueries.storeRollCall, {
            rollCall: parsed,
          });
          if (res.stored) stored++;
        }
      }
    }
    return { stored, skipped, rejected, fetchFailed, deferred };
  },
});
