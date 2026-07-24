/**
 * Storage for legislative roll calls. Plain mutations/queries only — the
 * fetching action lives in convex/votes.ts and is "use node", which a mutation
 * cannot import from (same split as scout.ts / scoutQueries.ts).
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import {
  billUrl,
  matchesQuery,
  summarize,
  type Position,
  type RecordChamber,
  type VotingSummary,
} from "./lib/votingRecord";
import { requireAdmin } from "./sponsors";

// "present" occurs only in U.S. House votes; Wisconsin roll calls never produce
// it. Shared across both paths so the position filter and the stored rows agree.
const positionValidator = v.union(
  v.literal("aye"),
  v.literal("nay"),
  v.literal("present"),
  v.literal("not_voting"),
);

/** State chambers only — this gates setLegislatorName and the state ingest,
 * neither of which applies to the U.S. House (federal uses bioguideId). */
const chamberValidator = v.union(v.literal("assembly"), v.literal("senate"));

export const storeRollCall = internalMutation({
  args: {
    rollCall: v.object({
      voteKey: v.string(),
      session: v.string(),
      chamber: chamberValidator,
      voteId: v.string(),
      billNumber: v.string(),
      billTitle: v.string(),
      voteType: v.string(),
      votedOn: v.string(),
      ayes: v.number(),
      nays: v.number(),
      notVoting: v.number(),
      vacantSeats: v.number(),
      sourceUrl: v.string(),
      votes: v.array(
        v.object({
          name: v.string(),
          party: v.optional(v.string()),
          position: positionValidator,
        }),
      ),
    }),
  },
  handler: async (ctx, { rollCall }): Promise<{ stored: boolean; matched: number }> => {
    const existing = await ctx.db
      .query("legislative_votes")
      .withIndex("by_voteKey", (q) => q.eq("voteKey", rollCall.voteKey))
      .unique();
    if (existing) return { stored: false, matched: 0 };

    await ctx.db.insert("legislative_votes", {
      voteKey: rollCall.voteKey,
      session: rollCall.session,
      chamber: rollCall.chamber,
      voteId: rollCall.voteId,
      billNumber: rollCall.billNumber,
      billTitle: rollCall.billTitle,
      voteType: rollCall.voteType,
      votedOn: rollCall.votedOn,
      ayes: rollCall.ayes,
      nays: rollCall.nays,
      notVoting: rollCall.notVoting,
      sourceUrl: rollCall.sourceUrl,
      ingestedAt: Date.now(),
    });

    // Only legislators we track, matched on an exact hand-entered name for the
    // right chamber and session. No fuzzy matching: two members can share a
    // surname on the same vote.
    const candidates = await ctx.db.query("candidates").collect();
    let matched = 0;
    for (const c of candidates) {
      const mapping = c.legislatorName;
      if (!mapping) continue;
      if (mapping.chamber !== rollCall.chamber) continue;
      if (!mapping.sessions.includes(rollCall.session)) continue;
      const row = rollCall.votes.find((x) => x.name === mapping.name);
      if (!row) continue;
      await ctx.db.insert("legislator_votes", {
        voteKey: rollCall.voteKey,
        candidateSlug: c.slug,
        position: row.position,
        session: rollCall.session,
      });
      matched++;
    }
    return { stored: true, matched };
  },
});

/**
 * One-time (idempotent) fill of legislator_votes.session for rows written
 * before the field existed. session is the first "-"-delimited part of voteKey.
 *
 * Paginated: a single mutation may not read+write more than 4096 documents, and
 * prod already holds several thousand legislator_votes rows, so an unbounded
 * `.collect()` over the whole table overruns the limit. The caller drives the
 * cursor — pass `continueCursor` back in until `isDone` — so each execution
 * touches at most `numItems` rows. Patching `session` does not change document
 * order, so pagination stays stable across the passes.
 */
export const backfillLegislatorSession = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { cursor = null, numItems = 1000 },
  ): Promise<{ updated: number; continueCursor: string; isDone: boolean }> => {
    const page = await ctx.db.query("legislator_votes").paginate({ cursor, numItems });
    let updated = 0;
    for (const r of page.page) {
      if (r.session) continue;
      await ctx.db.patch(r._id, { session: r.voteKey.split("-")[0] });
      updated++;
    }
    return { updated, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

export const ingestedKeys = internalQuery({
  args: { session: v.string(), chamber: chamberValidator },
  handler: async (ctx, { session, chamber }): Promise<string[]> => {
    const rows = await ctx.db
      .query("legislative_votes")
      .withIndex("by_session_chamber", (q) =>
        q.eq("session", session).eq("chamber", chamber),
      )
      .collect();
    return rows.map((r) => r.voteId).sort();
  },
});

/**
 * Delete one session+chamber's stored roll calls so an ingest can rebuild them.
 *
 * WHY THIS HAS TO EXIST. legislator_votes rows are written ONLY inside
 * storeRollCall, at ingest time, and non-tracked members' positions are never
 * persisted — so a legislatorName added after a backfill attaches nothing and
 * that candidate silently shows an empty record. There is no reconcile-from-DB
 * path and there cannot be one: the data needed to build it was never stored.
 * The only way to pick up newly-mapped legislators is to drop the stored roll
 * calls and re-fetch them from the source, which still has them.
 *
 * Deletes legislator_votes alongside legislative_votes. Leaving the former
 * behind would orphan them against vote keys that no longer exist, and the
 * re-ingest would then insert a SECOND row per candidate per vote — silently
 * doubling every tracked legislator's record.
 *
 * Paginated for the same reason as backfillLegislatorSession: one mutation may
 * not touch more than 4096 documents, and a session+chamber is well past that
 * once legislator_votes are counted. Call until `isDone`.
 */
export const deleteSessionVotes = internalMutation({
  args: {
    session: v.string(),
    chamber: v.union(v.literal("assembly"), v.literal("senate"), v.literal("us_house")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { session, chamber, limit = 200 }) => {
    const votes = await ctx.db
      .query("legislative_votes")
      .withIndex("by_session_chamber", (q) =>
        q.eq("session", session).eq("chamber", chamber),
      )
      .take(limit);
    let deletedVotes = 0;
    let deletedPositions = 0;
    for (const v of votes) {
      const positions = await ctx.db
        .query("legislator_votes")
        .withIndex("by_vote", (q) => q.eq("voteKey", v.voteKey))
        .collect();
      for (const p of positions) {
        await ctx.db.delete(p._id);
        deletedPositions++;
      }
      await ctx.db.delete(v._id);
      deletedVotes++;
    }
    return { deletedVotes, deletedPositions, isDone: votes.length < limit };
  },
});

/** Attach a hand-verified roll-call surname to a candidate. */
export const setLegislatorName = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    chamber: chamberValidator,
    sessions: v.array(v.string()),
  },
  handler: async (ctx, { slug, name, chamber, sessions }) => {
    await requireAdmin(ctx);
    const candidate = await ctx.db
      .query("candidates")
      .withIndex("by_slug_only", (q) => q.eq("slug", slug))
      .first();
    if (!candidate) throw new Error(`no candidate with slug "${slug}"`);
    await ctx.db.patch(candidate._id, { legislatorName: { name, chamber, sessions } });
    return { slug, name };
  },
});

/**
 * Attach a U.S. House Bioguide ID to a candidate.
 *
 * Far simpler than setLegislatorName by design. A Bioguide ID is unique across
 * every person who has ever served in Congress, so there is no surname collision
 * to hand-verify, no chamber to disambiguate, and no session list to maintain —
 * the id alone identifies the member for their whole career. The format check is
 * the only guard needed.
 */
export const setBioguideId = mutation({
  args: { slug: v.string(), bioguideId: v.string() },
  handler: async (ctx, { slug, bioguideId }) => {
    await requireAdmin(ctx);
    if (!/^[A-Z]\d{6}$/.test(bioguideId)) {
      throw new Error(`"${bioguideId}" is not a Bioguide ID (e.g. T000165)`);
    }
    const candidate = await ctx.db
      .query("candidates")
      .withIndex("by_slug_only", (q) => q.eq("slug", slug))
      .first();
    if (!candidate) throw new Error(`no candidate with slug "${slug}"`);
    await ctx.db.patch(candidate._id, { bioguideId });
    return { slug, bioguideId };
  },
});

/**
 * Store one House roll call and attach positions for tracked members.
 *
 * Mirrors storeRollCall, including its ordering hazard: legislator_votes rows
 * are written HERE, at ingest time, and the dedup on voteKey means a re-run
 * skips the whole document. A Bioguide ID added AFTER a vote is ingested
 * attaches nothing and the candidate silently shows an empty record. Seed IDs
 * BEFORE ingesting — same law as the state path.
 */
export const storeHouseVote = internalMutation({
  args: {
    rollCall: v.object({
      voteKey: v.string(),
      session: v.string(),
      voteId: v.string(),
      billNumber: v.string(),
      billTitle: v.string(),
      voteType: v.string(),
      votedOn: v.string(),
      ayes: v.number(),
      nays: v.number(),
      present: v.number(),
      notVoting: v.number(),
      result: v.string(),
      measure: v.string(),
      legislationUrl: v.optional(v.string()),
      sourceDataUrl: v.optional(v.string()),
      sourceUrl: v.string(),
      votes: v.array(
        v.object({
          bioguideId: v.string(),
          position: positionValidator,
        }),
      ),
    }),
  },
  handler: async (ctx, { rollCall }): Promise<{ stored: boolean; matched: number }> => {
    const existing = await ctx.db
      .query("legislative_votes")
      .withIndex("by_voteKey", (q) => q.eq("voteKey", rollCall.voteKey))
      .unique();
    if (existing) return { stored: false, matched: 0 };

    await ctx.db.insert("legislative_votes", {
      voteKey: rollCall.voteKey,
      session: rollCall.session,
      chamber: "us_house",
      voteId: rollCall.voteId,
      billNumber: rollCall.billNumber,
      billTitle: rollCall.billTitle,
      voteType: rollCall.voteType,
      votedOn: rollCall.votedOn,
      ayes: rollCall.ayes,
      nays: rollCall.nays,
      notVoting: rollCall.notVoting,
      present: rollCall.present,
      result: rollCall.result,
      measure: rollCall.measure,
      legislationUrl: rollCall.legislationUrl,
      sourceDataUrl: rollCall.sourceDataUrl,
      sourceUrl: rollCall.sourceUrl,
      ingestedAt: Date.now(),
    });

    const candidates = await ctx.db.query("candidates").collect();
    let matched = 0;
    for (const c of candidates) {
      if (!c.bioguideId) continue;
      const row = rollCall.votes.find((x) => x.bioguideId === c.bioguideId);
      if (!row) continue;
      await ctx.db.insert("legislator_votes", {
        voteKey: rollCall.voteKey,
        candidateSlug: c.slug,
        position: row.position,
        session: rollCall.session,
      });
      matched++;
    }
    return { stored: true, matched };
  },
});

/** Roll-call numbers already stored for a Congress+session, so ingest can skip
 * them. Federal counterpart of ingestedKeys. */
export const ingestedHouseVotes = internalQuery({
  args: { congress: v.string(), session: v.string() },
  handler: async (ctx, { congress, session }): Promise<string[]> => {
    const rows = await ctx.db
      .query("legislative_votes")
      .withIndex("by_session_chamber", (q) =>
        q.eq("session", congress).eq("chamber", "us_house"),
      )
      .collect();
    // voteId is "{session}-{roll}"; only this session's rolls are "already done".
    return rows
      .map((r) => r.voteId)
      .filter((id) => id.startsWith(`${session}-`));
  },
});

/** Distinct bill numbers among federal votes still lacking a title. Deduped, so
 * the enrichment pass makes one call per BILL rather than one per vote. */
export const federalBillsMissingTitle = internalQuery({
  args: { session: v.string() },
  handler: async (ctx, { session }): Promise<string[]> => {
    const rows = await ctx.db
      .query("legislative_votes")
      .withIndex("by_session_chamber", (q) =>
        q.eq("session", session).eq("chamber", "us_house"),
      )
      .collect();
    return [...new Set(rows.filter((r) => !r.billTitle).map((r) => r.billNumber))];
  },
});

/**
 * Repoint federal sourceUrl at the House Clerk's verified vote page.
 *
 * Rows ingested before that change carry a congress.gov /roll-call-vote/ URL
 * whose shape was never confirmed — congress.gov 403s every automated request,
 * so it could not be checked. Idempotent: rows already pointing at the Clerk are
 * left alone.
 */
export const repairFederalSourceUrls = internalMutation({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    const rows = await ctx.db
      .query("legislative_votes")
      .withIndex("by_session_chamber", (q) =>
        q.eq("session", session).eq("chamber", "us_house"),
      )
      .collect();
    let patched = 0;
    for (const r of rows) {
      if (r.sourceUrl.startsWith("https://clerk.house.gov/Votes/")) continue;
      const roll = r.voteId.split("-")[1];
      const year = r.votedOn.slice(0, 4);
      if (!roll || year.length !== 4) continue;
      await ctx.db.patch(r._id, {
        sourceUrl: `https://clerk.house.gov/Votes/${year}${roll}`,
      });
      patched++;
    }
    return { patched, total: rows.length };
  },
});

/** Fill billTitle for federal votes once the bill enrichment pass resolves it. */
export const setFederalBillTitle = internalMutation({
  args: { session: v.string(), billNumber: v.string(), billTitle: v.string() },
  handler: async (ctx, { session, billNumber, billTitle }) => {
    const rows = await ctx.db
      .query("legislative_votes")
      .withIndex("by_session_chamber", (q) =>
        q.eq("session", session).eq("chamber", "us_house"),
      )
      .collect();
    let patched = 0;
    for (const r of rows) {
      if (r.billNumber !== billNumber || r.billTitle === billTitle) continue;
      await ctx.db.patch(r._id, { billTitle });
      patched++;
    }
    return { patched };
  },
});

/**
 * Votes that decide a measure, surfaced ahead of procedural ones.
 *
 * Wisconsin prints a bare vote type ("PASSAGE"); the House prints a full
 * question ("On Motion to Suspend the Rules and Pass"). Substring-matching the
 * Wisconsin terms against federal questions gets almost all of them wrong —
 * "AND PASS" does not contain "PASSAGE", and "TO CONCUR IN THE SENATE
 * AMENDMENT" does not contain "CONCURRENCE" — so the House's real deciding
 * votes would all sort as procedural.
 *
 * Every federal pattern below is anchored on wording that appears ONLY in
 * deciding questions. Deliberately excluded, because they are procedural even
 * though they read like action: "On Agreeing to the Amendment" (an amendment,
 * not the measure), "On Motion to Recommit", "On Motion to Reconsider", "On
 * Motion to Table", "On Ordering the Previous Question".
 */
const FINAL_VOTE_TYPES = [
  // Wisconsin
  "PASSAGE",
  "CONCURRENCE",
  "ADOPTION",
  // U.S. House
  "AND PASS", // "...Suspend the Rules and Pass[, as Amended]"
  "TO CONCUR", // "On Motion to Concur in the Senate Amendment"
  "AND AGREE", // "...Suspend the Rules and Agree[, as Amended]"
  "AGREEING TO THE RESOLUTION", // resolutions decide on agreement
];
const isFinal = (voteType: string) =>
  FINAL_VOTE_TYPES.some((t) => voteType.toUpperCase().includes(t));

/**
 * Aggregate for the summary tiles and the SectionNav count. Computed from the
 * lightweight legislator_votes rows alone (session is the voteKey prefix), so
 * the candidate page never ships the full vote list. Explicit return type works
 * around the api-circularity TS quirk (same reason votingRecord annotates its).
 */
export const votingRecordSummary = query({
  args: { candidateSlug: v.string() },
  handler: async (ctx, { candidateSlug }): Promise<VotingSummary | null> => {
    const rows = await ctx.db
      .query("legislator_votes")
      .withIndex("by_candidate", (q) => q.eq("candidateSlug", candidateSlug))
      .collect();
    if (rows.length === 0) return null;
    return summarize(rows.map((r) => ({ voteKey: r.voteKey, position: r.position })));
  },
});

export const votingRecord = query({
  args: { candidateSlug: v.string(), query: v.optional(v.string()) },
  handler: async (ctx, { candidateSlug, query: search }) => {
    const positions = await ctx.db
      .query("legislator_votes")
      .withIndex("by_candidate", (q) => q.eq("candidateSlug", candidateSlug))
      .collect();
    if (positions.length === 0) return [];

    const rows = [];
    for (const p of positions) {
      const vote = await ctx.db
        .query("legislative_votes")
        .withIndex("by_voteKey", (q) => q.eq("voteKey", p.voteKey))
        .unique();
      if (!vote) continue;
      rows.push({ vote, position: p.position });
    }

    const matched = search?.trim()
      ? rows.filter((r) => matchesQuery(r.vote.billTitle, r.vote.billNumber, search))
      : rows;

    // Count every recorded vote we hold on the SAME bill, so an answer can
    // disclose that procedural votes exist rather than quietly showing one of
    // several. Keyed by session+billNumber: Wisconsin bill numbers reset each
    // biennium, so "AB 388" in 2023 and "AB 388" in 2025 are different bills
    // and must never be counted against each other.
    const perBill = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.vote.session}-${r.vote.billNumber}`;
      perBill.set(key, (perBill.get(key) ?? 0) + 1);
    }

    return matched
      .sort((a, b) => {
        // Final votes first, then most recent.
        const fa = isFinal(a.vote.voteType) ? 1 : 0;
        const fb = isFinal(b.vote.voteType) ? 1 : 0;
        return fb - fa || b.vote.votedOn.localeCompare(a.vote.votedOn);
      })
      .map((r) => ({
        billNumber: r.vote.billNumber,
        billTitle: r.vote.billTitle,
        voteType: r.vote.voteType,
        votedOn: r.vote.votedOn,
        chamber: r.vote.chamber,
        session: r.vote.session,
        position: r.position,
        ayes: r.vote.ayes,
        nays: r.vote.nays,
        sourceUrl: r.vote.sourceUrl,
        otherVotesOnBill: (perBill.get(`${r.vote.session}-${r.vote.billNumber}`) ?? 1) - 1,
        // Federal extras. `measure` differs from billNumber only on amendment
        // votes, where saying "voted on HR 3838" would misdescribe a vote that
        // was actually on an amendment to it.
        ...(r.vote.chamber === "us_house"
          ? {
              measure: r.vote.measure,
              result: r.vote.result,
              present: r.vote.present,
            }
          : {}),
      }));
  },
});

const PAGE_DEFAULT = 25;

/**
 * One session's rows for the accordion. The whole session is read (indexed and
 * bounded — ≤705 rows), joined to legislative_votes for metadata, then position
 * + search filtered and sliced to `limit`. otherVotesOnBill is computed over the
 * UNFILTERED session so a filter never changes it. billUrl is deterministic;
 * summary comes from the bills cache (by_session_bill), null if unenriched.
 */
export const votingRecordPage = query({
  args: {
    candidateSlug: v.string(),
    session: v.string(),
    limit: v.optional(v.number()),
    position: v.optional(positionValidator),
    query: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { candidateSlug, session, limit, position, query: search },
  ): Promise<{
    rows: Array<{
      billNumber: string; billTitle: string; voteType: string; votedOn: string;
      chamber: RecordChamber; session: string;
      position: Position; ayes: number; nays: number;
      sourceUrl: string; otherVotesOnBill: number; billUrl: string; summary: string | null;
    }>;
    total: number;
    hasMore: boolean;
  }> => {
    const cap = limit ?? PAGE_DEFAULT;
    const positions = await ctx.db
      .query("legislator_votes")
      .withIndex("by_candidate_session", (q) =>
        q.eq("candidateSlug", candidateSlug).eq("session", session),
      )
      .collect();

    const all = [];
    for (const p of positions) {
      const vote = await ctx.db
        .query("legislative_votes")
        .withIndex("by_voteKey", (q) => q.eq("voteKey", p.voteKey))
        .unique();
      if (vote) all.push({ vote, position: p.position });
    }

    const perBill = new Map<string, number>();
    for (const r of all) perBill.set(r.vote.billNumber, (perBill.get(r.vote.billNumber) ?? 0) + 1);

    const filtered = all.filter(
      (r) =>
        (!position || r.position === position) &&
        (!search?.trim() || matchesQuery(r.vote.billTitle, r.vote.billNumber, search)),
    );
    filtered.sort((a, b) => {
      const fa = isFinal(a.vote.voteType) ? 1 : 0;
      const fb = isFinal(b.vote.voteType) ? 1 : 0;
      return fb - fa || b.vote.votedOn.localeCompare(a.vote.votedOn);
    });

    const total = filtered.length;
    const rows = await Promise.all(
      filtered.slice(0, cap).map(async (r) => {
        const bill = await ctx.db
          .query("bills")
          .withIndex("by_session_bill", (q) =>
            q.eq("session", r.vote.session).eq("billNumber", r.vote.billNumber),
          )
          .unique();
        return {
          billNumber: r.vote.billNumber,
          billTitle: r.vote.billTitle,
          voteType: r.vote.voteType,
          votedOn: r.vote.votedOn,
          chamber: r.vote.chamber,
          session: r.vote.session,
          position: r.position,
          ayes: r.vote.ayes,
          nays: r.vote.nays,
          sourceUrl: r.vote.sourceUrl,
          otherVotesOnBill: (perBill.get(r.vote.billNumber) ?? 1) - 1,
          // billUrl builds a docs.legis.wisconsin.gov path, which is meaningless
          // for an HR. Federal rows carry the API's own legislationUrl instead.
          billUrl:
            r.vote.chamber === "us_house"
              ? (r.vote.legislationUrl ?? r.vote.sourceUrl)
              : billUrl(r.vote.session, r.vote.billNumber),
          summary: bill?.summary ?? null,
        };
      }),
    );

    return { rows, total, hasMore: cap < total };
  },
});
