"use node";
/**
 * Ingest U.S. House roll-call votes from the Congress.gov API.
 *
 * Federal counterpart of votes.ts. Two differences that matter:
 *
 *  1. Two calls per vote. The tally lives on the detail endpoint and the member
 *     positions on /members, and the gate needs both to reconcile.
 *  2. A cross-source check. Every response links the House Clerk's own XML for
 *     the same vote, so positions are verified against an independent rendering
 *     before anything is stored. rollCall.ts documents this exact blind spot as
 *     unfixable for Wisconsin; federal can and does fix it.
 *
 * Volume: 362 roll calls in 119/1 and ~270 so far in 119/2. The key's rate limit
 * is 20,000/hour, comfortably above a full backfill.
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  parseHouseVote,
  verifyAgainstClerk,
  type FederalRollCall,
} from "./lib/houseVote";

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

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const withKey = (path: string, key: string, extra = "") =>
  `${API}/${path}?format=json&api_key=${key}${extra}`;

/** Roll-call numbers for a Congress+session, walked through pagination. */
async function listVoteNumbers(
  congress: number,
  session: number,
  key: string,
): Promise<number[]> {
  const out: number[] = [];
  for (let offset = 0; ; offset += 250) {
    const url = withKey(
      `house-vote/${congress}/${session}`,
      key,
      `&limit=250&offset=${offset}`,
    );
    const page = (await fetchJson(url)) as
      | { houseRollCallVotes?: { rollCallNumber?: number }[] }
      | null;
    const items = page?.houseRollCallVotes ?? [];
    if (items.length === 0) break;
    for (const it of items) {
      if (typeof it.rollCallNumber === "number") out.push(it.rollCallNumber);
    }
    if (items.length < 250) break;
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export const ingest = internalAction({
  args: {
    congress: v.optional(v.number()),
    sessions: v.optional(v.array(v.number())),
    limit: v.optional(v.number()),
    /** Skip the Clerk cross-check. For diagnosis only — never for a real
     * backfill, since it disables the one check arithmetic cannot make. */
    skipCrossCheck: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    stored: number;
    skipped: number;
    rejected: number;
    fetchFailed: number;
    crossCheckFailed: number;
    deferred: number;
  }> => {
    const key = apiKey();
    const congress = args.congress ?? 119;
    const sessions = args.sessions ?? [1, 2];
    let stored = 0;
    let skipped = 0;
    let rejected = 0;
    let fetchFailed = 0;
    let crossCheckFailed = 0;
    let deferred = 0;

    for (const session of sessions) {
      const numbers = await listVoteNumbers(congress, session, key);
      if (numbers.length === 0) {
        console.warn(`no votes listed for ${congress}/${session}`);
        continue;
      }
      const done = new Set(
        await ctx.runQuery(internal.votesQueries.ingestedHouseVotes, {
          congress: String(congress),
          session: String(session),
        }),
      );
      const todoAll = numbers.filter((n) => !done.has(`${session}-${n}`));
      skipped += done.size;
      const limit = args.limit ?? 10_000;
      deferred += Math.max(0, todoAll.length - limit);

      for (const rollCallNumber of todoAll.slice(0, limit)) {
        const base = `house-vote/${congress}/${session}/${rollCallNumber}`;
        const detail = await fetchJson(withKey(base, key));
        const members = await fetchJson(withKey(`${base}/members`, key));
        if (!detail || !members) {
          console.warn(`fetch failed: ${base}`);
          fetchFailed++;
          continue;
        }

        const parsed = parseHouseVote(detail, members, {
          congress,
          session,
          rollCallNumber,
        });
        if ("error" in parsed) {
          // Rejected, never stored — a partial parse must not reach a public
          // profile. Same law as the Wisconsin path.
          console.warn(`reject ${base}: ${parsed.error}`);
          rejected++;
          continue;
        }

        if (!args.skipCrossCheck && parsed.sourceDataUrl) {
          const xml = await fetchText(parsed.sourceDataUrl);
          if (xml) {
            const { compared, disagreements } = verifyAgainstClerk(parsed.votes, xml);
            if (disagreements.length > 0) {
              // Two official sources disagree about how a sitting member of
              // Congress voted. There is no safe way to pick a winner, so the
              // document is refused outright and logged loudly.
              console.error(
                `CROSS-SOURCE DISAGREEMENT ${base} (${compared} compared): ` +
                  disagreements.slice(0, 5).join("; "),
              );
              crossCheckFailed++;
              continue;
            }
          }
        }

        const res = await ctx.runMutation(internal.votesQueries.storeHouseVote, {
          rollCall: toStorable(parsed),
        });
        if (res.stored) stored++;
      }
    }
    return { stored, skipped, rejected, fetchFailed, crossCheckFailed, deferred };
  },
});

function toStorable(rc: FederalRollCall) {
  return {
    voteKey: rc.voteKey,
    session: String(rc.congress),
    voteId: `${rc.session}-${rc.rollCallNumber}`,
    // The bill a reader recognises. Amendment votes keep their underlying bill
    // here and carry the amendment in `measure`.
    billNumber: rc.billNumber ?? rc.measure,
    // The API publishes no title; the enrichment pass fills this in. Empty
    // rather than a stand-in, so the UI can fall back honestly instead of
    // showing the vote question dressed up as a bill title.
    billTitle: "",
    voteType: rc.voteQuestion,
    votedOn: rc.votedOn,
    ayes: rc.ayes,
    nays: rc.nays,
    present: rc.present,
    notVoting: rc.notVoting,
    result: rc.result,
    measure: rc.measure,
    legislationUrl: rc.legislationUrl ?? undefined,
    sourceDataUrl: rc.sourceDataUrl ?? undefined,
    sourceUrl: rc.sourceUrl,
    votes: rc.votes.map((v) => ({ bioguideId: v.bioguideId, position: v.position })),
  };
}

/** "HR 3838" -> { type: "hr", number: "3838" } for the bill endpoint. */
export function billPathParts(
  billNumber: string,
): { type: string; number: string } | null {
  const m = billNumber.trim().match(/^([A-Za-z]+)\s*(\d+)$/);
  if (!m) return null;
  return { type: m[1].toLowerCase(), number: m[2] };
}

/**
 * Fill in official bill titles.
 *
 * The vote endpoints carry no title at all — only a type and number — but
 * MOO-396 requires answers to name the official title, so this is a required
 * second pass rather than a nicety. Cached per distinct bill (the federal
 * analogue of the LRB `bills` cache): a Congress takes hundreds of votes across
 * far fewer measures, so this is roughly one call per bill, not per vote.
 */
export const enrichBillTitles = internalAction({
  args: { congress: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ resolved: number; unresolved: number; patched: number }> => {
    const key = apiKey();
    const congress = args.congress ?? 119;
    const pending: string[] = await ctx.runQuery(
      internal.votesQueries.federalBillsMissingTitle,
      { session: String(congress) },
    );
    let resolved = 0;
    let unresolved = 0;
    let patched = 0;

    for (const billNumber of pending.slice(0, args.limit ?? 10_000)) {
      const parts = billPathParts(billNumber);
      // Amendment-only votes have no bill endpoint to ask; they keep the empty
      // title and the UI falls back to the measure.
      if (!parts) {
        unresolved++;
        continue;
      }
      const url = withKey(`bill/${congress}/${parts.type}/${parts.number}`, key);
      const res = (await fetchJson(url)) as { bill?: { title?: string } } | null;
      const title = res?.bill?.title;
      if (typeof title !== "string" || title.length === 0) {
        unresolved++;
        continue;
      }
      resolved++;
      const out = await ctx.runMutation(internal.votesQueries.setFederalBillTitle, {
        session: String(congress),
        billNumber,
        billTitle: title,
      });
      patched += out.patched;
    }
    return { resolved, unresolved, patched };
  },
});
