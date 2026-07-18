import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Campaign finance sync. Federal: OpenFEC API (daily cron). State: Sunshine
 * CSV import via scripts/import-sunshine.mjs → upsertTotals/addContribution.
 */

const financeSource = v.union(v.literal("openfec"), v.literal("sunshine"));

export const upsertTotals = internalMutation({
  args: {
    candidateSlug: v.string(),
    raceId: v.string(),
    source: financeSource,
    receipts: v.optional(v.number()),
    disbursements: v.optional(v.number()),
    cashOnHand: v.optional(v.number()),
    debts: v.optional(v.number()),
    coverageEndDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("finance_totals")
      .withIndex("by_candidate", (q) =>
        q.eq("raceId", args.raceId).eq("candidateSlug", args.candidateSlug),
      )
      .collect();
    const match = existing.find((t) => t.source === args.source);
    const doc = { ...args, fetchedAt: Date.now() };
    if (match) {
      await ctx.db.patch(match._id, doc);
      return match._id;
    }
    return await ctx.db.insert("finance_totals", doc);
  },
});

export const replaceContributions = internalMutation({
  args: {
    candidateSlug: v.string(),
    raceId: v.string(),
    source: financeSource,
    contributions: v.array(
      v.object({
        contributorName: v.string(),
        contributorLocation: v.optional(v.string()),
        contributorType: v.optional(v.string()),
        amount: v.number(),
        date: v.optional(v.string()),
        committee: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { candidateSlug, raceId, source, contributions }) => {
    const existing = await ctx.db
      .query("contributions")
      .withIndex("by_candidate", (q) =>
        q.eq("raceId", raceId).eq("candidateSlug", candidateSlug),
      )
      .collect();
    for (const c of existing.filter((c) => c.source === source)) {
      await ctx.db.delete(c._id);
    }
    for (const c of contributions) {
      await ctx.db.insert("contributions", {
        ...c,
        candidateSlug,
        raceId,
        source,
      });
    }
    return contributions.length;
  },
});

export const logFetch = internalMutation({
  args: {
    url: v.string(),
    status: v.union(v.literal("ok"), v.literal("error")),
    httpStatus: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("source_fetch_logs", { ...args, fetchedAt: Date.now() });
    if (args.status === "error") {
      await ctx.db.insert("alerts", {
        kind: "sync_failure",
        message: `Finance sync failed: ${args.error ?? "unknown"} (${args.url})`,
        severity: "warning",
        resolved: false,
        createdAt: Date.now(),
      });
    }
  },
});

export const listFecCandidates = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("candidates").collect();
    // Only candidates in FEDERAL races: a state-race candidate may carry an old
    // House-committee FEC ID (e.g. Tiffany for governor) — showing that money
    // on a state race would be misleading. State races use Sunshine only.
    return all
      .filter((c) => c.fecCandidateId && c.raceId.startsWith("WI-US-"))
      .map((c) => ({
        slug: c.slug,
        raceId: c.raceId,
        fecCandidateId: c.fecCandidateId!,
      }));
  },
});

export const removeTotals = internalMutation({
  args: {
    candidateSlug: v.string(),
    raceId: v.string(),
    source: financeSource,
  },
  handler: async (ctx, { candidateSlug, raceId, source }) => {
    const rows = await ctx.db
      .query("finance_totals")
      .withIndex("by_candidate", (q) =>
        q.eq("raceId", raceId).eq("candidateSlug", candidateSlug),
      )
      .collect();
    let removed = 0;
    for (const row of rows.filter((r) => r.source === source)) {
      await ctx.db.delete(row._id);
      removed++;
    }
    return removed;
  },
});

type FecTotalsRow = {
  candidate_id: string;
  // OpenFEC serializes money fields inconsistently (number or numeric string)
  receipts?: number | string;
  disbursements?: number | string;
  cash_on_hand_end_period?: number | string;
  debts_owed_by_committee?: number | string;
  coverage_end_date?: string;
};

function toNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export const syncOpenFec = internalAction({
  args: { apiBase: v.optional(v.string()) },
  handler: async (ctx, { apiBase }) => {
    const base = apiBase ?? "https://api.open.fec.gov/v1";
    const apiKey = process.env.OPENFEC_API_KEY ?? "DEMO_KEY";
    const url = `${base}/candidates/totals/?state=WI&office=H&election_year=2026&election_full=false&api_key=${apiKey}&per_page=100`;
    const logUrl = url.replace(apiKey, "***");

    let rows: FecTotalsRow[];
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { results: FecTotalsRow[] };
      rows = data.results;
    } catch (e) {
      await ctx.runMutation(internal.finance.logFetch, {
        url: logUrl,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }

    const ours: { slug: string; raceId: string; fecCandidateId: string }[] =
      await ctx.runQuery(internal.finance.listFecCandidates, {});
    const byFecId = new Map(ours.map((c) => [c.fecCandidateId, c]));

    let matched = 0;
    const unmatched: string[] = [];
    for (const row of rows) {
      const candidate = byFecId.get(row.candidate_id);
      if (!candidate) {
        unmatched.push(row.candidate_id);
        continue;
      }
      await ctx.runMutation(internal.finance.upsertTotals, {
        candidateSlug: candidate.slug,
        raceId: candidate.raceId,
        source: "openfec",
        receipts: toNumber(row.receipts),
        disbursements: toNumber(row.disbursements),
        cashOnHand: toNumber(row.cash_on_hand_end_period),
        debts: toNumber(row.debts_owed_by_committee),
        coverageEndDate: row.coverage_end_date ?? undefined,
      });
      matched++;
    }

    await ctx.runMutation(internal.finance.logFetch, {
      url: logUrl,
      status: "ok",
      httpStatus: 200,
    });
    // Unmatched FEC rows are normal (candidates not in our guide) — reported, never guessed.
    return { fetched: rows.length, matched, unmatched };
  },
});
