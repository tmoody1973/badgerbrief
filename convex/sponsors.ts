import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  ActionCtx,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import {
  normalizeSponsorKey,
  fecCommitteeKind,
  leanFromParty,
  type SponsorLean,
} from "./lib/sponsors";

/** Who is behind an outside-group ad. Reviewer-assisted: FEC facts + a
 * Perplexity-sourced one-liner, human-approved before it ever shows publicly. */

export async function requireAdmin(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("sponsors require authentication");
  const role = (identity as { metadata?: { role?: string } }).metadata?.role;
  if (role !== "admin") throw new Error("sponsors require the admin role");
}

const leanValidator = v.union(
  v.literal("supports_d"),
  v.literal("supports_r"),
  v.literal("bipartisan"),
  v.literal("issue"),
);

type FecMatch = {
  fecCommitteeId: string;
  name: string;
  kind: string;
  party?: string;
  lean?: SponsorLean;
};

/** OpenFEC committee search → typed matches. */
async function searchFecCommittees(name: string): Promise<FecMatch[]> {
  const apiKey = process.env.OPENFEC_API_KEY ?? "DEMO_KEY";
  const url = `https://api.open.fec.gov/v1/committees/?q=${encodeURIComponent(
    name,
  )}&api_key=${apiKey}&per_page=5&sort=-receipts`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: {
      committee_id: string;
      name: string;
      committee_type?: string;
      party?: string;
    }[];
  };
  return (data.results ?? []).map((c) => ({
    fecCommitteeId: c.committee_id,
    name: c.name,
    kind: fecCommitteeKind(c.committee_type).kind,
    party: c.party ?? undefined,
    lean: leanFromParty(c.party),
  }));
}

/** Fetch one FEC committee by id — used when the reviewer pastes an ID (the
 * advertised name often differs from the FEC name, e.g. "House Majority PAC" is
 * registered as "HMP", so name search misses it). */
async function getFecCommittee(id: string): Promise<FecMatch | null> {
  const apiKey = process.env.OPENFEC_API_KEY ?? "DEMO_KEY";
  const res = await fetch(
    `https://api.open.fec.gov/v1/committee/${encodeURIComponent(id)}/?api_key=${apiKey}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    results?: {
      committee_id: string;
      name: string;
      committee_type?: string;
      party?: string;
    }[];
  };
  const c = data.results?.[0];
  if (!c) return null;
  return {
    fecCommitteeId: c.committee_id,
    name: c.name,
    kind: fecCommitteeKind(c.committee_type).kind,
    party: c.party ?? undefined,
    lean: leanFromParty(c.party),
  };
}

/** Perplexity (web-grounded) → a sourced one-line description + citations.
 * Exported for reuse as sponsorEnrich.ts's narrative fallback when Firecrawl
 * finds nothing. */
export async function perplexityDescribe(
  name: string,
): Promise<{ summary?: string; sources: { label: string; url: string }[] }> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return { sources: [] };
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "You describe U.S. political ad sponsors for a nonpartisan voter guide. Answer in ONE neutral sentence: what kind of organization it is, its partisan lean if clearly established, and who funds it. Base it only on reliable sources. If you are not confident which group this is, reply exactly 'Unknown — needs manual research.'",
          },
          { role: "user", content: `Who is the political ad sponsor "${name}"?` },
        ],
        max_tokens: 200,
        temperature: 0,
      }),
    });
    if (!res.ok) return { sources: [] };
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      citations?: string[];
    };
    const summary = data.choices?.[0]?.message?.content?.trim();
    const sources = (data.citations ?? []).slice(0, 5).map((url) => {
      let label = url;
      try {
        label = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        /* keep url */
      }
      return { label, url };
    });
    return { summary, sources };
  } catch {
    return { sources: [] };
  }
}

/** Reviewer tool: research a sponsor (FEC + web) without writing anything.
 * Pass fecCommitteeId to fetch a specific committee (name search often misses). */
export const lookupSponsor = action({
  args: { advertiser: v.string(), fecCommitteeId: v.optional(v.string()) },
  handler: async (ctx, { advertiser, fecCommitteeId }) => {
    await requireAdmin(ctx);
    const [searched, described, direct] = await Promise.all([
      searchFecCommittees(advertiser),
      perplexityDescribe(advertiser),
      fecCommitteeId ? getFecCommittee(fecCommitteeId) : Promise.resolve(null),
    ]);
    const fecMatches = direct ? [direct, ...searched] : searched;
    const best = fecMatches[0];
    return {
      key: normalizeSponsorKey(advertiser),
      displayName: advertiser,
      fecMatches,
      // A pre-filled draft the reviewer edits — never auto-saved.
      suggested: {
        kind: best?.kind,
        lean: best?.lean,
        summary: described.summary,
        fecCommitteeId: best?.fecCommitteeId,
        disclosesDonors: best ? true : undefined,
        sources: described.sources,
      },
    };
  },
});

/** Reviewer approves/edits → upsert an approved sponsor profile. */
export const saveSponsor = mutation({
  args: {
    key: v.string(),
    displayName: v.string(),
    kind: v.optional(v.string()),
    lean: v.optional(leanValidator),
    summary: v.optional(v.string()),
    fecCommitteeId: v.optional(v.string()),
    disclosesDonors: v.optional(v.boolean()),
    topDonors: v.optional(
      v.array(v.object({ name: v.string(), amount: v.number() })),
    ),
    totalRaised: v.optional(v.number()),
    sources: v.array(v.object({ label: v.string(), url: v.string() })),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("sponsors")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    const doc = { ...args, reviewStatus: "approved" as const, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }
    return await ctx.db.insert("sponsors", doc);
  },
});

/** The already-saved profile for a sponsor name, if any (draft or approved). */
export const sponsorForName = query({
  args: { advertiser: v.string() },
  handler: async (ctx, { advertiser }) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("sponsors")
      .withIndex("by_key", (q) => q.eq("key", normalizeSponsorKey(advertiser)))
      .unique();
  },
});

/** Internal: the stored sponsor row for a key (unauthenticated enrichment reads
 * the prior fecCommitteeId so a name-search miss doesn't lose it). */
export const sponsorRowByKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) =>
    ctx.db
      .query("sponsors")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique(),
});

/** Public: approved sponsor profiles for a set of sponsor names (race pages). */
export const approvedForNames = query({
  args: { names: v.array(v.string()) },
  handler: async (ctx, { names }) => {
    const keys = new Set(names.map(normalizeSponsorKey));
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const s = await ctx.db
        .query("sponsors")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (s && s.reviewStatus === "approved") out[key] = s;
    }
    return out;
  },
});

/** Enrichment writer: exact facts publish immediately; a fresh narrative lands
 * as a draft (narrativeStatus:"draft") unless one is already approved. */
export const upsertEnrichment = internalMutation({
  args: {
    key: v.string(), displayName: v.string(),
    kind: v.optional(v.string()), lean: v.optional(leanValidator),
    fecCommitteeId: v.optional(v.string()), disclosesDonors: v.optional(v.boolean()),
    totalRaised: v.optional(v.number()), totalSpent: v.optional(v.number()),
    topDonors: v.optional(v.array(v.object({ name: v.string(), amount: v.number() }))),
    independentExpenditures: v.optional(v.array(v.object({
      candidate: v.string(), office: v.optional(v.string()),
      supportOppose: v.union(v.literal("support"), v.literal("oppose")), amount: v.number(),
    }))),
    financialsAsOf: v.optional(v.string()),
    factsFlag: v.optional(v.string()),
    narrativeDraft: v.optional(v.string()),
    leadership: v.optional(v.array(v.object({ name: v.string(), role: v.string() }))),
    sources: v.array(v.object({ label: v.string(), url: v.string() })),
  },
  handler: async (ctx, a) => {
    const existing = await ctx.db.query("sponsors").withIndex("by_key", (q) => q.eq("key", a.key)).unique();
    const keepNarrative = existing?.narrativeStatus === "approved";
    const doc = {
      key: a.key, displayName: existing?.displayName ?? a.displayName,
      kind: a.kind ?? existing?.kind, lean: a.lean ?? existing?.lean,
      summary: existing?.summary, fecCommitteeId: a.fecCommitteeId ?? existing?.fecCommitteeId,
      disclosesDonors: a.disclosesDonors ?? existing?.disclosesDonors,
      topDonors: a.topDonors ?? existing?.topDonors, totalRaised: a.totalRaised ?? existing?.totalRaised,
      totalSpent: a.totalSpent ?? existing?.totalSpent,
      independentExpenditures: a.independentExpenditures ?? existing?.independentExpenditures,
      financialsAsOf: a.financialsAsOf ?? existing?.financialsAsOf,
      factsFlag: a.factsFlag,
      leadership: keepNarrative ? existing?.leadership : (a.leadership ?? existing?.leadership),
      narrative: keepNarrative ? existing?.narrative : (a.narrativeDraft ?? existing?.narrative),
      narrativeStatus: keepNarrative
        ? existing?.narrativeStatus
        : ((a.narrativeDraft ?? existing?.narrative) ? ("draft" as const) : existing?.narrativeStatus),
      sources: a.sources.length ? a.sources : (existing?.sources ?? []),
      reviewStatus: existing?.reviewStatus ?? ("draft" as const),
      enrichedAt: Date.now(), updatedAt: Date.now(),
    };
    if (existing) { await ctx.db.patch(existing._id, doc); return existing._id; }
    return ctx.db.insert("sponsors", doc);
  },
});

/** Distinct sponsor names by tracked spend, newest-stale first — enrichment queue. */
export const sponsorsToEnrich = internalQuery({
  args: { limit: v.number(), staleDays: v.number() },
  handler: async (ctx, { limit, staleDays }) => {
    const ads = await ctx.db.query("ads").collect();
    const spendBy = new Map<string, { name: string; spend: number }>();
    for (const ad of ads) {
      const name = ad.pageOrCommittee;
      const key = normalizeSponsorKey(name);
      const mid = ((ad.spendLower ?? 0) + (ad.spendUpper ?? 0)) / 2;
      const cur = spendBy.get(key) ?? { name, spend: 0 };
      cur.spend += mid; spendBy.set(key, cur);
    }
    const cutoff = Date.now() - staleDays * 86_400_000;
    const out: { name: string; key: string }[] = [];
    for (const [key, { name, spend }] of [...spendBy.entries()].sort((a, b) => b[1].spend - a[1].spend)) {
      const existing = await ctx.db.query("sponsors").withIndex("by_key", (q) => q.eq("key", key)).unique();
      if (existing?.enrichedAt && existing.enrichedAt > cutoff) continue;
      // Skip candidate own-committees once enriched (kind set); include unknowns.
      if (existing?.kind === "Candidate committee") continue;
      out.push({ name, key });
      if (out.length >= limit) break;
    }
    return out;
  },
});

/** Support/attack scorecard: rolls up a sponsor's own ads by candidateSlug + stance
 * with summed spend midpoints, sorted by spend descending. */
export const sponsorScorecard = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const ads = await ctx.db.query("ads").collect();
    const mine = ads.filter((a) => a.candidateSlug && a.stance && normalizeSponsorKey(a.pageOrCommittee) === key);
    const roll = (stance: "support" | "oppose") => {
      const by = new Map<string, { candidateSlug: string; raceId?: string; spend: number; adCount: number }>();
      for (const a of mine.filter((x) => x.stance === stance)) {
        const mid = ((a.spendLower ?? 0) + (a.spendUpper ?? 0)) / 2;
        const cur = by.get(a.candidateSlug!) ?? { candidateSlug: a.candidateSlug!, raceId: a.raceId, spend: 0, adCount: 0 };
        cur.spend += mid; cur.adCount += 1; by.set(a.candidateSlug!, cur);
      }
      return [...by.values()].sort((x, y) => y.spend - x.spend);
    };
    return { supported: roll("support"), attacked: roll("oppose") };
  },
});

/** All ads for a sponsor, sorted by spend descending. */
export const sponsorAds = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const ads = await ctx.db.query("ads").collect();
    return ads.filter((a) => normalizeSponsorKey(a.pageOrCommittee) === key)
      .sort((a, b) => (b.spendUpper ?? 0) - (a.spendUpper ?? 0));
  },
});

/** Keys of sponsors that have a public profile — used to link sponsor names to
 * /sponsors/[slug] only when the page exists (avoids linking to 404s). */
export const enrichedSponsorKeys = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("sponsors").collect();
    return rows.filter((s) => s.enrichedAt).map((s) => s.key);
  },
});

/** Total tracked ad spend (range midpoints) for a sponsor — feeds the FEC
 * decoy-match guard: if this dwarfs a name-matched committee's receipts, the
 * match is implausible. */
export const trackedSpendForKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const ads = await ctx.db.query("ads").collect();
    return ads
      .filter((a) => normalizeSponsorKey(a.pageOrCommittee) === key)
      .reduce((s, a) => s + ((a.spendLower ?? 0) + (a.spendUpper ?? 0)) / 2, 0);
  },
});

type PublicProfile = {
  displayName: string;
  kind?: string;
  lean?: SponsorLean;
  disclosesDonors?: boolean;
  totalRaised?: number;
  totalSpent?: number;
  topDonors?: { name: string; amount: number }[];
  independentExpenditures?: { candidate: string; office?: string; supportOppose: "support" | "oppose"; amount: number }[];
  financialsAsOf?: string;
  sources: { label: string; url: string }[];
  narrative?: string;
  leadership?: { name: string; role: string }[];
};

/** Public profile: returns exact facts always; narrative/leadership only when approved. */
export const sponsorPublicProfile = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<PublicProfile | null> => {
    const s = await ctx.db.query("sponsors").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!s || !s.enrichedAt) return null;
    const base: PublicProfile = {
      displayName: s.displayName, kind: s.kind, lean: s.lean, disclosesDonors: s.disclosesDonors,
      totalRaised: s.totalRaised, totalSpent: s.totalSpent, topDonors: s.topDonors,
      independentExpenditures: s.independentExpenditures, financialsAsOf: s.financialsAsOf,
      sources: s.sources,
    };
    if (s.narrativeStatus === "approved") {
      return { ...base, narrative: s.narrative, leadership: s.leadership };
    }
    return base;
  },
});

/** Admin: save a narrative draft (reviewer-edited) + optional leadership. */
export const saveNarrativeDraft = mutation({
  args: {
    key: v.string(),
    narrative: v.string(),
    leadership: v.optional(v.array(v.object({ name: v.string(), role: v.string() }))),
  },
  handler: async (ctx, { key, narrative, leadership }) => {
    await requireAdmin(ctx);
    const s = await ctx.db
      .query("sponsors")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!s) throw new Error("no sponsor row to edit");
    await ctx.db.patch(s._id, {
      narrative,
      leadership,
      narrativeStatus: "draft" as const,
      updatedAt: Date.now(),
    });
  },
});

/** Admin: approve a narrative draft → set narrativeStatus to "approved". */
export const approveNarrative = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await requireAdmin(ctx);
    const s = await ctx.db
      .query("sponsors")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!s) throw new Error("no sponsor row to approve");
    await ctx.db.patch(s._id, {
      narrativeStatus: "approved" as const,
      updatedAt: Date.now(),
    });
  },
});

/** Admin: list sponsors with draft narratives pending review. */
export const pendingNarratives = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("sponsors").collect();
    return rows
      .filter((s) => s.narrativeStatus === "draft" && s.narrative)
      .map((s) => ({ key: s.key, displayName: s.displayName }));
  },
});
