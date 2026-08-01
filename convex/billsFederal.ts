"use node";
/**
 * Enrich the bills cache with each US-House bill's nonpartisan CRS summary.
 *
 * Federal counterpart of bills.ts. Source is the congress.gov
 * /bill/{congress}/{type}/{number}/summaries endpoint (CRS-authored, the federal
 * analogue of Wisconsin's LRB analysis), one fetch per unique (congress,
 * billNumber). A fetch failure is NOT stored (so it retries next run); a
 * successful fetch with no usable summary IS stored with summary=null (so it is
 * not retried forever, and the classifier skips it). Bounded per run by `limit`.
 *
 * Once a federal bill is cached with a summary, the existing classify → review →
 * approve flow (billClassifyRun.ts) and votingRecordByIssue pick it up unchanged.
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { federalBillParts, federalBillUrl, parseCrsSummary } from "./lib/federalBillSummary";

const API = "https://api.congress.gov/v3";
const UA = "BadgerBrief/1.0 (nonpartisan voter guide; +https://badgerbrief.org)";

function apiKey(): string {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) throw new Error("CONGRESS_API_KEY is not set");
  return key;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const enrichFederal = internalAction({
  args: { congress: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (
    ctx,
    { congress = 119, limit = 300 },
  ): Promise<{ stored: number; storedNull: number; fetchFailed: number; skippedNoEndpoint: number }> => {
    const key = apiKey();
    const session = String(congress);
    let stored = 0;
    let storedNull = 0;
    let fetchFailed = 0;
    let skippedNoEndpoint = 0;

    const billNumbers: string[] = await ctx.runQuery(
      internal.billsQueries.unenrichedFederalBillsForSession,
      { session },
    );

    for (const billNumber of billNumbers) {
      if (stored + storedNull + fetchFailed + skippedNoEndpoint >= limit) break;
      const parts = federalBillParts(billNumber);
      // Amendment-only measures (no <letters> <digits> bill) have no summaries
      // endpoint to ask. Cache them with summary=null so they aren't retried.
      if (!parts) {
        await ctx.runMutation(internal.billsQueries.storeBill, {
          session, billNumber, billUrl: federalBillUrl(session, billNumber), summary: null,
        });
        skippedNoEndpoint++;
        continue;
      }
      const url = `${API}/bill/${congress}/${parts.type}/${parts.number}/summaries?format=json&api_key=${key}`;
      const json = await fetchJson(url);
      if (json === null) {
        fetchFailed++;
        continue; // do not store — retry next run
      }
      const summary = parseCrsSummary(json);
      await ctx.runMutation(internal.billsQueries.storeBill, {
        session, billNumber, billUrl: federalBillUrl(session, billNumber), summary,
      });
      if (summary === null) storedNull++;
      else stored++;
    }
    return { stored, storedNull, fetchFailed, skippedNoEndpoint };
  },
});
